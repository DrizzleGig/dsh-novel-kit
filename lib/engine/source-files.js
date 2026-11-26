// 本地 txt/md 选择器（资料/风格/同人导入共用）；只读，不写任何账本。
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'

/** 列出某个目录下的 txt/md（给面板的导入选择用）。 */
export async function listSourceFiles(dir) {
  if (typeof dir !== 'string' || !path.isAbsolute(dir)) throw new Error('dir 必须是绝对路径')
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
  const capped = files.slice(0, 200)
  return { ok: true, dir, files: capped, total: files.length, truncated: files.length > capped.length }
}
