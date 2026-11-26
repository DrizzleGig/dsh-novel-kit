// kit 原生人物卡（voice persona 的 kit 侧）：
// 与“文笔档案”分开，按书存；未确认的提案不进入写作简报。
//
// 目录：.dsh-novel-kit/personas/<bookId>/personas.json
import { randomUUID } from 'node:crypto'
import { readJsonSnapshot, writeJsonAtomic } from '../storage/atomic-json.js'
import { withLock } from '../storage/locks.js'
import { assertBookId, PERSONAS_FORMAT } from './schema.js'
import { bookRecordFile, personasFile } from './store.js'

const FIELDS = ['narrative', 'inner', 'action', 'choice', 'dialogue']
const STATUS = new Set(['proposed', 'confirmed', 'rejected'])

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

async function fallbackBookName(root, bookId) {
  try {
    const record = (await readJsonSnapshot(bookRecordFile(root, bookId))).json
    return typeof record?.book === 'string' && record.book ? record.book : bookId
  } catch {
    return bookId
  }
}

function emptyPersonas({ bookId, book, now = new Date().toISOString() } = {}) {
  return {
    format: PERSONAS_FORMAT,
    schemaVersion: 1,
    bookId,
    book,
    revision: 0,
    personas: [],
    audit: [],
    createdAt: now,
    updatedAt: now,
  }
}

function validate(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('personas 必须是对象')
  if (data.format !== PERSONAS_FORMAT) throw new Error(`personas.format 必须是 ${PERSONAS_FORMAT}`)
  if (data.schemaVersion !== 1) throw new Error('personas.schemaVersion 必须是 1')
  assertBookId(data.bookId)
  if (!Array.isArray(data.personas)) throw new Error('personas.personas 必须是数组')
  if (!Array.isArray(data.audit)) throw new Error('personas.audit 必须是数组')
  for (const persona of data.personas) {
    if (!persona || typeof persona.id !== 'string' || !persona.id) throw new Error('persona.id 必填')
    if (typeof persona.name !== 'string' || !persona.name) throw new Error('persona.name 必填')
    if (!STATUS.has(persona.status)) throw new Error(`persona.status 不支持：${persona.status}`)
  }
  return data
}

export async function readPersonas(root, bookId) {
  assertBookId(bookId)
  try {
    return validate((await readJsonSnapshot(personasFile(root, bookId))).json)
  } catch (error) {
    if (error?.code === 'ENOENT' || /ENOENT/.test(String(error?.message ?? error))) {
      return emptyPersonas({ bookId, book: await fallbackBookName(root, bookId) })
    }
    throw new Error(`personas.json 读不出来：${String(error?.message ?? error)}`)
  }
}

async function writePersonas(root, bookId, next, { expectedRevision = null } = {}) {
  const current = await readPersonas(root, bookId)
  if (Number.isInteger(expectedRevision) && current.revision !== expectedRevision) {
    throw new Error(`personas revision 冲突：期望 ${expectedRevision}，实际 ${current.revision}`)
  }
  const now = new Date().toISOString()
  const document = validate({
    ...next,
    format: PERSONAS_FORMAT,
    schemaVersion: 1,
    bookId,
    book: next.book ?? current.book,
    revision: current.revision + 1,
    updatedAt: now,
  })
  await writeJsonAtomic(personasFile(root, bookId), document, { ensureDir: true })
  return document
}

function normalizeEvidence(evidence) {
  return (Array.isArray(evidence) ? evidence : []).map((item) => ({
    ...(item?.sourceId ? { sourceId: String(item.sourceId) } : {}),
    ...(item?.chapter !== undefined ? { chapter: Number(item.chapter) || 0 } : {}),
    ...(item?.quote ? { quote: String(item.quote) } : {}),
    ...(item?.hash ? { hash: String(item.hash) } : {}),
    ...(item?.kind ? { kind: String(item.kind) } : {}),
  }))
}

/** 提议一张人物卡；状态 proposed，进简报前必须由作者确认。 */
export async function createPersona({ root, bookId, name, aliases = [], fields = {}, evidence = [], note = '' } = {}) {
  assertBookId(bookId)
  const displayName = String(name ?? '').trim()
  if (!displayName) throw new Error('createPersona: name 必填')
  return withLock({ root, flowId: 'persona-create' }, async () => {
    const current = await readPersonas(root, bookId)
    const now = new Date().toISOString()
    const persona = {
      id: `per-${randomUUID()}`,
      name: displayName,
      aliases: Array.isArray(aliases) ? aliases.map(String).filter(Boolean) : [],
      status: 'proposed',
      fields: Object.fromEntries(FIELDS.filter((key) => fields?.[key]).map((key) => [key, String(fields[key])])),
      evidence: normalizeEvidence(evidence),
      note: String(note ?? ''),
      createdAt: now,
      updatedAt: now,
    }
    const next = {
      ...clone(current),
      personas: [...current.personas, persona],
      audit: [...current.audit, { id: `kit-a-persona-create-${persona.id.slice(-8)}`, kind: 'persona-proposed', personaId: persona.id, at: now, by: 'dsh-novel-kit' }],
    }
    const document = await writePersonas(root, bookId, next)
    return { ok: true, persona, revision: document.revision }
  })
}

/** 作者确认；只确认 proposed，重复确认幂等。 */
export async function confirmPersona({ root, bookId, personaId, expectedRevision = null } = {}) {
  assertBookId(bookId)
  return withLock({ root, flowId: 'persona-confirm' }, async () => {
    const current = await readPersonas(root, bookId)
    const persona = current.personas.find((item) => String(item?.id) === String(personaId))
    if (!persona) throw new Error(`没有这张人物卡：${personaId}`)
    if (persona.status === 'confirmed') return { ok: true, idempotent: true, persona, revision: current.revision }
    const now = new Date().toISOString()
    const personas = current.personas.map((item) => String(item?.id) === String(personaId) ? { ...item, status: 'confirmed', confirmedAt: now, updatedAt: now } : item)
    const document = await writePersonas(root, bookId, {
      ...clone(current),
      personas,
      audit: [...current.audit, { id: `kit-a-persona-confirm-${String(personaId).slice(-8)}`, kind: 'persona-confirmed', personaId: String(personaId), at: now, by: 'author' }],
    }, { expectedRevision })
    return { ok: true, idempotent: false, persona: personas.find((item) => String(item?.id) === String(personaId)), revision: document.revision }
  })
}

/** 只给已确认的人物卡，按字段拼成简报；未确认/拒绝的一律不注入。 */
export function personaBrief(document, { limit = 8 } = {}) {
  const data = validate(document)
  const confirmed = data.personas.filter((item) => item.status === 'confirmed').slice(0, Math.max(1, Math.min(30, Number(limit) || 8)))
  return {
    available: confirmed.length > 0,
    count: confirmed.length,
    personas: confirmed.map((item) => ({
      id: item.id,
      name: item.name,
      aliases: item.aliases ?? [],
      ...Object.fromEntries(FIELDS.filter((key) => item.fields?.[key]).map((key) => [key, item.fields[key]])),
    })),
  }
}

export async function listPersonas(root, bookId, { status = null } = {}) {
  const document = await readPersonas(root, bookId)
  return {
    ok: true,
    revision: document.revision,
    personas: status ? document.personas.filter((item) => item.status === status) : document.personas,
  }
}