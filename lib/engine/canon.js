// 门 B：写同人。原文与 style 共用 SourceDocument；这里只负责 canon 绑定与世界契约。
//
// 0.2.0 第一版不自动抽取高层 canon：导入后世界契约是 pending-extraction，
// 同人 start 必须等契约有内容且经确认，避免「没有强约束就开写」。
import path from 'node:path'
import { readJsonSnapshot, sha256, writeJsonAtomic } from '../storage/atomic-json.js'
import { KIT_DIR, readProjectSettings, writeProjectSettings } from './settings.js'
import { ingestSource } from './sources.js'
import { assertSafeName } from '../workspace.js'

export const CANON_SCHEMA_VERSION = 2
export const LEGACY_CANON_SCHEMA_VERSION = 1

export function canonRoot(root, book) {
  assertSafeName(book, 'book')
  return path.join(root, KIT_DIR, 'canon', book)
}

export function worldContractFile(root, book, sourceId) {
  const id = String(sourceId ?? '')
  if (!/^[a-f0-9]{64}$/u.test(id)) throw new Error('canon sourceId 必须是完整 SHA-256')
  return path.join(canonRoot(root, book), id, 'world.json')
}

export function defaultWorldContract({ book, sourceId, title = '' }) {
  return {
    schemaVersion: CANON_SCHEMA_VERSION,
    book,
    sourceId,
    title,
    status: 'pending-extraction',
    contractRevision: 0,
    contentHash: null,
    facts: [],
    characters: [],
    relationships: [],
    addresses: [],
    secrets: [],
    worldRules: [],
    timeline: [],
    forbidden: [],
    pendingChanges: [],
    appliedOperations: [],
    createdAt: new Date().toISOString(),
    revision: 1,
  }
}

function hasCanonConstraints(contract) {
  if (!contract || typeof contract !== 'object') return false
  return Object.keys(CONTRACT_FIELDS).some((field) => Array.isArray(contract[field]) && contract[field].some((item) => isUsableEntry(field, item)))
}

const CONTRACT_FIELDS = Object.freeze({
  facts: true,
  characters: true,
  relationships: true,
  addresses: true,
  secrets: true,
  worldRules: true,
  timeline: true,
  forbidden: true,
})

const textOf = (value) => (typeof value === 'string' ? value.trim() : '')

/** 每个字段的可消费形状；update、confirm、ready 共用，避免空字符串/ null 混过。 */
export function isUsableEntry(field, item) {
  if (typeof item === 'string') return textOf(item).length > 0
  if (!item || typeof item !== 'object') return false
  if (field === 'facts') {
    // fanfic 导入用 subject，模型提案常用 entity；两个都要认，否则条目会被静默丢掉。
    return (textOf(item.entity) || textOf(item.subjectName) || textOf(item.subject)).length > 0 && String(item.value ?? item.object ?? '').trim().length > 0
  }
  if (field === 'characters') return textOf(item.name).length > 0
  if (field === 'relationships') return (textOf(item.from) || textOf(item.a) || textOf(item.text)).length > 0 && (textOf(item.to) || textOf(item.b) || textOf(item.text)).length > 0
  if (field === 'addresses') return textOf(item.from).length > 0 && textOf(item.to).length > 0 && textOf(item.form).length > 0
  if (field === 'secrets') return String(item.what ?? item.text ?? '').trim().length > 0
  if (field === 'worldRules' || field === 'timeline') return (textOf(item.text) || textOf(item.rule) || textOf(item.event)).length > 0
  if (field === 'forbidden') return (textOf(item.text) || textOf(item.rule)).length > 0
  return false
}

export function contractHash(contract) {
  if (!contract || typeof contract !== 'object') return null
  const copy = { ...contract }
  delete copy.hash
  return sha256(JSON.stringify(copy))
}

/** 键排序的稳定 JSON：数组顺序保留（装配按顺序取前 N 条，顺序有实际影响）。 */
export function stableStringify(value) {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']'
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}'
  }
  return JSON.stringify(value ?? null)
}

// 参与已生效指纹的字段白名单：审阅时间、解释性 meta 等一律不进 hash。
const HASH_FIELDS = Object.freeze({
  facts: ['entity', 'key', 'value'],
  characters: ['name', 'aliases', 'role'],
  relationships: ['from', 'to', 'kind', 'text'],
  addresses: ['from', 'to', 'form', 'public', 'private', 'fromChapter'],
  secrets: ['what', 'publicAtChapter', 'knownBy'],
  worldRules: ['text'],
  timeline: ['text'],
  forbidden: ['text'],
})

function pickField(entry, names) {
  for (const name of names) {
    const value = entry?.[name]
    if (value !== undefined && value !== null) return value
  }
  return undefined
}

/** 把条目压到白名单字段（兼容 subject/predicate/object 等旧别名）。 */
function canonicalEntry(collection, entry, index) {
  if (typeof entry === 'string') return collection === 'worldRules' || collection === 'timeline' || collection === 'forbidden' ? { text: entry } : { text: entry }
  const source = entry && typeof entry === 'object' ? entry : {}
  const canonical = { entryId: entryIdOf(collection, source) }
  if (collection === 'facts') {
    canonical.entity = pickField(source, ['entity', 'subject', 'subjectName']) ?? ''
    canonical.key = pickField(source, ['key', 'predicate']) ?? ''
    canonical.value = pickField(source, ['value', 'object']) ?? ''
  } else if (collection === 'relationships') {
    canonical.from = pickField(source, ['from', 'a', 'source']) ?? ''
    canonical.to = pickField(source, ['to', 'b', 'target']) ?? ''
    canonical.kind = pickField(source, ['kind', 'type', 'relation']) ?? null
    canonical.text = pickField(source, ['text']) ?? ''
  } else if (collection === 'secrets') {
    canonical.what = pickField(source, ['what', 'text']) ?? ''
    canonical.publicAtChapter = source.publicAtChapter ?? null
    canonical.knownBy = Array.isArray(source.knownBy) ? source.knownBy : []
  } else if (collection === 'worldRules' || collection === 'timeline' || collection === 'forbidden') {
    canonical.text = pickField(source, ['text', 'rule', 'event']) ?? ''
  } else {
    for (const field of HASH_FIELDS[collection] ?? []) canonical[field] = source[field] ?? null
  }
  canonical.evidenceRefs = Array.isArray(source.evidenceRefs) ? source.evidenceRefs : []
  return canonical
}

/**
 * 已生效内容的指纹：对白名单投影做稳定序列化。
 * 审阅时间、回执、文档 revision 都不参与——否则「拒绝一条提案」也会让上下文失效。
 */
export function computeContentHash(contract) {
  if (!contract || typeof contract !== 'object') return null
  const payload = {
    title: contract.title ?? '',
    sourceId: contract.sourceId ?? null,
    collections: {},
  }
  for (const field of CONTRACT_ARRAYS) {
    const list = Array.isArray(contract[field]) ? contract[field] : []
    payload.collections[field] = list.map((entry, index) => canonicalEntry(field, entry, index))
  }
  return sha256(stableStringify(payload))
}

/**
 * 消费方只该看这份投影：没有生效版本时返回 null；返回深拷贝；
 * 永远不含 pendingChanges / 审阅历史 / 回执。
 */
export function getPublishedCanon(contract) {
  if (!contract || typeof contract !== 'object') return null
  const contractRevision = Number.isInteger(contract.contractRevision) ? contract.contractRevision : 0
  if (contractRevision < 1) return null
  const published = {
    schemaVersion: contract.schemaVersion ?? LEGACY_CANON_SCHEMA_VERSION,
    book: contract.book ?? null,
    sourceId: contract.sourceId ?? null,
    title: contract.title ?? '',
    status: contract.status ?? 'unknown',
    contractRevision,
    contentHash: contract.contentHash ?? computeContentHash(contract),
  }
  for (const field of CONTRACT_ARRAYS) {
    published[field] = (Array.isArray(contract[field]) ? contract[field] : []).map((entry) => (typeof entry === 'string' ? entry : structuredClone(entry)))
  }
  return published
}

/** schema 1 → 2：纯函数迁移，不写盘、不改传入对象。 */
export function migrateWorldContract(contract, { book = null, sourceId = null } = {}) {
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    const error = new Error('世界契约不是对象')
    error.code = 'canon-corrupt'
    throw error
  }
  const schema = contract.schemaVersion
  if (schema === CANON_SCHEMA_VERSION) {
    if (!Number.isInteger(contract.contractRevision) || !Array.isArray(contract.pendingChanges) || !Array.isArray(contract.appliedOperations)) {
      const error = new Error('schema 2 契约缺少 contractRevision / pendingChanges / appliedOperations')
      error.code = 'canon-corrupt'
      throw error
    }
    return structuredClone(contract)
  }
  if (schema !== LEGACY_CANON_SCHEMA_VERSION) {
    const error = new Error('不支持的世界契约 schema：' + String(schema))
    error.code = 'canon-schema-unsupported'
    throw error
  }

  const next = structuredClone(contract)
  next.schemaVersion = CANON_SCHEMA_VERSION
  next.legacyV1 = structuredClone(contract)
  next.book = next.book ?? book
  next.sourceId = next.sourceId ?? sourceId
  next.pendingChanges = []
  next.appliedOperations = []
  next.revision = Number.isInteger(contract.revision) ? contract.revision : 1

  const confirmed = contract.status === 'confirmed' && hasCanonConstraints(contract)
  if (confirmed) {
    next.contractRevision = 1
    next.contentHash = computeContentHash(next)
    return next
  }

  // 未确认的旧契约：旧数组不能当成生效内容，逐条转成待审候选。
  const legacyCollections = {}
  for (const field of CONTRACT_ARRAYS) {
    legacyCollections[field] = Array.isArray(contract[field]) ? contract[field] : []
    next[field] = []
  }
  next.contractRevision = 0
  next.contentHash = null
  const seen = new Map()
  for (const field of CONTRACT_ARRAYS) {
    for (const entry of legacyCollections[field]) {
      if (!isUsableEntry(field, entry)) continue
      const base = stableStringify(entry)
      const occurrence = seen.get(field + ':' + base) ?? 0
      seen.set(field + ':' + base, occurrence + 1)
      const entryId = 'e_m1_' + sha256(String(next.book) + '|' + String(next.sourceId) + '|' + field + '|' + base + '|' + occurrence).slice(0, 16)
      const changeHash = sha256(String(next.book) + '|' + String(next.sourceId) + '|' + field + '|' + entryId + '|add|0')
      next.pendingChanges.push({
        changeId: 'c_m1_' + changeHash.slice(0, 16),
        collection: field,
        entryId,
        operation: 'add',
        baseContractRevision: 0,
        before: null,
        beforeHash: null,
        after: entry,
        evidenceRefs: Array.isArray(entry?.evidenceRefs) ? entry.evidenceRefs : [],
        changeHash,
        decision: 'pending',
        reviewedBy: null,
        reviewedAt: null,
        appliedRevision: null,
        proposedBy: { kind: 'migration' },
      })
    }
  }
  return next
}

/** 条目的稳定身份：显式 id 优先，否则按内容派生（不随数组下标变化）。 */
export function entryIdOf(collection, entry) {
  if (entry && typeof entry === 'object' && typeof entry.id === 'string' && entry.id) return entry.id
  return 'e_' + sha256(String(collection) + ':' + stableStringify(entry)).slice(0, 12)
}

// 同一本书/同一 source 的契约写入串行化，避免两个编辑请求各读旧版本、后写覆盖。
const canonLocks = new Map()
async function withCanonLock(key, task) {
  const previous = canonLocks.get(key) ?? Promise.resolve()
  const run = previous.then(task, task)
  const tail = run.catch(() => {})
  canonLocks.set(key, tail)
  try {
    return await run
  } finally {
    if (canonLocks.get(key) === tail) canonLocks.delete(key)
  }
}

/** 契约是否足以给同人写作提供强约束：必须已确认，且至少有一条可用约束。 */
export function isCanonReady(contract) {
  if (!contract || typeof contract !== 'object') return false
  if (contract.status !== 'confirmed') return false
  return hasCanonConstraints(contract)
}

function legacyCanonReady(project, canon) {
  if (!project || !canon) return false
  const nonEmpty = (value) => Array.isArray(value) && value.length > 0
  return nonEmpty(project.exports?.forbidden)
    || nonEmpty(project.exports?.addresses)
    || nonEmpty(canon.facts)
    || nonEmpty(canon.characters)
    || nonEmpty(canon.secrets)
}

export async function readWorldContract(root, book, sourceId) {
  const snap = await readJsonSnapshot(worldContractFile(root, book, sourceId))
  // 读时升级到 schema 2，旧契约不改盘也能被新代码消费。
  return migrateWorldContract(snap.json)
}

/** 把 kit 的 WorldContract 变成 fanficContext 能消费的 project 形状。 */
export function contractToProject(contract, { book, revision = 0 } = {}) {
  const published = getPublishedCanon(contract)
  return {
    id: book,
    title: published?.title ?? book,
    sourceId: published?.sourceId ?? null,
    revision,
    currentChapter: null,
    exports: {
      addresses: Array.isArray(published?.addresses) ? published.addresses : [],
      forbidden: Array.isArray(published?.forbidden) ? published.forbidden : [],
    },
    kitCanon: published,
  }
}

const CONTRACT_ARRAYS = ['facts', 'characters', 'relationships', 'addresses', 'secrets', 'worldRules', 'timeline', 'forbidden']

/** 作者或模型提交的契约内容：只接受已知数组字段，进入 pending-review，不自动确认。 */
export async function updateWorldContract({ root, book, sourceId, patch = {}, expectedRevision = null, allowConfirmed = false }) {
  const file = worldContractFile(root, book, sourceId)
  return withCanonLock(`${root}:${book}:${sourceId}`, async () => {
    let current
    try {
      current = await readWorldContract(root, book, sourceId)
    } catch {
      current = defaultWorldContract({ book, sourceId })
    }
    if (current.status === 'confirmed' && allowConfirmed !== true) {
      return { ok: false, code: 'canon-confirmed', message: '这份 canon 已确认；要改先由作者编辑并重新确认。' }
    }
    const currentRevision = Number.isInteger(current.revision) ? current.revision : 0
    if (expectedRevision !== null && expectedRevision !== undefined && Number(expectedRevision) !== currentRevision) {
      return { ok: false, code: 'canon-conflict', message: '世界契约已被另一个操作改过；刷新后再编辑。', current: { revision: currentRevision, hash: contractHash(current) } }
    }
    const next = { ...current }
    const dropped = {}
    for (const field of CONTRACT_ARRAYS) {
      if (Array.isArray(patch[field])) {
        next[field] = patch[field].filter((item) => isUsableEntry(field, item))
        if (next[field].length !== patch[field].length) dropped[field] = patch[field].length - next[field].length
      }
    }
    if (patch.title && typeof patch.title === 'string') next.title = patch.title
    next.status = 'pending-review'
    next.revision = currentRevision + 1
    next.updatedAt = new Date().toISOString()
    // 生效内容被整份替换：生效版本 +1，内容指纹重算（队列与状态不参与指纹）。
    next.contractRevision = (Number.isInteger(current.contractRevision) ? current.contractRevision : 0) + 1
    next.contentHash = computeContentHash(next)
    next.hash = contractHash(next)
    await writeJsonAtomic(file, next, { ensureDir: true })
    return { ok: true, contract: next, canonReady: false, constraints: hasCanonConstraints(next), dropped }
  })
}

/** 作者确认：必须有可用约束；确认后同人 start 才放行。 */
export async function confirmWorldContract({ root, book, sourceId, expectedRevision = null }) {
  return withCanonLock(`${root}:${book}:${sourceId}`, async () => {
    let current
    try {
      current = await readWorldContract(root, book, sourceId)
    } catch {
      return { ok: false, code: 'canon-not-ready', message: '世界契约还不存在：先抽取/提交契约。' }
    }
    const currentRevision = Number.isInteger(current.revision) ? current.revision : 0
    if (expectedRevision !== null && expectedRevision !== undefined && Number(expectedRevision) !== currentRevision) {
      return { ok: false, code: 'canon-conflict', message: '你看到的版本已被更新；刷新并重新审阅后再确认。', current: { revision: currentRevision, hash: contractHash(current) } }
    }
    // 队列里还有未处理/未应用的候选时，不允许「整份批准」绕过逐条审阅。
    // 这条要排在 canon-empty 前面：契约里还没生效内容、但队列里有候选时，
    // 更可操作的提示是「先去应用候选」，而不是「契约是空的」。
    const queue = Array.isArray(current.pendingChanges) ? current.pendingChanges : []
    const unresolved = queue.filter((item) => item.decision === 'pending' || (item.decision === 'accepted' && item.appliedRevision === null))
    if (unresolved.length > 0) {
      return {
        ok: false, code: 'canon-queue-pending',
        message: '还有 ' + unresolved.length + ' 条候选没处理完：在「同人 · 待审阅队列」逐条接受/拒绝并应用后，再确认整份契约。',
        unresolved: unresolved.map((item) => item.changeId),
      }
    }
    if (!hasCanonConstraints(current)) {
      return { ok: false, code: 'canon-empty', message: '契约没有任何可用约束：至少补一条事实/人物/规则/禁忌，再确认。' }
    }
    const next = {
      ...current,
      status: 'confirmed',
      confirmedAt: new Date().toISOString(),
      revision: currentRevision + 1,
      updatedAt: new Date().toISOString(),
    }
    // 第一次确认时把生效版本立起来；之后确认不改内容，不动 contractRevision。
    if (!Number.isInteger(next.contractRevision) || next.contractRevision < 1) {
      next.contractRevision = 1
      next.contentHash = computeContentHash(next)
    }
    next.hash = contractHash(next)
    await writeJsonAtomic(worldContractFile(root, book, sourceId), next, { ensureDir: true })
    return { ok: true, contract: next, canonReady: true }
  })
}

/**
 * 逐条审阅：提案 → 接受/拒绝 → 应用。三个动作改的东西不同：
 * - 提案：新增 pending 记录，只动文档 revision；
 * - 接受/拒绝：更新审核记录，只动文档 revision；
 * - 应用：更新生效数组，contractRevision +1 并重算 contentHash。
 */
const CHANGE_OPERATIONS = new Set(['add', 'update', 'remove'])

function invalidChange(message) {
  return { ok: false, code: 'canon-invalid-change', message }
}

/** 提案：模型/作者提交候选，不改生效内容。 */
export async function proposeCanonChanges({
  root, book, sourceId, changes = [], expectedRevision = null, proposedBy = null,
}) {
  return withCanonLock(`${root}:${book}:${sourceId}`, async () => {
    let current
    try {
      current = await readWorldContract(root, book, sourceId)
    } catch {
      return { ok: false, code: 'canon-missing', message: '世界契约还不存在：先导入原著。' }
    }
    const revision = Number.isInteger(current.revision) ? current.revision : 0
    if (expectedRevision !== null && expectedRevision !== undefined && Number(expectedRevision) !== revision) {
      return {
        ok: false, code: 'canon-conflict',
        message: '契约已被另一个操作改过；刷新后再提案。',
        current: { revision, contractRevision: current.contractRevision, contentHash: current.contentHash },
      }
    }
    if (!Array.isArray(changes) || changes.length === 0) {
      return { ok: false, code: 'canon-empty-change', message: '没有提案内容。' }
    }

    const next = { ...current, pendingChanges: [...(current.pendingChanges ?? [])] }
    const created = []
    const touched = new Set()

    for (const change of changes) {
      const collection = String(change?.collection ?? '')
      const operation = String(change?.operation ?? '')
      if (!CONTRACT_ARRAYS.includes(collection)) return invalidChange('未知集合：' + collection)
      if (!CHANGE_OPERATIONS.has(operation)) return invalidChange('未知操作：' + operation)

      const list = Array.isArray(current[collection]) ? current[collection] : []
      const after = operation === 'remove' ? null : (change?.after ?? null)
      if (operation !== 'remove' && (!after || typeof after !== 'object')) return invalidChange('add/update 需要 after 对象')

      let entryId = String(change?.entryId ?? '')
      let before = null
      if (operation === 'add') {
        entryId = entryId || entryIdOf(collection, after)
        if (list.some((item) => entryIdOf(collection, item) === entryId)) {
          return { ok: false, code: 'canon-entry-exists', message: '这条已经存在：' + collection + ' / ' + entryId }
        }
      } else {
        if (!entryId) return invalidChange('update/remove 需要 entryId')
        const found = list.find((item) => entryIdOf(collection, item) === entryId)
        if (!found) return { ok: false, code: 'canon-entry-missing', message: '找不到条目：' + collection + ' / ' + entryId }
        before = found
      }

      const changeHash = sha256(stableStringify({ collection, entryId, operation, before, after }))
      const changeId = String(change?.changeId || ('chg_' + changeHash.slice(0, 12)))
      const existing = next.pendingChanges.find((item) => item.changeId === changeId)
      if (existing) {
        if (existing.changeHash === changeHash) continue
        return { ok: false, code: 'canon-change-conflict', message: '同一 changeId 的提案内容不同：' + changeId }
      }
      if (touched.has(collection + ':' + entryId)) {
        return { ok: false, code: 'canon-batch-duplicate', message: '同一批里同一集合 + 条目只能有一条变更。' }
      }
      touched.add(collection + ':' + entryId)

      const record = {
        changeId,
        collection,
        entryId,
        operation,
        baseContractRevision: Number.isInteger(current.contractRevision) ? current.contractRevision : 0,
        before,
        beforeHash: before === null ? null : sha256(stableStringify(before)),
        after,
        evidenceRefs: Array.isArray(change?.evidenceRefs) ? change.evidenceRefs : [],
        changeHash,
        decision: 'pending',
        reviewedBy: null,
        reviewedAt: null,
        appliedRevision: null,
        proposedBy: proposedBy ?? null,
      }
      next.pendingChanges.push(record)
      created.push(changeId)
    }

    next.revision = revision + 1
    next.updatedAt = new Date().toISOString()
    next.hash = contractHash(next)
    await writeJsonAtomic(worldContractFile(root, book, sourceId), next, { ensureDir: true })
    return { ok: true, revision: next.revision, contractRevision: next.contractRevision, created, pending: next.pendingChanges.filter((item) => item.decision === 'pending').length }
  })
}

/** 接受 / 拒绝一条提案：不动生效内容；每次审阅追加 reviewHistory，不覆盖历史。 */
export async function reviewCanonChange({
  root, book, sourceId, changeId, action, expectedRevision = null, expectedChangeHash = null, note = '', reviewedBy = null,
}) {
  if (action !== 'accepted' && action !== 'rejected') {
    return { ok: false, code: 'canon-invalid-action', message: 'action 只能是 accepted 或 rejected。' }
  }
  return withCanonLock(`${root}:${book}:${sourceId}`, async () => {
    let current
    try {
      current = await readWorldContract(root, book, sourceId)
    } catch {
      return { ok: false, code: 'canon-missing', message: '世界契约还不存在。' }
    }
    const revision = Number.isInteger(current.revision) ? current.revision : 0
    if (expectedRevision !== null && expectedRevision !== undefined && Number(expectedRevision) !== revision) {
      return { ok: false, code: 'canon-conflict', message: '契约已被改过；刷新后再审阅。', current: { revision } }
    }
    const pending = [...(current.pendingChanges ?? [])]
    const index = pending.findIndex((item) => item.changeId === String(changeId ?? ''))
    if (index < 0) return { ok: false, code: 'canon-change-missing', message: '找不到这条提案。' }
    const change = pending[index]
    // 请求方带了候选指纹就必须对得上：防止界面看到的候选与磁盘上的已经不是同一条。
    if (expectedChangeHash && change.changeHash && String(expectedChangeHash) !== String(change.changeHash)) {
      return { ok: false, code: 'canon-change-conflict', message: '这条候选已经被改过；刷新后再审阅。' }
    }
    if (change.appliedRevision !== null) {
      return { ok: false, code: 'canon-already-applied', message: '这条已经应用过，不能再审阅。' }
    }
    if (change.decision !== 'pending') {
      if (change.decision === action) return { ok: true, idempotent: true, decision: change.decision, changeId: change.changeId }
      // 接受但未应用的可以改判为拒绝；反过来（拒绝改接受）要重新提案。
      if (!(change.decision === 'accepted' && action === 'rejected')) {
        return { ok: false, code: 'canon-change-reviewed', message: '这条已经处理过：' + change.decision }
      }
    }
    // 接受要求基线仍是最新生效版本；过期提案要求重新审阅。拒绝只需文档版本核对。
    if (action === 'accepted' && Number(change.baseContractRevision) !== Number(current.contractRevision)) {
      return {
        ok: false, code: 'canon-base-stale',
        message: '这条提案基于旧生效版本 v' + change.baseContractRevision + '，当前 v' + current.contractRevision + '；请重新审阅。',
      }
    }
    const reviewedAt = new Date().toISOString()
    const history = Array.isArray(change.reviewHistory) ? [...change.reviewHistory] : []
    history.push({ decision: action, reviewedBy: reviewedBy ?? null, reviewedAt, note: String(note ?? '') })
    pending[index] = {
      ...change,
      decision: action,
      reviewedBy: reviewedBy ?? null,
      reviewedAt,
      note: String(note ?? ''),
      reviewHistory: history,
    }
    const next = { ...current, pendingChanges: pending, revision: revision + 1, updatedAt: new Date().toISOString() }
    next.hash = contractHash(next)
    await writeJsonAtomic(worldContractFile(root, book, sourceId), next, { ensureDir: true })
    return { ok: true, changeId: change.changeId, decision: action, revision: next.revision }
  })
}

/** 应用明确选中的已接受提案：整批成功或整批不写。 */
export async function applyCanonChanges({
  root, book, sourceId, changeIds = [], expectedRevision = null, operationId = null, inputHash = null,
}) {
  return withCanonLock(`${root}:${book}:${sourceId}`, async () => {
    let current
    try {
      current = await readWorldContract(root, book, sourceId)
    } catch {
      return { ok: false, code: 'canon-missing', message: '世界契约还不存在。' }
    }
    // 幂等：同一个 operationId 同输入直接返回上次回执。
    if (operationId) {
      const saved = (current.appliedOperations ?? []).find((item) => item.operationId === operationId)
      if (saved) {
        if (saved.inputHash && inputHash && saved.inputHash !== inputHash) {
          return { ok: false, code: 'operation-conflict', message: '同一 operationId 的输入不同。' }
        }
        return { ok: true, idempotent: true, receipt: saved, contractRevision: saved.contractRevision }
      }
    }
    const revision = Number.isInteger(current.revision) ? current.revision : 0
    if (expectedRevision !== null && expectedRevision !== undefined && Number(expectedRevision) !== revision) {
      return { ok: false, code: 'canon-conflict', message: '契约已被改过；刷新后再应用。', current: { revision } }
    }
    if (!Array.isArray(changeIds) || changeIds.length === 0) {
      return { ok: false, code: 'canon-empty-change', message: '没有选中要应用的提案。' }
    }
    const pending = current.pendingChanges ?? []
    const picked = changeIds.map((id) => pending.find((item) => item.changeId === String(id)))
    if (picked.some((item) => !item)) return { ok: false, code: 'canon-change-missing', message: '找不到选中的提案。' }
    if (picked.some((item) => item.decision !== 'accepted')) {
      return { ok: false, code: 'canon-not-accepted', message: '只能应用「已接受」且未应用的提案。' }
    }
    if (picked.some((item) => item.appliedRevision !== null)) {
      return { ok: false, code: 'canon-already-applied', message: '选中的提案里已经有应用过的。' }
    }
    const seen = new Set()
    for (const change of picked) {
      const mark = change.collection + ':' + change.entryId
      if (seen.has(mark)) return { ok: false, code: 'canon-batch-duplicate', message: '同一批里同一集合 + 条目只能有一条变更。' }
      seen.add(mark)
      if (Number(change.baseContractRevision) !== Number(current.contractRevision)) {
        return {
          ok: false, code: 'canon-base-stale',
          message: '有提案基于旧生效版本 v' + change.baseContractRevision + '，当前 v' + current.contractRevision + '；重新审阅后再应用。',
        }
      }
    }

    // 先在一份副本上算完整结果：任一项不满足就整批不写。
    const next = { ...current }
    for (const change of picked) {
      const list = Array.isArray(next[change.collection]) ? [...next[change.collection]] : []
      const index = list.findIndex((item) => entryIdOf(change.collection, item) === change.entryId)
      if (change.operation === 'add') {
        if (index >= 0) return { ok: false, code: 'canon-entry-exists', message: '要新增的条目已经存在。' }
        list.push(change.after)
      } else {
        if (index < 0) return { ok: false, code: 'canon-entry-missing', message: '要改的条目已经不存在。' }
        if (sha256(stableStringify(list[index])) !== change.beforeHash) {
          return { ok: false, code: 'canon-entry-drift', message: '条目在审阅后被改过；整批不写，请重新审阅。' }
        }
        if (change.operation === 'update') list[index] = change.after
        else list.splice(index, 1)
      }
      next[change.collection] = list
    }

    const contractRevision = (Number.isInteger(current.contractRevision) ? current.contractRevision : 0) + 1
    const contentHash = computeContentHash(next)
    const at = new Date().toISOString()
    const appliedIds = new Set(picked.map((item) => item.changeId))
    next.contractRevision = contractRevision
    next.contentHash = contentHash
    next.status = 'confirmed'
    next.pendingChanges = pending.map((item) => (appliedIds.has(item.changeId) ? { ...item, appliedRevision: contractRevision } : item))
    const receipt = { operationId: operationId ?? null, inputHash: inputHash ?? null, changeIds: [...appliedIds], contractRevision, contentHash, at }
    next.appliedOperations = [...(current.appliedOperations ?? []), receipt]
    next.revision = revision + 1
    next.updatedAt = at
    next.hash = contractHash(next)
    await writeJsonAtomic(worldContractFile(root, book, sourceId), next, { ensureDir: true })
    return { ok: true, action: 'apply', contractRevision, contentHash, applied: [...appliedIds], revision: next.revision, receipt }
  })
}

/**
 * 把「整份契约替换」换算成逐条候选变更：add / update / remove。
 * 模型提案走这条路，才不会绕过审阅队列直接改生效内容。
 */
export function diffContractPatch(current, patch, { limit = 200 } = {}) {
  const changes = []
  const base = current && typeof current === 'object' ? current : {}
  for (const field of CONTRACT_ARRAYS) {
    const incoming = Array.isArray(patch?.[field]) ? patch[field] : null
    if (incoming === null) continue
    const usable = incoming.filter((item) => isUsableEntry(field, item))
    const currentList = Array.isArray(base[field]) ? base[field] : []
    const currentById = new Map(currentList.map((item) => [entryIdOf(field, item), item]))
    const incomingIds = new Set()
    for (const entry of usable) {
      const id = entryIdOf(field, entry)
      incomingIds.add(id)
      const existing = currentById.get(id)
      if (!existing) {
        changes.push({ collection: field, operation: 'add', after: entry })
        continue
      }
      if (stableStringify(existing) !== stableStringify(entry)) {
        changes.push({ collection: field, operation: 'update', entryId: id, after: entry })
      }
    }
    for (const [id] of currentById) {
      if (!incomingIds.has(id)) changes.push({ collection: field, operation: 'remove', entryId: id })
    }
    if (changes.length > limit) break
  }
  return changes.slice(0, limit)
}

/** 模型/作者提交整份契约时的正式入口：只产出候选，不碰生效内容。 */
export async function proposeContractPatch({ root, book, sourceId, patch = {}, expectedRevision = null, proposedBy = null }) {
  let current
  try {
    current = await readWorldContract(root, book, sourceId)
  } catch {
    current = defaultWorldContract({ book, sourceId })
  }
  const changes = diffContractPatch(current, patch)
  if (changes.length === 0) {
    return { ok: true, created: [], pending: (current.pendingChanges ?? []).filter((item) => item.decision === 'pending').length, message: '与现有契约没有差异，没有生成候选。' }
  }
  const result = await proposeCanonChanges({
    root, book, sourceId, changes,
    expectedRevision: expectedRevision ?? (Number.isInteger(current.revision) ? current.revision : null),
    proposedBy,
  })
  return result
}

/**
 * 导入同人原著。
 * - 原创模式且 confirmMode !== true：只暂存 source，不绑定 canon，返回 mode-required；
 * - 同人模式或作者确认切换：写 world.json（pending-extraction）+ 绑定 settings。
 * @param {{root:string, book:string, file:string, title?:string, confirmMode?:boolean}} input
 */
export async function importCanon({ root, book, file, title = '', confirmMode = false }) {
  assertSafeName(book, 'book')
  const source = await ingestSource({ root, file, title })
  const current = await readProjectSettings(root, book)

  if (current.mode !== 'fanfic' && confirmMode !== true) {
    return {
      ok: false,
      code: 'mode-required',
      kind: 'canon',
      sourceId: source.sourceId,
      staged: true,
      title: source.title,
      message: '这是同人原著导入：先把项目模式切到「同人」并确认，才会激活世界观约束；原文已暂存，未绑定。',
    }
  }

  const contractFile = worldContractFile(root, book, source.sourceId)
  let contract
  let reused = false
  try {
    contract = await readWorldContract(root, book, source.sourceId)
    reused = true
  } catch (error) {
    // 只有「文件不存在」才能建默认契约：损坏/不支持的 schema 不能被导入覆盖掉。
    const missing = error?.code === 'ENOENT' || /ENOENT/u.test(String(error?.message ?? ''))
    if (!missing) throw error
    contract = defaultWorldContract({ book, sourceId: source.sourceId, title: title || source.title })
    await writeJsonAtomic(contractFile, contract, { ensureDir: true })
  }
  const settings = await writeProjectSettings(root, book, {
    mode: 'fanfic',
    activeCanonSourceId: source.sourceId,
  })
  return {
    ok: true,
    kind: 'canon',
    sourceId: source.sourceId,
    idempotent: source.idempotent === true || reused,
    reused,
    canonReady: isCanonReady(contract),
    contractStatus: contract.status,
    settings,
    message: reused
      ? '已有世界契约：保留已确认事实/审阅状态，不覆盖。'
      : '原著已绑定为同人 canon；世界契约还没有抽取/确认，同人 start 会被 canon-not-ready 拦住。',
  }
}

/**
 * 章节开始时检查 canon：同人模式必须绑定且契约可用。
 * 旧 fanfic 项目（.dsh-novel-fanfic）作为兼容 canon：有项目就算有强约束来源，
 * 不强制迁移到 kit 的新 canon 目录。
 * @returns {{ok:boolean, code?:string, message?:string, sourceId?:string, contract?:object, legacy?:boolean}}
 */
export async function requireCanon({ root, book, settings, legacyProject = null, legacyCanon = null }) {
  if (!settings || settings.mode !== 'fanfic') return { ok: true }
  if (!settings.activeCanonSourceId) {
    if (legacyProject && legacyCanonReady(legacyProject, legacyCanon)) {
      return { ok: true, legacy: true, sourceId: null, project: legacyProject, canon: legacyCanon }
    }
    return {
      ok: false,
      code: 'canon-required',
      message: legacyProject
        ? '同人项目还没有可用契约：导入/审阅 canon 后再开写。'
        : '同人模式还没有绑定原著：先导入一部同人原著。',
    }
  }
  let contract
  try {
    contract = await readWorldContract(root, book, settings.activeCanonSourceId)
  } catch {
    return { ok: false, code: 'canon-not-ready', message: '同人模式绑定的原著契约读不出来：重新导入或检查 canon 目录。' }
  }
  if (!isCanonReady(contract)) {
    return {
      ok: false,
      code: 'canon-not-ready',
      message: '同人原著已绑定，但世界契约还没有抽取/确认；先完成 canon 审阅，不要无约束开写。',
      sourceId: settings.activeCanonSourceId,
      contract,
    }
  }
  return { ok: true, sourceId: settings.activeCanonSourceId, contract }
}
