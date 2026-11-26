// kit 原生数据层：schema 常量、空文档与最小校验。
//
// 目标：kit 不再把五件的账本当运行时主存；这里的文档只属于 kit。
// 结构按《方案-kit-v2-独立化-2026-11-26》§3：books.json + books/<id>/book.json
// + decisions/<id>/ledger.json + memory/<id>/memory.json；正文在 正文/<bookId>/。
export const NATIVE_SCHEMA_VERSION = 1
export const BOOKS_FORMAT = 'kit.books'
export const BOOK_FORMAT = 'kit.book'
export const DECISIONS_FORMAT = 'kit.decisions'
export const MEMORY_FORMAT = 'kit.memory'
export const RUN_FORMAT = 'kit.run'
export const PERSONAS_FORMAT = 'kit.personas'
export const MEDIA_FORMAT = 'kit.media'

export const BOOK_ID_RE = /^bk-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u
export const BOOK_NAME_MAX = 120

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export function normalizeBookName(name, label = 'book') {
  const value = String(name ?? '').trim()
  if (!value || value === '.' || value === '..') throw new Error(`${label} 不合法：${JSON.stringify(value)}`)
  if (/[\\/\u0000]/u.test(value)) throw new Error(`${label} 不能包含路径分隔符：${value}`)
  if (/^[A-Za-z]:/u.test(value)) throw new Error(`${label} 不能是盘符路径：${value}`)
  if ([...value].length > BOOK_NAME_MAX) throw new Error(`${label} 超过 ${BOOK_NAME_MAX} 字`)
  return value
}

export function assertBookId(bookId) {
  const value = String(bookId ?? '')
  if (!BOOK_ID_RE.test(value)) throw new Error(`bookId 不合法：${JSON.stringify(value)}`)
  return value
}

export function emptyBookRecord({ bookId, book, title = '', mode = 'original', now = new Date().toISOString() } = {}) {
  assertBookId(bookId)
  const name = normalizeBookName(book)
  return {
    format: BOOK_FORMAT,
    schemaVersion: NATIVE_SCHEMA_VERSION,
    bookId,
    book: name,
    displayName: String(title || name),
    aliases: [],
    title: String(title || name),
    mode: mode === 'fanfic' ? 'fanfic' : 'original',
    bodyRoot: `正文/${bookId}`,
    chapters: {},
    plan: {},
    revision: 0,
    migrationState: 'active',
    originBatchIds: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function emptyDecisions({ bookId, book, now = new Date().toISOString() } = {}) {
  assertBookId(bookId)
  return {
    format: DECISIONS_FORMAT,
    schemaVersion: NATIVE_SCHEMA_VERSION,
    bookId,
    book: normalizeBookName(book),
    revision: 0,
    requests: [],
    answers: [],
    decisions: [],
    segments: [],
    canon: [],
    obligations: [],
    revisions: [],
    audit: [],
    integrity: { algorithm: 'sha256', ledgerHash: null, bodyBindings: [] },
    createdAt: now,
    updatedAt: now,
  }
}

export function emptyMemory({ bookId, book, now = new Date().toISOString() } = {}) {
  assertBookId(bookId)
  return {
    format: MEMORY_FORMAT,
    schemaVersion: NATIVE_SCHEMA_VERSION,
    bookId,
    book: normalizeBookName(book),
    revision: 0,
    meta: { revision: 0, revisionAt: 0, createdAt: now, updatedAt: now },
    chapters: {},
    cards: [],
    entities: {},
    places: {},
    threads: [],
    povDistortions: [],
    policy: { retention: 'v1' },
    archive: { objects: [], stubs: [] },
    audit: [],
    createdAt: now,
    updatedAt: now,
  }
}

function assertCommon(data, label, format) {
  if (!isPlainObject(data)) throw new Error(`${label}: 不是对象`)
  if (data.format !== format) throw new Error(`${label}: format 必须是 ${format}`)
  if (data.schemaVersion !== NATIVE_SCHEMA_VERSION) throw new Error(`${label}: 不支持的 schemaVersion=${data.schemaVersion}`)
  assertBookId(data.bookId)
  normalizeBookName(data.book, `${label}.book`)
  if (!Number.isInteger(data.revision) || data.revision < 0) throw new Error(`${label}.revision 必须是非负整数`)
}

export function validateBookRecord(data) {
  assertCommon(data, 'book', BOOK_FORMAT)
  if (typeof data.bodyRoot !== 'string' || data.bodyRoot !== `正文/${data.bookId}`) {
    throw new Error('book.bodyRoot 必须是 正文/<bookId>')
  }
  if (!isPlainObject(data.chapters)) throw new Error('book.chapters 必须是对象')
  if (!Array.isArray(data.aliases)) throw new Error('book.aliases 必须是数组')
  return data
}

export function validateDecisions(data) {
  assertCommon(data, 'decisions', DECISIONS_FORMAT)
  for (const key of ['requests', 'answers', 'decisions', 'segments', 'canon', 'obligations', 'revisions', 'audit']) {
    if (!Array.isArray(data[key])) throw new Error(`decisions.${key} 必须是数组`)
  }
  if (!isPlainObject(data.integrity)) throw new Error('decisions.integrity 必须是对象')
  return data
}

export function validateMemory(data) {
  assertCommon(data, 'memory', MEMORY_FORMAT)
  for (const key of ['cards', 'threads', 'povDistortions', 'audit']) {
    if (!Array.isArray(data[key])) throw new Error(`memory.${key} 必须是数组`)
  }
  for (const key of ['entities', 'places', 'chapters']) {
    if (!isPlainObject(data[key])) throw new Error(`memory.${key} 必须是对象`)
  }
  if (!isPlainObject(data.meta)) throw new Error('memory.meta 必须是对象')
  return data
}

export { isPlainObject }
