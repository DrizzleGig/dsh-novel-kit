// kit 原生书备份：把一本书的 kit 数据与正文复制到独立目录，并写 hash manifest。
// 只读源；不打包五件目录；恢复留给作者显式操作。
import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { assertBookId } from './schema.js'
import { bodyDir, decisionsFile, memoryFile, mediaFile, personasFile, runsDir, bookRecordFile } from './store.js'

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')

async function exists(target) {
  try { await stat(target); return true } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function listFiles(dir) {
  const out = []
  const walk = async (current) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (entry.isFile()) out.push(full)
    }
  }
  await walk(dir)
  return out
}

async function collectEntries(root, bookId) {
  const entries = []
  const add = (source, rel) => entries.push({ source, rel })
  add(bookRecordFile(root, bookId), 'book.json')
  add(decisionsFile(root, bookId), path.join('decisions', 'ledger.json'))
  add(memoryFile(root, bookId), path.join('memory', 'memory.json'))
  add(mediaFile(root, bookId), path.join('media', 'media.json'))
  add(personasFile(root, bookId), path.join('personas', 'personas.json'))
  const runs = await listFiles(runsDir(root, bookId)).catch(() => [])
  for (const file of runs) add(file, path.join('runs', path.basename(file)))
  const body = await listFiles(bodyDir(root, bookId)).catch(() => [])
  for (const file of body) add(file, path.join('body', path.relative(bodyDir(root, bookId), file)))
  return entries
}

async function writeBackup({ root, bookId, targetDir, previous = null } = {}) {
  await mkdir(targetDir, { recursive: true })
  const entries = await collectEntries(root, bookId)
  const files = []
  let copiedCount = 0
  for (const entry of entries) {
    if (!(await exists(entry.source))) continue
    const bytes = await readFile(entry.source)
    const hash = sha256(bytes)
    const rel = entry.rel.split(path.sep).join('/')
    const old = previous?.get(rel)
    if (old !== hash) {
      const dest = path.join(targetDir, entry.rel)
      await mkdir(path.dirname(dest), { recursive: true })
      await cp(entry.source, dest)
      copiedCount += 1
    }
    files.push({ path: rel, bytes: bytes.length, sha256: hash, ...(rel.startsWith('body/') ? { sourcePath: path.relative(root, entry.source).split(path.sep).join('/') } : {}) })
  }
  const manifest = {
    schemaVersion: 1,
    kind: 'kit-book-backup',
    bookId,
    exportedAt: new Date().toISOString(),
    sourceRoot: root,
    files,
  }
  await writeFile(path.join(targetDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return { files: files.length, copied: copiedCount, manifest }
}

/**
 * 导出单本：<outDir>/<bookId>/{book.json,decisions/,memory/,media/,personas/,runs/,body/} + manifest.json
 */
export async function exportBook({ root, bookId, outDir } = {}) {
  assertBookId(bookId)
  if (typeof outDir !== 'string' || !path.isAbsolute(outDir)) throw new Error('exportBook: outDir 必须是绝对路径')
  const targetDir = path.join(outDir, bookId)
  const written = await writeBackup({ root, bookId, targetDir })
  return { ok: true, bookId, dir: targetDir, files: written.files, manifest: written.manifest }
}

/** 增量刷新同一个备份目录：只复制新增/变化的文件；manifest 以当前源为准。 */
export async function refreshBackup({ root, bookId, dir } = {}) {
  assertBookId(bookId)
  if (typeof dir !== 'string' || !path.isAbsolute(dir)) throw new Error('refreshBackup: dir 必须是绝对路径')
  const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'))
  if (manifest.bookId !== bookId) throw new Error('备份目录的 bookId 不匹配')
  const previous = new Map((manifest.files ?? []).map((item) => [item.path, item.sha256]))
  const written = await writeBackup({ root, bookId, targetDir: dir, previous })
  return { ok: true, bookId, dir, files: written.files, copied: written.copied, manifest: written.manifest }
}

/** 校验备份目录里的文件 hash。 */
export async function verifyBackup({ dir } = {}) {
  if (typeof dir !== 'string' || !path.isAbsolute(dir)) throw new Error('verifyBackup: dir 必须是绝对路径')
  const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'))
  const issues = []
  for (const entry of manifest.files ?? []) {
    try {
      const bytes = await readFile(path.join(dir, entry.path))
      if (sha256(bytes) !== entry.sha256) issues.push({ path: entry.path, code: 'hash-mismatch' })
    } catch {
      issues.push({ path: entry.path, code: 'missing' })
    }
  }
  return { ok: issues.length === 0, bookId: manifest.bookId, files: manifest.files?.length ?? 0, issues }
}
