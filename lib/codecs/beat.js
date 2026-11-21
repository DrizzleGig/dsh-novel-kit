// beat 账本的历史格式解码（纯函数：不读盘、不写盘、不迁移）。
//
// 旧账本（schemaVersion 1）缺少 revision；beat 0.9.x 的 computeRevision 兜底是
// `revisions.length + audit.length`（见 novel-beat lib/store.js:283）。kit 只读时
// 必须用同一条兜底，不能统一填 0——否则第一张收据的 revision 会跳。
export const BEAT_SCHEMA_VERSION = 2

export function beatRevision(data) {
  return Number.isFinite(data?.revision)
    ? data.revision
    : (Array.isArray(data?.revisions) ? data.revisions.length : 0)
      + (Array.isArray(data?.audit) ? data.audit.length : 0)
}

// 账本里 chapters/entities/places 是「id → 对象」的字典，其它多是数组；两种都收。
const collection = (value) => (Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : [])
const list = collection

/**
 * 把任意版本的 book.json 解成 kit 内部只读视图。
 * @param {unknown} raw 原始 JSON
 * @returns {{schemaVersion:number, book:any, meta:any, chapters:any[], decisions:any[],
 *  canon:any[], obligations:any[], segments:any[], audit:any[], revisions:any[],
 *  revision:number, legacy:boolean, warnings:string[]}}
 */
export function decodeBeat(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('beat: book.json 不是对象')
  }
  const data = raw
  const schemaVersion = Number.isInteger(data.schemaVersion) ? data.schemaVersion : 1
  const warnings = []
  if (schemaVersion < BEAT_SCHEMA_VERSION) {
    warnings.push(`beat: 旧账本 schemaVersion=${schemaVersion}，按只读兼容解码（不写迁移）`)
  }
  return {
    schemaVersion,
    book: data.book ?? null,
    meta: data.meta ?? {},
    chapters: list(data.chapters),
    decisions: list(data.decisions),
    canon: list(data.canon),
    obligations: list(data.obligations),
    segments: list(data.segments),
    audit: list(data.audit),
    revisions: list(data.revisions),
    revision: beatRevision(data),
    legacy: schemaVersion < BEAT_SCHEMA_VERSION,
    warnings,
  }
}

/** 本章的已拍板决策（chapter 字段匹配）。 */
export function decisionsForChapter(view, chapter) {
  const n = Number(chapter)
  return view.decisions.filter((decision) => Number(decision?.chapter) === n && decision?.status !== 'reverted')
}

/** 本章已登记的段落。 */
export function segmentsForChapter(view, chapter) {
  const n = Number(chapter)
  return view.segments.filter((segment) => Number(segment?.chapter) === n)
}
