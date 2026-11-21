// 确定性文本指标：与 voice 档案的 bands 对齐（句长均值/CV、段长、对话占比、抽象词密度）。
const SENTENCE_END = /[。！？!?…]+/u
const QUOTED = /[「『“"][^」』”"]*[」』”"]/gu
const ABSTRACT_WORDS = ['似乎', '仿佛', '某种', '一种', '大概', '也许', '好像', '隐约', '某种程度']
const EXPLAIN_WORDS = ['因为', '所以', '因此', '意味', '说明', '表示', '也就是', '换句话说']

export function sentencesOf(text) {
  return String(text ?? '').split(SENTENCE_END).map((part) => part.trim()).filter(Boolean)
}

export function paragraphsOf(text) {
  return String(text ?? '').split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean)
}

const ratio = (count, total) => (total > 0 ? Math.round((count / total) * 10000) / 10000 : 0)

export function textMetrics(text) {
  const body = String(text ?? '')
  const chars = [...body].length
  const sentences = sentencesOf(body)
  const lengths = sentences.map((sentence) => [...sentence].length)
  const mean = lengths.length ? lengths.reduce((sum, item) => sum + item, 0) / lengths.length : 0
  const variance = lengths.length ? lengths.reduce((sum, item) => sum + (item - mean) ** 2, 0) / lengths.length : 0
  const sd = Math.sqrt(variance)
  const paragraphs = paragraphsOf(body)
  const paragraphMean = paragraphs.length
    ? paragraphs.reduce((sum, item) => sum + [...item].length, 0) / paragraphs.length
    : 0
  const quoted = [...body.matchAll(QUOTED)].reduce((sum, match) => sum + [...match[0]].length, 0)
  const countWords = (words) => words.reduce((sum, word) => sum + (body.split(word).length - 1), 0)
  return {
    chars,
    sentences: sentences.length,
    paragraphs: paragraphs.length,
    sentenceMean: Math.round(mean * 100) / 100,
    sentenceCv: mean > 0 ? Math.round((sd / mean) * 100) / 100 : 0,
    paragraphMean: Math.round(paragraphMean * 100) / 100,
    dialogueRatio: ratio(quoted, chars),
    abstractPer1k: chars ? Math.round((countWords(ABSTRACT_WORDS) / chars) * 1000 * 100) / 100 : 0,
    explanationPer1k: chars ? Math.round((countWords(EXPLAIN_WORDS) / chars) * 1000 * 100) / 100 : 0,
  }
}
