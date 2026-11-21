// 章节引擎（S1）：start → write → finish 的最小闭环。
//
// 只碰两类落账：beat 的 segments[] 与 fade 的 cards[]+audit[]；都通过可恢复事务提交。
// voice / fanfic 段在 S2 接入；本版缺席时给 available:false，不阻塞原创链路。
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { readJsonSnapshot, sha256 } from '../storage/atomic-json.js'
import { planTransaction, commitTransaction, recoverTransaction } from '../storage/transaction.js'
import { activeSession, newSessionId, saveSession, loadSession, sessionDir } from './session-store.js'
import { assembleContext } from './context.js'
import { readBeat, readFade } from '../repositories/ledger.js'
import { transition } from './state-machine.js'
import { LEDGER_DIRS } from '../workspace.js'

const CAPABILITIES = Object.freeze(['beat', 'fade', 'voice', 'fanfic'])

function requireString(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} 必填`)
  return value
}

async function loadOrFail(root, sessionId) {
  try {
    return await loadSession(root, sessionId)
  } catch {
    throw new Error(`找不到章节会话 ${sessionId}`)
  }
}

/**
 * 开始一章：读上下文、建会话。已有未完成会话时直接返回它（不重复开）。
 * @param {{root:string, book:string, chapter:number, requiredCapabilities?:string[]}} input
 */
export async function startChapter({ root, book, chapter, requiredCapabilities = ['beat', 'fade'] }) {
  const number = Number(chapter)
  if (!Number.isInteger(number) || number < 1) throw new Error('chapter 必须是正整数')
  const required = requiredCapabilities.filter((capability) => CAPABILITIES.includes(capability))

  const beat = await readBeat(root, book).catch(() => null)
  const fade = await readFade(root, book).catch(() => null)

  const missing = required.filter((capability) => (capability === 'beat' ? !beat : capability === 'fade' ? !fade : true))
  if (missing.length > 0) {
    return { ok: false, code: 'capability-missing', message: `缺少必需能力：${missing.join(', ')}`, missing }
  }

  const existing = await activeSession(root, book)
  if (existing && Number(existing.chapter) === number) {
    return { ok: true, resumed: true, session: existing, context: existing.context }
  }

  const context = assembleContext({ beat, fade, chapter: number })
  const session = {
    schemaVersion: 1,
    id: newSessionId(),
    book,
    chapter: number,
    requiredCapabilities: required,
    state: 'writing',
    context,
    contextFingerprint: sha256(context.fingerprint),
    draft: null,
    transactionId: null,
    receiptIds: [],
    createdAt: new Date().toISOString(),
  }
  await saveSession(root, session)
  return { ok: true, resumed: false, session, context }
}

/**
 * 保存正文草稿。正文一变，之前基于旧稿的 finish 结果就作废。
 * @param {{root:string, sessionId:string, text:string}} input
 */
export async function writeChapter({ root, sessionId, text }) {
  const body = requireString(text, 'text')
  const session = await loadOrFail(root, sessionId)
  if (['completed', 'aborted'].includes(session.state)) {
    throw new Error(`会话已 ${session.state}，不能继续写正文`)
  }
  const dir = path.join(sessionDir(root, session.id), 'draft')
  await mkdir(dir, { recursive: true })
  const version = (session.draft?.version ?? 0) + 1
  const hash = sha256(body)
  const file = path.join(dir, `${version}-${hash.slice(0, 8)}.md`)
  await writeFile(file, body, 'utf8')
  session.draft = { path: file, hash, version }
  session.state = session.state === 'awaiting_author' ? 'writing' : 'writing'
  await saveSession(root, session)
  return { ok: true, session, draft: session.draft }
}

function resolveSegment(draft, segment, index) {
  const quote = String(segment?.quote ?? '')
  if (!quote) throw new Error(`segments[${index}].quote 必填`)
  const start = Number(segment?.start)
  const end = Number(segment?.end)
  if (Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && draft.slice(start, end) === quote) {
    return { start, end, quote }
  }
  const at = draft.indexOf(quote)
  if (at < 0) throw new Error(`segments[${index}] 的引文在正文里找不到：${quote.slice(0, 20)}…`)
  if (draft.indexOf(quote, at + 1) >= 0) throw new Error(`segments[${index}] 的引文在正文里出现多次，请给准确 offset`)
  return { start: at, end: at + quote.length, quote }
}

/**
 * 收尾：校验提取结果 → beat 段落 + fade 卡片 → 一个事务提交。
 * 同一 draftHash 重复调用幂等：直接返回上次回执。
 */
export async function finishChapter({ root, sessionId, extraction = {} }) {
  const session = await loadOrFail(root, sessionId)
  if (session.state === 'completed') {
    return { ok: true, idempotent: true, session, receipt: session.receipt ?? null }
  }
  if (!session.draft) throw new Error('还没有保存正文（先 writeChapter）')
  const draft = await readFile(path.resolve(session.draft.path), 'utf8')

  const segments = Array.isArray(extraction.segments) ? extraction.segments : []
  const cards = Array.isArray(extraction.memory?.cards) ? extraction.memory.cards : []
  if (segments.length === 0) {
    return { ok: false, code: 'needs_extraction', message: '缺少段落映射：至少给一段 {start,end,quote}' }
  }
  const resolved = segments.map((segment, index) => resolveSegment(draft, segment, index))

  const beat = await readBeat(root, session.book).catch(() => null)
  const fade = await readFade(root, session.book).catch(() => null)
  if (!beat || !fade) return { ok: false, code: 'capability-missing', message: '账本缺失，无法收尾' }

  // 上下文变了不能静默续跑：canon/契约/文风在写作期间被改动时，基于旧上下文的
  // 提取结果不再可信，退回 blocked/context_stale，让作者决定重新装配。
  if (session.contextFingerprint) {
    const fresh = assembleContext({ beat, fade, chapter: session.chapter })
    if (sha256(fresh.fingerprint) !== session.contextFingerprint) {
      const from = session.state
      session.state = transition(session, 'blocked', { reason: '账本在写作期间发生变化', code: 'context_stale' }).state
      session.blockedFrom = from
      await saveSession(root, session)
      return {
        ok: false,
        code: 'context_stale',
        message: '上下文的 revision 变了（beat/fade 在写作期间被修改），请 resume 重新装配后再收尾。',
        context: fresh,
        session,
      }
    }
  }

  const beatFile = path.join(root, LEDGER_DIRS.beat, session.book, 'book.json')
  const fadeFile = path.join(root, LEDGER_DIRS.fade, session.book, 'memory.json')
  const beatRaw = (await readJsonSnapshot(beatFile)).json
  const fadeRaw = (await readJsonSnapshot(fadeFile)).json

  const now = new Date().toISOString()
  const chapterNo = Number(session.chapter)
  const newSegments = resolved.map((segment, index) => ({
    id: `kit-s-${session.id.slice(-6)}-${index + 1}`,
    chapter: chapterNo,
    taskId: null,
    decisionIds: Array.isArray(extraction.segments[index].decisionIds) ? extraction.segments[index].decisionIds : [],
    file: `正文/第${chapterNo}章.md`,
    fromMarker: segment.quote.slice(0, 40),
    toMarker: segment.quote.slice(-40),
    offsetStart: segment.start,
    offsetEnd: segment.end,
    hash: sha256(segment.quote),
    chars: segment.quote.length,
    status: 'committed',
    revisionId: null,
    createdAt: now,
  }))

  const newCards = cards.map((card, index) => {
    const quote = String(card?.quote ?? '')
    if (!quote) throw new Error(`memory.cards[${index}].quote 必填`)
    const at = draft.indexOf(quote)
    if (at < 0) throw new Error(`memory.cards[${index}] 的引文不在正文里`)
    return {
      id: `kit-c-${session.id.slice(-6)}-${index + 1}`,
      chapter: chapterNo,
      digestVersion: 1,
      topic: String(card.topic ?? card.gist ?? '').slice(0, 120),
      gist: String(card.gist ?? card.topic ?? ''),
      emotion: card.emotion ?? '',
      salience: Number(card.salience) || 3,
      domain: card.domain ?? 'plot',
      layer: card.layer ?? 'L2',
      quote,
      entityIds: Array.isArray(card.entityIds) ? card.entityIds : [],
      placeId: card.placeId ?? null,
      source: 'kit',
      createdAt: now,
    }
  })

  const beatNext = {
    ...beatRaw,
    revision: (Number.isFinite(beatRaw.revision) ? beatRaw.revision : beat.revision) + 1,
    segments: [...(Array.isArray(beatRaw.segments) ? beatRaw.segments : []), ...newSegments],
    audit: [...(Array.isArray(beatRaw.audit) ? beatRaw.audit : []), {
      id: `kit-a-${session.id.slice(-6)}`,
      kind: 'segment',
      chapter: chapterNo,
      count: newSegments.length,
      at: now,
      by: 'dsh-novel-kit',
    }],
  }
  const fadeNext = {
    ...fadeRaw,
    meta: { ...(fadeRaw.meta ?? {}), revision: fade.revision + 1, revisionAt: (Array.isArray(fadeRaw.audit) ? fadeRaw.audit.length : 0) + 1, updatedAt: now },
    cards: [...(Array.isArray(fadeRaw.cards) ? fadeRaw.cards : []), ...newCards],
    audit: [...(Array.isArray(fadeRaw.audit) ? fadeRaw.audit : []), {
      id: `kit-a-${session.id.slice(-6)}-fade`,
      kind: 'digest',
      chapter: chapterNo,
      cards: newCards.length,
      at: now,
      by: 'dsh-novel-kit',
    }],
  }

  session.state = transition(session, 'checking').state
  session.state = transition(session, 'committing').state
  session.transactionId = `tx-${session.id}-${session.draft.hash.slice(0, 8)}`
  await saveSession(root, session)

  let receipt
  try {
    await planTransaction({
      root,
      txId: session.transactionId,
      files: [
        { path: beatFile, after: beatNext },
        { path: fadeFile, after: fadeNext },
      ],
    })
    receipt = await commitTransaction({ root, txId: session.transactionId })
  } catch (error) {
    session.state = transition(session, 'blocked', { reason: error.message, code: 'commit-failed' }).state
    session.blockedFrom = 'committing'
    await saveSession(root, session)
    throw error
  }

  session.state = transition(session, 'completed').state
  session.receipt = receipt
  session.receiptIds = [receipt.txId]
  await saveSession(root, session)
  return { ok: true, idempotent: false, session, receipt, effects: receipt.effects }
}

/** 查询会话或按书查活动会话。 */
export async function queryChapter({ root, sessionId, book }) {
  if (sessionId) {
    const session = await loadOrFail(root, sessionId)
    return { ok: true, session }
  }
  if (!book) throw new Error('sessionId 或 book 必填')
  return { ok: true, session: await activeSession(root, book) }
}

/** 未完成事务的恢复状态（给 resume / 面板诊断用）。 */
export async function resumeChapter({ root, sessionId }) {
  const session = await loadOrFail(root, sessionId)
  if (!session.transactionId) return { ok: true, session, recovery: null }
  const recovery = await recoverTransaction({ root, txId: session.transactionId }).catch(() => null)
  return { ok: true, session, recovery }
}

/**
 * 建计划：把作者的意图与待拍板提案挂到章节会话上，状态进入 awaiting_author。
 * 不写任何账本；确认拍板由作者在面板/聊天里做，模型不能自己 approved。
 * @param {{root:string, book:string, chapter:number, intent?:string, proposals?:object[]}} input
 */
export async function planChapter({ root, book, chapter, intent = '', proposals = [] }) {
  const number = Number(chapter)
  if (!Number.isInteger(number) || number < 1) throw new Error('chapter 必须是正整数')
  const list = Array.isArray(proposals) ? proposals : []
  const pendingDecisionIds = list.map((item, index) => String(item?.id ?? `p-${index + 1}`))

  let session = await activeSession(root, book)
  if (!session || Number(session.chapter) !== number) {
    const beat = await readBeat(root, book).catch(() => null)
    const fade = await readFade(root, book).catch(() => null)
    const context = assembleContext({ beat, fade, chapter: number })
    session = {
      schemaVersion: 1,
      id: newSessionId(),
      book,
      chapter: number,
      requiredCapabilities: ['beat', 'fade'],
      state: 'awaiting_author',
      context,
      contextFingerprint: sha256(context.fingerprint),
      draft: null,
      transactionId: null,
      receiptIds: [],
      createdAt: new Date().toISOString(),
    }
  }
  session.plan = { intent: String(intent ?? ''), proposals: list }
  session.pendingDecisionIds = pendingDecisionIds
  if (session.state === 'writing' && pendingDecisionIds.length > 0) session.state = 'awaiting_author'
  await saveSession(root, session)
  return { ok: true, session, pending: pendingDecisionIds.length }
}

/**
 * 中止：停止后续执行，保留正文与已提交账本。
 * @param {{root:string, sessionId:string, reason?:string}} input
 */
export async function abortChapter({ root, sessionId, reason = '' }) {
  const session = await loadOrFail(root, sessionId)
  if (['completed', 'aborted'].includes(session.state)) {
    return { ok: true, idempotent: true, session }
  }
  session.state = transition(session, 'aborted', { reason: String(reason ?? '') || '作者中止' }).state
  session.abortReason = String(reason ?? '')
  await saveSession(root, session)
  return { ok: true, session }
}
