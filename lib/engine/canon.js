// 门 B：写同人。原文与 style 共用 SourceDocument；这里只负责 canon 绑定与世界契约。
//
// 0.2.0 第一版不自动抽取高层 canon：导入后世界契约是 pending-extraction，
// 同人 start 必须等契约有内容且经确认，避免「没有强约束就开写」。
import path from 'node:path'
import { readJsonSnapshot, writeJsonAtomic } from '../storage/atomic-json.js'
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

/** 契约是否足以给同人写作提供强约束：必须已确认，且至少有一条可用约束。 */
export function isCanonReady(contract) {
  if (!contract || typeof contract !== 'object') return false
  if (contract.status !== 'confirmed') return false
  const nonEmpty = (value) => Array.isArray(value) && value.length > 0
  return nonEmpty(contract.facts)
    || nonEmpty(contract.characters)
    || nonEmpty(contract.relationships)
    || nonEmpty(contract.addresses)
    || nonEmpty(contract.secrets)
    || nonEmpty(contract.worldRules)
    || nonEmpty(contract.timeline)
    || nonEmpty(contract.forbidden)
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
