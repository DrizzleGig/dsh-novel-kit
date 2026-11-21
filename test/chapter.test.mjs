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

test('finish：写正文期间账本被外部修改 → context_stale，不落账', async () => {
  const root = workspace()
  const { session } = await startChapter({ root, book: '书', chapter: 13 })
  await writeChapter({ root, sessionId: session.id, text: draft })

  // 模拟另一路写入：fade 新增一张卡并抬高 revision
  const fadeFile = path.join(root, '.dsh-novel-fade', '书', 'memory.json')
  const memory = JSON.parse(readFileSync(fadeFile, 'utf8'))
  memory.cards.push({ id: 'external', chapter: 12, gist: '别处写的卡', salience: 3 })
  memory.meta.revision += 1
  writeFileSync(fadeFile, JSON.stringify(memory, null, 2))

  const quote = '陈凡推门进来，屋里没有别人。'
  const result = await finishChapter({
    root,
    sessionId: session.id,
    extraction: { segments: [{ start: 0, end: quote.length, quote }] },
  })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'context_stale')
  assert.equal(result.session.state, 'blocked')

  const beat = JSON.parse(readFileSync(path.join(root, '.dsh-novel-beat', '书', 'book.json'), 'utf8'))
  assert.equal(beat.segments.length, 1, '中文：冲突时不写 beat 账本')
})

test('start：四本账齐备时四段上下文都可用（beat/fanfic/fade/voice）', async () => {
  const root = workspace()
  // 补 voice 书库与同人项目（名字故意与 beat 书名不同，验证 binding 解析）
  const voiceDir = path.join(root, '.dsh-novel-voice', '斗罗大陆')
  mkdirSync(voiceDir, { recursive: true })
  writeFileSync(path.join(voiceDir, 'library.json'), JSON.stringify({
    schemaVersion: 1, book: '斗罗大陆', works: [{ workId: 'w1', title: '原著', chapters: 10, chars: 1000, status: 'measured' }],
  }, null, 2))
  const ficDir = path.join(root, '.dsh-novel-fanfic', 'douluo')
  mkdirSync(ficDir, { recursive: true })
  writeFileSync(path.join(ficDir, 'project.json'), JSON.stringify({
    id: 'douluo', title: '原著', sourceId: 'src_1', revision: 7, schemaVersion: 1,
    exports: { schemaVersion: 1, revision: 7, forbidden: [], addresses: [{ from: 'A', to: 'B', form: 'B哥', fromChapter: 'ch001' }] },
  }, null, 2))

  const started = await startChapter({ root, book: '书', chapter: 13, requiredCapabilities: ['beat', 'fade', 'voice', 'fanfic'] })
  assert.equal(started.ok, true)
  const available = Object.fromEntries(started.context.segments.map((segment) => [segment.component, segment.available]))
  assert.deepEqual(available, { beat: true, fanfic: true, fade: true, voice: true })
  assert.match(started.context.segments[1].markdown, /称呼/)
  assert.match(started.context.segments[3].markdown, /文风档案/)
  assert.equal(started.session.binding.voiceLibrary, '斗罗大陆')
  assert.equal(started.session.binding.fanficProject, 'douluo')
})

test('finish：fanfic 禁忌词命中时 verify-failed，不落账', async () => {
  const root = workspace()
  const ficDir = path.join(root, '.dsh-novel-fanfic', 'douluo')
  mkdirSync(ficDir, { recursive: true })
  writeFileSync(path.join(ficDir, 'project.json'), JSON.stringify({
    id: 'douluo', title: '原著', sourceId: 'src_1', revision: 7, schemaVersion: 1,
    exports: { schemaVersion: 1, revision: 7, forbidden: ['手机'], addresses: [] },
  }, null, 2))

  const { session } = await startChapter({ root, book: '书', chapter: 13 })
  const badDraft = '陈凡掏出手机看了眼时间。'
  await writeChapter({ root, sessionId: session.id, text: badDraft })
  const result = await finishChapter({
    root,
    sessionId: session.id,
    extraction: { segments: [{ start: 0, end: 6, quote: '陈凡掏出手机' }] },
  })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'verify-failed')
  assert.equal(result.findings[0].code, 'forbidden')

  const beat = JSON.parse(readFileSync(path.join(root, '.dsh-novel-beat', '书', 'book.json'), 'utf8'))
  assert.equal(beat.segments.length, 1, 'verify 失败时账本不变')
})
