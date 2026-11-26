// kit-only 建书：没有 beat/fade 插件也能创建可开章的作品。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ensureBook } from '../lib/engine/book.js'
import { startChapter } from '../lib/engine/chapter.js'
import { readProjectSettings } from '../lib/engine/settings.js'
import { executeAuthorCommand } from '../lib/engine/author.js'

test('ensureBook：只创建原生书/决策/记忆/正文/settings，可开章，重复幂等', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-book-'))
  const first = await ensureBook({ root, book: '新书' })
  assert.equal(first.ok, true)
  assert.deepEqual(first.created.sort(), ['body', 'book', 'decisions', 'memory', 'settings'])
  assert.equal(JSON.parse(readFileSync(path.join(root, '.dsh-novel-kit', 'books', first.bookId, 'book.json'), 'utf8')).book, '新书')
  assert.ok(existsSync(path.join(root, '.dsh-novel-kit', 'decisions', first.bookId, 'ledger.json')))
  assert.ok(existsSync(path.join(root, '.dsh-novel-kit', 'memory', first.bookId, 'memory.json')))
  assert.equal(existsSync(path.join(root, '.dsh-novel-beat')), false)
  assert.equal(existsSync(path.join(root, '.dsh-novel-fade')), false)
  const settings = await readProjectSettings(root, '新书')
  assert.equal(settings.mode, 'original')
  assert.equal(settings.bookId, first.bookId)

  const started = await startChapter({ root, book: '新书', chapter: 1 })
  assert.equal(started.ok, true)
  assert.equal(started.session.chapter, 1)
  assert.equal(started.session.bookId, first.bookId)

  const again = await ensureBook({ root, book: '新书' })
  assert.equal(again.createdCount, 0)
})

test('ensureBook：坏的五件账本不影响原生建书，也不改源字节', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-book-corrupt-'))
  const dir = path.join(root, '.dsh-novel-beat', '坏书')
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'book.json')
  writeFileSync(file, '{broken', 'utf8')
  const result = await ensureBook({ root, book: '坏书' })
  assert.equal(result.ok, true)
  assert.equal(readFileSync(file, 'utf8'), '{broken')
})

test('作者命令：book.create 从面板建书', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-book-author-'))
  const result = await executeAuthorCommand({
    root, operationId: 'op-book-1', command: 'book.create',
    targetRef: { book: '面板新书' }, actor: { kind: 'author', trusted: true, source: 'panel' },
  })
  assert.equal(result.ok, true)
  assert.equal(result.book, '面板新书')
  assert.ok(result.created.includes('book'))
})
