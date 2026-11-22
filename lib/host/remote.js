/**
 * Host half of the "小说" panel.
 *
 * Reads the workspace with the read-only snapshot collector. It never executes
 * a slash command: `commands.execute()` appends `command/run` + `command/done`
 * to the session log (the 0.2.3 fanfic lesson), so panel polling would paint a
 * row into every open conversation.
 */
import { readFileSync } from 'node:fs'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { DESCRIPTORS } from './remote-contract.js'
import { collectSnapshot } from './snapshot.js'
import { collectDiagnostics } from './diagnostics.js'
import { applyTakeover, restoreBundles } from './takeover.js'
import { memoryView, styleView, canonView, searchMemory } from './views.js'
import { resolveBinding } from '../engine/binding.js'
import { readBeat, readFade, readVoice, readFanfic, readVoiceProfiles, readFanficCanon } from '../repositories/ledger.js'
import { activeSession } from '../engine/session-store.js'
import { decisionsView } from './decisions.js'
import { readDraft } from '../engine/chapter.js'
import { executeAuthorCommand } from '../engine/author.js'
import { updateMemoryCard } from '../engine/memory.js'
import { importSource as importSourceFile, listSourceFiles as listSourceFilesIn } from '../engine/import.js'
import { readProjectSettings } from '../engine/settings.js'
import { listStyleProfiles as listStyleProfilesIn } from '../engine/profiles.js'
import { contractToProject, isCanonReady, readWorldContract, contractHash } from '../engine/canon.js'
import { listSources as listSourcesIn } from '../engine/sources.js'

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
    return await collectDiagnostics({ pluginManager: this.ctx.get('pluginManager') })
  }

  async takeover(sessionId) {
    this.agent(sessionId)
    this.assertMaster()
    return await applyTakeover({ pluginManager: this.ctx.get('pluginManager') })
  }

  async restore(sessionId) {
    this.agent(sessionId)
    return await restoreBundles({ pluginManager: this.ctx.get('pluginManager') })
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

  async memoryAction(sessionId, request = {}) {
    await this.agent(sessionId)
    this.assertMaster()
    const action = String(request.action ?? '')
    if (!['pin', 'forget', 'restore'].includes(action)) throw new Error('action 只能是 pin / forget / restore')
    const root = await this.rootOf(sessionId)
    if (!request.book) throw new Error('缺少 book')
    return updateMemoryCard({ root, book: String(request.book), cardId: String(request.cardId ?? ''), action })
  }

  async getMemory(sessionId, request = {}) {
    const root = await this.rootOf(sessionId)
    const binding = await resolveBinding(root, request.book)
    const fade = binding.fadeBook ? await readFade(root, binding.fadeBook).catch(() => null) : null
    return memoryView(fade, { chapter: request.chapter ?? null, limit: request.limit, domain: request.domain ?? null, currentChapter: request.currentChapter ?? null })
  }

  async importSource(sessionId, request = {}) {
    await this.agent(sessionId)
    this.assertMaster()
    const root = await this.rootOf(sessionId)
    return importSourceFile({ root, project: String(request.project ?? ''), file: String(request.file ?? ''), title: request.title ? String(request.title) : '' })
  }

  async listSourceFiles(sessionId, request = {}) {
    await this.agent(sessionId)
    return listSourceFilesIn(String(request.dir ?? ''))
  }

  async searchMemory(sessionId, request = {}) {
    const root = await this.rootOf(sessionId)
    const binding = await resolveBinding(root, request.book)
    const fade = binding.fadeBook ? await readFade(root, binding.fadeBook).catch(() => null) : null
    return searchMemory(fade, request.query, { limit: request.limit })
  }

  async getStyle(sessionId, request = {}) {
    const root = await this.rootOf(sessionId)
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
}

for (const name of Object.getOwnPropertyNames(NovelKitPanelRemote.prototype)) {
  if (name === 'constructor') continue
  if (!DESCRIPTORS.some((descriptor) => descriptor.method === name)) continue
  markRemote(NovelKitPanelRemote.prototype, name)
}

export default NovelKitPanelRemote
