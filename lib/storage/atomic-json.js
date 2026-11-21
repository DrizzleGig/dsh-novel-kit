// 原子 JSON 读写：写入用「同目录临时文件 + rename」，读回带内容哈希。
// 不创建父目录之外的任何东西；调用方负责目录存在。
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

export function sha256(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex')
}

/** 稳定序列化：字段顺序由 JSON.stringify 决定，但保证尾随换行一致。 */
export function encodeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

/**
 * 读一个 JSON 文件，返回原文、解析结果与内容哈希。
 * @param {string} file 绝对路径
 */
export async function readJsonSnapshot(file) {
  const text = await readFile(file, 'utf8')
  return { file, text, json: JSON.parse(text), hash: sha256(text) }
}

/**
 * 原子写 JSON：临时文件写在同目录，fsync 后 rename 覆盖。
 * @param {string} file 绝对路径
 * @param {unknown} value 要写入的 JSON
 * @param {{ ensureDir?: boolean }} [options]
 * @returns {Promise<{ hash: string, bytes: number }>}
 */
export async function writeJsonAtomic(file, value, options = {}) {
  const dir = path.dirname(file)
  if (options.ensureDir) await mkdir(dir, { recursive: true })
  const text = encodeJson(value)
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`)
  await writeFile(tmp, text, 'utf8')
  await rename(tmp, file)
  return { hash: sha256(text), bytes: Buffer.byteLength(text) }
}

/** 文件是否存在（不抛错）。 */
export async function fileHashOrNull(file) {
  try {
    return sha256(await readFile(file, 'utf8'))
  } catch {
    return null
  }
}
