// 记忆卡片的作者操作：钉卡（pin）/ 遗忘（forget）/ 恢复（restore）。
//
// 只动 fade 的 memory.json 里该卡的 lifecycle 与卡片状态，并追加 audit；
// 通过事务提交，revision + 1。不做第二个记忆账本。
import path from 'node:path'
import { readJsonSnapshot } from '../storage/atomic-json.js'
import { planTransaction, commitTransaction } from '../storage/transaction.js'
import { LEDGER_DIRS, assertSafeName } from '../workspace.js'
import { readFade } from '../repositories/ledger.js'
import { memoryFile, resolveBook } from '../native/store.js'
import { readProjectSettings } from './settings.js'
import { withLock } from '../storage/locks.js'
import { LEGACY_ALLOWED, LEGACY_BLOCKED } from '../native/legacy-policy.js'

const ACTIONS = Object.freeze(['pin', 'forget', 'restore'])

/**
 * @param {{root:string, book:string, cardId:string, action:'pin'|'forget'|'restore'}} input
 */
export async function updateMemoryCard({ root, book, cardId, action }) {
  return withLock({ root, flowId: 'memory-card' }, async () => {
  if (!ACTIONS.includes(action)) throw new Error(`不支持的动作：${action}（可用 ${ACTIONS.join(' / ')}）`)
  assertSafeName(book, 'book')
  const settings = await readProjectSettings(root, book)
  let bookId = settings.bookId
  if (!bookId) bookId = (await resolveBook(root, book).catch(() => null))?.bookId ?? null
  const file = bookId ? memoryFile(root, bookId) : path.join(root, LEDGER_DIRS.fade, book, 'memory.json')
  if (!bookId && !LEGACY_ALLOWED) return { ok: false, ...LEGACY_BLOCKED }
  const faded = await readFade(root, book)
  const snap = await readJsonSnapshot(file)
  const raw = snap.json
  const cards = Array.isArray(raw.cards) ? raw.cards : []
  const index = cards.findIndex((card) => String(card?.id) === String(cardId))
  if (index < 0) throw new Error(`没有这张记忆卡：${cardId}`)
  const card = { ...cards[index] }

  const now = new Date().toISOString()
  if (action === 'pin') {
    card.status = 'active'
    card.lifecycle = { ...(card.lifecycle ?? {}), status: 'protected', protection: 'hard' }
    card.pinned = true
  } else if (action === 'forget') {
    card.status = 'forgotten'
    card.lifecycle = { ...(card.lifecycle ?? {}), status: 'forgotten' }
    card.pinned = false
  } else {
    card.status = 'active'
    card.lifecycle = { ...(card.lifecycle ?? {}), status: 'active', protection: card.lifecycle?.protection ?? 'none' }
    card.pinned = false
  }
  card.updatedAt = now
  const cardsNext = [...cards]
  cardsNext[index] = card

  const memoryNext = {
    ...raw,
    meta: { ...(raw.meta ?? {}), revision: faded.revision + 1, revisionAt: (Array.isArray(raw.audit) ? raw.audit.length : 0) + 1, updatedAt: now },
    cards: cardsNext,
    audit: [...(Array.isArray(raw.audit) ? raw.audit : []), {
      id: `kit-a-${now.replace(/[^0-9]/g, '').slice(-10)}-${action}`,
      kind: `memory-${action}`,
      cardId: String(cardId),
      at: now,
      by: 'dsh-novel-kit',
    }],
  }

  const txId = `tx-memory-${String(cardId).replace(/[^A-Za-z0-9._-]/g, '_')}-${action}-${Date.now().toString(36)}`
  await planTransaction({ root, txId, files: [{ path: file, after: memoryNext, beforeHash: snap.hash }] })
  const receipt = await commitTransaction({ root, txId })
  return { ok: true, card: { id: card.id, status: card.status, lifecycle: card.lifecycle }, revision: memoryNext.meta.revision, receipt }
  })
}
