// 章节检查（S1 确定性版）：禁忌词、长句、称呼矩阵。
//
// 这不是 voice_check / fic_check 的完整替代——那两套含模型判定与豁免表。
// 这里只做「不依赖模型就能确定的对错」，作为 finish 前的 verify 闸门；
// findings 结构化，blocker 会阻止落账，warning/info 只提示。
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
      findings.push({ code: 'forbidden', severity: 'blocker', message: `出现禁忌：${needle}`, quote: needle, at })
    }
  }

  for (const sentence of sentences) {
    if (sentence.length > maxSentence) {
      findings.push({
        code: 'long-sentence', severity: 'warning',
        message: `句子 ${sentence.length} 字，超过 ${maxSentence}`, quote: sentence.slice(0, 40), at: body.indexOf(sentence),
      })
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
        findings.push({
          code: 'address', severity: 'warning',
          message: `${row.from}→${to} 附近没有按矩阵称呼（${forms.join('/')}）`, quote: window.trim(), at,
        })
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
  }
}
