// 0.8 故事圣经导出：把 kit 原生决策/记忆/人物/媒体/runbook 汇成一份 Markdown。
// 只读；未确认人物/媒体不进入正文，缺数据如实标 0。
import { mediaBrief } from './media.js'

function line(value, fallback = '') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text || fallback
}

export function buildStoryBible({ book = '', decisions = null, memory = null, media = null, personas = null, runs = [] } = {}) {
  const title = line(book, '未命名作品')
  const out = [`# ${title} · 故事圣经`, '', `> 由 kit 原生数据只读导出。未确认的人物卡/媒体证据不进入正文。`, '']
  const committed = (decisions?.decisions ?? []).filter((item) => item?.status === 'committed')
  out.push('## 决策线', '')
  if (committed.length === 0) out.push('（暂无已拍板决策）')
  else {
    for (const item of committed.slice(-40)) {
      out.push(`- 第 ${Number(item.chapter) || 0} 章 · ${line(item.title, item.id)} → ${line(item.option, line(item.change, '（未记录选项）'))}`)
    }
  }
  out.push('', '## 未答请求', '')
  const open = (decisions?.requests ?? []).filter((item) => item?.status !== 'answered')
  if (open.length === 0) out.push('（无）')
  else for (const item of open.slice(0, 20)) out.push(`- ${line(item.question, item.id)}（${line(item.status, 'open')}）`)

  out.push('', '## 记忆卡', '')
  const cards = (memory?.cards ?? []).slice(-60)
  if (cards.length === 0) out.push('（暂无记忆卡）')
  else for (const card of cards) out.push(`- 第 ${Number(card.chapter) || 0} 章 · ${line(card.gist, card.topic ?? '（无摘要）')}`)

  out.push('', '## 已确认人物', '')
  const confirmed = (personas?.personas ?? []).filter((item) => item?.status === 'confirmed')
  if (confirmed.length === 0) out.push('（暂无已确认人物卡）')
  else for (const persona of confirmed) {
    out.push(`### ${line(persona.name, persona.id)}`, '')
    for (const [key, label] of [['narrative', '叙述'], ['inner', '内心'], ['action', '行动'], ['choice', '选择'], ['dialogue', '对白']]) {
      if (persona.fields?.[key]) out.push(`- ${label}：${line(persona.fields[key])}`)
    }
    out.push('')
  }

  out.push('## 媒体证据', '')
  const brief = media ? mediaBrief(media) : { count: 0, facts: [], rumors: [], fiction: [], unclassified: [] }
  out.push(`- 已确认 ${brief.count} 条；事实 ${brief.facts.length}、传闻 ${brief.rumors.length}、虚构 ${brief.fiction.length}、未分类 ${brief.unclassified.length}`)
  for (const item of brief.facts.slice(0, 20)) out.push(`- [事实] ${line(item.quote, item.id)}`)
  for (const item of brief.rumors.slice(0, 20)) out.push(`- [传闻] ${line(item.quote, item.id)}`)
  for (const item of brief.fiction.slice(0, 20)) out.push(`- [虚构] ${line(item.quote, item.id)}`)

  out.push('', '## 运行记录', '')
  if (!Array.isArray(runs) || runs.length === 0) out.push('（暂无 run）')
  else for (const run of runs.slice(0, 12)) out.push(`- ${line(run.title, run.runId)} · ${line(run.status)} · ${run.steps?.length ?? 0} 步`)

  return { title, markdown: out.join('\n') + '\n', chars: out.join('\n').length }
}
