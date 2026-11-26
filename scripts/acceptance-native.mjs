// kit v2 0.6/0.8 原生验收：原生建书写章 + 五件显式导入 + 备份校验 + 故事圣经。
//
// 用法：node scripts/acceptance-native.mjs
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ensureBook } from '../lib/engine/book.js'
import { startChapter, writeChapter, finishChapter, queryChapter } from '../lib/engine/chapter.js'
import { readDecisions } from '../lib/native/decisions.js'
import { readMemory } from '../lib/native/memory.js'
import { importLegacyBook } from '../lib/native/import/legacy.js'
import { exportBook, verifyBackup } from '../lib/native/backup.js'
import { buildStoryBible } from '../lib/native/bible.js'
import { readMedia } from '../lib/native/media.js'
import { readPersonas } from '../lib/native/personas.js'
import { listRuns } from '../lib/native/runs.js'

function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

const root = mkdtempSync(path.join(os.tmpdir(), 'kit-accept-native-'))
const book = await ensureBook({ root, book: '验收书' })
assert.equal(book.ok, true)
const started = await startChapter({ root, book: '验收书', chapter: 1 })
assert.equal(started.ok, true)
const text = '验收正文第一段。\n\n“你来了。”他说。'
await writeChapter({ root, sessionId: started.session.id, text })
const quote = '验收正文第一段。'
const done = await finishChapter({
  root,
  sessionId: started.session.id,
  extraction: { segments: [{ quote }], memory: { cards: [{ gist: quote, quote, salience: 4 }] } },
})
assert.equal(done.ok, true)
assert.equal(done.session.state, 'completed')
assert.match(done.chapterFile, new RegExp(`正文[/\\\\]${book.bookId}[/\\\\]`, 'u'))
assert.equal(existsSync(path.join(root, '.dsh-novel-beat')), false)
assert.equal(existsSync(path.join(root, '.dsh-novel-fade')), false)
assert.equal((await readDecisions(root, book.bookId)).segments.length, 1)
assert.equal((await readMemory(root, book.bookId)).cards.length, 1)
const queried = await queryChapter({ root, sessionId: started.session.id })
assert.equal(queried.session.state, 'completed')

// 第二阶段：造一份五件旧数据，显式导入后原生开章/收尾。
writeJson(path.join(root, '.dsh-novel-beat', '导入书', 'book.json'), {
  schemaVersion: 2, book: '导入书', decisions: [{ id: 'd1', chapter: 1, title: '谁去', status: 'committed' }],
  segments: [], canon: [], obligations: [], audit: [], revisions: [], revision: 3,
})
writeJson(path.join(root, '.dsh-novel-fade', '导入书', 'memory.json'), {
  schemaVersion: 3, book: '导入书', meta: { revision: 2 }, cards: [{ id: 'c1', chapter: 1, gist: '旧记忆' }],
  entities: {}, places: {}, threads: [], audit: [],
})
mkdirSync(path.join(root, '正文'), { recursive: true })
writeFileSync(path.join(root, '正文', '第1章_开端.md'), '导入书正文。', 'utf8')
const imported = await importLegacyBook({ root, book: '导入书' })
assert.equal(imported.ok, true)
const importedStart = await startChapter({ root, book: '导入书', chapter: 2 })
assert.equal(importedStart.ok, true)
await writeChapter({ root, sessionId: importedStart.session.id, text: '导入后的新章。' })
const importedDone = await finishChapter({
  root, sessionId: importedStart.session.id,
  extraction: { segments: [{ quote: '导入后的新章。' }] },
})
assert.equal(importedDone.ok, true)
assert.equal(existsSync(path.join(root, '.dsh-novel-kit', '.dsh-novel-beat')), false)

// 第三阶段：备份 + 校验 + 故事圣经。
const backupRoot = mkdtempSync(path.join(os.tmpdir(), 'kit-accept-backup-'))
const backup = await exportBook({ root, bookId: imported.bookId, outDir: backupRoot })
assert.equal(backup.ok, true)
assert.equal((await verifyBackup({ dir: backup.dir })).ok, true)
const bible = buildStoryBible({
  book: '导入书',
  decisions: await readDecisions(root, imported.bookId),
  memory: await readMemory(root, imported.bookId),
  media: await readMedia(root, imported.bookId),
  personas: await readPersonas(root, imported.bookId),
  runs: (await listRuns({ root, bookId: imported.bookId })).runs,
})
assert.match(bible.markdown, /导入书 · 故事圣经/u)

console.log(JSON.stringify({
  ok: true,
  nativeBookId: book.bookId,
  importedBookId: imported.bookId,
  chapterFile: done.chapterFile,
  importedChapterFile: importedDone.chapterFile,
  fiveDirsCreatedForNativeBook: false,
  backupVerified: true,
  bibleChars: bible.chars,
  segments: 1,
  cards: 1,
}, null, 2))
