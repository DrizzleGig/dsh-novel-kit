// fade 记忆账本的历史格式解码（纯函数：不读盘、不写盘、不迁移）。
//
// fade 0.7.x 的 revision 语义（见 dsh-novel-fade lib/store.js:40 revisionInfo）：
// - meta.revision 缺失 → audit.length；
// - meta.revisionAt 落后于 audit.length → 有未记账写入，revision 保持旧值但标 drift。
export const FADE_SCHEMA_VERSION = 3

export function fadeRevision(memory) {
  const stored = Number(memory?.meta?.revision)
  const auditLength = Array.isArray(memory?.audit) ? memory.audit.length : 0
  if (!Number.isInteger(stored)) return { revision: auditLength, drift: false }
  const at = Number(memory?.meta?.revisionAt)
  if (Number.isInteger(at) && auditLength > at) return { revision: stored, drift: true }
  return { revision: stored, drift: false }
}

// 账本里 chapters/entities/places 是字典，cards/threads/audit 是数组；两种都收。
const collection = (value) => (Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : [])
const list = collection

/**
 * @param {unknown} raw 原始 memory.json
 * @returns {{schemaVersion:number, book:any, meta:any, chapters:any[], cards:any[],
 *  entities:any[], places:any[], threads:any[], povDistortions:any[], audit:any[],
 *  revision:number, drift:boolean, legacy:boolean, warnings:string[]}}
 */
export function decodeFade(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('fade: memory.json 不是对象')
  }
  const memory = raw
  const schemaVersion = Number.isInteger(memory.schemaVersion) ? memory.schemaVersion : 1
  const { revision, drift } = fadeRevision(memory)
  const warnings = []
  if (schemaVersion < FADE_SCHEMA_VERSION) {
    warnings.push(`fade: 旧账本 schemaVersion=${schemaVersion}，按只读兼容解码（不写迁移）`)
  }
  if (drift) warnings.push('fade: audit 比 meta.revisionAt 长，存在未记账写入（drift）')
  return {
    schemaVersion,
    book: memory.book ?? null,
    meta: memory.meta ?? {},
    chapters: list(memory.chapters),
    cards: list(memory.cards),
    entities: list(memory.entities),
    places: list(memory.places),
    threads: list(memory.threads),
    povDistortions: list(memory.povDistortions),
    audit: list(memory.audit),
    revision,
    drift,
    legacy: schemaVersion < FADE_SCHEMA_VERSION,
    warnings,
  }
}

/** 本章的事件卡（chapter 字段匹配，含 superseded 的历史卡）。 */
export function cardsForChapter(view, chapter) {
  const n = Number(chapter)
  return view.cards.filter((card) => Number(card?.chapter) === n)
}

/** 仍活跃的卡（status 缺省视为 active）。 */
export function activeCards(view) {
  return view.cards.filter((card) => (card?.status ?? 'active') === 'active')
}
