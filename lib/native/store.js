// kit 原生书库：.dsh-novel-kit/books.json 索引 + books/<bookId>/book.json
// + decisions/<bookId>/ledger.json + memory/<bookId>/memory.json。
//
// 这里只写 kit 自己的目录；不创建、不读取、不修改任何 .dsh-novel-beat/-fade/-voice/-fanfic/-conductor。
// 五件数据只允许在显式“继承导入”时由 lib/native/import/* 以只读方式读取。
import { mkdir, readdir, stat } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { readJsonSnapshot, writeJsonAtomic } from '../storage/atomic-json.js'
import {
  BOOKS_FORMAT, NATIVE_SCHEMA_VERSION, assertBookId, emptyBookRecord, emptyDecisions, emptyMemory,
  normalizeBookName, validateBookRecord, validateDecisions, validateMemory,
} from './schema.js'

export const KIT_ROOT = '.dsh-novel-kit'
export const BOOKS_ROOT = `${KIT_ROOT}/books`
export const BOOKS_INDEX = `${KIT_ROOT}/books.json`
export const BODY_ROOT = '正文'

export function kitDir(root) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw new Error('native: root 必须是绝对路径')
  return path.join(root, KIT_ROOT)
}

export function booksDir(root) {
  return path.join(kitDir(root), 'books')
}

export function booksIndexFile(root) {
  return path.join(kitDir(root), 'books.json')
}

export function bookDir(root, bookId) {
  return path.join(booksDir(root), assertBookId(bookId))
}

export function bookRecordFile(root, bookId) {
  return path.join(bookDir(root, bookId), 'book.json')
}

export function decisionsFile(root, bookId) {
  return path.join(kitDir(root), 'decisions', assertBookId(bookId), 'ledger.json')
}

export function memoryFile(root, bookId) {
  return path.join(kitDir(root), 'memory', assertBookId(bookId), 'memory.json')
}

export function importsDir(root) {
  return path.join(kitDir(root), 'imports')
}

/** 原生 runbook 目录：.dsh-novel-kit/runs/<bookId>/。 */
export function runsDir(root, bookId) {
  return path.join(kitDir(root), 'runs', assertBookId(bookId))
}

/** 单份 run 文件：runs/<bookId>/<runId>.json。 */
export function runFile(root, bookId, runId) {
  const id = String(runId ?? '')
  if (!/^run-[a-z0-9-]{6,80}$/u.test(id)) throw new Error('runId 不合法')
  return path.join(runsDir(root, bookId), `${id}.json`)
}

/** 原生人物卡目录：.dsh-novel-kit/personas/<bookId>/。 */
export function personasDir(root, bookId) {
  return path.join(kitDir(root), 'personas', assertBookId(bookId))
}

/** 单本人物卡文件。 */
export function personasFile(root, bookId) {
  return path.join(personasDir(root, bookId), 'personas.json')
}

/** 原生媒体证据目录：.dsh-novel-kit/media/<bookId>/。 */
export function mediaDir(root, bookId) {
  return path.join(kitDir(root), 'media', assertBookId(bookId))
}

export function mediaFile(root, bookId) {
  return path.join(mediaDir(root, bookId), 'media.json')
}

/** 正文根：正文/<bookId>；物理文件仍放在工作区，便于作者直接查看/备份。 */
export function bodyDir(root, bookId) {
  return path.join(root, BODY_ROOT, assertBookId(bookId))
}

export function newBookId() {
  return `bk-${randomUUID()}`
}

function emptyIndex() {
  return {
    format: BOOKS_FORMAT,
    schemaVersion: NATIVE_SCHEMA_VERSION,
    registryId: `reg-${randomUUID()}`,
    revision: 0,
    activeBookId: null,
    books: [],
    updatedAt: null,
  }
}

function validateIndex(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('books.json: 不是对象')
  if (data.format !== BOOKS_FORMAT) throw new Error(`books.json: format 必须是 ${BOOKS_FORMAT}`)
  if (data.schemaVersion !== NATIVE_SCHEMA_VERSION) throw new Error(`books.json: 不支持的 schemaVersion=${data.schemaVersion}`)
  if (!Array.isArray(data.books)) throw new Error('books.json: books 必须是数组')
  if (typeof data.registryId !== 'string' || !data.registryId) throw new Error('books.json: registryId 必须是非空字符串')
  if (!Number.isInteger(data.revision) || data.revision < 0) throw new Error('books.json: revision 必须是非负整数')
  if (data.activeBookId !== null && data.activeBookId !== undefined) assertBookId(data.activeBookId)
  const ids = new Set()
  for (const item of data.books) {
    if (!item || typeof item !== 'object') throw new Error('books.json: 条目必须是对象')
    assertBookId(item.bookId)
    normalizeBookName(item.displayName ?? item.book, 'books[].displayName')
    if (ids.has(item.bookId)) throw new Error(`books.json: 重复 bookId ${item.bookId}`)
    ids.add(item.bookId)
    if (!Array.isArray(item.aliases)) throw new Error(`books.json: ${item.bookId} 的 aliases 必须是数组`)
    if (!['staged', 'active', 'blocked', 'rolledBack'].includes(item.migrationState)) {
      throw new Error(`books.json: ${item.bookId} 的 migrationState 非法`)
    }
  }
  return data
}

export async function readBooks(root) {
  try {
    const snap = await readJsonSnapshot(booksIndexFile(root))
    return validateIndex(snap.json)
  } catch (error) {
    if (error?.code === 'ENOENT' || /ENOENT/.test(String(error?.message ?? ''))) return emptyIndex()
    throw new Error(`books.json 读不出来：${String(error?.message ?? error)}`)
  }
}

export async function writeBooks(root, index) {
  const current = await readBooks(root)
  const next = validateIndex({
    ...index,
    format: BOOKS_FORMAT,
    schemaVersion: NATIVE_SCHEMA_VERSION,
    registryId: index.registryId || current.registryId,
    revision: Math.max(current.revision, Number(index.revision) || 0) + 1,
    updatedAt: new Date().toISOString(),
  })
  await writeJsonAtomic(booksIndexFile(root), next, { ensureDir: true })
  return next
}

function pickRecord(index, key) {
  const needle = String(key ?? '').trim()
  if (!needle) return null
  return index.books.find((item) => item.bookId === needle)
    ?? index.books.find((item) => item.displayName === needle || item.book === needle)
    ?? index.books.find((item) => Array.isArray(item.aliases) && item.aliases.includes(needle))
    ?? null
}

export async function resolveBook(root, key) {
  const index = await readBooks(root)
  return pickRecord(index, key)
}

export async function listBooks(root) {
  return (await readBooks(root)).books
}

async function exists(file) {
  try { return (await stat(file)).isFile() } catch { return false }
}

async function writeIfMissing(file, value, validate) {
  if (await exists(file)) {
    validate((await readJsonSnapshot(file)).json)
    return false
  }
  await writeJsonAtomic(file, value, { ensureDir: true })
  return true
}

function registryEntry(record, now) {
  return {
    bookId: record.bookId,
    displayName: record.displayName,
    book: record.book,
    aliases: record.aliases ?? [],
    mode: record.mode,
    bodyRoot: record.bodyRoot,
    migrationState: record.migrationState ?? 'active',
    originBatchIds: record.originBatchIds ?? [],
    createdAt: record.createdAt ?? now,
    updatedAt: record.updatedAt ?? now,
    revision: record.revision ?? 0,
  }
}

/**
 * 创建/确认一本原生书；幂等。
 * 只创建 kit 自己的目录与正文根，不碰五件目录。
 * @returns {{ok:true, bookId:string, book:string, created:string[], record:object}}
 */
export async function ensureBook({ root, book, title = '', mode = 'original' } = {}) {
  const name = normalizeBookName(book)
  const index = await readBooks(root)
  const found = pickRecord(index, name)
  if (found) {
    const record = validateBookRecord((await readJsonSnapshot(bookRecordFile(root, found.bookId))).json)
    const created = []
    if (await writeIfMissing(decisionsFile(root, found.bookId), emptyDecisions({ bookId: found.bookId, book: record.book }), validateDecisions)) created.push('decisions')
    if (await writeIfMissing(memoryFile(root, found.bookId), emptyMemory({ bookId: found.bookId, book: record.book }), validateMemory)) created.push('memory')
    await mkdir(bodyDir(root, found.bookId), { recursive: true })
    return { ok: true, bookId: found.bookId, book: record.book, created, record }
  }

  const now = new Date().toISOString()
  await mkdir(booksDir(root), { recursive: true })
  let bookId = newBookId()
  let createdDir = false
  for (let attempt = 0; attempt < 5 && !createdDir; attempt += 1) {
    try {
      await mkdir(bookDir(root, bookId), { recursive: false })
      createdDir = true
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
      bookId = newBookId()
    }
  }
  if (!createdDir) throw new Error('创建原生书目录失败')

  const record = emptyBookRecord({ bookId, book: name, title, mode, now })
  await writeJsonAtomic(bookRecordFile(root, bookId), record, { ensureDir: true })
  await writeJsonAtomic(decisionsFile(root, bookId), emptyDecisions({ bookId, book: name, now }), { ensureDir: true })
  await writeJsonAtomic(memoryFile(root, bookId), emptyMemory({ bookId, book: name, now }), { ensureDir: true })
  await mkdir(bodyDir(root, bookId), { recursive: true })

  const next = await readBooks(root)
  next.books.push(registryEntry(record, now))
  if (!next.activeBookId) next.activeBookId = bookId
  await writeBooks(root, next)
  return { ok: true, bookId, book: name, created: ['book', 'decisions', 'memory', 'body'], record }
}

/** 重命名只改显示名；bookId 不变。 */
export async function renameBook({ root, bookId, displayName } = {}) {
  assertBookId(bookId)
  const name = normalizeBookName(displayName)
  const record = validateBookRecord((await readJsonSnapshot(bookRecordFile(root, bookId))).json)
  const next = { ...record, book: name, displayName: name, title: name, revision: record.revision + 1, updatedAt: new Date().toISOString() }
  await writeJsonAtomic(bookRecordFile(root, bookId), next)
  const index = await readBooks(root)
  const entry = index.books.find((item) => item.bookId === bookId)
  if (entry) {
    entry.displayName = name
    entry.book = name
    entry.updatedAt = next.updatedAt
    entry.revision = next.revision
    await writeBooks(root, index)
  }
  return next
}

export async function setActiveBook(root, bookId) {
  assertBookId(bookId)
  const index = await readBooks(root)
  if (!index.books.some((item) => item.bookId === bookId)) throw new Error(`没有这本书：${bookId}`)
  index.activeBookId = bookId
  return writeBooks(root, index)
}

/** 列出正文目录里实际存在的章节文件（只读；给导入/导出/诊断用）。 */
export async function listBodyFiles(root, bookId) {
  const dir = bodyDir(root, bookId)
  let names = []
  try {
    names = (await readdir(dir, { withFileTypes: true })).filter((entry) => entry.isFile() && /\.md$/iu.test(entry.name)).map((entry) => entry.name)
  } catch {
    return []
  }
  names.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN', { numeric: true }))
  return names
}
