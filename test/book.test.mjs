// kit-only 建书：没有 beat/fade 插件也能创建可开章的作品。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ensureBook } from '../lib/engine/book.js'
import { startChapter } from '../lib/engine/chapter.js'
import { readProjectSettings } from '../lib/engine/settings.js'
import { executeAuthorCommand } from '../lib/engine/author.js'

test('ensureBook：kit-only 创建 beat/fade/settings，可开章，重复幂等', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-book-'))
  const first = await ensureBook({ root, book: '新书' })
  assert.equal(first.ok, true)
  assert.deepEqual(first.created.sort(), ['beat', 'fade', 'settings'])
  assert.equal(JSON.parse(readFileSync(path.join(root, '.dsh-novel-beat', '新书', 'book.json'), 'utf8')).book, '新书')
  assert.equal(JSON.parse(readFileSync(path.join(root, '.dsh-novel-fade', '新书', 'memory.json'), 'utf8')).book, '新书')
  const settings = await readProjectSettings(root, '新书')
  assert.equal(settings.mode, 'original')

  const started = await startChapter({ root, book: '新书', chapter: 1 })
  assert.equal(started.ok, true)
  assert.equal(started.session.chapter, 1)

  const again = await ensureBook({ root, book: '新书' })
  assert.equal(again.createdCount, 0)
})

test('作者命令：book.create 从面板建书', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-book-author-'))
  const result = await executeAuthorCommand({
    root, operationId: 'op-book-1', command: 'book.create',
    targetRef: { book: '面板新书' }, actor: { kind: 'author', trusted: true, source: 'panel' },
  })
  assert.equal(result.ok, true)
  assert.equal(result.book, '面板新书')
  assert.ok(result.created.includes('beat'))
})
