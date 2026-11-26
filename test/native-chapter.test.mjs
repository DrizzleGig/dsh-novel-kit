// v2 原生闭环：建书 → 开章 → 写稿 → 收尾 → 查询；不创建/不写五件目录。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ensureBook } from '../lib/engine/book.js'
import { startChapter, writeChapter, finishChapter, queryChapter } from '../lib/engine/chapter.js'
import { loadSession, saveSession } from '../lib/engine/session-store.js'
import { readDecisions } from '../lib/native/decisions.js'
import { readMemory } from '../lib/native/memory.js'

const draft = '陈凡推门进来，屋里没有别人。\n\n“你来了。”唐昊说。\n\n他把那枚令牌放在桌上，没有解释。'

test('原生闭环：无五件目录也能写章、落原生账、正文按 bookId 隔离', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-native-chapter-'))
  const book = await ensureBook({ root, book: '原生书' })
  assert.equal(book.ok, true)
  const started = await startChapter({ root, book: '原生书', chapter: 1 })
  assert.equal(started.ok, true)
  assert.equal(started.session.bookId, book.bookId)
  await writeChapter({ root, sessionId: started.session.id, text: draft })
  const quote = '陈凡推门进来，屋里没有别人。'
  const done = await finishChapter({
    root,
    sessionId: started.session.id,
    extraction: {
      segments: [{ quote }],
      memory: { cards: [{ topic: '陈凡进屋', gist: quote, quote, salience: 4 }] },
    },
  })
  assert.equal(done.ok, true)
  assert.equal(done.session.state, 'completed')
  assert.match(done.chapterFile, new RegExp(`正文[/\\\\]${book.bookId}[/\\\\]`, 'u'))
  assert.equal(existsSync(path.join(root, '.dsh-novel-beat')), false)
  assert.equal(existsSync(path.join(root, '.dsh-novel-fade')), false)

  const decisions = await readDecisions(root, book.bookId)
  assert.equal(decisions.segments.length, 1)
  assert.equal(decisions.segments[0].chapter, 1)
  const memory = await readMemory(root, book.bookId)
  assert.equal(memory.cards.length, 1)

  const queried = await queryChapter({ root, sessionId: started.session.id })
  assert.equal(queried.session.state, 'completed')
  assert.ok(readFileSync(done.chapterFile, 'utf8').includes('陈凡推门进来'))
})

test('原生双书同章：正文/决策/记忆互不覆盖', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-native-two-books-'))
  const a = await ensureBook({ root, book: '甲书' })
  const b = await ensureBook({ root, book: '乙书' })
  const out = []
  for (const [book, text] of [['甲书', '甲书正文第一段。'], ['乙书', '乙书正文第一段。']]) {
    const started = await startChapter({ root, book, chapter: 1 })
    await writeChapter({ root, sessionId: started.session.id, text })
    const done = await finishChapter({
      root,
      sessionId: started.session.id,
      extraction: { segments: [{ quote: text }], memory: { cards: [{ gist: text, quote: text, salience: 3 }] } },
    })
    assert.equal(done.ok, true)
    out.push({ book, session: started.session, done })
  }
  assert.notEqual(out[0].done.chapterFile, out[1].done.chapterFile)
  assert.equal(readFileSync(out[0].done.chapterFile, 'utf8'), '甲书正文第一段。')
  assert.equal(readFileSync(out[1].done.chapterFile, 'utf8'), '乙书正文第一段。')
  assert.equal((await readDecisions(root, a.bookId)).segments.length, 1)
  assert.equal((await readDecisions(root, b.bookId)).segments.length, 1)
  assert.equal((await readMemory(root, a.bookId)).cards[0].gist, '甲书正文第一段。')
  assert.equal((await readMemory(root, b.bookId)).cards[0].gist, '乙书正文第一段。')
})

test('原生书不因五件账本损坏而阻塞', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-native-broken-five-'))
  const book = await ensureBook({ root, book: '原生书' })
  mkdirSync(path.join(root, '.dsh-novel-beat', '原生书'), { recursive: true })
  writeFileSync(path.join(root, '.dsh-novel-beat', '原生书', 'book.json'), '{broken', 'utf8')
  mkdirSync(path.join(root, '.dsh-novel-fade', '原生书'), { recursive: true })
  writeFileSync(path.join(root, '.dsh-novel-fade', '原生书', 'memory.json'), '{broken', 'utf8')
  const started = await startChapter({ root, book: '原生书', chapter: 1 })
  assert.equal(started.ok, true)
  await writeChapter({ root, sessionId: started.session.id, text: '正文不被坏账本影响。' })
  const done = await finishChapter({
    root,
    sessionId: started.session.id,
    extraction: { segments: [{ quote: '正文不被坏账本影响。' }] },
  })
  assert.equal(done.ok, true)
  assert.equal((await readDecisions(root, book.bookId)).segments.length, 1)
})

test('原生收尾恢复：事务已完成但会话未保存，按原生回执补齐', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-native-recover-'))
  const book = await ensureBook({ root, book: '恢复书' })
  const started = await startChapter({ root, book: '恢复书', chapter: 1 })
  const text = '恢复测试正文。'
  await writeChapter({ root, sessionId: started.session.id, text })
  const finished = await finishChapter({
    root,
    sessionId: started.session.id,
    extraction: { segments: [{ quote: text }] },
  })
  assert.equal(finished.ok, true)
  const broken = await loadSession(root, started.session.id)
  broken.state = 'committing'
  broken.receipt = null
  broken.receiptIds = []
  broken.chapterFile = null
  await saveSession(root, broken)
  const recovered = await finishChapter({ root, sessionId: started.session.id, extraction: {} })
  assert.equal(recovered.ok, true)
  assert.equal(recovered.recovered, true)
  assert.equal(recovered.receipt.txId, finished.receipt.txId)
  assert.match(recovered.session.chapterFile, new RegExp(`正文[/\\\\]${book.bookId}[/\\\\]`, 'u'))
})
