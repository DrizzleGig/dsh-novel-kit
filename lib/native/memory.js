// kit 原生记忆账：books/<bookId>/memory.json。
//
// 承载 kit 自己的事件卡/人物/地点/线索；不是 fade 的 memory.json。
// 字段与旧 decodeFade 视图相近，便于记忆页与简报装配过渡。
import { readJsonSnapshot, writeJsonAtomic } from '../storage/atomic-json.js'
import { withLock } from '../storage/locks.js'
import { emptyMemory, validateMemory, assertBookId } from './schema.js'
import { bookRecordFile, memoryFile } from './store.js'
import { consolidationPlan } from './consolidation.js'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

async function fallbackBookName(root, bookId) {
  try {
    const record = (await readJsonSnapshot(bookRecordFile(root, bookId))).json
    return typeof record?.book === 'string' && record.book ? record.book : bookId
  } catch {
    return bookId
  }
}

export async function readMemory(root, bookId) {
  assertBookId(bookId)
  try {
    const snap = await readJsonSnapshot(memoryFile(root, bookId))
    return validateMemory(snap.json)
  } catch (error) {
    if (error?.code === 'ENOENT' || /ENOENT/.test(String(error?.message ?? ''))) {
      return emptyMemory({ bookId, book: await fallbackBookName(root, bookId) })
    }
    throw new Error(`memory.json 读不出来：${String(error?.message ?? error)}`)
  }
}

export async function writeMemory(root, bookId, next, { expectedRevision } = {}) {
  assertBookId(bookId)
  const current = await readMemory(root, bookId)
  if (Number.isInteger(expectedRevision) && current.revision !== expectedRevision) {
    throw new Error(`memory revision 冲突：期望 ${expectedRevision}，实际 ${current.revision}`)
  }
  const now = new Date().toISOString()
  const document = validateMemory({
    ...next,
    schemaVersion: 1,
    bookId,
    revision: current.revision + 1,
    meta: { ...(next.meta ?? {}), revision: (Number(next.meta?.revision) || 0) + 1, revisionAt: Array.isArray(next.audit) ? next.audit.length : 0, updatedAt: now },
    updatedAt: now,
  })
  await writeJsonAtomic(memoryFile(root, bookId), document, { ensureDir: true })
  return document
}

export async function mutateMemory(root, bookId, fn, { expectedRevision } = {}) {
  const current = await readMemory(root, bookId)
  const draft = clone(current)
  const result = await fn(draft)
  const document = await writeMemory(root, bookId, draft, { expectedRevision: expectedRevision ?? current.revision })
  return { document, result }
}

/** 供引擎/UI 的只读视图：保持旧 decodeFade 的字段形状，并带章节/策略/归档。 */
export function memoryView(document) {
  const data = validateMemory(document)
  return {
    schemaVersion: data.schemaVersion,
    bookId: data.bookId,
    book: data.book,
    meta: data.meta,
    chapters: data.chapters,
    cards: data.cards,
    entities: data.entities,
    places: data.places,
    threads: data.threads,
    povDistortions: data.povDistortions,
    policy: data.policy,
    archive: data.archive,
    audit: data.audit,
    revision: data.revision,
    drift: false,
    legacy: false,
    warnings: [],
  }
}

/**
 * 归档一张卡：active 卡移入 archive.objects，留一条 stub；不删除 L0 事实。
 * 幂等：卡已不在 active 且 stub 已存在时返回 idempotent。
 */
export async function archiveCard({ root, bookId, cardId, reason = '', expectedRevision = null } = {}) {
  assertBookId(bookId)
  const id = String(cardId ?? '').trim()
  if (!id) throw new Error('archiveCard: cardId 必填')
  return withLock({ root, flowId: 'memory-archive' }, async () => {
    const current = await readMemory(root, bookId)
    const currentCards = Array.isArray(current.cards) ? current.cards : []
    const currentStubs = Array.isArray(current.archive?.stubs) ? current.archive.stubs : []
    if (!currentCards.some((item) => String(item?.id) === id) && currentStubs.some((item) => String(item?.cardId) === id)) {
      return { ok: true, idempotent: true, cardId: id, objectId: currentStubs.find((item) => String(item?.cardId) === id)?.objectId ?? null, revision: current.revision }
    }
    const { document, result } = await mutateMemory(root, bookId, (draft) => {
      const cards = Array.isArray(draft.cards) ? draft.cards : []
      const card = cards.find((item) => String(item?.id) === id)
      const archive = draft.archive && typeof draft.archive === 'object' ? draft.archive : { objects: [], stubs: [] }
      const objects = Array.isArray(archive.objects) ? archive.objects : []
      const stubs = Array.isArray(archive.stubs) ? archive.stubs : []
      if (!card) {
        if (stubs.some((item) => String(item?.cardId) === id)) return { ok: true, idempotent: true, cardId: id, objectId: stubs.find((item) => String(item?.cardId) === id)?.objectId ?? null }
        throw new Error(`没有这张记忆卡：${id}`)
      }
      const now = new Date().toISOString()
      const objectId = `ar-${id}`
      const object = {
        id: objectId,
        cardId: id,
        card: clone(card),
        chapter: Number(card.chapter) || 0,
        archivedAt: now,
        reason: String(reason ?? ''),
      }
      draft.cards = cards.filter((item) => String(item?.id) !== id)
      draft.archive = {
        objects: [...objects.filter((item) => String(item?.id) !== objectId), object],
        stubs: [...stubs.filter((item) => String(item?.cardId) !== id), {
          cardId: id,
          objectId,
          chapter: Number(card.chapter) || 0,
          gist: String(card.gist ?? card.topic ?? ''),
          archivedAt: now,
          reason: String(reason ?? ''),
        }],
      }
      draft.audit = [...(Array.isArray(draft.audit) ? draft.audit : []), {
        id: `kit-a-archive-${id}-${now.replace(/[^0-9]/g, '').slice(-10)}`,
        kind: 'memory-archive',
        cardId: id,
        objectId,
        at: now,
        by: 'dsh-novel-kit',
      }]
      return { ok: true, idempotent: false, cardId: id, objectId }
    }, { expectedRevision })
    return { ...result, revision: document.revision }
  })
}

/** 从归档恢复一张卡；stub 消失，卡回到 active。 */
export async function restoreArchivedCard({ root, bookId, cardId, expectedRevision = null } = {}) {  assertBookId(bookId)
  const id = String(cardId ?? '').trim()
  if (!id) throw new Error('restoreArchivedCard: cardId 必填')
  return withLock({ root, flowId: 'memory-restore' }, async () => {
    const current = await readMemory(root, bookId)
    if (Array.isArray(current.cards) && current.cards.some((item) => String(item?.id) === id)) {
      return { ok: true, idempotent: true, cardId: id, revision: current.revision }
    }
    const { document, result } = await mutateMemory(root, bookId, (draft) => {
      const cards = Array.isArray(draft.cards) ? draft.cards : []
      if (cards.some((item) => String(item?.id) === id)) return { ok: true, idempotent: true, cardId: id }
      const archive = draft.archive && typeof draft.archive === 'object' ? draft.archive : { objects: [], stubs: [] }
      const objects = Array.isArray(archive.objects) ? archive.objects : []
      const stubs = Array.isArray(archive.stubs) ? archive.stubs : []
      const stub = stubs.find((item) => String(item?.cardId) === id)
      if (!stub) throw new Error(`没有这张归档卡：${id}`)
      const object = objects.find((item) => String(item?.id) === String(stub.objectId))
      if (!object?.card) throw new Error(`归档对象缺失：${stub.objectId}`)
      const now = new Date().toISOString()
      draft.cards = [...cards, { ...clone(object.card), restoredAt: now }]
      draft.archive = {
        objects: objects.filter((item) => String(item?.id) !== String(stub.objectId)),
        stubs: stubs.filter((item) => String(item?.cardId) !== id),
      }
      draft.audit = [...(Array.isArray(draft.audit) ? draft.audit : []), {
        id: `kit-a-restore-${id}-${now.replace(/[^0-9]/g, '').slice(-10)}`,
        kind: 'memory-restore',
        cardId: id,
        objectId: String(stub.objectId),
        at: now,
        by: 'dsh-novel-kit',
      }]
      return { ok: true, idempotent: false, cardId: id, objectId: String(stub.objectId) }
    }, { expectedRevision })
    return { ...result, revision: document.revision }
  })
}

/**
 * 按保留曲线做一次“巩固”：窗口外、非钉、低显著度的卡归档（保留对象/stub，可恢复）。
 * 不删除事实，不改近章/钉卡；没有候选时不写 revision。
 */
export async function consolidateMemory({ root, bookId, chapter, span = 40, maxSalience = 2, expectedRevision = null } = {}) {
  assertBookId(bookId)
  const currentChapter = Number(chapter)
  if (!Number.isInteger(currentChapter) || currentChapter < 1) throw new Error('consolidateMemory: chapter 必须是正整数')
  return withLock({ root, flowId: 'memory-consolidate' }, async () => {
    const current = await readMemory(root, bookId)
    const plan = consolidationPlan(current.cards, currentChapter, { span, maxSalience })
    if (plan.archiveIds.length === 0) {
      return { ok: true, archived: [], kept: plan.keepIds, revision: current.revision, curve: plan.curve }
    }
    const { document, result } = await mutateMemory(root, bookId, (draft) => {
      const cards = Array.isArray(draft.cards) ? draft.cards : []
      const archive = draft.archive && typeof draft.archive === 'object' ? draft.archive : { objects: [], stubs: [] }
      let objects = Array.isArray(archive.objects) ? archive.objects : []
      let stubs = Array.isArray(archive.stubs) ? archive.stubs : []
      const now = new Date().toISOString()
      const archived = []
      const removed = new Set()
      for (const id of plan.archiveIds) {
        const card = cards.find((item) => String(item?.id) === id)
        if (!card) continue
        const objectId = `ar-${id}`
        objects = [...objects.filter((item) => String(item?.id) !== objectId), {
          id: objectId, cardId: id, card: clone(card), chapter: Number(card.chapter) || 0, archivedAt: now, reason: 'consolidation',
        }]
        stubs = [...stubs.filter((item) => String(item?.cardId) !== id), {
          cardId: id, objectId, chapter: Number(card.chapter) || 0, gist: String(card.gist ?? card.topic ?? ''), archivedAt: now, reason: 'consolidation',
        }]
        archived.push({ cardId: id, objectId })
        removed.add(id)
        draft.audit = [...(Array.isArray(draft.audit) ? draft.audit : []), {
          id: `kit-a-consolidate-${id}-${now.replace(/[^0-9]/g, '').slice(-10)}`,
          kind: 'memory-consolidate', cardId: id, objectId, at: now, by: 'dsh-novel-kit',
        }]
      }
      draft.cards = cards.filter((item) => !removed.has(String(item?.id)))
      draft.archive = { objects, stubs }
      return { ok: true, archived }
    }, { expectedRevision })
    return { ...result, kept: plan.keepIds, revision: document.revision, curve: plan.curve }
  })
}
