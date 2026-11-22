// 共用 SourceDocument：一本导入作品的不可变原文 + 分章索引。
//
// style 与 canon 两条导入口都先落到这里，再各自生成 StyleProfile / CanonSource。
// sourceId 用完整 SHA-256，不用前 10 位：同一内容长期共享身份，短 id 不够。
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { readJsonSnapshot, writeJsonAtomic } from '../storage/atomic-json.js'
import { KIT_DIR } from './settings.js'
import { decodeSourceText, sha256Hex, splitChapters } from './source-text.js'

export const SOURCE_SCHEMA_VERSION = 1
export const MAX_SOURCE_BYTES = 64 * 1024 * 1024

export function sourcesRoot(root) {
  return path.join(root, KIT_DIR, 'sources')
}

export function sourceDir(root, sourceId) {
  const id = String(sourceId ?? '')
  if (!/^[a-f0-9]{64}$/u.test(id)) throw new Error('sourceId 必须是完整 SHA-256')
  return path.join(sourcesRoot(root), id)
}

function publicSource(meta, idempotent = false) {
  return {
    ok: true,
    idempotent,
    sourceId: meta.sourceId,
    sha256: meta.sha256,
    title: meta.title,
    filename: meta.filename,
    encoding: meta.encoding,
    chars: meta.chars,
    chapterCount: meta.chapterCount,
    chapters: Array.isArray(meta.chapters) ? meta.chapters : undefined,
    createdAt: meta.createdAt,
  }
}

/**
 * 摄入一本 txt/md：UTF-8 → 完整 hash → 分章 → 写 sources/<sha256>/。
 * 同一内容重复导入幂等，不重复写原文。
 * @param {{root:string, file:string, title?:string}} input
 */
export async function ingestSource({ root, file, title = '' }) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) throw new Error('file 必须是绝对路径')
  const info = await stat(file)
  if (!info.isFile()) throw new Error('file 不是文件')
  if (info.size > MAX_SOURCE_BYTES) throw new Error('文件超过 64 MB，先拆分再导入')

  const buffer = await readFile(file)
  const { text, encoding } = decodeSourceText(buffer, file)
  const sourceId = sha256Hex(text)
  const dir = sourceDir(root, sourceId)
  const metaFile = path.join(dir, 'meta.json')

  try {
    const snap = await readJsonSnapshot(metaFile)
    return publicSource(snap.json, true)
  } catch (error) {
    if (error?.code !== 'ENOENT' && !/ENOENT/.test(String(error?.message ?? ''))) throw error
  }

  const chapters = splitChapters(text)
  const now = new Date().toISOString()
  const meta = {
    schemaVersion: SOURCE_SCHEMA_VERSION,
    sourceId,
    sha256: sourceId,
    title: String(title || path.basename(file)).trim() || path.basename(file),
    filename: path.basename(file),
    encoding,
    chars: [...text].length,
    chapterCount: chapters.length,
    createdAt: now,
    chapters: chapters.map((chapter) => ({
      id: chapter.id, ordinal: chapter.ordinal, title: chapter.title, heading: chapter.heading,
      chars: chapter.chars, start: chapter.start, end: chapter.end,
    })),
  }

  const tmp = await (async () => {
    await mkdir(sourcesRoot(root), { recursive: true })
    return await mkdtemp(path.join(sourcesRoot(root), '.tmp-'))
  })()
  try {
    await mkdir(path.join(tmp, 'chapters'), { recursive: true })
    await writeFile(path.join(tmp, 'raw.txt'), text, 'utf8')
    for (const chapter of chapters) {
      await writeFile(path.join(tmp, 'chapters', `${chapter.id}.txt`), chapter.body, 'utf8')
    }
    await writeJsonAtomic(path.join(tmp, 'meta.json'), meta)
    await writeJsonAtomic(path.join(tmp, 'index.json'), {
      schemaVersion: SOURCE_SCHEMA_VERSION,
      sourceId,
      sha256: sourceId,
      chapterCount: chapters.length,
      chapters: meta.chapters,
    })
    await rename(tmp, dir)
  } catch (error) {
    await rm(tmp, { recursive: true, force: true }).catch(() => {})
    // 并发导入同一本：另一个进程已落盘，读它的 meta 即可。
    try {
      const snap = await readJsonSnapshot(metaFile)
      return publicSource(snap.json, true)
    } catch {
      throw new Error('写入作品原文失败：' + String(error?.message ?? error))
    }
  }
  return publicSource(meta, false)
}

/** 读回原文（只给分析/证据回查用，不默认进模型上下文）。 */
export async function readSourceText(root, sourceId) {
  return await readFile(path.join(sourceDir(root, sourceId), 'raw.txt'), 'utf8')
}

export async function readSourceMeta(root, sourceId) {
  const snap = await readJsonSnapshot(path.join(sourceDir(root, sourceId), 'meta.json'))
  return snap.json
}

/** 列出已摄入的作品（面板/诊断用）。 */
export async function listSources(root) {
  let entries = []
  try {
    entries = await readdir(sourcesRoot(root), { withFileTypes: true })
  } catch {
    return { ok: true, total: 0, sources: [] }
  }
  const sources = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[a-f0-9]{64}$/u.test(entry.name)) continue
    try {
      const meta = await readSourceMeta(root, entry.name)
      sources.push({
        sourceId: meta.sourceId, title: meta.title, filename: meta.filename,
        chars: meta.chars, chapterCount: meta.chapterCount, createdAt: meta.createdAt,
      })
    } catch {
      // 损坏的 source 跳过；不把它当成可用作品
    }
  }
  sources.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  return { ok: true, total: sources.length, sources }
}
