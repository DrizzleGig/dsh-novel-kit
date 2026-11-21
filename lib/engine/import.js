// 同人原著导入（S2）：把一本 txt 切成章节并落成 fanfic 自己的 source 布局。
//
// 只支持 UTF-8 / UTF-8 BOM；GB18030 等编码如实报错并提示先转码（不猜编码）。
// 落盘布局与 fanfic 0.2.x 一致：source/<sourceId>/{raw.txt,meta.json,index.json,chapters/chNNN.txt}
import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { readJsonSnapshot } from '../storage/atomic-json.js'
import { planTransaction, commitTransaction } from '../storage/transaction.js'
import { LEDGER_DIRS, assertSafeName } from '../workspace.js'
import { readFanfic } from '../repositories/ledger.js'

const HEADING = /^[ \t　]*(?:(序章|序|楔子|尾声|后记|番外[^\n]{0,20})|(第[零一二三四五六七八九十百千万两0-9]+[章节回卷][^\n]{0,40}))[ \t　]*$/gmu

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex')

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
  // 第一个标题之前的内容算序章（有内容时）
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

function decodeText(buffer, file) {
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { text: buffer.subarray(3).toString('utf8'), encoding: 'utf-8-bom' }
  }
  const text = buffer.toString('utf8')
  if (text.includes('\uFFFD')) {
    throw new Error(`${path.basename(file)} 不是 UTF-8（含替换字符）；请先转成 UTF-8 再导入`)
  }
  return { text, encoding: 'utf-8' }
}

/**
 * 导入一个 txt 到同人项目。已导入过同一内容时幂等返回。
 * @param {{root:string, project:string, file:string, title?:string}} input
 */
export async function importSource({ root, project, file, title = '' }) {
  assertSafeName(project, 'project')
  if (typeof file !== 'string' || !path.isAbsolute(file)) throw new Error('file 必须是绝对路径')
  const info = await stat(file)
  if (!info.isFile()) throw new Error('file 不是文件')
  if (info.size > 64 * 1024 * 1024) throw new Error('文件超过 64 MB，先拆分再导入')

  const buffer = await readFile(file)
  const { text, encoding } = decodeText(buffer, file)
  const digest = sha256(text)
  const sourceId = `src_${digest.slice(0, 10)}`
  const projectDir = path.join(root, LEDGER_DIRS.fanfic, project)
  const sourceDir = path.join(projectDir, 'source', sourceId)

  // 先确认项目存在/可读，再写源文件：避免把 source/ 目录写进一个不存在的项目。
  const projectFile = path.join(projectDir, 'project.json')
  const projectRaw = await readJsonSnapshot(projectFile).catch((error) => {
    throw new Error('项目读不出来（' + project + '）：' + String(error?.message ?? error))
  })
  const existing = await readFanfic(root, project).catch(() => null)
  if (existing?.sourceId === sourceId) {
    return { ok: true, idempotent: true, sourceId, sourceIdBefore: existing.sourceId }
  }

  const chapters = splitChapters(text)
  await mkdir(path.join(sourceDir, 'chapters'), { recursive: true })
  await writeFile(path.join(sourceDir, 'raw.txt'), text, 'utf8')
  for (const chapter of chapters) {
    await writeFile(path.join(sourceDir, 'chapters', `${chapter.id}.txt`), chapter.body, 'utf8')
  }
  const now = new Date().toISOString()
  const meta = {
    sourceId,
    filename: path.basename(file),
    encoding,
    sha256: digest,
    chars: [...text].length,
    chapterCount: chapters.length,
    importedAt: now,
  }
  await writeFile(path.join(sourceDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
  const index = {
    sourceId,
    sha256: digest,
    encoding,
    chars: meta.chars,
    chapterCount: chapters.length,
    chapters: chapters.map((chapter) => ({
      id: chapter.id, ordinal: chapter.ordinal, title: chapter.title, heading: chapter.heading,
      chars: chapter.chars, start: chapter.start, end: chapter.end,
    })),
  }
  await writeFile(path.join(sourceDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8')

  // 更新 project.json（sourceId + revision + title 若给了）
  const raw = projectRaw.json
  const next = {
    ...raw,
    sourceId,
    title: title || raw.title || path.basename(file),
    revision: (Number.isInteger(raw.revision) ? raw.revision : 0) + 1,
    updatedAt: now,
  }
  const txId = 'tx-import-' + project + '-' + sourceId
  await planTransaction({ root, txId, files: [{ path: projectFile, after: next }] })
  const receipt = await commitTransaction({ root, txId })
  return { ok: true, idempotent: false, sourceId, chapters: chapters.length, chars: meta.chars, sample: chapters.slice(0, 3).map((chapter) => ({ id: chapter.id, title: chapter.title })), receipt }
}

/** 列出某个目录下的 txt/md（给面板的导入选择用）。 */
export async function listSourceFiles(dir) {
  if (typeof dir !== 'string' || !path.isAbsolute(dir)) throw new Error('dir 必须是绝对路径')
  const { readdir } = await import('node:fs/promises')
  let entries = []
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return { ok: false, dir, files: [], reason: '目录不可读' }
  }
  const files = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!/\.(txt|md)$/iu.test(entry.name)) continue
    try {
      const info = await stat(path.join(dir, entry.name))
      files.push({ name: entry.name, path: path.join(dir, entry.name), bytes: info.size })
    } catch {
      // 跳过读不到的
    }
  }
  files.sort((a, b) => a.name.localeCompare(b.name))
  return { ok: true, dir, files }
}
