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
import { memoryView, styleView, canonView } from './views.js'
import { resolveBinding } from '../engine/binding.js'
import { readBeat, readFade, readVoice, readFanfic, readVoiceProfiles } from '../repositories/ledger.js'
import { activeSession } from '../engine/session-store.js'
import { decisionsView } from './decisions.js'
import { decideProposal } from '../engine/chapter.js'

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
    const root = await this.rootOf(sessionId)
    return decideProposal({
      root,
      sessionId: String(request.chapterSessionId ?? ''),
      proposalId: String(request.proposalId ?? ''),
      action: request.action === 'reject' ? 'reject' : 'adopt',
      option: request.option ? String(request.option) : '',
    })
  }

  async getMemory(sessionId, request = {}) {
    const root = await this.rootOf(sessionId)
    const binding = await resolveBinding(root, request.book)
    const fade = binding.fadeBook ? await readFade(root, binding.fadeBook).catch(() => null) : null
    return memoryView(fade, { chapter: request.chapter ?? null, limit: request.limit, domain: request.domain ?? null })
  }

  async getStyle(sessionId, request = {}) {
    const root = await this.rootOf(sessionId)
    const binding = await resolveBinding(root, request.book)
    const library = binding.voiceLibrary ? await readVoice(root, binding.voiceLibrary).catch(() => null) : null
    const profiles = binding.voiceLibrary ? await readVoiceProfiles(root, binding.voiceLibrary).catch(() => []) : []
    return styleView(library, profiles)
  }

  async getCanon(sessionId, request = {}) {
    const root = await this.rootOf(sessionId)
    const binding = await resolveBinding(root, request.book)
    const project = binding.fanficProject ? await readFanfic(root, binding.fanficProject).catch(() => null) : null
    return canonView(project)
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
