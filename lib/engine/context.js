// 四段上下文的装配（S1 先接 beat + fade；voice/fanfic 在 S2 接入）。
//
// 不是把整本账塞给模型：每段都有字数上限与来源标注，面板与工具共用。
import { decisionsForChapter, segmentsForChapter } from '../codecs/beat.js'
import { cardsForChapter } from '../codecs/fade.js'

export const BUDGETS = Object.freeze({ beat: 800, fade: 1400, voice: 600, fanfic: 800 })

function clip(text, max) {
  const value = String(text ?? '')
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`
}

/** 第一段：剧情约束（本章已拍板决策 + canon + 未回收义务）。 */
export function beatContext(beat, chapter) {
  if (!beat) return { component: 'beat', available: false, chars: 0, budgetChars: BUDGETS.beat, revision: null, markdown: '' }
  const decisions = decisionsForChapter(beat, chapter)
  const canon = beat.canon.slice(-20)
  const lines = []
  if (decisions.length) {
    lines.push('### 本章已拍板')
    for (const decision of decisions) lines.push(`- ${decision.title ?? decision.id}：${decision.change ?? ''}`.trim())
  }
  if (canon.length) {
    lines.push('### 本书 canon（最近 20 条）')
    for (const item of canon) lines.push(`- ${item.entity ?? '?'}·${item.key ?? '?'}：${item.value ?? ''}`)
  }
  const markdown = clip(lines.join('\n'), BUDGETS.beat * 2)
  return {
    component: 'beat',
    available: true,
    revision: beat.revision,
    chars: markdown.length,
    budgetChars: BUDGETS.beat,
    markdown,
    decisions: decisions.length,
    segments: segmentsForChapter(beat, chapter).length,
  }
}

/** 第三段：记忆简报（近章卡片 gist；S1 的确定性版本，S2 换 fade 的三维打分）。 */
export function fadeContext(fade, chapter, span = 3) {
  if (!fade) return { component: 'fade', available: false, chars: 0, budgetChars: BUDGETS.fade, revision: null, markdown: '' }
  const from = Math.max(1, Number(chapter) - span)
  const cards = fade.cards
    .filter((card) => Number(card.chapter) >= from && Number(card.chapter) < Number(chapter))
    .sort((a, b) => (Number(b.salience) || 0) - (Number(a.salience) || 0))
    .slice(0, 24)
  const lines = ['### 前情（近章卡片，按重要度）']
  for (const card of cards) lines.push(`- [ch${card.chapter}] ${card.gist ?? card.topic ?? ''}`)
  const markdown = clip(lines.join('\n'), BUDGETS.fade * 2)
  return {
    component: 'fade',
    available: true,
    revision: fade.revision,
    drift: fade.drift,
    chars: markdown.length,
    budgetChars: BUDGETS.fade,
    markdown,
    cards: cards.length,
  }
}

export function emptyContext(component) {
  return { component, available: false, chars: 0, budgetChars: BUDGETS[component] ?? 600, revision: null, markdown: '' }
}

/**
 * 装配四段；voice/fanfic 缺席时给 available:false（不阻塞原创链路）。
 * @returns {{segments: object[], fingerprint: string, chars: number, budgets: object}}
 */
export function assembleContext({ beat, fade, voice = null, fanfic = null, chapter }) {
  const segments = [
    beatContext(beat, chapter),
    fanfic ? emptyContext('fanfic') : emptyContext('fanfic'),
    fadeContext(fade, chapter),
    voice ? emptyContext('voice') : emptyContext('voice'),
  ]
  const fingerprint = JSON.stringify(segments.map((segment) => [segment.component, segment.revision, segment.chars]))
  return {
    segments,
    chars: segments.reduce((sum, segment) => sum + segment.chars, 0),
    budgets: BUDGETS,
    fingerprint,
  }
}
