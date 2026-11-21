// 工作区里的五本账：只读发现，不创建目录、不写任何文件。
//
// 目录结构沿用五件的冻结契约：
//   <root>/.dsh-novel-beat/<book>/book.json
//   <root>/.dsh-novel-fade/<book>/memory.json
//   <root>/.dsh-novel-voice/<library>/library.json
//   <root>/.dsh-novel-fanfic/<project>/project.json
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'

export const LEDGER_DIRS = Object.freeze({
  beat: '.dsh-novel-beat',
  fade: '.dsh-novel-fade',
  voice: '.dsh-novel-voice',
  fanfic: '.dsh-novel-fanfic',
  conductor: '.dsh-novel-conductor',
})

async function isDir(target) {
  try {
    return (await stat(target)).isDirectory()
  } catch {
    return false
  }
}

async function entries(target) {
  try {
    const list = await readdir(target, { withFileTypes: true })
    return list.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.')).map((entry) => entry.name)
  } catch {
    return []
  }
}

/**
 * 列出工作区里五本账的实际内容（只读）。
 * @param {string} root 工作区绝对路径
 */
export async function discoverWorkspace(root) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) {
    throw new Error('workspace: root 必须是绝对路径')
  }
  const out = { root, beat: [], fade: [], voice: [], fanfic: [], conductor: [] }
  for (const [kind, dir] of Object.entries(LEDGER_DIRS)) {
    const base = path.join(root, dir)
    if (!(await isDir(base))) continue
    out[kind] = await entries(base)
  }
  return out
}

/** 磁盘上是否存在这本书的 beat 账本。 */
export async function hasBeatLedger(root, book) {
  try {
    return (await stat(path.join(root, LEDGER_DIRS.beat, book, 'book.json'))).isFile()
  } catch {
    return false
  }
}

/** 目录名/账本名的统一校验：拒绝空、.、..、分隔符、盘符与 NUL。 */
export function assertSafeName(name, label = 'name') {
  const value = String(name ?? '')
  if (!value || value === '.' || value === '..') throw new Error(`${label} 不合法：${JSON.stringify(value)}`)
  if (/[\\/\u0000]/.test(value)) throw new Error(`${label} 不能包含路径分隔符：${value}`)
  if (/^[A-Za-z]:/.test(value)) throw new Error(`${label} 不能是盘符路径：${value}`)
  return value
}
