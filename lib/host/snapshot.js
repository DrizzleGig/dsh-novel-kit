// 面板/诊断用的只读快照：一次取齐「书、章、会话、四段摘要、五本账 revision、开关」。
// 只读：不建目录、不写文件、不执行任何命令；缺哪本给 null 并记一条 issue。
import { readFile } from 'node:fs/promises'
import { discoverWorkspace } from '../workspace.js'
import { readBeat, readFade, readVoice, readFanfic } from '../repositories/ledger.js'
import { activeSession } from '../engine/session-store.js'

function summarizeContext(context) {
  if (!context?.segments) return []
  return context.segments.map((segment) => ({
    component: segment.component,
    available: segment.available === true,
    chars: segment.chars ?? 0,
    budgetChars: segment.budgetChars ?? null,
    revision: segment.revision ?? null,
    drift: segment.drift === true,
  }))
}

/**
 * @param {{root:string, book?:string, library?:string, project?:string, gate?:{isOn:Function}, agent?:object}} input
 */
export async function collectSnapshot({ root, book = null, library = null, project = null, gate = null, agent = null } = {}) {
  if (typeof root !== 'string' || !root) throw new Error('snapshot: root 必填')
  const issues = []
  const found = await discoverWorkspace(root)

  const read = async (label, fn, ...args) => {
    try {
      return await fn(...args)
    } catch (error) {
      issues.push({ component: label, code: 'unreadable', message: String(error?.message ?? error) })
      return null
    }
  }

  const beat = book ? await read('beat', readBeat, root, book) : null
  const fade = book ? await read('fade', readFade, root, book) : null
  const voice = library ? await read('voice', readVoice, root, library) : null
  const fanfic = project ? await read('fanfic', readFanfic, root, project) : null

  let session = null
  if (book) {
    try {
      session = await activeSession(root, book)
    } catch (error) {
      issues.push({ component: 'session', code: 'unreadable', message: String(error?.message ?? error) })
    }
  }

  // 工作台预览：草稿正文最多带 4000 字（只读，不写）。
  let draftText = null
  if (session?.draft?.path) {
    try {
      const text = await readFile(session.draft.path, 'utf8')
      draftText = text.length > 4000 ? `${text.slice(0, 4000)}…` : text
    } catch {
      issues.push({ component: 'draft', code: 'unreadable', message: '草稿文件读不到' })
    }
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    root,
    book,
    workspace: {
      beat: found.beat,
      fade: found.fade,
      voice: found.voice,
      fanfic: found.fanfic,
      conductor: found.conductor,
    },
    driving: gate && agent ? gate.isOn(agent) === true : null,
    session: session
      ? {
        id: session.id,
        chapter: session.chapter,
        state: session.state,
        revision: session.revision ?? 0,
        draft: session.draft ? { version: session.draft.version, chars: session.draft.chars ?? (draftText ? draftText.length : null), hash: session.draft.hash.slice(0, 12), text: draftText } : null,
        pendingDecisionIds: session.pendingDecisionIds ?? [],
        transactionId: session.transactionId ?? null,
      }
      : null,
    contexts: summarizeContext(session?.context ?? null),
    ledgers: {
      beat: beat ? { revision: beat.revision, chapters: beat.chapters.length, decisions: beat.decisions.length, canon: beat.canon.length, segments: beat.segments.length } : null,
      fade: fade ? { revision: fade.revision, drift: fade.drift, cards: fade.cards.length, entities: fade.entities.length, threads: fade.threads.length } : null,
      voice: voice ? { works: voice.works.length, chapters: voice.works.reduce((sum, work) => sum + work.chapters, 0) } : null,
      fanfic: fanfic ? { revision: fanfic.revision, sourceId: fanfic.sourceId, currentChapter: fanfic.currentChapter } : null,
    },
    issues,
  }
}
