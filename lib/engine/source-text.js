// 作品原文的共用摄入工具：分章、UTF-8 解码、内容哈希。
// style 与 canon 两条导入口共用，但各自产出不同的分析物。
import { createHash } from 'node:crypto'
import path from 'node:path'

const HEADING = /^[ \t　]*(?:(序章|序|楔子|尾声|后记|番外[^\n]{0,20})|(第[零一二三四五六七八九十百千万两0-9]+[章节回卷][^\n]{0,40}))[ \t　]*$/gmu

export function sha256Hex(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex')
}

/**
 * 把全文按标题切成章节；找不到标题时整篇当一章（ch001）。
 * @returns {Array<{id:string, ordinal:number, title:string, heading:string, chars:number, start:number, end:number, body:string}>}
 */
export function splitChapters(text) {
  const body = String(text ?? '')
  const marks = []
  HEADING.lastIndex = 0
  let match = HEADING.exec(body)
  while (match) {
    marks.push({ index: match.index, heading: match[0].trim() })
    match = HEADING.exec(body)
  }
  if (marks.length === 0) {
    return [{ id: 'ch001', ordinal: 1, title: '正文', heading: '', chars: [...body].length, start: 0, end: body.length, body }]
  }
  const chapters = []
  if (marks[0].index > 0 && body.slice(0, marks[0].index).trim()) {
    chapters.push({ id: 'ch000', ordinal: 0, title: '序', heading: '', chars: [...body.slice(0, marks[0].index)].length, start: 0, end: marks[0].index, body: body.slice(0, marks[0].index) })
  }
  for (const [index, mark] of marks.entries()) {
    const next = index + 1 < marks.length ? marks[index + 1].index : body.length
    const start = mark.index
    const chunk = body.slice(start, next)
    const title = mark.heading.replace(/^第[零一二三四五六七八九十百千万两0-9]+[章节回卷][\s　:：]*/u, '').trim() || mark.heading
    const id = `ch${String(chapters.length).padStart(3, '0')}`
    chapters.push({ id, ordinal: chapters.length, title, heading: mark.heading, chars: [...chunk].length, start, end: next, body: chunk })
  }
  return chapters
}

/** 只支持 UTF-8 / UTF-8 BOM；GB18030 等编码如实报错，不猜。 */
export function decodeSourceText(buffer, file) {
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { text: buffer.subarray(3).toString('utf8'), encoding: 'utf-8-bom' }
  }
  const text = buffer.toString('utf8')
  if (text.includes('\uFFFD')) {
    throw new Error(`${path.basename(file)} 不是 UTF-8（含替换字符）；请先转成 UTF-8 再导入`)
  }
  return { text, encoding: 'utf-8' }
}
