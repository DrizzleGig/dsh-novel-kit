// kit 原生媒体证据：漫画/短剧来源与证据的只读索引 + 作者确认/拒绝。
// 不复制整本漫画/整集短剧，不存播放地址/内容密钥。
//
// 目录：.dsh-novel-kit/media/<bookId>/media.json
import { readJsonSnapshot, writeJsonAtomic } from '../storage/atomic-json.js'
import { withLock } from '../storage/locks.js'
import { assertBookId, MEDIA_FORMAT } from './schema.js'
import { bookRecordFile, mediaFile } from './store.js'

const STATUS = new Set(['unverified', 'confirmed', 'rejected'])
const CLAIM_TYPES = new Set(['fact', 'rumor', 'fiction', 'unknown'])
const VISIBILITY = new Set(['public', 'licensed', 'private', 'unknown'])

function normalizeClaim(value) {
  const text = String(value ?? '')
  return CLAIM_TYPES.has(text) ? text : 'unknown'
}

function normalizeVisibility(value) {
  const text = String(value ?? '')
  return VISIBILITY.has(text) ? text : 'unknown'
}

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

function emptyMedia({ bookId, book, now = new Date().toISOString() } = {}) {
  return {
    format: MEDIA_FORMAT,
    schemaVersion: 1,
    bookId,
    book,
    revision: 0,
    sources: [],
    evidence: [],
    audit: [],
    createdAt: now,
    updatedAt: now,
  }
}

function validate(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('media 必须是对象')
  if (data.format !== MEDIA_FORMAT) throw new Error(`media.format 必须是 ${MEDIA_FORMAT}`)
  if (data.schemaVersion !== 1) throw new Error('media.schemaVersion 必须是 1')
  assertBookId(data.bookId)
  if (!Array.isArray(data.sources)) throw new Error('media.sources 必须是数组')
  if (!Array.isArray(data.evidence)) throw new Error('media.evidence 必须是数组')
  return data
}

export async function readMedia(root, bookId) {
  assertBookId(bookId)
  try {
    return validate((await readJsonSnapshot(mediaFile(root, bookId))).json)
  } catch (error) {
    if (error?.code === 'ENOENT' || /ENOENT/.test(String(error?.message ?? error))) {
      return emptyMedia({ bookId, book: await fallbackBookName(root, bookId) })
    }
    throw new Error(`media.json 读不出来：${String(error?.message ?? error)}`)
  }
}

async function writeMediaUnlocked(root, bookId, next, { expectedRevision = null } = {}) {
  assertBookId(bookId)
  const current = await readMedia(root, bookId)
  if (Number.isInteger(expectedRevision) && current.revision !== expectedRevision) {
    throw new Error(`media revision 冲突：期望 ${expectedRevision}，实际 ${current.revision}`)
  }
  const now = new Date().toISOString()
  const document = validate({
    ...next,
    format: MEDIA_FORMAT,
    schemaVersion: 1,
    bookId,
    book: next.book ?? current.book,
    revision: current.revision + 1,
    updatedAt: now,
  })
  await writeJsonAtomic(mediaFile(root, bookId), document, { ensureDir: true })
  return document
}

export async function writeMedia(root, bookId, next, { expectedRevision = null } = {}) {
  return withLock({ root, flowId: 'media-write' }, () => writeMediaUnlocked(root, bookId, next, { expectedRevision }))
}

/** 已持有工作区锁的调用方（导入批次）使用；不要在外层无锁时直接调用。 */
export async function writeMediaHoldingLock(root, bookId, next, options = {}) {
  return writeMediaUnlocked(root, bookId, next, options)
}

/** 把五件 fanfic media.json 的 sources/evidence 映射成 kit 原生；证据默认 unverified。 */
export function mediaFromLegacy(raw, { bookId, book } = {}) {
  const sources = (Array.isArray(raw?.sources) ? raw.sources : []).map((item, index) => ({
    ...item,
    id: String(item?.id ?? `src-${index + 1}`),
    status: item?.status === 'verified' ? 'verified' : (item?.status ?? 'unverified'),
    claimType: normalizeClaim(item?.claimType),
    visibility: normalizeVisibility(item?.visibility),
    ...(item?.version ? { version: String(item.version) } : {}),
    ...(item?.route ? { route: String(item.route) } : {}),
  }))
  const evidence = (Array.isArray(raw?.evidence) ? raw.evidence : []).map((item, index) => ({
    ...item,
    id: String(item?.id ?? `ev-${index + 1}`),
    status: STATUS.has(item?.status) ? item.status : 'unverified',
    claimType: normalizeClaim(item?.claimType),
    ...(item?.version ? { version: String(item.version) } : {}),
    ...(item?.route ? { route: String(item.route) } : {}),
  }))
  const now = new Date().toISOString()
  return {
    ...emptyMedia({ bookId, book, now }),
    sources,
    evidence,
    audit: [],
  }
}

/** 作者确认/拒绝一条证据；不改 sources；重复同状态幂等。 */
export async function reviewMediaEvidence({ root, bookId, evidenceId, status, note = '', expectedRevision = null } = {}) {
  assertBookId(bookId)
  if (!STATUS.has(status) || status === 'unverified') throw new Error('status 只能是 confirmed / rejected')
  return withLock({ root, flowId: 'media-review' }, async () => {
    const current = await readMedia(root, bookId)
    const evidence = current.evidence.find((item) => String(item?.id) === String(evidenceId))
    if (!evidence) throw new Error(`没有这条媒体证据：${evidenceId}`)
    if (evidence.status === status) return { ok: true, idempotent: true, evidence, revision: current.revision }
    const now = new Date().toISOString()
    const evidenceNext = current.evidence.map((item) => String(item?.id) === String(evidenceId)
      ? { ...item, status, note: String(note ?? ''), reviewedAt: now }
      : item)
    const document = await writeMediaUnlocked(root, bookId, {
      ...clone(current),
      evidence: evidenceNext,
      audit: [...current.audit, { id: `kit-a-media-${String(evidenceId)}-${now.replace(/[^0-9]/g, '').slice(-10)}`, kind: `media-${status}`, evidenceId: String(evidenceId), at: now, by: 'author' }],
    }, { expectedRevision })
    return { ok: true, idempotent: false, evidence: evidenceNext.find((item) => String(item?.id) === String(evidenceId)), revision: document.revision }
  })
}

export function mediaBrief(document) {
  const data = validate(document)
  const sources = new Map((data.sources ?? []).map((item) => [String(item?.id), item]))
  const confirmed = data.evidence.filter((item) => item.status === 'confirmed')
  const groups = { fact: [], rumor: [], fiction: [], unknown: [] }
  for (const evidence of confirmed) {
    const source = sources.get(String(evidence?.sourceId))
    const claimType = normalizeClaim(evidence?.claimType && evidence.claimType !== 'unknown' ? evidence.claimType : source?.claimType)
    groups[claimType].push(evidence)
  }
  return {
    available: confirmed.length > 0,
    count: confirmed.length,
    evidence: confirmed,
    facts: groups.fact,
    rumors: groups.rumor,
    fiction: groups.fiction,
    unclassified: groups.unknown,
    sources: {
      total: data.sources.length,
      public: data.sources.filter((item) => item.visibility === 'public').length,
      licensed: data.sources.filter((item) => item.visibility === 'licensed').length,
      private: data.sources.filter((item) => item.visibility === 'private').length,
      unknown: data.sources.filter((item) => !item.visibility || item.visibility === 'unknown').length,
    },
  }
}
