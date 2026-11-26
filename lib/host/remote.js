/**
 * Host half of the "小说" panel.
 *
 * Reads the workspace with the read-only snapshot collector. It never executes
 * a slash command: `commands.execute()` appends `command/run` + `command/done`
 * to the session log (the 0.2.3 fanfic lesson), so panel polling would paint a
 * row into every open conversation.
 */
import { readFileSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { DESCRIPTORS } from './remote-contract.js'
import { collectSnapshot } from './snapshot.js'
import { collectDiagnostics } from './diagnostics.js'
import { memoryView, styleView, canonView, searchMemory, worldContractView } from './views.js'
import { buildInbox } from './inbox.js'
import { resolveBinding } from '../engine/binding.js'
import { readBeat, readFade, readVoice, readFanfic, readVoiceProfiles, readFanficCanon } from '../repositories/ledger.js'
import { activeSession } from '../engine/session-store.js'
import { decisionsView } from './decisions.js'
import { readDraft, readContext, resumeChapter as resumeChapterEngine } from '../engine/chapter.js'
import { readChapterPlan, compilePlanBrief } from '../engine/plan.js'
import { assembleContext } from '../engine/context.js'
import { listOperations } from '../engine/operations.js'
import { executeAuthorCommand } from '../engine/author.js'
import { updateMemoryCard } from '../engine/memory.js'
import { archiveCard, restoreArchivedCard } from '../native/memory.js'
import { readMedia, reviewMediaEvidence, mediaBrief } from '../native/media.js'
import { readPersonas, confirmPersona as confirmNativePersona, personaBrief } from '../native/personas.js'
import { readDecisions } from '../native/decisions.js'
import { readMemory } from '../native/memory.js'
import { createRun, listRuns, updateRun } from '../native/runs.js'
import { analyzeBook } from '../native/analysis.js'
import { listSourceFiles as listSourceFilesIn } from '../engine/source-files.js'
import { readProjectSettings, unbindStyleProfile } from '../engine/settings.js'
import { listStyleProfiles as listStyleProfilesIn, readStyleProfile, compileStyleBrief, rateStyleProfile, updateStyleRule, addStyleCandidate, readStyleHistory, remeasureStyle, removeStyleProfile, setStyleReaderPreference } from '../engine/profiles.js'
import { contractToProject, isCanonReady, readWorldContract, contractHash } from '../engine/canon.js'
import { listSources as listSourcesIn, readSourceChapter } from '../engine/sources.js'
import { resolveBook } from '../native/store.js'
import { LEGACY_ALLOWED } from '../native/legacy-policy.js'
import { assertComicFile, listComicPages as listComicPagesIn, readComicPageBase64, ocrComicPages as ocrComicPagesIn } from '../native/comic/index.js'
import { hongguoSearch, hongguoSeries, hongguoEpisodes, hongguoDanmaku } from '../native/hongguo/index.js'
import { previewLegacy, importLegacyBook } from '../native/import/legacy.js'
import { migrateKitBook } from '../native/import/kit-legacy.js'
import { LEDGER_DIRS } from '../workspace.js'

const VERSION = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version
const initializers = []

function markRemote(proto, name) {
  const context = {
    kind: 'method',
    name,
    static: false,
    private: false,
    addInitializer(fn) {
      initializers.push(fn)
    },
  }
  Remote(name)(proto[name], context)
}

class NovelKitPanelRemote extends TypertRemoteService {
  static inject = ['agents', 'typert', 'workingDirectory']

  constructor(ctx) {
    super(ctx, 'novelKitPanel')
    for (const initializer of initializers) initializer.call(this)
    ctx.typert.register({
      package: 'dsh-novel-kit',
      face: 'host',
      schemas: [],
      model: { services: [], events: [], objects: [] },
      invocations: DESCRIPTORS,
    })
  }

  agent(id) {
    const agent = this.ctx.agents.get(id)
    if (!agent) throw new Error('会话尚未加载或已关闭，请重新打开会话后重试。')
    return agent
  }

  async rootOf(id) {
    const workdir = this.ctx.get('workingDirectory')
    const agent = this.agent(id)
    if (!workdir?.ensure) throw new Error('宿主没有工作区服务（workingDirectory）')
    return await workdir.ensure(agent)
  }

  gate() {
    return this.ctx.get('novelKitGate') ?? null
  }

  /** 所有写操作先看总开关：when 只影响工具呈现，remote 写入必须自己拦。 */
  assertMaster() {
    const gate = this.gate()
    if (!gate || gate.isMasterOn?.() !== true) {
      throw new Error('小说能力总开关关着：先在面板/命令里启用小说能力，再执行写操作。')
    }
  }

  authorActor() {
    return { kind: 'author', trusted: true, source: 'novel-kit-panel' }
  }

  operationId(request = {}, prefix = 'op') {
    const supplied = typeof request.operationId === 'string' ? request.operationId.trim() : ''
    if (supplied) return supplied
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  }

  async identity(sessionId) {
    this.agent(sessionId)
    return { plugin: 'dsh-novel-kit', version: VERSION, apiVersion: 1 }
  }

  async getDiagnostics(sessionId) {
    this.agent(sessionId)
    return await collectDiagnostics({ root: await this.rootOf(sessionId), pluginManager: this.ctx.get('pluginManager') })
  }

  async previewLegacy(sessionId) {
    await this.agent(sessionId)
    const root = await this.rootOf(sessionId)
    return await previewLegacy(root)
  }

  async importLegacy(sessionId, request = {}) {
    await this.agent(sessionId)
    this.assertMaster()
    const root = await this.rootOf(sessionId)
    return await importLegacyBook({
      root,
      book: String(request.book ?? ''),
      mode: request.mode === 'fanfic' ? 'fanfic' : 'original',
      replace: request.replace === true,
      sources: {
        voice: request.voice ? String(request.voice) : null,
        fanfic: request.fanfic ? String(request.fanfic) : null,
      },
    })
  }

  async migrateKitLegacy(sessionId, request = {}) {
    await this.agent(sessionId)
    this.assertMaster()
    const root = await this.rootOf(sessionId)
    return await migrateKitBook({ root, book: String(request.book ?? ''), replace: request.replace === true })
  }

  async getDecisions(sessionId, request = {}) {
    const root = await this.rootOf(sessionId)
    const binding = await resolveBinding(root, request.book)
    const book = request.book || binding.beatBook || null
    const beat = book ? await readBeat(root, book).catch(() => null) : null
    const session = book ? await activeSession(root, book).catch(() => null) : null
    return decisionsView(beat, session, request.chapter ?? null)
  }

  async decide(sessionId, request = {}) {
    await this.agent(sessionId)
    this.assertMaster()
    const action = String(request.action ?? 'adopt')
    if (action !== 'adopt' && action !== 'reject') throw new Error('action 只能是 adopt / reject')
    const root = await this.rootOf(sessionId)
    return executeAuthorCommand({
      root,
      operationId: this.operationId(request, 'decision'),
      command: action === 'reject' ? 'decision.reject' : 'decision.adopt',
      targetRef: {
        sessionId: String(request.chapterSessionId ?? ''),
        proposalId: String(request.proposalId ?? ''),
      },
      payload: { option: request.option ? String(request.option) : '' },
      actor: this.authorActor(),
    })
  }

  async createBook(sessionId, request = {}) {
    await this.agent(sessionId)
    this.assertMaster()
    const root = await this.rootOf(sessionId)
    return executeAuthorCommand({
      root,
      operationId: this.operationId(request, 'book-create'),
      command: 'book.create',
      targetRef: { book: String(request.book ?? '') },
      payload: { mode: request.mode === 'fanfic' ? 'fanfic' : 'original' },
      actor: this.authorActor(),
    })
  }

  async startChapter(sessionId, request = {}) {
    await this.agent(sessionId)
    this.assertMaster()
    const root = await this.rootOf(sessionId)
    return executeAuthorCommand({
      root,
      operationId: this.operationId(request, 'chapter-start'),
      command: 'chapter.start',
      targetRef: { book: String(request.book ?? ''), chapter: Number(request.chapter) },
      actor: this.authorActor(),
    })
  }

  async getDraft(sessionId, request = {}) {
    await this.agent(sessionId)
    const root = await this.rootOf(sessionId)
    return await readDraft({ root, sessionId: String(request.chapterSessionId ?? '') })
  }

  async saveDraft(sessionId, request = {}) {
    await this.agent(sessionId)
    this.assertMaster()
    const root = await this.rootOf(sessionId)
    return executeAuthorCommand({
      root,
      operationId: this.operationId(request, 'draft'),
      command: 'draft.save',
      targetRef: { sessionId: String(request.chapterSessionId ?? '') },
      expectedDraftHash: request.expectedDraftHash ? String(request.expectedDraftHash) : null,
      payload: {
        text: String(request.text ?? ''),
        expectedVersion: request.expectedVersion ?? null,
      },
      actor: this.authorActor(),
    })
  }

  async reviseDecision(sessionId, request = {}) {
    await this.agent(sessionId)
    this.assertMaster()
    const root = await this.rootOf(sessionId)
    return executeAuthorCommand({
      root,
      operationId: this.operationId(request, 'decision-revise'),
      command: 'decision.revise',
      targetRef: { book: String(request.book ?? ''), decisionId: String(request.decisionId ?? '') },
      payload: { option: String(request.option ?? ''), note: request.note ? String(request.note) : '' },
      actor: this.authorActor(),
    })
  }

  async memoryAction(sessionId, request = {}) {
    await this.agent(sessionId)
    this.assertMaster()
    const action = String(request.action ?? '')
    if (!['pin', 'forget', 'restore', 'archive', 'unarchive'].includes(action)) throw new Error('action 只能是 pin / forget / restore / archive / unarchive')
    const root = await this.rootOf(sessionId)
    if (!request.book) throw new Error('缺少 book')
    if (action === 'archive' || action === 'unarchive') {
      const book = String(request.book)
      const settings = await readProjectSettings(root, book)
      const bookId = settings.bookId ?? (await resolveBook(root, book).catch(() => null))?.bookId ?? null
      if (!bookId) return { ok: false, code: 'legacy-migration-required', message: '这本书还没有 kit 原生身份：先迁移再归档。' }
      return action === 'archive'
        ? archiveCard({ root, bookId, cardId: String(request.cardId ?? '') })
        : restoreArchivedCard({ root, bookId, cardId: String(request.cardId ?? '') })
    }
    return updateMemoryCard({ root, book: String(request.book), cardId: String(request.cardId ?? ''), action })
  }

  async getMemory(sessionId, request = {}) {
    const root = await this.rootOf(sessionId)
    const binding = await resolveBinding(root, request.book)
    const fade = binding.fadeBook
      ? await readFade(root, binding.fadeBook).catch(() => null)
      : (request.book ? await readFade(root, request.book).catch(() => null) : null)
    return memoryView(fade, { chapter: request.chapter ?? null, limit: request.limit, domain: request.domain ?? null, currentChapter: request.currentChapter ?? null })
  }

  async listSourceFiles(sessionId, request = {}) {
    await this.agent(sessionId)
    return listSourceFilesIn(String(request.dir ?? ''))
  }

  async searchMemory(sessionId, request = {}) {
    const root = await this.rootOf(sessionId)
    const binding = await resolveBinding(root, request.book)
    const fade = binding.fadeBook
      ? await readFade(root, binding.fadeBook).catch(() => null)
      : (request.book ? await readFade(root, request.book).catch(() => null) : null)
    return searchMemory(fade, request.query, { limit: request.limit })
  }

  async getStyleBrief(sessionId, request = {}) {
    const root = await this.rootOf(sessionId)
    const profileId = String(request.profileId ?? '')
    if (!profileId) return { available: false, message: '缺少 profileId。' }
    const profile = await readStyleProfile(root, profileId)
    return { available: true, profileId, brief: compileStyleBrief(profile) }
  }

  async getStyle(sessionId, request = {}) {    const root = await this.rootOf(sessionId)
    const binding = await resolveBinding(root, request.book)
    const library = binding.voiceLibrary ? await readVoice(root, binding.voiceLibrary).catch(() => null) : null
    const profiles = binding.voiceLibrary ? await readVoiceProfiles(root, binding.voiceLibrary).catch(() => []) : []
    const kit = await listStyleProfilesIn(root).catch(() => ({ profiles: [] }))
    const base = styleView(library, profiles)
    return { ...base, available: base.available === true || (kit.profiles?.length ?? 0) > 0, kitProfiles: kit.profiles ?? [] }
  }

  async getSettings(sessionId, request = {}) {
    await this.agent(sessionId)
    const root = await this.rootOf(sessionId)
    const book = typeof request.book === 'string' && request.book ? request.book : null
    const gate = this.gate()
    return {
      master: gate?.isMasterOn?.() === true,
      session: gate?.isOn?.(this.agent(sessionId)) === true,
      project: book ? await readProjectSettings(root, book) : null,
    }
  }

  async setMaster(sessionId, request = {}) {
    await this.agent(sessionId)
    const gate = this.gate()
    if (!gate?.setMaster) throw new Error('总开关服务未就绪')
    if (typeof request.master !== 'boolean') throw new Error('master 必须是布尔值')
    return await gate.setMaster(request.master)
  }

  async setMode(sessionId, request = {}) {
    await this.agent(sessionId)
    this.assertMaster()
    const book = String(request.book ?? '')
    if (!book) throw new Error('缺少 book')
    const root = await this.rootOf(sessionId)
    return executeAuthorCommand({
      root,
      operationId: this.operationId(request, 'mode'),
      command: 'mode.set',
      targetRef: { book },
      expectedRevision: request.expectedRevision ?? null,
      payload: { mode: String(request.mode ?? '') },
      actor: this.authorActor(),
    })
  }

  async importStyle(sessionId, request = {}) {
    await this.agent(sessionId)
    this.assertMaster()
    const root = await this.rootOf(sessionId)
    return executeAuthorCommand({
      root,
      operationId: this.operationId(request, 'style'),
      command: 'import.style',
      targetRef: { book: String(request.book ?? '') },
      expectedRevision: request.expectedRevision ?? null,
      payload: {
        file: String(request.file ?? ''),
        title: request.title ? String(request.title) : '',
      },
      actor: this.authorActor(),
    })
  }

  async confirmStyle(sessionId, request = {}) {
    await this.agent(sessionId)
    this.assertMaster()
    const root = await this.rootOf(sessionId)
    return executeAuthorCommand({
      root,
      operationId: this.operationId(request, 'style-confirm'),
      command: 'style.confirm',
      targetRef: { profileId: String(request.profileId ?? '') },
      payload: { expectedRevision: request.expectedRevision ?? null },
      actor: this.authorActor(),
    })
  }

  async rateStyle(sessionId, request = {}) {
    await this.agent(sessionId)
    this.assertMaster()
    const root = await this.rootOf(sessionId)
    return rateStyleProfile({
      root,
      profileId: String(request.profileId ?? ''),
      stars: request.stars,
      note: request.note ? String(request.note) : '',
      by: 'author',
      expectedRevision: request.expectedRevision ?? null,
    })
  }

  async unbindStyle(sessionId, request = {}) {
    await this.agent(sessionId)
    this.assertMaster()
    const root = await this.rootOf(sessionId)
    if (!request.book || !request.profileId) return { ok: false, code: 'style-unbind-missing' }
    return unbindStyleProfile(root, String(request.book), String(request.profileId))
  }

  async saveStyleReader(sessionId, request = {}) {
    await this.agent(sessionId)
    this.assertMaster()
    const root = await this.rootOf(sessionId)
    return setStyleReaderPreference({ root, profileId: String(request.profileId ?? ''), text: String(request.text ?? ''), expectedRevision: request.expectedRevision ?? null })
  }

  async removeStyleProfile(sessionId, request = {}) {
    await this.agent(sessionId)
    this.assertMaster()
    const root = await this.rootOf(sessionId)
    return removeStyleProfile({ root, profileId: String(request.profileId ?? ''), book: request.book ? String(request.book) : null })
  }

  async remeasureStyle(sessionId, request = {}) {
    await this.agent(sessionId)
    this.assertMaster()
    const root = await this.rootOf(sessionId)
    return remeasureStyle({ root, profileId: String(request.profileId ?? '') })
  }

  async updateStyleRule(sessionId, request = {}) {
    await this.agent(sessionId)
    this.assertMaster()
    const root = await this.rootOf(sessionId)
    return updateStyleRule({
      root,
      profileId: String(request.profileId ?? ''),
      ruleId: String(request.ruleId ?? ''),
      status: request.status === undefined ? undefined : String(request.status),
      weight: request.weight === undefined ? undefined : request.weight,
      text: request.text === undefined ? undefined : String(request.text),
      expectedRevision: request.expectedRevision ?? null,
    })
  }

  async addStyleCandidate(sessionId, request = {}) {
    await this.agent(sessionId)
    this.assertMaster()
    const root = await this.rootOf(sessionId)
    return addStyleCandidate({
      root,
      profileId: String(request.profileId ?? ''),
      text: String(request.text ?? ''),
      evidence: Array.isArray(request.evidence) ? request.evidence : [],
      expectedRevision: request.expectedRevision ?? null,
    })
  }

  async getStyleHistory(sessionId, request = {}) {
    await this.agent(sessionId)
    const root = await this.rootOf(sessionId)
    return readStyleHistory({ root, profileId: String(request.profileId ?? '') })
  }

  async listComicPages(sessionId, request = {}) {
    await this.agent(sessionId)
    const root = await this.rootOf(sessionId)
    const file = assertComicFile(root, request.file)
    return await listComicPagesIn(file)
  }

  async getComicPage(sessionId, request = {}) {
    await this.agent(sessionId)
    const root = await this.rootOf(sessionId)
    return await readComicPageBase64(root, request.file, request.index)
  }

  async ocrComicPages(sessionId, request = {}) {
    await this.agent(sessionId)
    const root = await this.rootOf(sessionId)
    const file = assertComicFile(root, request.file)
    return await ocrComicPagesIn(file, Array.isArray(request.indices) ? request.indices : [])
  }

  async hongguoSearch(sessionId, request = {}) {
    await this.agent(sessionId)
    return await hongguoSearch(String(request.query ?? ''), {})
  }

  async hongguoSeries(sessionId, request = {}) {
    await this.agent(sessionId)
    return await hongguoSeries(String(request.seriesId ?? ''))
  }

  async hongguoEpisodes(sessionId, request = {}) {
    await this.agent(sessionId)
    return await hongguoEpisodes(String(request.seriesId ?? ''), {})
  }

  async hongguoDanmaku(sessionId, request = {}) {
    await this.agent(sessionId)
    return await hongguoDanmaku(String(request.seriesId ?? ''), String(request.episodeId ?? ''), {})
  }

  async getMedia(sessionId, request = {}) {    await this.agent(sessionId)
    const root = await this.rootOf(sessionId)
    const book = String(request.book ?? '')
    if (!book) return { ok: false, code: 'book-required', message: '缺少 book' }
    const settings = await readProjectSettings(root, book)
    const bookId = settings.bookId ?? (await resolveBook(root, book).catch(() => null))?.bookId ?? null
    if (!bookId) return { ok: false, code: 'legacy-migration-required', message: '这本书还没有 kit 原生身份：先迁移再看媒体。' }
    const media = await readMedia(root, bookId)
    return { ok: true, revision: media.revision, sources: media.sources, evidence: media.evidence, brief: mediaBrief(media) }
  }

  async reviewMedia(sessionId, request = {}) {
    await this.agent(sessionId)
    this.assertMaster()
    const root = await this.rootOf(sessionId)
    const book = String(request.book ?? '')
    if (!book) return { ok: false, code: 'book-required', message: '缺少 book' }
    const settings = await readProjectSettings(root, book)
    const bookId = settings.bookId ?? (await resolveBook(root, book).catch(() => null))?.bookId ?? null
    if (!bookId) return { ok: false, code: 'legacy-migration-required', message: '这本书还没有 kit 原生身份：先迁移再审媒体。' }
    return reviewMediaEvidence({
      root, bookId,
      evidenceId: String(request.evidenceId ?? ''),
      status: String(request.status ?? ''),
      note: request.note ? String(request.note) : '',
      expectedRevision: request.expectedRevision ?? null,
    })
  }

  async getPersonas(sessionId, request = {}) {
    await this.agent(sessionId)
    const root = await this.rootOf(sessionId)
    const book = String(request.book ?? '')
    if (!book) return { ok: false, code: 'book-required', message: '缺少 book' }
    const settings = await readProjectSettings(root, book)
    const bookId = settings.bookId ?? (await resolveBook(root, book).catch(() => null))?.bookId ?? null
    if (!bookId) return { ok: false, code: 'legacy-migration-required', message: '这本书还没有 kit 原生身份：先迁移再看人物卡。' }
    const document = await readPersonas(root, bookId)
    return { ok: true, revision: document.revision, personas: document.personas, brief: personaBrief(document) }
  }

  async confirmPersona(sessionId, request = {}) {
    await this.agent(sessionId)
    this.assertMaster()
    const root = await this.rootOf(sessionId)
    const book = String(request.book ?? '')
    if (!book) return { ok: false, code: 'book-required', message: '缺少 book' }
    const settings = await readProjectSettings(root, book)
    const bookId = settings.bookId ?? (await resolveBook(root, book).catch(() => null))?.bookId ?? null
    if (!bookId) return { ok: false, code: 'legacy-migration-required', message: '这本书还没有 kit 原生身份：先迁移再确认人物卡。' }
    return confirmNativePersona({ root, bookId, personaId: String(request.personaId ?? ''), expectedRevision: request.expectedRevision ?? null })
  }

  async getRuns(sessionId, request = {}) {
    await this.agent(sessionId)
    const root = await this.rootOf(sessionId)
    const book = String(request.book ?? '')
    if (!book) return { ok: false, code: 'book-required', message: '缺少 book' }
    const settings = await readProjectSettings(root, book)
    const bookId = settings.bookId ?? (await resolveBook(root, book).catch(() => null))?.bookId ?? null
    if (!bookId) return { ok: false, code: 'legacy-migration-required', message: '这本书还没有 kit 原生身份：先迁移再看 runbook。' }
    const listed = await listRuns({ root, bookId, limit: 50 })
    return { ok: true, runs: listed.runs }
  }

  async createRun(sessionId, request = {}) {
    await this.agent(sessionId)
    this.assertMaster()
    const root = await this.rootOf(sessionId)
    const book = String(request.book ?? '')
    if (!book) return { ok: false, code: 'book-required', message: '缺少 book' }
    const settings = await readProjectSettings(root, book)
    const bookId = settings.bookId ?? (await resolveBook(root, book).catch(() => null))?.bookId ?? null
    if (!bookId) return { ok: false, code: 'legacy-migration-required', message: '这本书还没有 kit 原生身份：先迁移再建 run。' }
    const steps = Array.isArray(request.steps) && request.steps.length
      ? request.steps
      : [
          { id: 'plan', kind: 'plan', title: '计划' },
          { id: 'write', kind: 'write', title: '写正文' },
          { id: 'check', kind: 'check', title: '检查' },
          { id: 'finish', kind: 'finish', title: '收尾' },
        ]
    return createRun({ root, bookId, title: request.title ? String(request.title) : '', flowId: request.flowId ? String(request.flowId) : '', steps })
  }

  async updateRun(sessionId, request = {}) {
    await this.agent(sessionId)
    this.assertMaster()
    const root = await this.rootOf(sessionId)
    const book = String(request.book ?? '')
    if (!book) return { ok: false, code: 'book-required', message: '缺少 book' }
    const settings = await readProjectSettings(root, book)
    const bookId = settings.bookId ?? (await resolveBook(root, book).catch(() => null))?.bookId ?? null
    if (!bookId) return { ok: false, code: 'legacy-migration-required', message: '这本书还没有 kit 原生身份：先迁移再改 run。' }
    return updateRun({
      root, bookId,
      runId: String(request.runId ?? ''),
      patch: { status: String(request.status ?? '') },
      expectedRevision: request.expectedRevision ?? null,
    })
  }

  async getAnalysis(sessionId, request = {}) {
    await this.agent(sessionId)
    const root = await this.rootOf(sessionId)
    const book = String(request.book ?? '')
    if (!book) return { ok: false, code: 'book-required', message: '缺少 book' }
    const settings = await readProjectSettings(root, book)
    const bookId = settings.bookId ?? (await resolveBook(root, book).catch(() => null))?.bookId ?? null
    if (!bookId) return { ok: false, code: 'legacy-migration-required', message: '这本书还没有 kit 原生身份：先迁移再分析。' }
    const [decisions, memory, media, personas, runs] = await Promise.all([
      readDecisions(root, bookId),
      readMemory(root, bookId),
      readMedia(root, bookId),
      readPersonas(root, bookId),
      listRuns({ root, bookId, limit: 50 }).then((result) => result.runs),
    ])
    return analyzeBook({ bookId, decisions, memory, media, personas, runs })
  }

  async importCanon(sessionId, request = {}) {
    await this.agent(sessionId)
    this.assertMaster()
    const root = await this.rootOf(sessionId)
    return executeAuthorCommand({
      root,
      operationId: this.operationId(request, 'canon'),
      command: 'import.canon',
      targetRef: { book: String(request.book ?? '') },
      expectedRevision: request.expectedRevision ?? null,
      payload: {
        file: String(request.file ?? ''),
        title: request.title ? String(request.title) : '',
        confirmMode: request.confirmMode === true,
      },
      actor: this.authorActor(),
    })
  }

  async getOperations(sessionId, request = {}) {
    const root = await this.rootOf(sessionId)
    return listOperations(root, { limit: request.limit ?? 20 })
  }

  async resumeChapter(sessionId, request = {}) {
    await this.agent(sessionId)
    this.assertMaster()
    const root = await this.rootOf(sessionId)
    return resumeChapterEngine({ root, sessionId: String(request.chapterSessionId ?? request.sessionId ?? '') })
  }

  async previewContext(sessionId, request = {}) {
    const root = await this.rootOf(sessionId)
    const book = String(request.book ?? '')
    if (!book) return { available: false, code: 'book-required', message: '先选择作品。' }
    const chapter = Number(request.chapter ?? 1)
    const ctx = await readContext(root, book, { includeFanfic: true })
    const assembled = assembleContext({
      beat: ctx.beat, fade: ctx.fade, voice: ctx.voice, voiceProfiles: ctx.voiceProfiles,
      styleBriefs: ctx.styleBriefs, fanfic: ctx.fanfic, chapter, mode: ctx.mode,
    })
    return {
      available: true,
      book,
      chapter,
      mode: assembled.mode,
      fingerprint: assembled.fingerprint,
      chars: assembled.chars,
      budgets: assembled.budgets,
      segments: assembled.segments.map((segment) => ({
        component: segment.component,
        chars: segment.chars,
        budgetChars: segment.budgetChars,
        revision: segment.revision ?? null,
        available: segment.available !== false,
      })),
    }
  }

  async getPlan(sessionId, request = {}) {    const root = await this.rootOf(sessionId)
    const book = String(request.book ?? '')
    const chapter = Number(request.chapter ?? 1)
    const plan = await readChapterPlan({ root, book, chapter })
    return { ...plan, brief: compilePlanBrief(plan) }
  }

  async savePlan(sessionId, request = {}) {
    await this.agent(sessionId)
    this.assertMaster()
    const root = await this.rootOf(sessionId)
    return executeAuthorCommand({
      root,
      operationId: this.operationId(request, 'plan-save'),
      command: 'plan.save',
      targetRef: { book: String(request.book ?? ''), chapter: Number(request.chapter ?? 1) },
      payload: {
        intent: String(request.intent ?? ''),
        pov: String(request.pov ?? ''),
        time: String(request.time ?? ''),
        place: String(request.place ?? ''),
        scenes: Array.isArray(request.scenes) ? request.scenes : [],
        expectedRevision: request.expectedRevision ?? null,
      },
      actor: this.authorActor(),
    })
  }

  async updateCanon(sessionId, request = {}) {
    await this.agent(sessionId)
    this.assertMaster()
    const root = await this.rootOf(sessionId)
    return executeAuthorCommand({
      root,
      operationId: this.operationId(request, 'canon-update'),
      command: 'canon.update',
      targetRef: { book: String(request.book ?? ''), sourceId: String(request.sourceId ?? '') },
      payload: {
        patch: request.patch && typeof request.patch === 'object' ? request.patch : {},
        expectedRevision: request.expectedRevision ?? null,
      },
      actor: this.authorActor(),
    })
  }

  async confirmCanon(sessionId, request = {}) {
    await this.agent(sessionId)
    this.assertMaster()
    const root = await this.rootOf(sessionId)
    return executeAuthorCommand({
      root,
      operationId: this.operationId(request, 'canon-confirm'),
      command: 'canon.confirm',
      targetRef: { book: String(request.book ?? ''), sourceId: String(request.sourceId ?? '') },
      payload: { expectedRevision: request.expectedRevision ?? null },
      actor: this.authorActor(),
    })
  }

  /** canon 审阅队列：生效版本 + 待审 / 已接受待应用 / 已拒绝。 */
  async getCanonQueue(sessionId, request = {}) {
    await this.agent(sessionId)
    const root = await this.rootOf(sessionId)
    const book = String(request.book ?? '')
    if (!book) return { available: false, message: '缺少 book。' }
    let sourceId = String(request.sourceId ?? '')
    if (!sourceId) {
      const settings = await readProjectSettings(root, book).catch(() => null)
      sourceId = settings?.activeCanonSourceId ?? ''
    }
    if (!sourceId) return { available: false, message: '这本书还没有绑定原著。' }
    let contract
    try {
      contract = await readWorldContract(root, book, sourceId)
    } catch {
      return { available: false, message: '世界契约读不出来。' }
    }
    // 版本语义由 worldContractView 统一定义，队列与 getCanon 共用。
    const view = worldContractView(contract)
    const all = view.changes
    return {
      available: true,
      book,
      sourceId,
      title: view.title,
      status: view.status,
      canonReady: isCanonReady(contract),
      revision: view.revision,
      contractRevision: view.contractRevision,
      contentHash: view.contentHash,
      reviewSummary: view.reviewSummary,
      pending: all.filter((item) => item.decision === 'pending'),
      accepted: all.filter((item) => item.decision === 'accepted' && item.appliedRevision === null),
      rejected: all.filter((item) => item.decision === 'rejected'),
      applied: all.filter((item) => item.appliedRevision !== null).map((item) => ({ changeId: item.changeId, collection: item.collection, appliedRevision: item.appliedRevision })),
    }
  }

  async reviewCanonChange(sessionId, request = {}) {
    await this.agent(sessionId)
    this.assertMaster()
    const root = await this.rootOf(sessionId)
    return executeAuthorCommand({
      root,
      operationId: this.operationId(request, 'canon-review'),
      command: 'canon.review',
      targetRef: {
        book: String(request.book ?? ''),
        sourceId: String(request.sourceId ?? ''),
        changeId: String(request.changeId ?? ''),
      },
      payload: {
        action: String(request.action ?? ''),
        note: request.note ? String(request.note) : '',
        expectedChangeHash: request.expectedChangeHash ? String(request.expectedChangeHash) : null,
        expectedRevision: request.expectedRevision ?? null,
      },
      actor: this.authorActor(),
    })
  }

  async applyCanonChanges(sessionId, request = {}) {
    await this.agent(sessionId)
    this.assertMaster()
    const root = await this.rootOf(sessionId)
    return executeAuthorCommand({
      root,
      operationId: this.operationId(request, 'canon-apply'),
      command: 'canon.apply',
      targetRef: { book: String(request.book ?? ''), sourceId: String(request.sourceId ?? '') },
      payload: {
        changeIds: Array.isArray(request.changeIds) ? request.changeIds.map(String) : [],
        expectedRevision: request.expectedRevision ?? null,
        inputHash: request.inputHash ? String(request.inputHash) : null,
      },
      actor: this.authorActor(),
    })
  }

  async listSources(sessionId) {
    await this.agent(sessionId)
    const root = await this.rootOf(sessionId)
    return await listSourcesIn(root)
  }

  async listStyleProfiles(sessionId) {
    await this.agent(sessionId)
    const root = await this.rootOf(sessionId)
    return await listStyleProfilesIn(root)
  }

  async getCanon(sessionId, request = {}) {
    const root = await this.rootOf(sessionId)
    const book = request.book ? String(request.book) : null
    const binding = await resolveBinding(root, book)
    if (book) {
      const settings = await readProjectSettings(root, book)
      if (settings.activeCanonSourceId) {
        const contract = await readWorldContract(root, book, settings.activeCanonSourceId).catch(() => null)
        if (contract) {
          const project = contractToProject(contract, { book, revision: settings.revision })
          return {
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
    }
    const project = binding.fanficProject ? await readFanfic(root, binding.fanficProject).catch(() => null) : null
    const canon = binding.fanficProject ? await readFanficCanon(root, binding.fanficProject).catch(() => null) : null
    return { ...canonView(project, canon), source: project ? 'fanfic' : null }
  }

  async getSnapshot(sessionId, request = {}) {
    const root = await this.rootOf(sessionId)
    const book = typeof request.book === 'string' && request.book ? request.book : null
    const library = typeof request.library === 'string' && request.library ? request.library : null
    const project = typeof request.project === 'string' && request.project ? request.project : null
    const gate = this.ctx.get('novelKitGate')
    return await collectSnapshot({ root, book, library, project, gate, agent: this.agent(sessionId) })
  }

  /** 统一收件箱：按书聚合待拍板 / canon / 冲突 / 阻断检查 / 失败操作。 */
  async getInbox(sessionId, request = {}) {
    await this.agent(sessionId)
    const root = await this.rootOf(sessionId)
    const requested = typeof request.book === 'string' && request.book ? request.book : null
    const binding = await resolveBinding(root, requested)
    const book = requested || binding.beatBook || null
    const beat = book ? await readBeat(root, book).catch(() => null) : null
    const active = book ? await activeSession(root, book).catch(() => null) : null
    const decisions = decisionsView(beat, active, request.chapter ?? null)
    const snapshot = await collectSnapshot({ root, book, gate: this.ctx.get('novelKitGate'), agent: this.agent(sessionId) })
    const operations = await listOperations(root, { limit: 20 }).catch(() => ({ items: [] }))
    return buildInbox({ book, decisions, snapshot, operations, limit: request.limit ?? 40 })
  }

  /**
   * 证据回查：按 sourceId + 章号读回原文切片。
   * 先找 kit 自己的 sources/，再找同人项目里的 source/（旧 fanfic 布局）。
   */
  async getSourceExcerpt(sessionId, request = {}) {
    await this.agent(sessionId)
    const root = await this.rootOf(sessionId)
    const sourceId = String(request.sourceId ?? '')
    const chapter = Number(request.chapter)
    if (!/^[a-f0-9]{64}$/u.test(sourceId)) throw new Error('sourceId 必须是完整 SHA-256')
    if (!Number.isInteger(chapter) || chapter < 1) throw new Error('chapter 必须是正整数')
    const chapterId = 'ch' + String(chapter).padStart(3, '0')
    const limit = Math.max(200, Math.min(6000, Number(request.length) || 1200))

    let text = null
    let layout = null
    try {
      text = await readSourceChapter(root, sourceId, chapterId)
      layout = 'kit'
    } catch {
      // 继续按旧布局找；原生书不再扫描 fanfic。
    }
    if (text === null) {
      const requestedBook = request.book ? String(request.book) : ''
      const settings = requestedBook ? await readProjectSettings(root, requestedBook).catch(() => null) : null
      const native = Boolean(settings?.bookId) || Boolean(requestedBook && await resolveBook(root, requestedBook).catch(() => null))
      if (!native && LEGACY_ALLOWED) {
        const fanficRoot = path.join(root, LEDGER_DIRS.fanfic)
        const projects = await readdir(fanficRoot, { withFileTypes: true }).catch(() => [])
        for (const entry of projects) {
          if (!entry.isDirectory()) continue
          try {
            text = await readFile(path.join(fanficRoot, entry.name, 'source', sourceId, 'chapters', chapterId + '.txt'), 'utf8')
            layout = 'fanfic:' + entry.name
            break
          } catch {
            // 换下一个项目
          }
        }
      }
    }
    if (text === null) {
      return {
        ok: false,
        code: 'source-not-found',
        message: '找不到这一章的原文：sourceId 或章号不对，或原文已被移走。',
        sourceId,
        chapter,
      }
    }

    const chars = Array.from(text)
    const offset = Math.max(0, Math.min(Math.max(0, chars.length - 1), Number(request.offset) || 0))
    const slice = chars.slice(offset, offset + limit).join('')
    return {
      ok: true,
      sourceId,
      chapter,
      chapterId,
      layout,
      chars: chars.length,
      offset,
      length: Array.from(slice).length,
      text: slice,
      truncated: offset + Array.from(slice).length < chars.length,
    }
  }
}

for (const name of Object.getOwnPropertyNames(NovelKitPanelRemote.prototype)) {
  if (name === 'constructor') continue
  if (!DESCRIPTORS.some((descriptor) => descriptor.method === name)) continue
  markRemote(NovelKitPanelRemote.prototype, name)
}

export default NovelKitPanelRemote
