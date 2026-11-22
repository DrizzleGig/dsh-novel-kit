// 四段上下文的装配：beat 约束 / fanfic 世界契约 / fade 记忆 / voice 文风。
//
// 每段都有字数上限与来源（revision、是否 drift），缺哪段就 available:false——
// 原创链路不因 fanfic 缺席而失败；同人链路也不会把原著当默认。
// 0.2.0 起：mode=original 时**不装配 canon**，即使调用方误传了 fanfic 项目。
import { decisionsForChapter, segmentsForChapter } from '../codecs/beat.js'
import { cardsForChapter } from '../codecs/fade.js'
import { memory3d, memoryLine } from './memory3d.js'
import { sha256 } from '../storage/atomic-json.js'

export const BUDGETS = Object.freeze({ beat: 800, fanfic: 800, fade: 1400, voice: 600 })

function clip(text, max) {
  const value = String(text ?? '')
  return {
    text: value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`,
    truncated: value.length > max,
  }
}

const empty = (component, revision = null) => ({
  component, available: false, chars: 0, budgetChars: BUDGETS[component], revision, markdown: '', truncated: false, reason: 'not-bound',
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
  const clipped = clip(lines.join('\n'), BUDGETS.beat)
  return {
    component: 'beat', available: true, revision: beat.revision, chars: clipped.text.length,
    budgetChars: BUDGETS.beat, markdown: clipped.text, truncated: clipped.truncated,
    decisions: decisions.length, segments: segmentsForChapter(beat, chapter).length,
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
    for (const row of addresses.slice(0, 20)) {
      if (!row || typeof row !== 'object') continue
      lines.push(`- ${row.from ?? '?'}→${row.to ?? '?'}：${row.form ?? ''}（${row.fromChapter ?? '-'} 起）`)
    }
  }
  const kitCanon = project.kitCanon
  if (kitCanon?.facts?.length) {
    lines.push('### 事实')
    for (const fact of kitCanon.facts.slice(0, 12)) {
      if (!fact || typeof fact !== 'object') continue
      const entity = fact.entity ?? fact.subjectName ?? fact.subject ?? '?'
      const key = fact.key ?? fact.predicate ?? ''
      const value = fact.value ?? fact.object ?? ''
      lines.push(`- ${entity}${key ? '·' + key : ''}：${value}`)
    }
  }
  if (kitCanon?.relationships?.length) {
    lines.push('### 关系')
    for (const relation of kitCanon.relationships.slice(0, 10)) {
      if (!relation || typeof relation !== 'object') continue
      const from = relation.from ?? relation.a ?? relation.source ?? '?'
      const to = relation.to ?? relation.b ?? relation.target ?? '?'
      const kind = relation.kind ?? relation.type ?? relation.relation ?? ''
      lines.push(`- ${from} → ${to}${kind ? '：' + kind : ''}`)
    }
  }
  if (kitCanon?.timeline?.length) {
    lines.push('### 时间线')
    for (const item of kitCanon.timeline.slice(0, 8)) lines.push(`- ${typeof item === 'string' ? item : item?.text ?? item?.event ?? ''}`)
  }
  if (kitCanon?.worldRules?.length) {
    lines.push('### 世界规则')
    for (const rule of kitCanon.worldRules.slice(0, 8)) lines.push(`- ${typeof rule === 'string' ? rule : rule?.text ?? rule?.rule ?? ''}`)
  }
  if (kitCanon?.characters?.length) {
    lines.push('### 人物')
    for (const person of kitCanon.characters.slice(0, 12)) {
      if (!person || typeof person !== 'object') continue
      lines.push(`- ${person.name ?? person.id ?? '?'}${person.role ? '：' + person.role : ''}${person.aliases?.length ? '（' + person.aliases.join('/') + '）' : ''}`)
    }
  }
  if (kitCanon?.secrets?.length) {
    lines.push('### 秘密')
    for (const secret of kitCanon.secrets.slice(0, 8)) {
      if (!secret || typeof secret !== 'object') continue
      lines.push(`- ${secret.publicAtChapter ? secret.publicAtChapter + ' 起公开' : '未公开'}：${String(secret.what ?? secret.text ?? '')}`)
    }
  }
  const clipped = clip(lines.join('\n'), BUDGETS.fanfic)
  return { component: 'fanfic', available: true, revision: project.revision, chars: clipped.text.length, budgetChars: BUDGETS.fanfic, markdown: clipped.text, truncated: clipped.truncated }
}

/** 记忆简报：三维打分后的卡片行（低 fidelity 只给模糊印象，不给细节）。 */
export function fadeContext(fade, chapter, span = 3) {
  if (!fade) return empty('fade')
  const scored = memory3d(fade, chapter, { span: 40 })
  const cards = scored.cards.slice(0, 18)
  const lines = ['### 前情（三维记忆：近章清楚、旧事模糊）']
  for (const card of cards) lines.push('- ' + memoryLine(card))
  const clipped = clip(lines.join('\n'), BUDGETS.fade)
  return {
    component: 'fade', available: true, revision: fade.revision, drift: fade.drift, chars: clipped.text.length,
    budgetChars: BUDGETS.fade, markdown: clipped.text, truncated: clipped.truncated, cards: cards.length,
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
  const clipped = clip(lines.join('\n'), BUDGETS.voice)
  return {
    component: 'voice', available: true, revision: null, chars: clipped.text.length, budgetChars: BUDGETS.voice, markdown: clipped.text, truncated: clipped.truncated,
    profileId: profile?.id ?? null, provisional: profile ? profile.provisional === true : null,
  }
}

/**
 * kit 自有文风档案（导入作品生成）优先于 voice 插件档案。
 * 多个档案拼成一份简报；仍然受 600 字硬预算约束。
 */
export function styleContext(briefs = []) {
  const list = (Array.isArray(briefs) ? briefs : []).filter((brief) => brief && brief.available && brief.markdown)
  if (list.length === 0) return null
  const text = list.map((brief) => brief.markdown).join('\n\n')
  const clipped = clip(text, BUDGETS.voice)
  return {
    component: 'voice', available: true, revision: null, chars: clipped.text.length,
    budgetChars: BUDGETS.voice, markdown: clipped.text, truncated: clipped.truncated,
    profileIds: list.map((brief) => brief.profileId).filter(Boolean),
    source: 'kit-style',
  }
}

/**
 * 装配四段；参数缺省时对应段 available:false。
 * mode=original 时 canon 段强制空，避免调用方误传项目把世界事实带进原创。
 * styleBriefs 存在时，「文风」段用 kit 导入档案，否则退回 voice 插件档案。
 * @returns {{segments: object[], fingerprint: string, chars: number, budgets: object, mode: string}}
 */
export function assembleContext({ beat, fade, voice = null, voiceProfiles = [], styleBriefs = [], fanfic = null, chapter, mode = 'original' }) {
  const resolvedMode = mode === 'fanfic' ? 'fanfic' : 'original'
  const styleSegment = styleContext(styleBriefs)
  const segments = [
    beatContext(beat, chapter),
    fanficContext(resolvedMode === 'fanfic' ? fanfic : null),
    fadeContext(fade, chapter),
    styleSegment ?? voiceContext(voice, voiceProfiles),
  ]
  // 指纹要能发现「同 revision、同长度、内容变了」的改动，所以对内容做哈希。
  const fingerprint = sha256(segments.map((segment) => segment.component + ':' + segment.markdown).join('\u0000'))
  return {
    segments,
    chars: segments.reduce((sum, segment) => sum + segment.chars, 0),
    budgets: BUDGETS,
    fingerprint,
    mode: resolvedMode,
    styleProfileIds: styleSegment?.profileIds ?? [],
  }
}
