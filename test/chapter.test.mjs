// S1：章节引擎最小闭环（start → write → finish）与可恢复事务。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { startChapter, writeChapter, finishChapter, queryChapter, resumeChapter } from '../lib/engine/chapter.js'

function workspace({ withFade = true } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-chapter-'))
  const beatDir = path.join(root, '.dsh-novel-beat', '书')
  mkdirSync(beatDir, { recursive: true })
  const book = {
    schemaVersion: 2,
    book: '书',
    meta: { title: '书' },
    chapters: { ch012: { status: 'verified' } },
    decisions: [{ id: 'd1', chapter: 13, title: '谁去', change: '陈凡去', status: 'committed' }],
    canon: [{ entity: '陈凡', key: '身份', value: '多出来的人' }],
    obligations: [],
    segments: [{ id: 's-1', chapter: 12 }],
    audit: [{ id: 'a-1' }],
    revisions: [],
    revision: 41,
  }
  writeFileSync(path.join(beatDir, 'book.json'), JSON.stringify(book, null, 2))
  if (withFade) {
    const fadeDir = path.join(root, '.dsh-novel-fade', '书')
    mkdirSync(fadeDir, { recursive: true })
    const memory = {
      schemaVersion: 3,
      book: '书',
      meta: { revision: 18, revisionAt: 2 },
      chapters: {},
      cards: [
        { id: 'c1', chapter: 11, gist: '陈凡知道了自己的来历', salience: 5 },
        { id: 'c2', chapter: 12, gist: '冰火两仪眼被毁', salience: 4 },
      ],
      entities: {}, places: {}, threads: [], povDistortions: [],
      audit: [{ id: 'a1' }, { id: 'a2' }],
    }
    writeFileSync(path.join(fadeDir, 'memory.json'), JSON.stringify(memory, null, 2))
  }
  return root
}

const draft = '陈凡推门进来，屋里没有别人。\n\n“你来了。”唐昊说。\n\n他把那枚令牌放在桌上，没有解释。'

test('start：装配四段上下文，缺 fade 时如实报错', async () => {
  const root = workspace()
  const started = await startChapter({ root, book: '书', chapter: 13 })
  assert.equal(started.ok, true)
  assert.equal(started.session.state, 'writing')
  assert.equal(started.context.segments[0].available, true)
  assert.equal(started.context.segments[2].available, true)
  assert.match(started.context.segments[0].markdown, /本章已拍板/)

  const bare = workspace({ withFade: false })
  const missing = await startChapter({ root: bare, book: '书', chapter: 13 })
  assert.equal(missing.ok, false)
  assert.equal(missing.code, 'capability-missing')
  assert.deepEqual(missing.missing, ['fade'])
})

test('start：同一本书同一章重复开始会复用未完成会话', async () => {
  const root = workspace()
  const first = await startChapter({ root, book: '书', chapter: 13 })
  const second = await startChapter({ root, book: '书', chapter: 13 })
  assert.equal(second.resumed, true)
  assert.equal(second.session.id, first.session.id)
})

test('write → finish：写正文、落 beat 段落与 fade 卡、事务回执，重复 finish 幂等', async () => {
  const root = workspace()
  const { session } = await startChapter({ root, book: '书', chapter: 13 })
  const written = await writeChapter({ root, sessionId: session.id, text: draft })
  assert.equal(written.session.draft.version, 1)

  const quote = '陈凡推门进来，屋里没有别人。'
  const start = draft.indexOf(quote)
  const result = await finishChapter({
    root,
    sessionId: session.id,
    extraction: {
      segments: [{ start, end: start + quote.length, quote, decisionIds: ['d1'] }],
      memory: { cards: [{ topic: '陈凡进屋', gist: '陈凡推门进来，屋里没有别人。', quote, salience: 4, entityIds: ['陈凡'] }] },
    },
  })
  assert.equal(result.ok, true)
  assert.equal(result.session.state, 'completed')
  assert.equal(result.effects.length, 2)

  const beat = JSON.parse(readFileSync(path.join(root, '.dsh-novel-beat', '书', 'book.json'), 'utf8'))
  assert.equal(beat.segments.length, 2)
  assert.equal(beat.revision, 42)
  assert.equal(beat.segments[1].chapter, 13)
  assert.equal(beat.segments[1].chars, quote.length)

  const fade = JSON.parse(readFileSync(path.join(root, '.dsh-novel-fade', '书', 'memory.json'), 'utf8'))
  assert.equal(fade.cards.length, 3)
  assert.equal(fade.meta.revision, 19)
  assert.equal(fade.meta.revisionAt, 3)

  const again = await finishChapter({ root, sessionId: session.id, extraction: {} })
  assert.equal(again.idempotent, true)
  const beatAgain = JSON.parse(readFileSync(path.join(root, '.dsh-novel-beat', '书', 'book.json'), 'utf8'))
  assert.equal(beatAgain.segments.length, 2, '重复 finish 不重复落账')

  const queried = await queryChapter({ root, sessionId: session.id })
  assert.equal(queried.session.state, 'completed')
  const resumed = await resumeChapter({ root, sessionId: session.id })
  assert.equal(resumed.recovery.status, 'completed')
})

test('finish：引文对不上正文时拒绝，不写任何账本', async () => {
  const root = workspace()
  const { session } = await startChapter({ root, book: '书', chapter: 13 })
  await writeChapter({ root, sessionId: session.id, text: draft })
  await assert.rejects(() => finishChapter({
    root,
    sessionId: session.id,
    extraction: { segments: [{ start: 0, end: 5, quote: '不存在的句子' }] },
  }), /找不到/)

  const beat = JSON.parse(readFileSync(path.join(root, '.dsh-novel-beat', '书', 'book.json'), 'utf8'))
  assert.equal(beat.segments.length, 1, '失败时账本不变')
})

test('finish：offset 不准则按唯一引文自动定位', async () => {
  const root = workspace()
  const { session } = await startChapter({ root, book: '书', chapter: 13 })
  await writeChapter({ root, sessionId: session.id, text: draft })
  const quote = '“你来了。”唐昊说。'
  const result = await finishChapter({
    root,
    sessionId: session.id,
    extraction: { segments: [{ start: 0, end: 1, quote }] },
  })
  assert.equal(result.ok, true)
  const beat = JSON.parse(readFileSync(path.join(root, '.dsh-novel-beat', '书', 'book.json'), 'utf8'))
  assert.equal(beat.segments[1].offsetStart, draft.indexOf(quote))
})
