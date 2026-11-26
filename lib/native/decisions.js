// kit 原生决策账：books/<bookId>/decisions.json。
//
// 这不是 beat 的 book.json：没有 beat v3 的 request/answer/gate 语义（0.7 再补）；
// 当前只承载 kit 自己的决策/段落/canon/义务，字段保持与旧 codec 视图相近，便于 UI 过渡。
import { readJsonSnapshot, writeJsonAtomic } from '../storage/atomic-json.js'
import { emptyDecisions, validateDecisions, assertBookId } from './schema.js'
import { bookRecordFile, decisionsFile } from './store.js'

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

export async function readDecisions(root, bookId) {
  assertBookId(bookId)
  try {
    const snap = await readJsonSnapshot(decisionsFile(root, bookId))
    return validateDecisions(snap.json)
  } catch (error) {
    if (error?.code === 'ENOENT' || /ENOENT/.test(String(error?.message ?? ''))) {
      return emptyDecisions({ bookId, book: await fallbackBookName(root, bookId) })
    }
    throw new Error(`decisions.json 读不出来：${String(error?.message ?? error)}`)
  }
}

export async function writeDecisions(root, bookId, next, { expectedRevision } = {}) {
  assertBookId(bookId)
  const current = await readDecisions(root, bookId)
  if (Number.isInteger(expectedRevision) && current.revision !== expectedRevision) {
    throw new Error(`decisions revision 冲突：期望 ${expectedRevision}，实际 ${current.revision}`)
  }
  const document = validateDecisions({
    ...next,
    schemaVersion: 1,
    bookId,
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
  })
  await writeJsonAtomic(decisionsFile(root, bookId), document, { ensureDir: true })
  return document
}

/** 在最新文档上做一次纯变更；冲突由 expectedRevision 兜底。 */
export async function mutateDecisions(root, bookId, fn, { expectedRevision } = {}) {
  const current = await readDecisions(root, bookId)
  const draft = clone(current)
  const result = await fn(draft)
  const document = await writeDecisions(root, bookId, draft, { expectedRevision: expectedRevision ?? current.revision })
  return { document, result }
}

/** 供引擎/UI 的只读视图：保持旧 decodeBeat 的字段形状，并带请求/回答/完整性。 */
export function decisionsView(document) {
  const data = validateDecisions(document)
  return {
    schemaVersion: data.schemaVersion,
    bookId: data.bookId,
    book: data.book,
    meta: { title: data.book, source: 'dsh-novel-kit' },
    chapters: {},
    requests: data.requests,
    answers: data.answers,
    decisions: data.decisions,
    canon: data.canon,
    obligations: data.obligations,
    segments: data.segments,
    audit: data.audit,
    revisions: data.revisions,
    integrity: data.integrity,
    revision: data.revision,
    legacy: false,
    warnings: [],
    gate: decisionGate(data),
    loop: decisionLoop(data),
  }
}

/** v3 决策循环的只读状态：还有哪些请求没答、下一个是谁。 */
export function decisionLoop(document) {
  const data = validateDecisions(document)
  const requests = Array.isArray(data.requests) ? data.requests : []
  const open = requests.filter((item) => item?.status !== 'answered')
  const answered = requests.filter((item) => item?.status === 'answered')
  return {
    total: requests.length,
    open: open.length,
    answered: answered.length,
    nextRequest: open[0] ?? null,
    done: open.length === 0,
  }
}

/**
 * v3 决策闸门：带 requestId 的 committed 决策必须有 answered request + answer。
 * 没有 requestId 的旧决策只记 warning；新决策不一致是 error。
 */
export function decisionGate(document) {
  const data = validateDecisions(document)
  const requests = new Map((data.requests ?? []).map((item) => [String(item?.id), item]))
  const answers = new Map((data.answers ?? []).map((item) => [String(item?.id), item]))
  const issues = []
  for (const decision of data.decisions ?? []) {
    if (String(decision?.status ?? '') !== 'committed') continue
    const decisionId = String(decision?.id ?? '')
    if (!decision?.requestId) {
      issues.push({ severity: 'warning', code: 'missing-request', decisionId, message: '旧决策没有 requestId；不阻塞读写，但无法核验作者回答凭据。' })
      continue
    }
    const request = requests.get(String(decision.requestId))
    if (!request) {
      issues.push({ severity: 'error', code: 'request-missing', decisionId, requestId: decision.requestId, message: '决策指向的请求不存在。' })
      continue
    }
    if (request.status !== 'answered' || !request.answeredAt) {
      issues.push({ severity: 'error', code: 'request-unanswered', decisionId, requestId: decision.requestId, message: '决策指向的请求还没有作者回答时间。' })
    }
    const answer = decision.answerId ? answers.get(String(decision.answerId)) : [...answers.values()].find((item) => String(item?.requestId) === String(decision.requestId))
    if (!answer) {
      issues.push({ severity: 'error', code: 'answer-missing', decisionId, requestId: decision.requestId, message: '决策找不到对应的作者回答。' })
    } else if (String(answer.requestId) !== String(decision.requestId)) {
      issues.push({ severity: 'error', code: 'answer-mismatch', decisionId, requestId: decision.requestId, message: '回答不属于这条请求。' })
    }
  }
  const errors = issues.filter((item) => item.severity === 'error')
  return { ok: errors.length === 0, errors: errors.length, warnings: issues.length - errors.length, issues }
}
