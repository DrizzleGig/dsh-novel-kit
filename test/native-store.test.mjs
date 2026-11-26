// kit 原生数据层：书索引、决策账、记忆账、正文根；不依赖五件目录。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ensureBook, listBooks, resolveBook, renameBook, bodyDir, decisionsFile, memoryFile } from '../lib/native/store.js'
import { readDecisions, writeDecisions, decisionsView } from '../lib/native/decisions.js'
import { readMemory, writeMemory, memoryView } from '../lib/native/memory.js'

function tempRoot() {
  return mkdtempSync(path.join(os.tmpdir(), 'kit-native-'))
}

test('ensureBook：只创建 .dsh-novel-kit 与正文根，不碰五件目录', async () => {
  const root = tempRoot()
  const result = await ensureBook({ root, book: '新书' })
  assert.equal(result.ok, true)
  assert.match(result.bookId, /^bk-/u)
  assert.ok(existsSync(path.join(root, '.dsh-novel-kit', 'books.json')))
  assert.ok(existsSync(path.join(root, '.dsh-novel-kit', 'books', result.bookId, 'book.json')))
  assert.ok(existsSync(decisionsFile(root, result.bookId)))
  assert.ok(existsSync(memoryFile(root, result.bookId)))
  assert.equal(existsSync(path.join(root, '正文', result.bookId)), true)
  assert.equal(existsSync(path.join(root, '.dsh-novel-beat')), false)
  assert.equal(existsSync(path.join(root, '.dsh-novel-fade')), false)
  assert.equal(existsSync(path.join(root, '.dsh-novel-fanfic')), false)
})

test('ensureBook：同名幂等；resolve/list 能按书名找到同一 bookId', async () => {
  const root = tempRoot()
  const first = await ensureBook({ root, book: '书A' })
  const again = await ensureBook({ root, book: '书A' })
  assert.equal(again.bookId, first.bookId)
  const byName = await resolveBook(root, '书A')
  assert.equal(byName.bookId, first.bookId)
  const list = await listBooks(root)
  assert.equal(list.filter((item) => item.book === '书A').length, 1)
})

test('renameBook：只改显示名，bookId 不变，索引同步', async () => {
  const root = tempRoot()
  const { bookId } = await ensureBook({ root, book: '旧名' })
  const record = await renameBook({ root, bookId, displayName: '新名' })
  assert.equal(record.book, '新名')
  const byNew = await resolveBook(root, '新名')
  assert.equal(byNew.bookId, bookId)
  assert.equal((await resolveBook(root, '旧名')), null)
})

test('decisions：读默认空账、写入 revision+1、视图保持旧 codec 形状', async () => {
  const root = tempRoot()
  const { bookId } = await ensureBook({ root, book: '决策书' })
  const empty = await readDecisions(root, bookId)
  assert.equal(empty.revision, 0)
  assert.deepEqual(empty.decisions, [])
  const view = decisionsView(empty)
  assert.equal(view.book, '决策书')
  assert.equal(view.legacy, false)

  const next = { ...empty, decisions: [{ id: 'd1', chapter: 1, title: '谁去', status: 'committed' }] }
  const written = await writeDecisions(root, bookId, next)
  assert.equal(written.revision, 1)
  assert.equal(written.decisions.length, 1)
  const back = await readDecisions(root, bookId)
  assert.equal(back.revision, 1)
  assert.equal(back.decisions[0].id, 'd1')
})

test('decisions：expectedRevision 冲突拒绝；坏文件报错不回落为空', async () => {
  const root = tempRoot()
  const { bookId } = await ensureBook({ root, book: '冲突书' })
  const current = await readDecisions(root, bookId)
  await writeDecisions(root, bookId, { ...current, decisions: [] })
  await assert.rejects(() => writeDecisions(root, bookId, current, { expectedRevision: 0 }), /revision 冲突/u)
  writeFileSync(decisionsFile(root, bookId), '{broken', 'utf8')
  await assert.rejects(() => readDecisions(root, bookId), /读不出来/u)
})

test('memory：写卡 revision+1、meta 同步、视图保持旧 codec 形状', async () => {
  const root = tempRoot()
  const { bookId } = await ensureBook({ root, book: '记忆书' })
  const empty = await readMemory(root, bookId)
  assert.equal(empty.revision, 0)
  const written = await writeMemory(root, bookId, {
    ...empty,
    cards: [{ id: 'c1', chapter: 1, gist: '他来了', salience: 4 }],
    audit: [{ id: 'a1', kind: 'digest' }],
  })
  assert.equal(written.revision, 1)
  assert.equal(written.meta.revision, 1)
  assert.equal(written.meta.revisionAt, 1)
  const view = memoryView(written)
  assert.equal(view.book, '记忆书')
  assert.equal(view.cards.length, 1)
  assert.equal(view.drift, false)
})

test('books.json 损坏时拒绝，不静默重建', async () => {
  const root = tempRoot()
  await ensureBook({ root, book: '书' })
  writeFileSync(path.join(root, '.dsh-novel-kit', 'books.json'), '{broken', 'utf8')
  await assert.rejects(() => listBooks(root), /books\.json 读不出来/u)
})

test('正文根按 bookId 隔离，文件名可列出', async () => {
  const root = tempRoot()
  const a = await ensureBook({ root, book: '甲' })
  const b = await ensureBook({ root, book: '乙' })
  assert.notEqual(a.bookId, b.bookId)
  assert.notEqual(bodyDir(root, a.bookId), bodyDir(root, b.bookId))
  writeFileSync(path.join(bodyDir(root, a.bookId), '第1章_开端.md'), '甲文', 'utf8')
  assert.equal(readFileSync(path.join(bodyDir(root, a.bookId), '第1章_开端.md'), 'utf8'), '甲文')
  assert.equal(existsSync(path.join(bodyDir(root, b.bookId), '第1章_开端.md')), false)
})
