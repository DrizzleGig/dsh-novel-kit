// 章节引擎（S1）：start → write → finish 的最小闭环。
//
// 只碰两类落账：beat 的 segments[] 与 fade 的 cards[]+audit[]；都通过可恢复事务提交。
// voice / fanfic 段在 S2 接入；本版缺席时给 available:false，不阻塞原创链路。
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { readJsonSnapshot, sha256, fileHashOrNull } from '../storage/atomic-json.js'
import { planTransaction, commitTransaction, recoverTransaction } from '../storage/transaction.js'
import { activeSession, newSessionId, saveSession, loadSession, sessionDir, sessionsForBook } from './session-store.js'
import { assembleContext } from './context.js'
import { checkDraft, checkBands, checkCopy, checkNames } from './checks.js'
import { collectConflicts } from './conflicts.js'
import { memoryView, searchMemory, styleView, canonView } from '../host/views.js'
import { readBeat, readFade, readVoice, readFanfic, readVoiceProfiles, readFanficCanon } from '../repositories/ledger.js'
import { resolveBinding } from './binding.js'
import { readProjectSettings } from './settings.js'
import { requireCanon, contractToProject, isCanonReady, readWorldContract, contractHash } from './canon.js'
import { annotateProposal, compileDecisionHint, compileStyleBrief, readStyleProfile } from './profiles.js'
import { transition } from './state-machine.js'
import { LEDGER_DIRS, assertSafeName } from '../workspace.js'

const CAPABILITIES = Object.freeze(['beat', 'fade', 'voice', 'fanfic'])

// 同一会话的草稿保存串行化：expectedVersion/hash 校验与写入之间不能被另一个保存插队。
const sessionLocks = new Map()
async function withSessionLock(key, task) {
  const previous = sessionLocks.get(key) ?? Promise.resolve()
  const run = previous.then(task, task)
  const tail = run.catch(() => {})
  sessionLocks.set(key, tail)
  try {
    return await run
  } finally {
    if (sessionLocks.get(key) === tail) sessionLocks.delete(key)
  }
}

/** 读四家账本（按 binding 解析目录名）；缺哪家给 null。损坏的账本要报出来，不能当成「没有」。 */
const MISSING = (error) => error?.code === 'ENOENT' || error?.code === 'ENOTDIR' || /ENOENT/.test(String(error?.message ?? ''))

async function readOrNull(label, reader, ...args) {
  try {
    return await reader(...args)
  } catch (error) {
    if (MISSING(error)) return null
    throw new Error(`ledger-corrupt：${label} 读不出来（${String(error?.message ?? error)}）`)
  }
}

async function readContext(root, book, { includeFanfic = false } = {}) {
  const settings = await readProjectSettings(root, book)
  const mode = settings.mode === 'fanfic' ? 'fanfic' : 'original'
  const binding = await resolveBinding(root, book)
  const readLegacyFanfic = mode === 'fanfic' || includeFanfic
  const legacyFanfic = readLegacyFanfic && binding.fanficProject ? await readOrNull('fanfic', readFanfic, root, binding.fanficProject) : null
  const legacyCanon = readLegacyFanfic && binding.fanficProject ? await readOrNull('fanfic-canon', readFanficCanon, root, binding.fanficProject) : null
  const canon = mode === 'fanfic'
    ? await requireCanon({ root, book, settings, legacyProject: legacyFanfic, legacyCanon })
    : { ok: true }
  const beat = binding.beatBook ? await readOrNull('beat', readBeat, root, binding.beatBook) : null
  const fade = binding.fadeBook ? await readOrNull('fade', readFade, root, binding.fadeBook) : null
  const voice = binding.voiceLibrary ? await readOrNull('voice', readVoice, root, binding.voiceLibrary) : null
  const voiceProfiles = binding.voiceLibrary ? (await readOrNull('voice-profils', readVoiceProfiles, root, binding.voiceLibrary)) ?? [] : []
  // 原创模式不读 fanfic 项目：即使工作区里有同人账本，也不能把世界事实带进原创上下文。
  // 只读视图（canon/ledgers）可以 includeFanfic=true 来展示已有资料，但不参与装配。
  let fanfic = (mode === 'fanfic' || includeFanfic) ? legacyFanfic : null
  // kit 自有的 canon 契约优先于旧 fanfic 项目（同一本书只该有一套强约束）。
  if (mode === 'fanfic' && canon.ok && canon.contract) {
    fanfic = contractToProject(canon.contract, { book, revision: settings.revision })
  }
  const styleProfiles = []
  for (const profileId of settings.activeStyleProfileIds ?? []) {
    try {
      styleProfiles.push(await readStyleProfile(root, profileId))
    } catch {
      // 档案缺失/损坏不阻塞写作；面板另行报
    }
  }
  const styleBriefs = styleProfiles.map((profile) => compileStyleBrief(profile)).filter((brief) => brief.available)
  return { binding, beat, fade, voice, voiceProfiles, fanfic, settings, mode, canon, styleProfiles, styleBriefs }
}

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

/** 所有待拍板都处理完后，awaiting_author 才回到 writing；模型不能用 write 绕过。 */
function releaseAwaitingIfReady(session) {
  const hasPendingIds = (session.pendingDecisionIds ?? []).length > 0
  const hasPendingProposals = (session.plan?.proposals ?? []).some((proposal) => (proposal?.status ?? 'pending') === 'pending')
  if (!hasPendingIds && !hasPendingProposals && session.state === 'awaiting_author') {
    session.state = transition(session, 'writing').state
  }
}

/**
 * 开始一章：读上下文、建会话。已有未完成会话时直接返回它（不重复开）。
 * @param {{root:string, book:string, chapter:number, requiredCapabilities?:string[]}} input
 */
export async function startChapter({ root, book, chapter, requiredCapabilities = ['beat', 'fade'], strict = false }) {
  assertSafeName(book, 'book')
  const number = Number(chapter)
  if (!Number.isInteger(number) || number < 1) throw new Error('chapter 必须是正整数')
  const required = requiredCapabilities.filter((capability) => CAPABILITIES.includes(capability))

  const { binding, beat, fade, voice, voiceProfiles, fanfic, settings, mode, canon, styleBriefs } = await readContext(root, book)

  if (canon.ok === false) {
    return { ok: false, code: canon.code ?? 'canon-required', message: canon.message, sourceId: canon.sourceId ?? null }
  }

  const missing = required.filter((capability) => (capability === 'beat' ? !beat : capability === 'fade' ? !fade : capability === 'voice' ? !voice : !fanfic))
  if (missing.length > 0) {
    return { ok: false, code: 'capability-missing', message: `缺少必需能力：${missing.join(', ')}`, missing }
  }

  const existing = await activeSession(root, book)
  if (existing && Number(existing.chapter) === number) {
    // 续上会话时重新装配上下文：拍板/记忆/契约/模式可能在两次调用之间变过，
    // 沿用旧上下文会让后续 finish 的指纹检查误判成 context_stale。
    const context = assembleContext({ beat, fade, voice, voiceProfiles, styleBriefs, fanfic, chapter: number, mode })
    const fingerprint = sha256(context.fingerprint)
    if (fingerprint !== existing.contextFingerprint || existing.mode !== mode) {
      existing.context = context
      existing.contextFingerprint = fingerprint
      existing.binding = binding
      existing.mode = mode
      existing.settings = settings
      await saveSession(root, existing)
    }
    return { ok: true, resumed: true, session: existing, context: existing.context }
  }

  const context = assembleContext({ beat, fade, voice, voiceProfiles, styleBriefs, fanfic, chapter: number, mode })
  const session = {
    schemaVersion: 1,
    id: newSessionId(),
    book,
    chapter: number,
    mode,
    binding,
    settings,
    requiredCapabilities: required,
    strict: strict === true,
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
 * expectedVersion / expectedDraftHash 给 UI 并发保存用；不匹配返回 draft-conflict，不写。
 * @param {{root:string, sessionId:string, text:string, expectedVersion?:number, expectedDraftHash?:string}} input
 */
export async function writeChapter({ root, sessionId, text, expectedVersion = null, expectedDraftHash = null }) {
  const body = requireString(text, 'text')
  return withSessionLock(sessionId, async () => {
    const session = await loadOrFail(root, sessionId)
    if (['completed', 'aborted'].includes(session.state)) {
      throw new Error(`会话已 ${session.state}，不能继续写正文`)
    }
    if (session.state === 'committing') {
      throw new Error('上一笔提交还没走完（committing）：先 resume 看事务状态，再改正文')
    }
    if (session.state === 'blocked') {
      throw new Error('会话被阻塞（' + (session.lastError?.code ?? 'blocked') + '）：先 resume 重新装配上下文，再改正文')
    }
    const currentVersion = Number.isInteger(session.draft?.version) ? session.draft.version : 0
    const currentHash = session.draft?.hash ?? null
    if (expectedVersion !== null && expectedVersion !== undefined && Number(expectedVersion) !== currentVersion) {
      return { ok: false, code: 'draft-conflict', message: '草稿已被另一个保存改过版本；刷新后再保存。', current: { version: currentVersion, hash: currentHash } }
    }
    if (expectedDraftHash !== null && expectedDraftHash !== undefined && String(expectedDraftHash) !== String(currentHash ?? '')) {
      return { ok: false, code: 'draft-conflict', message: '草稿内容已被另一个保存改过；刷新后再保存。', current: { version: currentVersion, hash: currentHash } }
    }
    const dir = path.join(sessionDir(root, session.id), 'draft')
    await mkdir(dir, { recursive: true })
    const version = currentVersion + 1
    const hash = sha256(body)
    const file = path.join(dir, `${version}-${hash.slice(0, 8)}.md`)
    await writeFile(file, body, 'utf8')
    session.draft = { path: file, hash, version }
    session.draftChars = [...body].length
    // awaiting_author 且有未拍板提案时，写草稿不解除等待；否则模型可以从 write 绕到 finish。
    const pending = (session.pendingDecisionIds ?? []).length > 0
    if (session.state !== 'writing' && !pending) {
      session.state = transition(session, 'writing').state
    }
    delete session.lastError
    delete session.blockedFrom
    await saveSession(root, session)
    return { ok: true, session, draft: session.draft }
  })
}

/** 读完整草稿（不截断）；工作台编辑用。 */
export async function readDraft({ root, sessionId }) {
  const session = await loadOrFail(root, sessionId)
  if (!session.draft?.path) return { ok: true, sessionId, draft: null }
  try {
    const text = await readFile(path.resolve(session.draft.path), 'utf8')
    return {
      ok: true,
      sessionId,
      draft: {
        text,
        version: session.draft.version,
        hash: session.draft.hash,
        chars: [...text].length,
        path: session.draft.path,
      },
      state: session.state,
    }
  } catch {
    return { ok: false, code: 'draft-missing', message: '草稿文件读不到；重新保存一次正文。', sessionId }
  }
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
  return withSessionLock(sessionId, async () => {
  const session = await loadOrFail(root, sessionId)
  if (session.state === 'completed') {
    return { ok: true, idempotent: true, session, receipt: session.receipt ?? null }
  }

  // 上次提交没走完（进程中断 / 写盘失败）时，先按事务日志判定，不重复落账。
  if (session.transactionId && ['committing', 'blocked'].includes(session.state)) {
    const recovery = await recoverTransaction({ root, txId: session.transactionId }).catch(() => null)
    if (recovery?.status === 'completed') {
      session.state = 'completed'
      session.receiptIds = [session.transactionId]
      await saveSession(root, session)
      return { ok: true, idempotent: true, recovered: true, session, receipt: session.receipt ?? null }
    }
    if (recovery && recovery.status !== 'not_started') {
      return {
        ok: false,
        code: 'recovery-' + recovery.status,
        message: `上一笔事务状态为 ${recovery.status}，请先在面板核对或 resume，不能重复收尾。`,
        recovery,
        session,
      }
    }
  }

  const pendingProposals = (session.plan?.proposals ?? []).filter((proposal) => (proposal?.status ?? 'pending') === 'pending')
  const pendingIds = session.pendingDecisionIds ?? []
  if (pendingIds.length > 0 || pendingProposals.length > 0) {
    return {
      ok: false,
      code: 'awaiting_author',
      message: '还有待拍板提案：先让作者在面板确认（模型不能替作者拍板），再收尾。',
      pending: pendingIds.length ? pendingIds : pendingProposals.map((proposal) => proposal.id),
      session,
    }
  }
  if (session.state === 'awaiting_author') {
    return { ok: false, code: 'awaiting_author', message: '会话仍在等待作者：先完成拍板或 resume 进入写作。', session }
  }
  if (session.state === 'aborted') {
    return { ok: false, code: 'aborted', message: '会话已作废，不能再收尾', session }
  }

  if (!session.draft) throw new Error('还没有保存正文（先 writeChapter）')
  const draft = await readFile(path.resolve(session.draft.path), 'utf8')

  const segments = Array.isArray(extraction.segments) ? extraction.segments : []
  const cards = Array.isArray(extraction.memory?.cards) ? extraction.memory.cards : []
  if (segments.length === 0) {
    return { ok: false, code: 'needs_extraction', message: '缺少段落映射：至少给一段 {start,end,quote}' }
  }
  const resolved = segments.map((segment, index) => resolveSegment(draft, segment, index))

  const { beat, fade, voice, voiceProfiles, fanfic, mode, canon, styleBriefs, styleProfiles } = await readContext(root, session.book)
  if (!beat || !fade) return { ok: false, code: 'capability-missing', message: '账本缺失，无法收尾' }
  if (canon.ok === false) return { ok: false, code: canon.code ?? 'canon-required', message: canon.message, session }

  // 上下文变了不能静默续跑：canon/契约/文风在写作期间被改动时，基于旧上下文的
  // 提取结果不再可信，退回 blocked/context_stale，让作者决定重新装配。
  if (session.contextFingerprint) {
    const fresh = assembleContext({ beat, fade, voice, voiceProfiles, styleBriefs, fanfic, chapter: session.chapter, mode })
    if (sha256(fresh.fingerprint) !== session.contextFingerprint) {
      const from = session.state === 'blocked' ? (session.blockedFrom ?? 'writing') : session.state
      if (session.state !== 'blocked') session.state = transition(session, 'blocked', { reason: '账本在写作期间发生变化', code: 'context_stale' }).state
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

  // verify：确定性检查（禁忌 / 长句 / 称呼）。blocker 不落账。
  // strict：只检查本次任务声明过的能力（requiredCapabilities），不越权扫无关账本。
  const required = new Set(session.requiredCapabilities ?? [])
  const useFanfic = mode === 'fanfic' && (session.strict !== true || required.has('fanfic'))
  const useVoice = session.strict !== true || required.has('voice')
  const verification = checkDraft({
    text: draft,
    forbidden: useFanfic ? (fanfic?.exports?.forbidden ?? []) : [],
    addresses: useFanfic ? (fanfic?.exports?.addresses ?? []) : [],
  })
  if (useVoice) {
    const styleProfile = styleProfiles[0] ?? voiceProfiles.find((item) => item.status === 'confirmed') ?? voiceProfiles[0] ?? null
    if (styleProfile) {
      const bandCheck = checkBands({ text: draft, profile: styleProfile })
      verification.findings.push(...bandCheck.findings)
      verification.warnings += bandCheck.warnings
      verification.metrics = bandCheck.metrics
    }
  }
  if (useFanfic && canon.contract) {
    const facts = Array.isArray(canon.contract.facts) ? canon.contract.facts : []
    const evidence = facts
      .flatMap((fact) => Array.isArray(fact?.evidence) ? fact.evidence : [])
      .concat(facts.map((fact) => ({ quote: fact?.evidenceQuote ?? fact?.quote ?? '' })))
      .filter((item) => item?.quote)
    if (evidence.length) {
      const copy = checkCopy({ text: draft, evidence })
      verification.findings.push(...copy.findings)
      verification.blockers += copy.blockers
    }
    const names = (canon.contract.characters ?? []).map((person) => person?.name).filter((name) => typeof name === 'string' && name)
    if (names.length) {
      const near = checkNames({ text: draft, names })
      verification.findings.push(...near.findings)
      verification.warnings += near.warnings
    }
  }
  if (useFanfic && session.binding?.fanficProject) {
    const legacyCanon = await readFanficCanon(root, session.binding.fanficProject).catch(() => null)
    if (legacyCanon) {
      const copy = checkCopy({ text: draft, evidence: legacyCanon.evidence })
      verification.findings.push(...copy.findings)
      verification.blockers += copy.blockers
      const names = checkNames({ text: draft, names: legacyCanon.names })
      verification.findings.push(...names.findings)
      verification.warnings += names.warnings
    }
  }
  verification.ok = verification.blockers === 0
  if (!verification.ok) {
    return {
      ok: false,
      code: 'verify-failed',
      message: '有 ' + verification.blockers + ' 处 blocker，改完正文再收尾',
      findings: verification.findings,
      stats: verification.stats,
      session,
    }
  }

  const beatFile = path.join(root, LEDGER_DIRS.beat, session.book, 'book.json')
  const fadeFile = path.join(root, LEDGER_DIRS.fade, session.book, 'memory.json')
  const beatSnap = await readJsonSnapshot(beatFile)
  const fadeSnap = await readJsonSnapshot(fadeFile)
  const beatRaw = beatSnap.json
  const fadeRaw = fadeSnap.json

  // 正文先落盘，再提交账本：写盘失败时账本不动，也不会报「已完成」。
  const beatChapterTitle = (() => {
    const list = Array.isArray(beatRaw.chapters) ? beatRaw.chapters : Object.values(beatRaw.chapters ?? {})
    const hit = list.find((item) => Number(item?.chapter ?? String(item?.key ?? '').replace(/\D/g, '')) === Number(session.chapter))
    return hit?.title ?? null
  })()
  const chapterTitle = String(session.title ?? beatChapterTitle ?? session.plan?.intent ?? '')
  let chapterFile = null
  let chapterRelPath = null
  let chapterBeforeHash = null
  try {
    const resolvedFile = await resolveChapterFile({ root, book: session.book, chapter: session.chapter, title: chapterTitle })
    chapterFile = resolvedFile.file
    chapterBeforeHash = resolvedFile.beforeHash
    chapterRelPath = path.relative(root, chapterFile).split(path.sep).join('/')
  } catch (error) {
    return { ok: false, code: 'chapter-file-failed', message: '定位正文文件失败：' + String(error?.message ?? error), session }
  }

  const now = new Date().toISOString()
  const chapterNo = Number(session.chapter)
  const newSegments = resolved.map((segment, index) => ({
    id: `kit-s-${session.id.slice(-6)}-${index + 1}`,
    chapter: chapterNo,
    taskId: null,
    decisionIds: Array.isArray(extraction.segments[index].decisionIds) ? extraction.segments[index].decisionIds : [],
    file: chapterRelPath,
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

  session.verification = { ok: verification.ok, blockers: verification.blockers, warnings: verification.warnings, stats: verification.stats }
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
        { path: chapterFile, after: draft, beforeHash: chapterBeforeHash },
        { path: beatFile, after: beatNext, beforeHash: beatSnap.hash },
        { path: fadeFile, after: fadeNext, beforeHash: fadeSnap.hash },
      ],
    })
    receipt = await commitTransaction({ root, txId: session.transactionId })
  } catch (error) {
    session.state = transition(session, 'blocked', { reason: error.message, code: 'commit-failed' }).state
    session.blockedFrom = 'committing'
    await saveSession(root, session)
    throw error
  }

  // 正文与两本账在同一个事务里提交；不再先写正文再提交账本。
  session.state = transition(session, 'completed').state
  session.completedAt = new Date().toISOString()
  session.receipt = receipt
  session.receiptIds = [receipt.txId]
  session.chapterFile = chapterFile
  await saveSession(root, session)
  return { ok: true, idempotent: false, session, receipt, effects: receipt.effects, chapterFile }
  })
}

/** 查询会话或按书查活动会话。 */
export async function queryChapter({ root, sessionId, book, view = null, query = '', chapter = null }) {
  if (view === 'history') {
    if (!book) throw new Error('view=history 需要 book')
    return chapterHistory({ root, book })
  }
  if (view === 'memory' || view === 'style' || view === 'canon' || view === 'ledgers') {
    if (!book) throw new Error('view=' + view + ' 需要 book')
    const { binding, beat, fade, voice, voiceProfiles, fanfic, styleProfiles, settings } = await readContext(root, book, { includeFanfic: true })
    if (view === 'ledgers') {
      return {
        ok: true, view,
        ledgers: {
          beat: beat ? { revision: beat.revision, chapters: beat.chapters.length, decisions: beat.decisions.length, segments: beat.segments.length } : null,
          fade: fade ? { revision: fade.revision, drift: fade.drift, cards: fade.cards.length } : null,
          voice: voice ? { works: voice.works.length } : null,
          fanfic: fanfic ? { revision: fanfic.revision, sourceId: fanfic.sourceId } : null,
        },
      }
    }
    if (view === 'style') {
      const base = styleView(voice, voiceProfiles)
      return {
        ok: true, view,
        ...base,
        available: base.available === true || (styleProfiles?.length ?? 0) > 0,
        kitProfiles: (styleProfiles ?? []).map((profile) => ({
          id: profile.id, name: profile.name, status: profile.status, version: profile.version,
          bands: profile.bands, rules: profile.rules, decisionPolicy: profile.decisionPolicy,
        })),
      }
    }
    if (view === 'canon') {
      if (settings?.activeCanonSourceId) {
        const contract = await readWorldContract(root, book, settings.activeCanonSourceId).catch(() => null)
        if (contract) {
          const project = contractToProject(contract, { book, revision: settings.revision })
          return {
            ok: true, view,
            ...canonView(project, { characters: contract.characters ?? [], secrets: contract.secrets ?? [] }),
            source: 'kit',
            contractStatus: contract.status,
            contractRevision: contract.revision ?? 0,
            contractHash: contract.hash ?? contractHash(contract),
            canonReady: isCanonReady(contract),
            facts: contract.facts ?? [],
            relationships: contract.relationships ?? [],
            timeline: contract.timeline ?? [],
            worldRules: contract.worldRules ?? [],
          }
        }
      }
      const fanficCanon = binding.fanficProject ? await readFanficCanon(root, binding.fanficProject).catch(() => null) : null
      return { ok: true, view, ...canonView(fanfic, fanficCanon), source: fanfic ? 'fanfic' : null }
    }
    const current = chapter ?? (await activeSession(root, book))?.chapter ?? null
    if (query) return { ok: true, view, ...searchMemory(fade, query) }
    return { ok: true, view, ...memoryView(fade, { currentChapter: current }) }
  }
  if (view === 'conflicts') {
    if (!book) throw new Error('view=conflicts 需要 book')
    const scanned = await collectConflicts({ root, book })
    return { ok: true, view: 'conflicts', ...scanned }
  }
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
  const recovery = session.transactionId
    ? await recoverTransaction({ root, txId: session.transactionId }).catch(() => null)
    : null

  // 模式可能在写作期间被切走（原创 ↔ 同人）；resume 不能把旧 canon 继续返回给作者。
  let refreshed = null
  const current = await readContext(root, session.book)
  if (session.mode !== current.mode) {
    if (current.canon.ok === false) {
      return { ok: false, code: current.canon.code ?? 'canon-required', message: current.canon.message, session, recovery }
    }
    const context = assembleContext({
      beat: current.beat, fade: current.fade, voice: current.voice, voiceProfiles: current.voiceProfiles,
      styleBriefs: current.styleBriefs, fanfic: current.fanfic, chapter: session.chapter, mode: current.mode,
    })
    session.context = context
    session.contextFingerprint = sha256(context.fingerprint)
    session.binding = current.binding
    session.mode = current.mode
    session.settings = current.settings
    await saveSession(root, session)
    refreshed = { modeChanged: true, mode: current.mode, chars: context.chars }
  }

  // blocked（常见是 context_stale）：重新装配上下文并回到出错前的状态，让作者能继续收尾。
  if (session.state === 'blocked') {
    const { binding, beat, fade, voice, voiceProfiles, fanfic, mode, canon, styleBriefs } = await readContext(root, session.book)
    if (canon.ok === false) {
      return { ok: false, code: canon.code ?? 'canon-required', message: canon.message, session, recovery }
    }
    const context = assembleContext({ beat, fade, voice, voiceProfiles, styleBriefs, fanfic, chapter: session.chapter, mode })
    session.context = context
    session.contextFingerprint = sha256(context.fingerprint)
    session.binding = binding
    session.mode = mode
    const candidates = ['preparing', 'awaiting_author', 'writing', 'checking', 'committing']
    session.state = candidates.includes(session.blockedFrom) ? session.blockedFrom : 'writing'
    session.lastError = null
    delete session.blockedFrom
    await saveSession(root, session)
    refreshed = { state: session.state, chars: context.chars }
  }

  return { ok: true, session, recovery, refreshed }
}

/**
 * 建计划：把作者的意图与待拍板提案挂到章节会话上，状态进入 awaiting_author。
 * 不写任何账本；确认拍板由作者在面板/聊天里做，模型不能自己 approved。
 * @param {{root:string, book:string, chapter:number, intent?:string, proposals?:object[]}} input
 */
export async function planChapter({ root, book, chapter, intent = '', proposals = [] }) {
  assertSafeName(book, 'book')
  const number = Number(chapter)
  if (!Number.isInteger(number) || number < 1) throw new Error('chapter 必须是正整数')
  const list = Array.isArray(proposals) ? proposals : []
  const contextInfo = await readContext(root, book)
  const annotated = list.map((item) => annotateProposal(item, contextInfo.styleProfiles))
  const styleHint = compileDecisionHint(contextInfo.styleProfiles)
  const pendingDecisionIds = annotated.map((item, index) => String(item?.id ?? `p-${index + 1}`))

  let session = await activeSession(root, book)
  if (!session || Number(session.chapter) !== number) {
    const { binding, beat, fade, voice, voiceProfiles, fanfic, mode, styleBriefs } = contextInfo
    const context = assembleContext({ beat, fade, voice, voiceProfiles, styleBriefs, fanfic, chapter: number, mode })
    session = {
      schemaVersion: 1,
      id: newSessionId(),
      book,
      chapter: number,
      mode,
      binding,
      requiredCapabilities: ['beat', 'fade'],
      state: 'awaiting_author',
      context,
      contextFingerprint: sha256(context.fingerprint),
      styleProfileIds: context.styleProfileIds ?? [],
      draft: null,
      transactionId: null,
      receiptIds: [],
      createdAt: new Date().toISOString(),
    }
  }
  session.plan = { intent: String(intent ?? ''), proposals: annotated, styleHint }
  session.pendingDecisionIds = pendingDecisionIds
  if (session.state === 'writing' && pendingDecisionIds.length > 0) session.state = 'awaiting_author'
  await saveSession(root, session)
  return { ok: true, session, pending: pendingDecisionIds.length, styleHint, proposals: annotated }
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

/**
 * 作者拍板：把会话里的一个提案写进 beat decisions（adopt），或只标记拒绝（reject）。
 * 这是唯一的「提案 → 账本」入口；模型只能提议，不能自己批准。
 * @param {{root:string, sessionId:string, proposalId:string, action?:'adopt'|'reject', option?:string, note?:string}} input
 */
export async function decideProposal({ root, sessionId, proposalId, action = 'adopt', option = '', note = '' }) {
  const session = await loadOrFail(root, sessionId)
  const proposals = session.plan?.proposals ?? []
  const index = proposals.findIndex((item) => String(item?.id) === String(proposalId))
  if (index < 0) throw new Error(`没有这个提案：${proposalId}`)
  if (['completed', 'aborted'].includes(session.state)) throw new Error(`会话已 ${session.state}，不能再拍板`)
  const proposal = proposals[index]
  if (proposal.status === 'adopted' || proposal.status === 'rejected') {
    return { ok: true, idempotent: true, session, written: false, proposal }
  }

  if (action === 'reject') {
    proposal.status = 'rejected'
    session.pendingDecisionIds = (session.pendingDecisionIds ?? []).filter((id) => String(id) !== String(proposalId))
    releaseAwaitingIfReady(session)
    await saveSession(root, session)
    return { ok: true, session, written: false, proposal }
  }

  const options = Array.isArray(proposal.options) ? proposal.options : []
  const chosen = options.find((item) => item?.label === option) ?? (options.length === 1 ? options[0] : null)
  if (options.length > 0 && !chosen) {
    return { ok: false, code: 'option-required', message: `提案「${proposal.title ?? proposalId}」需要指定 option（${options.map((item) => item.label).join(' / ')}）`, options }
  }

  const beatFile = path.join(root, LEDGER_DIRS.beat, session.book, 'book.json')
  const beatSnap = await readJsonSnapshot(beatFile)
  const beatRaw = beatSnap.json
  // 业务可能已经落账、但会话保存失败（operation 重试）：按稳定提案 id 找回，不重复写 decision。
  const already = (Array.isArray(beatRaw.decisions) ? beatRaw.decisions : []).find((item) => String(item.proposalId) === String(proposalId) && String(item.id ?? '').includes(session.id.slice(-6)))
  if (already) {
    proposal.status = 'adopted'
    proposal.decidedAt = already.createdAt ?? new Date().toISOString()
    proposal.option = already.option ?? option
    session.pendingDecisionIds = (session.pendingDecisionIds ?? []).filter((id) => String(id) !== String(proposalId))
    if (!(session.decisions ?? []).some((item) => String(item.proposalId) === String(proposalId))) {
      session.decisions = [...(session.decisions ?? []), { id: already.id, proposalId: String(proposalId), choice: already.option ?? '', styleFit: already.styleFit ?? null, at: proposal.decidedAt }]
    }
    releaseAwaitingIfReady(session)
    await saveSession(root, session)
    return { ok: true, idempotent: true, recovered: true, written: false, session, decision: already, receipt: null, proposal }
  }
  const now = new Date().toISOString()
  const decision = {
    id: `kit-d-${session.id.slice(-6)}-${index + 1}`,
    chapter: Number(session.chapter),
    title: String(proposal.title ?? `第 ${session.chapter} 章拍板`),
    kind: '分叉',
    change: String(chosen?.impact || chosen?.label || note || '（作者确认）'),
    option: chosen?.label ?? '',
    proposalId: String(proposalId),
    styleFit: chosen?.styleFit ?? null,
    styleWhy: chosen?.styleWhy ?? '',
    effect: 'option-recorded',
    status: 'committed',
    source: 'kit',
    createdAt: now,
  }
  const beatNext = {
    ...beatRaw,
    revision: (Number.isFinite(beatRaw.revision) ? beatRaw.revision : (Array.isArray(beatRaw.revisions) ? beatRaw.revisions.length : 0) + (Array.isArray(beatRaw.audit) ? beatRaw.audit.length : 0)) + 1,
    decisions: [...(Array.isArray(beatRaw.decisions) ? beatRaw.decisions : []), decision],
    audit: [...(Array.isArray(beatRaw.audit) ? beatRaw.audit : []), { id: `kit-a-${session.id.slice(-6)}-d`, kind: 'decision', chapter: Number(session.chapter), decisionId: decision.id, at: now, by: 'dsh-novel-kit' }],
  }
  const txId = `tx-${session.id}-decision-${index + 1}`
  await planTransaction({ root, txId, files: [{ path: beatFile, after: beatNext, beforeHash: beatSnap.hash }] })
  const receipt = await commitTransaction({ root, txId })

  proposal.status = 'adopted'
  proposal.decidedAt = now
  proposal.option = chosen?.label ?? ''
  session.pendingDecisionIds = (session.pendingDecisionIds ?? []).filter((id) => String(id) !== String(proposalId))
  session.decisions = [...(session.decisions ?? []), { id: decision.id, proposalId: String(proposalId), choice: chosen?.label ?? '', styleFit: decision.styleFit, at: now }]
  releaseAwaitingIfReady(session)
  await saveSession(root, session)
  return { ok: true, session, written: true, decision, effect: decision.effect, receipt, proposal }
}

/** 定位正文文件（不写）：正文/第N章_标题.md；同章已有文件就复用。 */
async function resolveChapterFile({ root, book, chapter, title }) {
  const dir = path.join(root, '正文')
  const prefix = `第${Number(chapter)}章`
  const safe = String(title ?? '').replace(/[\\/:*?"<>|\n\r\t]/g, '').trim().slice(0, 40)
  let existing = null
  try {
    const entries = await readdir(dir)
    existing = entries.find((name) => name === `${prefix}.md` || name.startsWith(`${prefix}_`)) ?? null
  } catch {
    // 目录还不存在；事务写入时会创建
  }
  const file = path.join(dir, existing ?? (safe ? `${prefix}_${safe}.md` : `${prefix}.md`))
  return { file, beforeHash: await fileHashOrNull(file) }
}

/**
 * 章节历史：每个章号取最近一个会话，给出状态/字数/正文文件。
 * 只读；没经过 kit 收尾的章不会出现（那些章看 beat 的 segments）。
 * @param {{root:string, book:string, limit?:number}} input
 */
export async function chapterHistory({ root, book, limit = 60 }) {
  assertSafeName(book, 'book')
  const sessions = await sessionsForBook(root, book)
  const seen = new Map()
  for (const session of sessions) {
    const key = Number(session.chapter)
    if (!seen.has(key)) seen.set(key, session)
  }
  const chapters = [...seen.entries()]
    .map(([chapter, session]) => ({
      chapter,
      state: session.state,
      chars: session.draftChars ?? null,
      completedAt: session.completedAt ?? null,
      chapterFile: session.chapterFile ?? null,
      sessionId: session.id,
    }))
    .sort((a, b) => b.chapter - a.chapter)
    .slice(0, Math.max(1, Math.min(200, Number(limit) || 60)))
  return { ok: true, book, total: seen.size, chapters }
}
