// 章节历史带体检摘要，供决策页「按章体检」只读展示。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ensureBook } from '../lib/engine/book.js'
import { startChapter, writeChapter, finishChapter, chapterHistory } from '../lib/engine/chapter.js'

test('chapterHistory: 已收尾章节带 verification 摘要', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-chapter-history-'))
  await ensureBook({ root, book: '历史书' })
  const started = await startChapter({ root, book: '历史书', chapter: 1 })
  await writeChapter({ root, sessionId: started.session.id, text: '第一段。\n\n第二段。' })
  const done = await finishChapter({ root, sessionId: started.session.id, extraction: { segments: [{ quote: '第一段。' }] } })
  assert.equal(done.ok, true)
  const history = await chapterHistory({ root, book: '历史书' })
  const row = history.chapters.find((item) => item.chapter === 1)
  assert.ok(row)
  assert.equal(row.state, 'completed')
  assert.ok(row.verification && Number.isInteger(row.verification.blockers))
  assert.ok(Array.isArray(row.verification.findings))
})