// 五件旧数据的单向只读导入器（第一版：保留原始 + 激活 beat/fade/正文）。
//
// 硬规则：
// - 只读 .dsh-novel-beat / -fade / -voice / -fanfic / -conductor；绝不写/移动/删除源文件。
// - 导入是复制到 .dsh-novel-kit/imports/<bookId>/<batchId>/ 并生成 kit 原生 decisions/memory/正文。
// - 目标书已有原生数据时默认拒绝，必须显式 replace（防止静默覆盖 kit 新创作）。
// - beat v3 的 request/answer/gate 暂不转换成 kit 决策；原样保存在导入批次里，标 warning。
import { copyFile, mkdir, readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { sha256, writeJsonAtomic } from '../../storage/atomic-json.js'
import { withLock } from '../../storage/locks.js'
import { ensureBook, bodyDir, listBodyFiles, importsDir } from '../store.js'
import { readDecisions, writeDecisions } from '../decisions.js'
import { readMemory, writeMemory } from '../memory.js'
import { readMedia, writeMediaHoldingLock, mediaFromLegacy } from '../media.js'
import { emptyDecisions, emptyMemory, normalizeBookName } from '../schema.js'
import { ingestSource } from '../../engine/sources.js'
import { writeProjectSettingsUnlocked } from '../../engine/settings.js'
import { defaultWorldContract, worldContractFile, readWorldContract, isCanonReady, computeContentHash } from '../../engine/canon.js'

export const LEGACY_DIRS = Object.freeze({
  beat: '.dsh-novel-beat',
  fade: '.dsh-novel-fade',
  voice: '.dsh-novel-voice',
  fanfic: '.dsh-novel-fanfic',
  conductor: '.dsh-novel-conductor',
})

function safeName(value) {
  const name = String(value ?? '')
  if (!name || name === '.' || name === '..' || /[\\/\u0000]/u.test(name)) throw new Error(`旧数据目录名不合法：${JSON.stringify(name)}`)
  return name
}

/** 只取 fanfic canon 里已确认的桶；pending/rejected 不能因为“导入了”就变成 kit 生效依据。 */
function confirmedRows(fanfic, bucket) {
  const canon = fanfic?.canon ?? {}
  const rows = canon[bucket] ?? canon[`${bucket}.json`] ?? []
  return Array.isArray(rows) ? rows.filter((row) => row && row.status === 'confirmed') : []
}

function textOf(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

/** 有 project.sourceId 时精确匹配；没有唯一匹配返回 null（调用方必须失败关闭）。 */
function selectFanficSource(fanfic) {
  const candidates = fanfic?.sources ?? []
  const wanted = String(fanfic?.project?.sourceId ?? '').trim()
  if (wanted) return candidates.find((item) => String(item.sourceId ?? '') === wanted) ?? null
  return candidates.length === 1 ? candidates[0] : null
}

/**
 * fanfic canon → kit WorldContract 的最小语义投影。
 * 只映射已确认条目；未知/空字段丢弃，不补造事实。返回 null 表示没有可生效内容。
 */
function buildFanficContract({ book, sourceId, title, fanfic }) {
  const contract = defaultWorldContract({ book, sourceId, title })
  const facts = []
  for (const row of confirmedRows(fanfic, 'facts')) {
    const entity = textOf(row.subject, row.entity, row.subjectName)
    const value = textOf(row.value, row.object)
    if (entity && value) facts.push({ entity, key: textOf(row.predicate, row.key), value })
  }
  const characters = []
  for (const row of confirmedRows(fanfic, 'characters')) {
    const name = textOf(row.name)
    if (!name) continue
    characters.push({
      name,
      aliases: Array.isArray(row.aliases) ? row.aliases.filter((item) => typeof item === 'string' && item.trim()) : [],
      role: textOf(row.role) || null,
    })
  }
  const addresses = []
  for (const row of confirmedRows(fanfic, 'addresses')) {
    if (textOf(row.from) && textOf(row.to) && textOf(row.form)) {
      addresses.push({
        from: textOf(row.from),
        to: textOf(row.to),
        form: textOf(row.form),
        public: textOf(row.publicForm, row.public) || null,
        private: textOf(row.privateForm, row.private) || null,
        fromChapter: textOf(row.fromChapter) || null,
      })
    }
  }
  const secrets = []
  for (const row of confirmedRows(fanfic, 'secrets')) {
    const what = textOf(row.what, row.text)
    if (what) secrets.push({ what, publicAtChapter: row.publicAtChapter ?? null, knownBy: Array.isArray(row.knownBy) ? row.knownBy : [] })
  }
  const worldRules = []
  for (const row of confirmedRows(fanfic, 'worldRules')) {
    const text = textOf(row.rule, row.text)
    if (text) worldRules.push({ text })
  }
  const forbidden = []
  for (const item of fanfic?.project?.exports?.forbidden ?? []) {
    const text = textOf(item)
    if (text) forbidden.push({ text })
  }
  contract.facts = facts
  contract.characters = characters
  contract.addresses = addresses
  contract.secrets = secrets
  contract.worldRules = worldRules
  contract.forbidden = forbidden
  contract.relationships = []
  contract.timeline = []
  contract.contractRevision = 1
  contract.revision = 1
  const ready = facts.length + characters.length + addresses.length + secrets.length + worldRules.length + forbidden.length > 0
  contract.status = ready ? 'confirmed' : 'pending-extraction'
  if (ready) contract.confirmedAt = new Date().toISOString()
  contract.contentHash = computeContentHash(contract)
  const projected = { facts, characters, addresses, secrets, worldRules, forbidden }
  contract.fanficCanonHash = sha256(JSON.stringify(projected))
  return {
    contract,
    counts: {
      facts: facts.length, characters: characters.length, addresses: addresses.length,
      secrets: secrets.length, worldRules: worldRules.length, forbidden: forbidden.length,
    },
    unsupportedFields: ['relationships', 'timeline', 'fact.evidenceRefs'],
  }
}

async function dirEntries(base) {
  try {
    return (await readdir(base, { withFileTypes: true })).filter((entry) => entry.isDirectory() && !entry.name.startsWith('.')).map((entry) => entry.name)
  } catch {
    return []
  }
}

async function readJsonOrNull(file) {
  try {
    const text = (await readFile(file, 'utf8')).replace(/^\uFEFF/u, '')
    return JSON.parse(text)
  } catch (error) {
    if (error?.code === 'ENOENT' || /ENOENT/.test(String(error?.message ?? ''))) return null
    throw new Error(`旧数据读不出来（${file}）：${String(error?.message ?? error)}`)
  }
}

async function readJsonDir(dir) {
  const out = []
  for (const name of await dirEntries(dir)) {
    const data = await readJsonOrNull(path.join(dir, name, 'profile.json')).catch(() => null)
    if (data) out.push({ name, data })
  }
  return out
}

async function readJsonFiles(dir) {
  let names = []
  try {
    names = (await readdir(dir, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.endsWith('.json')).map((entry) => entry.name)
  } catch {
    return []
  }
  const out = []
  for (const name of names) {
    if (name === 'index.json') continue
    const data = await readJsonOrNull(path.join(dir, name)).catch(() => null)
    if (data) out.push({ name: name.replace(/\.json$/u, ''), data })
  }
  return out
}

async function readJsonl(file) {
  try {
    const text = (await readFile(file, 'utf8')).replace(/^\uFEFF/u, '')
    return text.split(/\r?\n/u).filter((line) => line.trim()).map((line) => JSON.parse(line))
  } catch {
    return []
  }
}

async function fileInfo(file) {
  try {
    const info = await stat(file)
    if (!info.isFile()) return null
    const buffer = await readFile(file)
    return { file, bytes: buffer.length, sha256: sha256(buffer.toString('utf8')) }
  } catch {
    return null
  }
}

/** 只读扫描五件目录；不创建、不修改。 */
export async function discoverLegacy(root) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw new Error('legacy: root 必须是绝对路径')
  const out = { root, beat: [], fade: [], voice: [], fanfic: [], conductor: [] }
  for (const [kind, dir] of Object.entries(LEGACY_DIRS)) {
    out[kind] = await dirEntries(path.join(root, dir))
  }
  return out
}

/** 读一份 beat book.json；保留原始与来源判断。 */
export async function readLegacyBeat(root, book) {
  const name = safeName(book)
  const file = path.join(root, LEGACY_DIRS.beat, name, 'book.json')
  const raw = await readJsonOrNull(file)
  if (!raw) return null
  return {
    file,
    raw,
    schemaVersion: Number.isInteger(raw.schemaVersion) ? raw.schemaVersion : 1,
    kitOrigin: raw?.meta?.source === 'dsh-novel-kit' || raw?.meta?.createdBy === 'dsh-novel-kit',
    requests: Array.isArray(raw.requests) ? raw.requests : [],
    answers: Array.isArray(raw.answers) ? raw.answers : [],
    decisions: Array.isArray(raw.decisions) ? raw.decisions : [],
    segments: Array.isArray(raw.segments) ? raw.segments : [],
    canon: Array.isArray(raw.canon) ? raw.canon : [],
    obligations: Array.isArray(raw.obligations) ? raw.obligations : [],
    forks: Array.isArray(raw.forks) ? raw.forks : [],
    audit: Array.isArray(raw.audit) ? raw.audit : [],
    revisions: Array.isArray(raw.revisions) ? raw.revisions : [],
    revision: Number.isFinite(raw.revision) ? raw.revision : 0,
  }
}

export async function readLegacyFade(root, book) {
  const name = safeName(book)
  const file = path.join(root, LEGACY_DIRS.fade, name, 'memory.json')
  const raw = await readJsonOrNull(file)
  if (!raw) return null
  return {
    file,
    raw,
    schemaVersion: Number.isInteger(raw.schemaVersion) ? raw.schemaVersion : 1,
    kitOrigin: raw?.meta?.source === 'dsh-novel-kit',
    chapters: raw.chapters && typeof raw.chapters === 'object' ? raw.chapters : {},
    cards: Array.isArray(raw.cards) ? raw.cards : [],
    entities: raw.entities && typeof raw.entities === 'object' ? raw.entities : {},
    places: raw.places && typeof raw.places === 'object' ? raw.places : {},
    threads: Array.isArray(raw.threads) ? raw.threads : [],
    povDistortions: Array.isArray(raw.povDistortions) ? raw.povDistortions : [],
    policy: raw.policy && typeof raw.policy === 'object' ? raw.policy : null,
    archive: raw.archive && typeof raw.archive === 'object' ? raw.archive : null,
    audit: Array.isArray(raw.audit) ? raw.audit : [],
    revision: Number.isFinite(raw?.meta?.revision) ? raw.meta.revision : 0,
  }
}

export async function readLegacyVoice(root, library) {
  const name = safeName(library)
  const dir = path.join(root, LEGACY_DIRS.voice, name)
  const libraryRaw = await readJsonOrNull(path.join(dir, 'library.json'))
  if (!libraryRaw) return null
  const profiles = await readJsonDir(path.join(dir, 'profiles'))
  const personas = await readJsonFiles(path.join(dir, 'personas'))
  const ratings = await readJsonl(path.join(dir, 'ratings.jsonl'))
  const reader = await readJsonOrNull(path.join(dir, 'reader.json'))
  return { dir, library: libraryRaw, profiles, personas, ratings, reader }
}

export async function readLegacyFanfic(root, project) {
  const name = safeName(project)
  const dir = path.join(root, LEGACY_DIRS.fanfic, name)
  const projectRaw = await readJsonOrNull(path.join(dir, 'project.json'))
  if (!projectRaw) return null
  const canon = {}
  for (const file of ['characters.json', 'secrets.json', 'facts.json', 'worldRules.json', 'addresses.json', 'contradictions.json', 'proposals.json', 'world.json', 'relationships.json']) {
    const value = await readJsonOrNull(path.join(dir, 'canon', file))
    if (value !== null) canon[file] = value
  }
  const media = await readJsonOrNull(path.join(dir, 'media.json'))
  const avatars = await readJsonOrNull(path.join(dir, 'avatars.json'))
  const sources = []
  for (const sourceId of await dirEntries(path.join(dir, 'source'))) {
    const info = await fileInfo(path.join(dir, 'source', sourceId, 'raw.txt'))
    if (info) sources.push({ sourceId, ...info })
  }
  return { dir, project: projectRaw, canon, media, avatars, sources }
}

export async function readLegacyConductor(root, book) {
  const name = safeName(book)
  const dir = path.join(root, LEGACY_DIRS.conductor)
  const books = await readJsonOrNull(path.join(dir, 'books.json'))
  const bookJson = await readJsonOrNull(path.join(dir, 'book.json'))
  const bookRuns = await dirEntries(path.join(dir, 'books', name, 'runs'))
  const runs = []
  for (const runId of bookRuns) {
    const data = await readJsonOrNull(path.join(dir, 'books', name, 'runs', runId, 'run.json')).catch(() => null)
    if (data) runs.push({ runId, data })
  }
  if (!books && !bookJson && runs.length === 0) return null
  return { books, book: bookJson, runs }
}

/** 正文文件：只读列出 正文/ 与 正文/<book>/ 下的 md。 */
export async function listLegacyBody(root, book) {
  const candidates = [path.join(root, '正文'), path.join(root, '正文', safeName(book))]
  const files = []
  for (const dir of candidates) {
    let names = []
    try {
      names = (await readdir(dir, { withFileTypes: true })).filter((entry) => entry.isFile() && /\.md$/iu.test(entry.name)).map((entry) => entry.name)
    } catch {
      continue
    }
    for (const name of names) {
      if (files.some((item) => item.name === name)) continue
      const info = await fileInfo(path.join(dir, name))
      if (info) files.push({ name, dir, ...info })
    }
  }
  files.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true }))
  return files
}

function toNativeDecisions({ bookId, book, beat }) {
  const doc = emptyDecisions({ bookId, book })
  return {
    ...doc,
    requests: beat.requests,
    answers: beat.answers,
    decisions: beat.decisions,
    segments: beat.segments,
    canon: beat.canon,
    obligations: beat.obligations,
    audit: beat.audit,
    revisions: beat.revisions,
    importedFrom: { kind: 'beat', schemaVersion: beat.schemaVersion, sourceRevision: beat.revision, file: beat.file },
  }
}

function toNativeMemory({ bookId, book, fade }) {
  const doc = emptyMemory({ bookId, book })
  return {
    ...doc,
    chapters: fade.chapters,
    cards: fade.cards,
    entities: fade.entities,
    places: fade.places,
    threads: fade.threads,
    povDistortions: fade.povDistortions,
    policy: fade.policy ?? doc.policy,
    archive: fade.archive ?? doc.archive,
    audit: fade.audit,
    importedFrom: { kind: 'fade', schemaVersion: fade.schemaVersion, sourceRevision: fade.revision, file: fade.file },
  }
}

function assertWritableTarget(decisions, memory, media, { replace = false } = {}) {
  const hasDecisions = (decisions.decisions?.length ?? 0) + (decisions.segments?.length ?? 0) + (decisions.canon?.length ?? 0) > 0
  const hasMemory = (memory.cards?.length ?? 0) + (memory.threads?.length ?? 0) > 0
  const hasMedia = (media.sources?.length ?? 0) + (media.evidence?.length ?? 0) > 0
  if (!replace && (hasDecisions || hasMemory || hasMedia)) {
    throw new Error('目标书已有原生数据；导入默认拒绝覆盖（确认后用 replace:true 重新导入为新快照）')
  }
}

async function saveRaw(dir, name, value) {
  if (value === null || value === undefined) return null
  const file = path.join(dir, name)
  await writeJsonAtomic(file, value, { ensureDir: true })
  return fileInfo(file)
}

async function copyIfExists(source, target) {
  if (!source || !target) return null
  try {
    await mkdir(path.dirname(target), { recursive: true })
    await copyFile(source, target)
    return fileInfo(target)
  } catch (error) {
    if (error?.code === 'ENOENT' || /ENOENT/.test(String(error?.message ?? ''))) return null
    throw error
  }
}

/**
 * 导入一本书：五件的 beat/fade/voice/fanfic/conductor + 正文。
 * @param {{root:string, book:string, mode?:'original'|'fanfic', sources?:object, replace?:boolean}} input
 */
export async function importLegacyBook({ root, book, mode = 'original', sources = {}, replace = false } = {}) {
  return withLock({ root, flowId: 'legacy-import' }, async () => {
  const name = normalizeBookName(book)
  const beat = sources.beat === false ? null : await readLegacyBeat(root, name)
  const fade = sources.fade === false ? null : await readLegacyFade(root, name)
  const voice = sources.voice ? await readLegacyVoice(root, sources.voice) : null
  const fanfic = sources.fanfic ? await readLegacyFanfic(root, sources.fanfic) : null
  const conductor = sources.conductor === false ? null : await readLegacyConductor(root, name)
  // 同人导入必须在任何写入前确认来源唯一；否则先写账本再失败会留下半成品。
  if (fanfic && mode === 'fanfic' && !selectFanficSource(fanfic)?.file) {
    throw new Error('fanfic 项目无法按 sourceId 唯一确定原文来源：拒绝导入，避免绑定错误或旧 canon')
  }
  const body = sources.body === false ? [] : await listLegacyBody(root, name)
  if (!beat && !fade && !voice && !fanfic && !conductor && body.length === 0) {
    throw new Error('没有找到可导入的旧数据')
  }

  const target = await ensureBook({ root, book: name, mode })
  const bookId = target.bookId
  const currentDecisions = await readDecisions(root, bookId)
  const currentMemory = await readMemory(root, bookId)
  const currentMedia = await readMedia(root, bookId)
  assertWritableTarget(currentDecisions, currentMemory, currentMedia, { replace })
  if (!replace && (await listBodyFiles(root, bookId)).length > 0) {
    throw new Error('目标书正文目录已有章节文件；导入默认拒绝覆盖（确认后用 replace:true 重新导入为新快照）')
  }

  const batchId = `imp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const batchDir = path.join(importsDir(root), batchId)
  await mkdir(batchDir, { recursive: true })
  const files = []
  const warnings = []

  if (beat) {
    if (beat.schemaVersion >= 3) warnings.push(`beat schemaVersion=${beat.schemaVersion}：request/answer/gate 未转换成 kit 决策，原样保存在导入批次`)
    files.push(await saveRaw(batchDir, 'beat-book.json', beat.raw))
  }
  if (fade) files.push(await saveRaw(batchDir, 'fade-memory.json', fade.raw))
  if (voice) {
    files.push(await saveRaw(batchDir, 'voice-library.json', voice.library))
    for (const profile of voice.profiles) files.push(await saveRaw(path.join(batchDir, 'voice', 'profiles'), `${profile.name}.json`, profile.data))
    for (const persona of voice.personas) files.push(await saveRaw(path.join(batchDir, 'voice', 'personas'), `${persona.name}.json`, persona.data))
    const ratingsCopied = await copyIfExists(path.join(voice.dir, 'ratings.jsonl'), path.join(batchDir, 'voice', 'ratings.jsonl'))
    if (ratingsCopied) files.push(ratingsCopied)
    if (voice.reader) files.push(await saveRaw(path.join(batchDir, 'voice'), 'reader.json', voice.reader))
  }
  if (fanfic) {
    files.push(await saveRaw(batchDir, 'fanfic-project.json', fanfic.project))
    for (const [file, value] of Object.entries(fanfic.canon)) files.push(await saveRaw(path.join(batchDir, 'fanfic', 'canon'), file, value))
    if (fanfic.media) files.push(await saveRaw(batchDir, 'fanfic-media.json', fanfic.media))
    if (fanfic.avatars) files.push(await saveRaw(batchDir, 'fanfic-avatars.json', fanfic.avatars))
    for (const source of fanfic.sources) {
      const copied = await copyIfExists(source.file, path.join(batchDir, 'fanfic', 'source', source.sourceId, 'raw.txt'))
      if (copied) files.push(copied)
    }
  }
  if (conductor) {
    files.push(await saveRaw(batchDir, 'conductor-books.json', conductor.books))
    files.push(await saveRaw(batchDir, 'conductor-book.json', conductor.book))
    for (const run of conductor.runs) files.push(await saveRaw(path.join(batchDir, 'conductor', 'runs'), `${run.runId}.json`, run.data))
  }

  const bodyFiles = []
  for (const item of body) {
    const targetFile = path.join(bodyDir(root, bookId), item.name)
    const copied = await copyIfExists(item.file, targetFile)
    if (copied) bodyFiles.push({ name: item.name, sha256: copied.sha256, bytes: copied.bytes, source: item.file })
  }

  if (beat || fade) {
    const decisions = beat ? toNativeDecisions({ bookId, book: name, beat }) : { ...currentDecisions }
    const memory = fade ? toNativeMemory({ bookId, book: name, fade }) : { ...currentMemory }
    await writeDecisions(root, bookId, decisions, { expectedRevision: currentDecisions.revision })
    await writeMemory(root, bookId, memory, { expectedRevision: currentMemory.revision })
  }
  if (fanfic?.media) {
    await writeMediaHoldingLock(root, bookId, mediaFromLegacy(fanfic.media, { bookId, book: name }), { expectedRevision: currentMedia.revision })
  }

  // fanfic 快照不是“canon 已生效”。同人导入必须把原文写进 kit 原生 sources/，
  // 把已确认的 fanfic canon 投影成本地 world contract，并绑定 settings；
  // 否则 startChapter 会静默落到 original 模式（比报错更危险）。
  let canonImport = null
  if (fanfic) {
    if (mode !== 'fanfic') {
      warnings.push('fanfic 数据已快照保存，但 mode=original：未建立原生 canon 绑定；要写同人请用 mode=fanfic 重新导入')
    } else {
      // 有 sourceId 时按项目当前来源精确匹配；没有唯一匹配就失败关闭，不能取
      // 目录枚举的第一个（多来源项目会绑到不确定的原文）。
      const candidates = fanfic.sources ?? []
      const source = selectFanficSource(fanfic)
      if (!source?.file) {
        await writeProjectSettingsUnlocked(root, name, { mode: 'fanfic' })
        warnings.push(candidates.length > 1
          ? `fanfic 项目有 ${candidates.length} 个来源但无法按 sourceId 唯一匹配：已切同人模式，canon 未绑定`
          : 'fanfic 项目没有可读原文：已切同人模式，但 canon 未绑定，开章会被 canon-required 拦住')
      } else {
        const ingested = await ingestSource({ root, file: source.file, title: fanfic.project?.title ?? name })
        const contractFile = worldContractFile(root, name, ingested.sourceId)
        const built = buildFanficContract({
          book: name,
          sourceId: ingested.sourceId,
          title: fanfic.project?.title ?? name,
          fanfic,
        })
        let contract
        let reused = false
        try {
          contract = await readWorldContract(root, name, ingested.sourceId)
          reused = true
          // 原文没变但 fanfic 的 confirmed canon 变了：不能静默复用旧投影。
          if (contract.fanficCanonHash && contract.fanficCanonHash !== built.contract.fanficCanonHash) {
            throw new Error('fanfic canon 投影已变化：拒绝复用旧 world.json；请先导出旧数据/确认后再显式重建')
          }
        } catch (error) {
          const missing = error?.code === 'ENOENT' || /ENOENT/u.test(String(error?.message ?? error))
          if (!missing) throw error
          contract = built.contract
          await writeJsonAtomic(contractFile, contract, { ensureDir: true })
        }
        const settings = await writeProjectSettingsUnlocked(root, name, {
          mode: 'fanfic',
          activeCanonSourceId: ingested.sourceId,
        })
        const ready = isCanonReady(contract)
        canonImport = {
          bound: true,
          sourceId: ingested.sourceId,
          sourceMatched: String(source.sourceId ?? '').replace(/^src_/u, '') !== ''
            ? ingested.sourceId.startsWith(String(source.sourceId ?? '').replace(/^src_/u, ''))
            : false,
          reused,
          ready,
          status: contract.status,
          counts: built.counts,
          unsupportedFields: built.unsupportedFields,
          settingsRevision: settings.revision,
        }
        if (!ready) {
          warnings.push('fanfic canon 已绑定，但契约没有可用的已确认内容；开章会被 canon-not-ready 拦住，需作者先审阅 canon')
        }
      }
    }
  }

  const manifest = {
    schemaVersion: 1,
    batchId,
    bookId,
    book: name,
    mode,
    canon: canonImport,
    createdAt: new Date().toISOString(),
    status: 'completed',
    origin: beat?.kitOrigin || fade?.kitOrigin ? 'kit-legacy-or-mixed' : 'five-plugin',
    sources: {
      beat: beat ? { file: beat.file, schemaVersion: beat.schemaVersion, kitOrigin: beat.kitOrigin, decisions: beat.decisions.length, segments: beat.segments.length, canon: beat.canon.length } : null,
      fade: fade ? { file: fade.file, schemaVersion: fade.schemaVersion, kitOrigin: fade.kitOrigin, cards: fade.cards.length, threads: fade.threads.length } : null,
      voice: voice ? { dir: voice.dir, profiles: voice.profiles.length, personas: voice.personas.length, ratings: voice.ratings.length, reader: Boolean(voice.reader) } : null,
      fanfic: fanfic ? { dir: fanfic.dir, canon: Object.keys(fanfic.canon), sources: fanfic.sources.length, mediaSources: fanfic.media?.sources?.length ?? 0, mediaEvidence: fanfic.media?.evidence?.length ?? 0 } : null,
      conductor: conductor ? { runs: conductor.runs.length } : null,
      body: bodyFiles.length,
    },
    body: bodyFiles,
    files: files.filter(Boolean),
    warnings,
  }
  await writeJsonAtomic(path.join(batchDir, 'manifest.json'), manifest, { ensureDir: true })
  return {
    ok: true,
    book: name,
    bookId,
    batchId,
    batchDir,
    imported: {
      decisions: beat?.decisions.length ?? 0,
      segments: beat?.segments.length ?? 0,
      canon: beat?.canon.length ?? 0,
      cards: fade?.cards.length ?? 0,
      threads: fade?.threads.length ?? 0,
      profiles: voice?.profiles.length ?? 0,
      personas: voice?.personas.length ?? 0,
      ratings: voice?.ratings.length ?? 0,
      fanficSources: fanfic?.sources.length ?? 0,
      mediaSources: fanfic?.media?.sources?.length ?? 0,
      mediaEvidence: fanfic?.media?.evidence?.length ?? 0,
      canonBound: canonImport?.bound === true,
      canonReady: canonImport?.ready === true,
      body: bodyFiles.length,
    },
    canon: canonImport,
    warnings,
  }
  })
}

/** 只读预览：不写任何文件；给 UI 导入向导用。 */
export async function previewLegacy(root) {
  const found = await discoverLegacy(root)
  const names = [...new Set([...found.beat, ...found.fade, ...found.fanfic, ...found.conductor])].sort()
  const items = []
  for (const name of names) {
    const beat = await readLegacyBeat(root, name).catch(() => null)
    const fade = await readLegacyFade(root, name).catch(() => null)
    items.push({
      book: name,
      origin: beat?.kitOrigin || fade?.kitOrigin ? 'kit-legacy-or-mixed' : 'five-plugin',
      beat: beat ? { schemaVersion: beat.schemaVersion, kitOrigin: beat.kitOrigin, decisions: beat.decisions.length, segments: beat.segments.length } : null,
      fade: fade ? { schemaVersion: fade.schemaVersion, cards: fade.cards.length } : null,
      hasFanfic: found.fanfic.includes(name),
      body: (await listLegacyBody(root, name)).length,
    })
  }
  return { root, found, items }
}
