// 0.7 原生记忆归档：卡移入 archive.objects + stub，可恢复；重复不重复写。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ensureBook } from '../lib/native/store.js'
import { archiveCard, restoreArchivedCard, readMemory, mutateMemory, consolidateMemory } from '../lib/native/memory.js'
import { consolidationPlan, retentionCurve } from '../lib/native/consolidation.js'
import { readFileSync } from 'node:fs'
import { memoryFile } from '../lib/native/store.js'

test('原生记忆：归档移出 active、留 stub/对象，恢复可回 active，重复幂等', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-native-archive-'))
  const book = await ensureBook({ root, book: '归档书' })
  await mutateMemory(root, book.bookId, (draft) => {
    draft.cards = [{ id: 'c1', chapter: 3, gist: '旧事', topic: '旧事', salience: 4 }]
    draft.entities = { 陈凡: { name: '陈凡' } }
    draft.audit = []
  })

  const archived = await archiveCard({ root, bookId: book.bookId, cardId: 'c1', reason: '旧章', expectedRevision: 1 })
  assert.equal(archived.ok, true)
  assert.equal(archived.idempotent, false)
  const after = await readMemory(root, book.bookId)
  assert.equal(after.cards.length, 0)
  assert.equal(after.archive.stubs.length, 1)
  assert.equal(after.archive.objects.length, 1)
  assert.equal(after.archive.stubs[0].cardId, 'c1')
  assert.equal(after.archive.objects[0].card.id, 'c1')
  assert.equal(after.audit.at(-1).kind, 'memory-archive')

  const again = await archiveCard({ root, bookId: book.bookId, cardId: 'c1' })
  assert.equal(again.idempotent, true)
  assert.equal((await readMemory(root, book.bookId)).revision, after.revision)

  const restored = await restoreArchivedCard({ root, bookId: book.bookId, cardId: 'c1' })
  assert.equal(restored.ok, true)
  const back = await readMemory(root, book.bookId)
  assert.equal(back.cards.length, 1)
  assert.equal(back.cards[0].id, 'c1')
  assert.equal(back.archive.stubs.length, 0)
  assert.equal(back.archive.objects.length, 0)

  const againRestore = await restoreArchivedCard({ root, bookId: book.bookId, cardId: 'c1' })
  assert.equal(againRestore.idempotent, true)

  const raw = JSON.parse(readFileSync(memoryFile(root, book.bookId), 'utf8'))
  assert.equal(raw.cards.length, 1)
  assert.ok(Array.isArray(raw.audit))
})

test('原生记忆：归档缺失卡报错，不写', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-native-archive-missing-'))
  const book = await ensureBook({ root, book: '归档书二' })
  await assert.rejects(() => archiveCard({ root, bookId: book.bookId, cardId: 'nope' }), /没有这张记忆卡/u)
})

test('原生记忆：保留曲线 + 巩固只归档旧低显著度卡，钉卡/近章/高显著度保留', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-native-consolidate-'))
  const book = await ensureBook({ root, book: '巩固书' })
  await mutateMemory(root, book.bookId, (draft) => {
    draft.cards = [
      { id: 'old-low', chapter: 1, gist: '很久以前的小事', salience: 1 },
      { id: 'old-high', chapter: 1, gist: '很久以前的大事', salience: 5 },
      { id: 'recent', chapter: 45, gist: '刚发生', salience: 2 },
      { id: 'pinned', chapter: 1, gist: '钉住的身份', salience: 1, pinned: true },
    ]
    draft.audit = []
  })
  const plan = consolidationPlan((await readMemory(root, book.bookId)).cards, 50, { span: 40, maxSalience: 2 })
  assert.deepEqual(plan.archiveIds, ['old-low'])
  assert.ok(plan.keepIds.includes('old-high'))
  assert.ok(plan.keepIds.includes('recent'))
  assert.ok(plan.keepIds.includes('pinned'))
  assert.ok(Array.isArray(retentionCurve((await readMemory(root, book.bookId)).cards, 50)))

  const consolidated = await consolidateMemory({ root, bookId: book.bookId, chapter: 50, span: 40, maxSalience: 2 })
  assert.equal(consolidated.ok, true)
  assert.deepEqual(consolidated.archived.map((item) => item.cardId), ['old-low'])
  const after = await readMemory(root, book.bookId)
  assert.deepEqual(after.cards.map((card) => card.id).sort(), ['old-high', 'pinned', 'recent'].sort())
  assert.equal(after.archive.stubs.length, 1)
  assert.equal(after.archive.objects[0].reason, 'consolidation')

  const again = await consolidateMemory({ root, bookId: book.bookId, chapter: 50, span: 40, maxSalience: 2 })
  assert.equal(again.archived.length, 0)
  assert.equal(again.revision, after.revision)
})