// 门 B：写同人。原文与 style 共用 SourceDocument；这里只负责 canon 绑定与世界契约。
//
// 0.2.0 第一版不自动抽取高层 canon：导入后世界契约是 pending-extraction，
// 同人 start 必须等契约有内容且经确认，避免「没有强约束就开写」。
import path from 'node:path'
import { readJsonSnapshot, sha256, writeJsonAtomic } from '../storage/atomic-json.js'
import { KIT_DIR, readProjectSettings, writeProjectSettings } from './settings.js'
import { ingestSource } from './sources.js'
import { assertSafeName } from '../workspace.js'

export const CANON_SCHEMA_VERSION = 1

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
    facts: [],
    characters: [],
    relationships: [],
    addresses: [],
    secrets: [],
    worldRules: [],
    timeline: [],
    forbidden: [],
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
  if (field === 'facts') return (textOf(item.entity) || textOf(item.subjectName)).length > 0 && String(item.value ?? item.object ?? '').trim().length > 0
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
  return snap.json
}

/** 把 kit 的 WorldContract 变成 fanficContext 能消费的 project 形状。 */
export function contractToProject(contract, { book, revision = 0 } = {}) {
  return {
    id: book,
    title: contract?.title ?? book,
    sourceId: contract?.sourceId ?? null,
    revision,
    currentChapter: null,
    exports: {
      addresses: Array.isArray(contract?.addresses) ? contract.addresses : [],
      forbidden: Array.isArray(contract?.forbidden) ? contract.forbidden : [],
    },
    kitCanon: contract,
  }
}

const CONTRACT_ARRAYS = ['facts', 'characters', 'relationships', 'addresses', 'secrets', 'worldRules', 'timeline', 'forbidden']

/** 作者或模型提交的契约内容：只接受已知数组字段，进入 pending-review，不自动确认。 */
export async function updateWorldContract({ root, book, sourceId, patch = {}, expectedRevision = null, allowConfirmed = false }) {
  const file = worldContractFile(root, book, sourceId)
  return withCanonLock(`${book}:${sourceId}`, async () => {
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
    next.hash = contractHash(next)
    await writeJsonAtomic(file, next, { ensureDir: true })
    return { ok: true, contract: next, canonReady: false, constraints: hasCanonConstraints(next), dropped }
  })
}

/** 作者确认：必须有可用约束；确认后同人 start 才放行。 */
export async function confirmWorldContract({ root, book, sourceId, expectedRevision = null }) {
  return withCanonLock(`${book}:${sourceId}`, async () => {
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
    next.hash = contractHash(next)
    await writeJsonAtomic(worldContractFile(root, book, sourceId), next, { ensureDir: true })
    return { ok: true, contract: next, canonReady: true }
  })
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
  } catch {
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
