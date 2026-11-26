// kit 原生漫画/OCR：从 fanfic 的本地漫画读取移植（原生实现，不共享账本/运行时）。
// 只读作者指定的本地文件；文件必须位于工作区内，避免 remote 任意读盘。
import path from 'node:path'
import { listComicPages, extractComicPage, ocrComicPages, ocrComicPanels, detectComicPanels } from './comic.mjs'

export { listComicPages, extractComicPage, ocrComicPages, ocrComicPanels, detectComicPanels }

export function assertComicFile(root, file) {
  const resolved = path.resolve(String(file ?? ''))
  const workspace = path.resolve(root)
  const relative = path.relative(workspace, resolved)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('漫画文件必须在工作区内')
  }
  return resolved
}

export async function readComicPageBase64(root, file, index = 0) {
  const target = assertComicFile(root, file)
  const buffer = await extractComicPage(target, Number(index) || 0)
  const ext = path.extname(target).toLowerCase().replace('.', '')
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
  return { ok: true, index: Number(index) || 0, mime, base64: buffer.toString('base64'), bytes: buffer.length }
}
