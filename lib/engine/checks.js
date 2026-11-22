// 章节检查（S1 确定性版）：禁忌词、长句、称呼矩阵。
//
// 这不是 voice_check / fic_check 的完整替代——那两套含模型判定与豁免表。
// 这里只做「不依赖模型就能确定的对错」，作为 finish 前的 verify 闸门；
// findings 结构化，blocker 会阻止落账，warning/info 只提示。
import { textMetrics } from './metrics.js'

const SENTENCE_END = /[。！？!?…]+/u

export function splitSentences(text) {
  return String(text ?? '')
    .split(SENTENCE_END)
    .map((part) => part.trim())
    .filter(Boolean)
}

function findOccurrences(text, needle) {
  const out = []
  if (!needle) return out
  let at = text.indexOf(needle)
  while (at >= 0 && out.length < 50) {
    out.push(at)
    at = text.indexOf(needle, at + needle.length)
  }
  return out
}

/** 去掉空白但保留「去空白后每个字符在原文里的下标」，用于把复制检查定位回正文。 */
function stripWithMap(text) {
  const value = String(text ?? '')
  let body = ''
  const map = []
  for (let index = 0; index < value.length; index += 1) {
    const ch = value[index]
    if (/\s/u.test(ch)) continue
    body += ch
    map.push(index)
  }
  return { body, map }
}

/** findings 统一带定位：at 是原文 UTF-16 下标，length 是覆盖长度；at=null 表示「全文级」。 */
function located(finding, at, length) {
  return { ...finding, coordinate: 'utf16', at: at === null || at === undefined || at < 0 ? null : at, length: at === null || at === undefined || at < 0 ? null : length }
}

/**
 * @param {{text:string, addresses?:Array<{from:string,to:string,form?:string,fromChapter?:string}>, forbidden?:string[], maxSentence?:number}} input
 */
export function checkDraft({ text = '', addresses = [], forbidden = [], maxSentence = 80 } = {}) {
  const body = String(text ?? '')
  const findings = []
  const sentences = splitSentences(body)

  for (const phrase of forbidden) {
    const needle = String(phrase ?? '').trim()
    if (!needle) continue
    for (const at of findOccurrences(body, needle)) {
      findings.push(located({ code: 'forbidden', severity: 'blocker', message: `出现禁忌：${needle}`, quote: needle }, at, needle.length))
    }
  }

  for (const sentence of sentences) {
    if (sentence.length > maxSentence) {
      const at = body.indexOf(sentence)
      findings.push(located({
        code: 'long-sentence', severity: 'warning',
        message: `句子 ${sentence.length} 字，超过 ${maxSentence}`, quote: sentence.slice(0, 40),
      }, at, sentence.length))
    }
  }

  for (const row of addresses) {
    const to = String(row?.to ?? '')
    if (!to) continue
    const forms = [row.form, row.public, row.private].filter(Boolean).map(String)
    if (forms.length === 0) continue
    for (const at of findOccurrences(body, to)) {
      const window = body.slice(Math.max(0, at - 12), at + to.length + 12)
      if (!forms.some((form) => window.includes(form))) {
        findings.push(located({
          code: 'address', severity: 'warning',
          message: `${row.from}→${to} 附近没有按矩阵称呼（${forms.join('/')}）`, quote: window.trim(),
        }, at, to.length))
        break
      }
    }
  }

  const blockers = findings.filter((item) => item.severity === 'blocker').length
  const warnings = findings.filter((item) => item.severity === 'warning').length
  const chars = body.length
  const avgSentence = sentences.length ? Math.round((sentences.reduce((sum, item) => sum + item.length, 0) / sentences.length) * 10) / 10 : 0
  return {
    ok: blockers === 0,
    blockers,
    warnings,
    findings,
    stats: { chars, sentences: sentences.length, avgSentence },
    metrics: textMetrics(body),
  }
}

const BAND_LABELS = {
  sentenceMean: '句长均值',
  sentenceCv: '句长波动',
  paragraphMean: '段长均值',
  dialogueRatio: '对话占比',
  abstractPer1k: '抽象词/千字',
  explanationPer1k: '解释词/千字',
}

/**
 * 文风档案检查：把正文的确定性指标与 voice 档案 bands 对齐。
 * 越界只算 warning（文风是取向不是对错）；identity.avoid 里的词也是 warning。
 * @param {{text:string, profile:object}} input
 */
export function checkBands({ text = '', profile } = {}) {
  const findings = []
  const metrics = textMetrics(text)
  const bands = profile?.bands ?? {}
  for (const [key, label] of Object.entries(BAND_LABELS)) {
    const spec = bands[key]
    if (!spec || !Array.isArray(spec.band)) continue
    const [lo, hi] = spec.band
    const value = metrics[key]
    if (typeof value !== 'number') continue
    if (value < lo || value > hi) {
      findings.push(located({
        code: 'voice-band', severity: 'warning',
        message: `${label} ${value} 超出档案区间 [${lo}, ${hi}]`, metric: key, value, band: spec.band,
      }, null, null))
    }
  }
  for (const word of profile?.identity?.avoid ?? []) {
    const needle = String(word ?? '').trim()
    if (!needle) continue
    for (const at of findOccurrences(String(text), needle)) {
      findings.push(located({ code: 'voice-avoid', severity: 'warning', message: `文风档案要求避免「${needle}」`, quote: needle }, at, needle.length))
    }
  }
  return {
    ok: true,
    findings,
    metrics,
    warnings: findings.length,
    blockers: 0,
  }
}

/**
 * 原文复制检查：正文里出现与原著证据引文连续 minLen 字相同 → blocker。
 * 以 canon 的 evidence 引文为源（facts/characters/secrets），按去空白后的窗口比对。
 */
export function checkCopy({ text = '', evidence = [], minLen = 20 } = {}) {
  const { body, map } = stripWithMap(text)
  const findings = []
  for (const item of evidence) {
    const quote = String(item?.quote ?? '').replace(/\s+/gu, '')
    if (quote.length < minLen) continue
    let hit = false
    for (let offset = 0; offset + minLen <= quote.length; offset += Math.max(1, Math.floor(minLen / 2))) {
      const window = quote.slice(offset, offset + minLen)
      const strippedAt = body.indexOf(window)
      if (strippedAt >= 0) {
        // 映射回原文下标：去空白会把中间的换行/空格跳过，直接用去空白后的下标是错的。
        const start = map[strippedAt] ?? 0
        const last = map[strippedAt + window.length - 1] ?? start
        findings.push(located({ code: 'copy', severity: 'blocker', message: `连续 ${minLen} 字与原著相同`, quote: window }, start, last - start + 1))
        hit = true
        break
      }
    }
    if (hit) break
  }
  return { ok: findings.length === 0, findings, blockers: findings.length }
}

function editDistance(a, b) {
  const m = a.length
  const n = b.length
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i += 1) {
    const row = [i]
    for (let j = 1; j <= n; j += 1) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = row
  }
  return prev[n]
}

/**
 * 疑似写错名字：正文里与 canon 人物名只差一个字的片段 → warning。
 * 只对 2–3 字的中文片段做检查；最多报 max 条，避免噪声。
 * @param {{text:string, names:string[], max?:number}} input
 */
export function checkNames({ text = '', names = [], max = 5 } = {}) {
  const canon = [...new Set((names ?? []).filter(Boolean).map(String))]
  const exact = new Set(canon)
  const findings = []
  const seen = new Set()
  const runs = String(text ?? '').match(/[\u4e00-\u9fa5]{2,6}/gu) ?? []
  for (const run of runs) {
    for (let len = 2; len <= 3; len += 1) {
      for (let start = 0; start + len <= run.length; start += 1) {
        const chunk = run.slice(start, start + len)
        if (exact.has(chunk)) continue
        for (const name of canon) {
          if (name.length !== len) continue
          if (editDistance(chunk, name) !== 1) continue
          const key = chunk + '>' + name
          if (seen.has(key)) continue
          seen.add(key)
          findings.push(located({ code: 'name-near', severity: 'warning', message: '「' + chunk + '」疑似「' + name + '」', quote: chunk }, String(text ?? '').indexOf(chunk), chunk.length))
          break
        }
        if (findings.length >= max) return { ok: true, findings, warnings: findings.length }
      }
    }
  }
  return { ok: true, findings, warnings: findings.length }
}
