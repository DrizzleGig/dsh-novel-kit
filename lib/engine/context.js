// 四段上下文的装配：beat 约束 / fanfic 世界契约 / fade 记忆 / voice 文风。
//
// 每段都有字数上限与来源（revision、是否 drift），缺哪段就 available:false——
// 原创链路不因 fanfic 缺席而失败，同人链路也不会把原著当默认。
import { decisionsForChapter, segmentsForChapter } from '../codecs/beat.js'
import { cardsForChapter } from '../codecs/fade.js'

export const BUDGETS = Object.freeze({ beat: 800, fanfic: 800, fade: 1400, voice: 600 })

function clip(text, max) {
  const value = String(text ?? '')
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`
}

const empty = (component, revision = null) => ({
  component, available: false, chars: 0, budgetChars: BUDGETS[component], revision, markdown: '', reason: 'not-bound',
})

/** 剧情约束：本章已拍板决策 + canon + 未回收义务。 */
export function beatContext(beat, chapter) {
  if (!beat) return empty('beat')
  const decisions = decisionsForChapter(beat, chapter)
  const canon = beat.canon.slice(-20)
  const open = beat.obligations.filter((item) => item?.status === 'open')
  const lines = []
  if (decisions.length) {
    lines.push('### 本章已拍板')
    for (const decision of decisions) lines.push(`- ${decision.title ?? decision.id}：${decision.change ?? ''}`.trim())
  }
  if (open.length) {
    lines.push('### 未回收义务')
    for (const item of open.slice(0, 10)) lines.push(`- ${item.text ?? item.id ?? ''}`)
  }
  if (canon.length) {
    lines.push('### 本书 canon（最近 20 条）')
    for (const item of canon) lines.push(`- ${item.entity ?? '?'}·${item.key ?? '?'}：${item.value ?? ''}`)
  }
  const markdown = clip(lines.join('\n'), BUDGETS.beat * 2)
  return {
    component: 'beat', available: true, revision: beat.revision, chars: markdown.length,
    budgetChars: BUDGETS.beat, markdown, decisions: decisions.length, segments: segmentsForChapter(beat, chapter).length,
  }
}

/** 世界契约（同人）：称呼矩阵 + 禁忌 + 当前章；S2 接完整九段契约。 */
export function fanficContext(project) {
  if (!project) return empty('fanfic')
  const exports = project.exports
  const lines = [`### 本作 / 原著（${project.title ?? project.id}）`]
  if (project.sourceId) lines.push(`- 原著来源：${project.sourceId}；当前章：${project.currentChapter ?? '-'}`)
  const forbidden = exports?.forbidden ?? []
  if (forbidden.length) lines.push(`### 禁忌\n- ${forbidden.slice(0, 10).map((item) => item?.text ?? item).join('\n- ')}`)
  const addresses = exports?.addresses ?? []
  if (addresses.length) {
    lines.push('### 称呼')
    for (const row of addresses.slice(0, 20)) lines.push(`- ${row.from}→${row.to}：${row.form}（${row.fromChapter} 起）`)
  }
  const markdown = clip(lines.join('\n'), BUDGETS.fanfic * 2)
  return { component: 'fanfic', available: true, revision: project.revision, chars: markdown.length, budgetChars: BUDGETS.fanfic, markdown }
}

/** 记忆简报：近章卡片 gist（S2 换 fade 的三维打分与 recall）。 */
export function fadeContext(fade, chapter, span = 3) {
  if (!fade) return empty('fade')
  const from = Math.max(1, Number(chapter) - span)
  const cards = fade.cards
    .filter((card) => Number(card.chapter) >= from && Number(card.chapter) < Number(chapter))
    .sort((a, b) => (Number(b.salience) || 0) - (Number(a.salience) || 0))
    .slice(0, 24)
  const lines = ['### 前情（近章卡片，按重要度）']
  for (const card of cards) lines.push(`- [ch${card.chapter}] ${card.gist ?? card.topic ?? ''}`)
  const markdown = clip(lines.join('\n'), BUDGETS.fade * 2)
  return {
    component: 'fade', available: true, revision: fade.revision, drift: fade.drift, chars: markdown.length,
    budgetChars: BUDGETS.fade, markdown, cards: cards.length,
  }
}

/** 表达简报：优先用 voice 档案（bands + rules + avoid）；没有档案时退回书库摘要。 */
export function voiceContext(library, profiles = []) {
  if (!library && (!profiles || profiles.length === 0)) return empty('voice')
  const profile = profiles.find((item) => item.status === 'confirmed') ?? profiles[0] ?? null
  const lines = []
  if (profile) {
    lines.push('### 文风档案（' + (profile.name || profile.id) + ' v' + (profile.version ?? '?') + '，' + profile.status + '）')
    if (profile.identity?.summary) lines.push(profile.identity.summary)
    const bands = []
    for (const [key, label] of [['sentenceMean', '句长'], ['sentenceCv', '句长波动'], ['paragraphMean', '段长'], ['dialogueRatio', '对话占比'], ['abstractPer1k', '抽象词/千字']]) {
      const spec = profile.bands?.[key]
      if (spec && Array.isArray(spec.band)) bands.push(label + ' ' + spec.band[0] + '–' + spec.band[1])
    }
    if (bands.length) lines.push(bands.join('；'))
    if (profile.rules?.length) lines.push('规则：' + profile.rules.slice(0, 6).map((rule) => rule.text).join('；'))
    if (profile.identity?.avoid?.length) lines.push('避免：' + profile.identity.avoid.join('、'))
  } else {
    const works = library?.works ?? []
    lines.push('### 文风档案')
    for (const work of works.slice(0, 5)) lines.push('- ' + (work.title ?? work.workId) + '：' + work.chapters + ' 章 / ' + work.chars + ' 字')
    lines.push('（还没有 confirmed 档案，只列书库）')
  }
  const markdown = clip(lines.join('\n'), BUDGETS.voice * 2)
  return {
    component: 'voice', available: true, revision: null, chars: markdown.length, budgetChars: BUDGETS.voice, markdown,
    profileId: profile?.id ?? null, provisional: profile ? profile.provisional === true : null,
  }
}

/**
 * 装配四段；参数缺省时对应段 available:false。
 * @returns {{segments: object[], fingerprint: string, chars: number, budgets: object}}
 */
export function assembleContext({ beat, fade, voice = null, voiceProfiles = [], fanfic = null, chapter }) {
  const segments = [
    beatContext(beat, chapter),
    fanficContext(fanfic),
    fadeContext(fade, chapter),
    voiceContext(voice, voiceProfiles),
  ]
  const fingerprint = JSON.stringify(segments.map((segment) => [segment.component, segment.revision, segment.chars]))
  return {
    segments,
    chars: segments.reduce((sum, segment) => sum + segment.chars, 0),
    budgets: BUDGETS,
    fingerprint,
  }
}
