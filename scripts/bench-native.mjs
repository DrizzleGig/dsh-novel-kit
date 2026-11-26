// 0.8 合成规模基准：1000 章决策 / 10000 记忆卡 / 1000 媒体证据，测只读路径 p95。
// 只读内存数据；不启动 DSH、不写工作区。
import { performance } from 'node:perf_hooks'
import { analyzeBook } from '../lib/native/analysis.js'
import { retentionCurve } from '../lib/native/consolidation.js'
import { buildStoryBible } from '../lib/native/bible.js'

const RUNS = 40
function p95(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
}

function makeData() {
  const cards = Array.from({ length: 10000 }, (_, index) => ({
    id: `c${index}`,
    chapter: 1 + (index % 1000),
    gist: '记忆卡 ' + index,
    salience: 1 + (index % 5),
    pinned: index % 97 === 0,
    lifecycle: { status: 'active' },
  }))
  const decisions = {
    format: 'kit.decisions', schemaVersion: 1, bookId: 'bk-11111111-1111-4111-8111-111111111111', book: '基准书', revision: 1,
    requests: Array.from({ length: 1000 }, (_, index) => ({ id: `r${index}`, status: index % 2 ? 'answered' : 'open', answeredAt: index % 2 ? 'x' : null })),
    answers: Array.from({ length: 500 }, (_, index) => ({ id: `a${index}`, requestId: `r${index * 2 + 1}` })),
    decisions: Array.from({ length: 1000 }, (_, index) => ({ id: `d${index}`, chapter: index + 1, status: 'committed', requestId: `r${index}`, answerId: index % 2 ? `a${Math.floor(index / 2)}` : null })),
    canon: [], obligations: [], segments: [], revisions: [], audit: [], integrity: {},
  }
  const media = {
    format: 'kit.media', schemaVersion: 1, bookId: 'bk-11111111-1111-4111-8111-111111111111', book: '基准书', revision: 1,
    sources: Array.from({ length: 100 }, (_, index) => ({ id: `s${index}`, claimType: index % 2 ? 'fact' : 'rumor', visibility: 'public' })),
    evidence: Array.from({ length: 1000 }, (_, index) => ({ id: `e${index}`, sourceId: `s${index % 100}`, status: 'confirmed', claimType: index % 2 ? 'fact' : 'rumor', quote: '引文 ' + index })),
  }
  const memory = { revision: 1, cards, archive: { stubs: [] } }
  return { cards, decisions, media, memory }
}

const data = makeData()
const times = { curve: [], analysis: [], bible: [] }
for (let i = 0; i < RUNS; i += 1) {
  const t0 = performance.now()
  retentionCurve(data.cards, 300, { span: 40 })
  times.curve.push(performance.now() - t0)
  const t1 = performance.now()
  analyzeBook({ bookId: 'bk-1', decisions: data.decisions, memory: data.memory, media: data.media, personas: { personas: [] }, runs: [] })
  times.analysis.push(performance.now() - t1)
  const t2 = performance.now()
  buildStoryBible({ book: '基准书', decisions: data.decisions, memory: data.memory, media: data.media, personas: { personas: [] }, runs: [] })
  times.bible.push(performance.now() - t2)
}

const result = {
  ok: true,
  cards: data.cards.length,
  decisions: data.decisions.decisions.length,
  mediaEvidence: data.media.evidence.length,
  ms: {
    curveP95: Math.round(p95(times.curve) * 10) / 10,
    analysisP95: Math.round(p95(times.analysis) * 10) / 10,
    bibleP95: Math.round(p95(times.bible) * 10) / 10,
  },
}
if (result.ms.analysisP95 > 2000 || result.ms.bibleP95 > 3000) {
  result.ok = false
  result.reason = '只读分析超过 2s/3s 门限'
}
console.log(JSON.stringify(result, null, 2))
if (!result.ok) process.exitCode = 1
