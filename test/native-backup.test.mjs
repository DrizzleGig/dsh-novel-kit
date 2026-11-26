// 0.6/0.7 备份：单本 kit 数据 + 正文复制到独立目录，manifest 可校验；不打包五件。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ensureBook } from '../lib/native/store.js'
import { exportBook, verifyBackup, refreshBackup } from '../lib/native/backup.js'
import { startChapter, writeChapter, finishChapter } from '../lib/engine/chapter.js'

test('备份：单本数据+正文可导出并校验 hash，不包含五件目录', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-backup-'))
  const book = await ensureBook({ root, book: '备份书' })
  const started = await startChapter({ root, book: '备份书', chapter: 1 })
  await writeChapter({ root, sessionId: started.session.id, text: '备份正文。' })
  await finishChapter({ root, sessionId: started.session.id, extraction: { segments: [{ quote: '备份正文。' }] } })
  const out = mkdtempSync(path.join(os.tmpdir(), 'kit-backup-out-'))
  const exported = await exportBook({ root, bookId: book.bookId, outDir: out })
  assert.equal(exported.ok, true)
  assert.ok(existsSync(path.join(exported.dir, 'manifest.json')))
  assert.ok(existsSync(path.join(exported.dir, 'decisions', 'ledger.json')))
  assert.ok(existsSync(path.join(exported.dir, 'memory', 'memory.json')))
  assert.ok(existsSync(path.join(exported.dir, 'body', '第1章.md')))
  assert.equal(existsSync(path.join(exported.dir, '.dsh-novel-beat')), false)

  const verified = await verifyBackup({ dir: exported.dir })
  assert.equal(verified.ok, true)
  assert.ok(verified.files >= 4)

  writeFileSync(path.join(exported.dir, 'decisions', 'ledger.json'), '{}', 'utf8')
  const broken = await verifyBackup({ dir: exported.dir })
  assert.equal(broken.ok, false)
  assert.ok(broken.issues.some((item) => item.code === 'hash-mismatch'))

  // 修复并新增一章后增量刷新；只复制变化文件。
  await exportBook({ root, bookId: book.bookId, outDir: out })
  const chapterFile = path.join(root, '正文', book.bookId, '第1章.md')
  writeFileSync(chapterFile, '备份正文（修订）。', 'utf8')
  const refreshed = await refreshBackup({ root, bookId: book.bookId, dir: exported.dir })
  assert.equal(refreshed.ok, true)
  assert.equal(refreshed.copied, 1)
  assert.equal((await verifyBackup({ dir: exported.dir })).ok, true)
  assert.equal(readFileSync(path.join(exported.dir, 'body', '第1章.md'), 'utf8'), '备份正文（修订）。')
})
