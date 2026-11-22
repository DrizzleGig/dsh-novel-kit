// S1：章节引擎最小闭环（start → write → finish）与可恢复事务。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { startChapter, writeChapter, readDraft, finishChapter, queryChapter, resumeChapter, planChapter, decideProposal, reviseDecision, chapterHistory } from '../lib/engine/chapter.js'
import { writeProjectSettings } from '../lib/engine/settings.js'
import { loadSession, saveSession } from '../lib/engine/session-store.js'
import { worldContractFile } from '../lib/engine/canon.js'
import { writeJsonAtomic } from '../lib/storage/atomic-json.js'

async function fanficMode(root, book = '书') {
  await writeProjectSettings(root, book, { mode: 'fanfic' })
}

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
  assert.equal(result.effects.length, 3, '正文 + beat + fade 同一事务')
  assert.ok(result.chapterFile && result.chapterFile.endsWith('.md'))
  assert.match(readFileSync(result.chapterFile, 'utf8'), /陈凡推门进来/)

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

  await fanficMode(root)
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

  await fanficMode(root)
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

test('decideProposal：adopt 写 beat 决策并清空待拍板；重复幂等', async () => {
  const root = workspace()
  const planned = await planChapter({
    root, book: '书', chapter: 13, intent: '雪夜出城',
    proposals: [{ id: 'p1', title: '出城方式', options: [{ label: '夜行', impact: '紧张' }, { label: '白天', impact: '稳' }] }],
  })
  const sessionId = planned.session.id
  const beatFile = path.join(root, '.dsh-novel-beat', '书', 'book.json')
  const before = JSON.parse(readFileSync(beatFile, 'utf8'))

  const adopted = await decideProposal({ root, sessionId, proposalId: 'p1', action: 'adopt', option: '夜行' })
  assert.equal(adopted.ok, true)
  assert.equal(adopted.written, true)
  const after = JSON.parse(readFileSync(beatFile, 'utf8'))
  assert.equal(after.decisions.length, before.decisions.length + 1)
  assert.equal(after.decisions.at(-1).change, '紧张')
  assert.equal(after.decisions.at(-1).source, 'kit')
  assert.equal(after.revision, before.revision + 1)

  const again = await decideProposal({ root, sessionId, proposalId: 'p1', action: 'adopt', option: '夜行' })
  assert.equal(again.idempotent, true)
  const after2 = JSON.parse(readFileSync(beatFile, 'utf8'))
  assert.equal(after2.decisions.length, after.decisions.length)
})

test('decideProposal：有选项却没给 option 时拒绝；reject 不写账本', async () => {
  const root = workspace()
  const planned = await planChapter({
    root, book: '书', chapter: 13,
    proposals: [{ id: 'p1', title: '出城方式', options: [{ label: '夜行', impact: '紧张' }, { label: '白天', impact: '稳' }] }],
  })
  const sessionId = planned.session.id
  const needOption = await decideProposal({ root, sessionId, proposalId: 'p1', action: 'adopt' })
  assert.equal(needOption.ok, false)
  assert.equal(needOption.code, 'option-required')

  const beatFile = path.join(root, '.dsh-novel-beat', '书', 'book.json')
  const before = JSON.parse(readFileSync(beatFile, 'utf8'))
  const rejected = await decideProposal({ root, sessionId, proposalId: 'p1', action: 'reject' })
  assert.equal(rejected.ok, true)
  assert.equal(rejected.written, false)
  const after = JSON.parse(readFileSync(beatFile, 'utf8'))
  assert.equal(after.decisions.length, before.decisions.length)
  assert.equal(after.revision, before.revision)
})

test('finish：正文连续 20 字与原著证据相同 → verify-failed（copy），不落账', async () => {
  const root = workspace()
  const ficDir = path.join(root, '.dsh-novel-fanfic', 'douluo')
  mkdirSync(path.join(ficDir, 'canon'), { recursive: true })
  writeFileSync(path.join(ficDir, 'project.json'), JSON.stringify({
    id: 'douluo', title: '原著', sourceId: 'src_1', revision: 7, schemaVersion: 1,
    exports: { schemaVersion: 1, revision: 7, forbidden: [], addresses: [] },
  }, null, 2))
  const quote = '他偷去了唐门内门的秘籍之后，跳崖明志，重生于此界。'
  writeFileSync(path.join(ficDir, 'canon', 'facts.json'), JSON.stringify([
    { id: 'f1', evidence: [{ chapter: 'ch001', quote }] },
  ], null, 2))

  await fanficMode(root)
  const { session } = await startChapter({ root, book: '书', chapter: 13 })
  const copied = '那一夜，' + quote.slice(0, 22) + '。'
  await writeChapter({ root, sessionId: session.id, text: copied })
  const result = await finishChapter({
    root,
    sessionId: session.id,
    extraction: { segments: [{ quote: copied.slice(0, 6) }] },
  })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'verify-failed')
  assert.equal(result.findings[0].code, 'copy')
  const beat = JSON.parse(readFileSync(path.join(root, '.dsh-novel-beat', '书', 'book.json'), 'utf8'))
  assert.equal(beat.segments.length, 1)
})

test('start：拍板之后再 start 会刷新上下文，finish 不再误判 context_stale', async () => {
  const root = workspace()
  const planned = await planChapter({
    root, book: '书', chapter: 13,
    proposals: [{ id: 'p1', title: '出城方式', options: [{ label: '夜行', impact: '紧张' }] }],
  })
  await decideProposal({ root, sessionId: planned.session.id, proposalId: 'p1', action: 'adopt', option: '夜行' })

  const started = await startChapter({ root, book: '书', chapter: 13 })
  assert.equal(started.resumed, true)
  assert.match(started.context.segments[0].markdown, /本章已拍板/)

  await writeChapter({ root, sessionId: started.session.id, text: draft })
  const quote = '陈凡推门进来，屋里没有别人。'
  const done = await finishChapter({
    root,
    sessionId: started.session.id,
    extraction: { segments: [{ quote }] },
  })
  assert.equal(done.ok, true)
  assert.equal(done.session.state, 'completed')
})

test('queryChapter：view=conflicts 找出 beat canon 与同人原著的同键不同值', async () => {
  const root = workspace()
  const ficDir = path.join(root, '.dsh-novel-fanfic', 'douluo')
  mkdirSync(path.join(ficDir, 'canon'), { recursive: true })
  writeFileSync(path.join(ficDir, 'project.json'), JSON.stringify({
    id: 'douluo', title: '原著', sourceId: 'src_1', revision: 7, schemaVersion: 1,
    exports: { schemaVersion: 1, revision: 7, forbidden: [], addresses: [] },
  }, null, 2))
  writeFileSync(path.join(ficDir, 'canon', 'facts.json'), JSON.stringify([
    { id: 'f1', subjectName: '陈凡', predicate: '身份', object: '穿越者', chapter: 'ch001', status: 'confirmed', evidence: [{ quote: '他是穿越者' }] },
  ], null, 2))

  const result = await queryChapter({ root, book: '书', view: 'conflicts' })
  assert.equal(result.ok, true)
  assert.equal(result.total, 1)
  assert.equal(result.conflicts[0].entity, '陈凡')
  assert.equal(result.conflicts[0].beat.value, '多出来的人')
  assert.equal(result.conflicts[0].fanfic.value, '穿越者')
})

test('strict：只检查声明过的能力——没声明 fanfic 就不跑同人检查', async () => {
  const root = workspace()
  const ficDir = path.join(root, '.dsh-novel-fanfic', 'douluo')
  mkdirSync(ficDir, { recursive: true })
  writeFileSync(path.join(ficDir, 'project.json'), JSON.stringify({
    id: 'douluo', title: '原著', sourceId: 'src_1', revision: 7, schemaVersion: 1,
    exports: { schemaVersion: 1, revision: 7, forbidden: ['手机'], addresses: [] },
  }, null, 2))

  const started = await startChapter({ root, book: '书', chapter: 13, requiredCapabilities: ['beat', 'fade'], strict: true })
  assert.equal(started.session.strict, true)
  const text = '陈凡掏出手机看了一眼时间。'
  await writeChapter({ root, sessionId: started.session.id, text })
  const done = await finishChapter({
    root,
    sessionId: started.session.id,
    extraction: { segments: [{ quote: '陈凡掏出手机' }] },
  })
  assert.equal(done.ok, true, 'strict 模式不因 fanfic 禁忌卡住')
  assert.equal(done.session.state, 'completed')
})

test('非 strict：同样的稿子会被同人检查拦住', async () => {
  const root = workspace()
  const ficDir = path.join(root, '.dsh-novel-fanfic', 'douluo')
  mkdirSync(ficDir, { recursive: true })
  writeFileSync(path.join(ficDir, 'project.json'), JSON.stringify({
    id: 'douluo', title: '原著', sourceId: 'src_1', revision: 7, schemaVersion: 1,
    exports: { schemaVersion: 1, revision: 7, forbidden: ['手机'], addresses: [] },
  }, null, 2))

  await fanficMode(root)
  const { session } = await startChapter({ root, book: '书', chapter: 13 })
  await writeChapter({ root, sessionId: session.id, text: '陈凡掏出手机看了一眼时间。' })
  const done = await finishChapter({ root, sessionId: session.id, extraction: { segments: [{ quote: '陈凡掏出手机' }] } })
  assert.equal(done.ok, false)
  assert.equal(done.code, 'verify-failed')
})

test('resume：context_stale 后重新装配上下文并回到 writing，再 finish 成功', async () => {
  const root = workspace()
  const { session } = await startChapter({ root, book: '书', chapter: 13 })
  await writeChapter({ root, sessionId: session.id, text: draft })

  // 外部改 fade，让指纹失效
  const fadeFile = path.join(root, '.dsh-novel-fade', '书', 'memory.json')
  const memory = JSON.parse(readFileSync(fadeFile, 'utf8'))
  memory.cards.push({ id: 'external', chapter: 12, gist: '外部写入', salience: 3 })
  memory.meta.revision += 1
  writeFileSync(fadeFile, JSON.stringify(memory, null, 2))

  const stale = await finishChapter({ root, sessionId: session.id, extraction: { segments: [{ quote: '陈凡推门进来，屋里没有别人。' }] } })
  assert.equal(stale.code, 'context_stale')
  assert.equal(stale.session.state, 'blocked')

  const resumed = await resumeChapter({ root, sessionId: session.id })
  assert.equal(resumed.refreshed.state, 'writing')
  assert.equal(resumed.session.state, 'writing')

  const quote = '陈凡推门进来，屋里没有别人。'
  const done = await finishChapter({ root, sessionId: session.id, extraction: { segments: [{ quote }] } })
  assert.equal(done.ok, true)
  assert.equal(done.session.state, 'completed')
})

test('queryChapter：memory / style / canon / ledgers 四个只读视图', async () => {
  const root = workspace()
  const ficDir = path.join(root, '.dsh-novel-fanfic', 'douluo')
  mkdirSync(path.join(ficDir, 'canon'), { recursive: true })
  writeFileSync(path.join(ficDir, 'project.json'), JSON.stringify({
    id: 'douluo', title: '原著', sourceId: 'src_1', revision: 7, schemaVersion: 1,
    exports: { schemaVersion: 1, revision: 7, forbidden: [], addresses: [] },
  }, null, 2))
  writeFileSync(path.join(ficDir, 'canon', 'characters.json'), JSON.stringify([{ id: 'c1', name: '唐三' }], null, 2))

  const ledgers = await queryChapter({ root, book: '书', view: 'ledgers' })
  assert.equal(ledgers.ledgers.beat.revision, 41)
  assert.equal(ledgers.ledgers.fade.cards, 2)

  const memory = await queryChapter({ root, book: '书', view: 'memory', query: '陈凡' })
  assert.equal(memory.hits.length, 1)

  const style = await queryChapter({ root, book: '书', view: 'style' })
  assert.equal(style.available, false, '没有 voice 书库')

  const canon = await queryChapter({ root, book: '书', view: 'canon' })
  assert.equal(canon.available, true)
  assert.equal(canon.characters.length, 1)
})

test('finish：正文落盘到 正文/第N章.md，同章重复收尾不产生副本', async () => {
  const root = workspace()
  const { session } = await startChapter({ root, book: '书', chapter: 13 })
  await writeChapter({ root, sessionId: session.id, text: draft })
  const quote = '陈凡推门进来，屋里没有别人。'
  const done = await finishChapter({ root, sessionId: session.id, extraction: { segments: [{ quote }] } })
  assert.equal(done.ok, true)
  assert.ok(done.chapterFile, 'returns chapter file path')
  const saved = readFileSync(done.chapterFile, 'utf8')
  assert.match(saved, /陈凡推门进来/)

  const again = await finishChapter({ root, sessionId: session.id, extraction: { segments: [{ quote }] } })
  assert.equal(again.idempotent, true)
  const files = readdirSync(path.dirname(done.chapterFile)).filter((name) => name.startsWith('第13章'))
  assert.equal(files.length, 1, '同章只有一个文件')
})

test('指纹按内容：同 revision、同长度的账本改动也会 context_stale', async () => {
  const root = workspace()
  const { session } = await startChapter({ root, book: '书', chapter: 13 })
  await writeChapter({ root, sessionId: session.id, text: draft })

  const beatFile = path.join(root, '.dsh-novel-beat', '书', 'book.json')
  const beat = JSON.parse(readFileSync(beatFile, 'utf8'))
  beat.canon[0].value = beat.canon[0].value.replace('多出来', '少出来')
  writeFileSync(beatFile, JSON.stringify(beat, null, 2))

  const result = await finishChapter({ root, sessionId: session.id, extraction: { segments: [{ quote: '陈凡推门进来，屋里没有别人。' }] } })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'context_stale')
})

test('损坏的 beat 账本报 ledger-corrupt，而不是「缺少能力」', async () => {
  const root = workspace()
  writeFileSync(path.join(root, '.dsh-novel-beat', '书', 'book.json'), '{ broken json')
  await assert.rejects(
    () => startChapter({ root, book: '书', chapter: 13 }),
    /ledger-corrupt/,
  )
})

test('planChapter：文风档案给决策提示与候选标注，但不替作者选', async () => {
  const root = workspace()
  const profileId = 'sty_aaaaaaaaaaaaaaaa'
  const styleDir = path.join(root, '.dsh-novel-kit', 'styles')
  mkdirSync(styleDir, { recursive: true })
  writeFileSync(path.join(styleDir, `${profileId}.json`), JSON.stringify({
    schemaVersion: 1,
    id: profileId,
    name: '克制样本',
    version: 1,
    status: 'provisional',
    sourceRef: { kind: 'style', sourceId: 'a'.repeat(64), sha256: 'a'.repeat(64) },
    identity: { summary: '冷叙述', keywords: [], avoid: ['手机'] },
    bands: {},
    rules: [{ id: 'r1', text: '关键事实延迟揭示' }],
    anchors: [],
    decisionPolicy: { restraint: 'high', revealPace: 'slow' },
    revision: 1,
  }, null, 2))
  await writeProjectSettings(root, '书', { activeStyleProfileIds: [profileId] })

  const planned = await planChapter({
    root, book: '书', chapter: 14, intent: '重逢',
    proposals: [{
      id: 'p1', title: '要不要现在说破',
      options: [
        { label: '直接说破', impact: '公开秘密' },
        { label: '沉默，留白', impact: '旁敲侧击' },
      ],
    }],
  })
  assert.equal(planned.ok, true)
  assert.match(planned.styleHint, /克制=high/)
  const options = planned.session.plan.proposals[0].options
  assert.equal(options[0].styleFit, 'low')
  assert.match(options[0].styleWhy, /揭示太快/)
  assert.equal(options[1].styleFit, 'high')
  assert.match(options[1].styleWhy, /克制/)
})

test('startChapter：kit 文风档案进入文风段，且仍受 600 字预算', async () => {  const root = workspace()
  const profileId = 'sty_bbbbbbbbbbbbbbbb'
  const styleDir = path.join(root, '.dsh-novel-kit', 'styles')
  mkdirSync(styleDir, { recursive: true })
  writeFileSync(path.join(styleDir, `${profileId}.json`), JSON.stringify({
    schemaVersion: 1,
    id: profileId,
    name: '样本',
    version: 1,
    status: 'provisional',
    sourceRef: { kind: 'style', sourceId: 'b'.repeat(64), sha256: 'b'.repeat(64) },
    identity: { summary: '冷叙述，少解释。', keywords: [], avoid: [] },
    bands: { sentenceMean: { band: [14, 22], n: 10 } },
    rules: [{ id: 'r1', text: '关键事实延迟揭示' }],
    anchors: [],
    decisionPolicy: { revealPace: 'slow' },
    revision: 1,
  }, null, 2))
  await writeProjectSettings(root, '书', { activeStyleProfileIds: [profileId] })

  const started = await startChapter({ root, book: '书', chapter: 15 })
  assert.equal(started.ok, true)
  const voice = started.context.segments.find((segment) => segment.component === 'voice')
  assert.equal(voice.source, 'kit-style')
  assert.equal(voice.available, true)
  assert.match(voice.markdown, /关键事实延迟揭示/)
  assert.ok(voice.chars <= 600)
})

test('同人模式：kit canon 契约进入世界段；无契约拒绝开写', async () => {
  const root = workspace()
  const sourceId = 'c'.repeat(64)
  await writeProjectSettings(root, '书', { mode: 'fanfic', activeCanonSourceId: sourceId })

  const blocked = await startChapter({ root, book: '书', chapter: 16 })
  assert.equal(blocked.ok, false)
  assert.equal(blocked.code, 'canon-not-ready')

  await writeJsonAtomic(worldContractFile(root, '书', sourceId), {
    schemaVersion: 1,
    book: '书',
    sourceId,
    title: '原著',
    status: 'confirmed',
    facts: [{ id: 'f1', entity: '唐昊', key: '身份', value: '封号斗罗' }],
    characters: [{ name: '唐昊', role: '父亲' }, { name: '陈凡', aliases: ['小凡'] }],
    relationships: [],
    addresses: [{ from: '唐昊', to: '陈凡', form: '小凡', fromChapter: 'ch001' }],
    secrets: [{ id: 's1', what: '唐昊的真实身份', publicAtChapter: 20 }],
    worldRules: ['封港后不能点灯'],
    timeline: [],
    forbidden: ['手机'],
    revision: 1,
  }, { ensureDir: true })

  const started = await startChapter({ root, book: '书', chapter: 16 })
  assert.equal(started.ok, true)
  const fan = started.context.segments.find((segment) => segment.component === 'fanfic')
  assert.equal(fan.available, true)
  assert.match(fan.markdown, /世界规则/)
  assert.match(fan.markdown, /封港后不能点灯/)
  assert.match(fan.markdown, /唐昊/)
  assert.match(fan.markdown, /封号斗罗/)
  assert.match(fan.markdown, /小凡/)
})

test('同人模式：空 legacy 项目目录不算 canon 就绪', async () => {
  const root = workspace()
  mkdirSync(path.join(root, '.dsh-novel-fanfic', 'empty'), { recursive: true })
  await writeProjectSettings(root, '书', { mode: 'fanfic' })
  const started = await startChapter({ root, book: '书', chapter: 18 })
  assert.equal(started.ok, false)
  assert.equal(started.code, 'canon-required')
})

test('原创模式：旧同人证据不参与 finish 检查', async () => {
  const root = workspace()
  const ficDir = path.join(root, '.dsh-novel-fanfic', 'douluo')
  mkdirSync(path.join(ficDir, 'canon'), { recursive: true })
  writeFileSync(path.join(ficDir, 'project.json'), JSON.stringify({
    id: 'douluo', title: '原著', sourceId: 'src_1', revision: 7, schemaVersion: 1,
    exports: { schemaVersion: 1, revision: 7, forbidden: ['手机'], addresses: [] },
  }, null, 2))
  const quote = '他偷去了唐门内门的秘籍之后，跳崖明志，重生于此界。'
  writeFileSync(path.join(ficDir, 'canon', 'facts.json'), JSON.stringify([{ id: 'f1', evidence: [{ chapter: 'ch001', quote }] }], null, 2))

  const { session } = await startChapter({ root, book: '书', chapter: 19 })
  await writeChapter({ root, sessionId: session.id, text: '陈凡推门进来。屋里没有别人，手机也不在。' })
  const done = await finishChapter({ root, sessionId: session.id, extraction: { segments: [{ quote: '陈凡推门进来' }] } })
  assert.equal(done.ok, true, '原创模式不因旧同人禁忌/复制/名字被拦')
})

test('readDraft/saveDraft：完整 8000 字、expectedVersion/hash CAS、并发冲突', async () => {
  const root = workspace()
  const { session } = await startChapter({ root, book: '书', chapter: 21 })
  const big = '字'.repeat(8000)
  const first = await writeChapter({ root, sessionId: session.id, text: big })
  assert.equal(first.ok, true)
  const read = await readDraft({ root, sessionId: session.id })
  assert.equal(read.ok, true)
  assert.equal(read.draft.chars, 8000, '不截断')
  assert.equal(read.draft.text.length, 8000)

  const wrong = await writeChapter({ root, sessionId: session.id, text: '短稿', expectedVersion: 0, expectedDraftHash: 'deadbeef' })
  assert.equal(wrong.ok, false)
  assert.equal(wrong.code, 'draft-conflict')
  assert.equal(wrong.current.version, 1)

  const conflictA = writeChapter({ root, sessionId: session.id, text: '并发 A', expectedVersion: read.draft.version, expectedDraftHash: read.draft.hash })
  const conflictB = writeChapter({ root, sessionId: session.id, text: '并发 B', expectedVersion: read.draft.version, expectedDraftHash: read.draft.hash })
  const [a, b] = await Promise.all([conflictA, conflictB])
  const okCount = [a, b].filter((item) => item.ok).length
  const conflictCount = [a, b].filter((item) => item.code === 'draft-conflict').length
  assert.equal(okCount, 1)
  assert.equal(conflictCount, 1)
})

test('finish 事务不把合法 JSON 正文重新序列化', async () => {
  const root = workspace()
  const { session } = await startChapter({ root, book: '书', chapter: 33 })
  const text = '"hello"'
  await writeChapter({ root, sessionId: session.id, text })
  const finished = await finishChapter({
    root, sessionId: session.id,
    extraction: { segments: [{ quote: text }], memory: { cards: [{ gist: text, quote: text, salience: 2 }] } },
  })
  assert.equal(finished.ok, true)
  assert.equal(readFileSync(finished.chapterFile, 'utf8'), text)
})

test('finish 恢复：事务已完成但会话未保存时，从回执补齐 receipt/chapterFile', async () => {
  const root = workspace()
  const { session } = await startChapter({ root, book: '书', chapter: 34 })
  const text = '陈凡把令牌放在桌上。'
  await writeChapter({ root, sessionId: session.id, text })
  const finished = await finishChapter({
    root, sessionId: session.id,
    extraction: { segments: [{ quote: text }], memory: { cards: [{ gist: text, quote: text, salience: 2 }] } },
  })
  assert.equal(finished.ok, true)
  const broken = await loadSession(root, session.id)
  broken.state = 'committing'
  broken.receipt = null
  broken.receiptIds = []
  broken.chapterFile = null
  await saveSession(root, broken)

  const recovered = await finishChapter({ root, sessionId: session.id, extraction: {} })
  assert.equal(recovered.ok, true)
  assert.equal(recovered.recovered, true)
  assert.equal(recovered.session.state, 'completed')
  assert.equal(recovered.receipt.txId, finished.receipt.txId)
  assert.match(recovered.session.chapterFile, /第34章/)
})

test('decision 重试：beat 已落账但会话保存失败时按提案 id 找回，不重复写', async () => {
  const root = workspace()
  const planned = await planChapter({
    root, book: '书', chapter: 32,
    proposals: [{ id: 'p-retry', title: '谁去', options: [{ label: '夜行', impact: '紧张' }] }],
  })
  await decideProposal({ root, sessionId: planned.session.id, proposalId: 'p-retry', action: 'adopt', option: '夜行' })
  const session = await loadSession(root, planned.session.id)
  const proposal = session.plan.proposals.find((item) => item.id === 'p-retry')
  proposal.status = 'pending'
  session.pendingDecisionIds = ['p-retry']
  await saveSession(root, session)

  const again = await decideProposal({ root, sessionId: planned.session.id, proposalId: 'p-retry', action: 'adopt', option: '夜行' })
  assert.equal(again.ok, true)
  assert.equal(again.recovered, true)
  const beat = JSON.parse(readFileSync(path.join(root, '.dsh-novel-beat', '书', 'book.json'), 'utf8'))
  assert.equal(beat.decisions.filter((item) => item.proposalId === 'p-retry').length, 1)
})

test('reviseDecision：追加改选与重写工单，旧决策保留，重复调用幂等', async () => {
  const root = workspace()
  const planned = await planChapter({
    root, book: '书', chapter: 35,
    proposals: [{ id: 'p-rev', title: '走哪条路', options: [{ label: '官道', impact: '快' }] }],
  })
  await decideProposal({ root, sessionId: planned.session.id, proposalId: 'p-rev', action: 'adopt', option: '官道' })
  const beatBefore = JSON.parse(readFileSync(path.join(root, '.dsh-novel-beat', '书', 'book.json'), 'utf8'))
  const old = beatBefore.decisions.find((item) => item.proposalId === 'p-rev')
  const revised = await reviseDecision({ root, book: '书', decisionId: old.id, newOption: '山路', note: '避开追兵' })
  assert.equal(revised.ok, true)
  assert.match(revised.workOrder, /山路/)
  const beatAfter = JSON.parse(readFileSync(path.join(root, '.dsh-novel-beat', '书', 'book.json'), 'utf8'))
  assert.equal(beatAfter.decisions.length, beatBefore.decisions.length + 1)
  assert.equal(beatAfter.decisions[beatAfter.decisions.length - 1].kind, '改选')
  assert.equal(beatAfter.decisions[beatAfter.decisions.length - 1].supersedes, old.id)
  const again = await reviseDecision({ root, book: '书', decisionId: old.id, newOption: '山路' })
  assert.equal(again.idempotent, true)
})

test('finish 与 write 共用会话锁：不会把已保存的新稿回退成旧稿', async () => {
  const root = workspace()
  const { session } = await startChapter({ root, book: '书', chapter: 31 })
  const oldText = '旧稿：陈凡把令牌放在桌上。'
  await writeChapter({ root, sessionId: session.id, text: oldText })
  const quote = '陈凡把令牌放在桌上。'
  const finishing = finishChapter({
    root, sessionId: session.id,
    extraction: { segments: [{ quote }], memory: { cards: [{ gist: quote, quote, salience: 3 }] } },
  })
  const writing = writeChapter({ root, sessionId: session.id, text: '新稿：陈凡把令牌收进怀里。' })
  const [finishResult, writeResult] = await Promise.allSettled([finishing, writing])
  assert.equal(finishResult.status, 'fulfilled')
  assert.equal(finishResult.value.ok, true)
  const body = readFileSync(finishResult.value.chapterFile, 'utf8')
  if (writeResult.status === 'fulfilled') {
    assert.match(body, /新稿/, '写入成功时正文必须是新稿')
  } else {
    assert.match(body, /旧稿/, '写入被完成态拒绝时正文保持旧稿')
  }
})

test('作者拍板不能被 write 绕过：有 pending 提案时 finish 拒绝', async () => {
  const root = workspace()
  const planned = await planChapter({
    root, book: '书', chapter: 17,
    proposals: [{ id: 'p1', title: '谁去', options: [{ label: '夜行', impact: '紧张' }] }],
  })
  const sessionId = planned.session.id
  await writeChapter({ root, sessionId, text: '陈凡推门进来，屋里没有别人。' })
  const blocked = await finishChapter({ root, sessionId, extraction: { segments: [{ quote: '陈凡推门进来' }] } })
  assert.equal(blocked.ok, false)
  assert.equal(blocked.code, 'awaiting_author')
  assert.equal(blocked.session.state, 'awaiting_author')

  await decideProposal({ root, sessionId, proposalId: 'p1', action: 'adopt', option: '夜行' })
  await startChapter({ root, book: '书', chapter: 17 })
  const done = await finishChapter({ root, sessionId, extraction: { segments: [{ quote: '陈凡推门进来' }] } })
  assert.equal(done.ok, true)
  assert.equal(done.session.state, 'completed')
})

test('resume：同人切回原创后不再返回旧 canon 上下文', async () => {
  const root = workspace()
  const ficDir = path.join(root, '.dsh-novel-fanfic', 'douluo')
  mkdirSync(ficDir, { recursive: true })
  writeFileSync(path.join(ficDir, 'project.json'), JSON.stringify({
    id: 'douluo', title: '原著', sourceId: 'src_1', revision: 7, schemaVersion: 1,
    exports: { schemaVersion: 1, revision: 7, forbidden: [], addresses: [{ from: 'A', to: 'B', form: 'B哥', fromChapter: 'ch001' }] },
  }, null, 2))
  await fanficMode(root)
  const started = await startChapter({ root, book: '书', chapter: 20 })
  assert.equal(started.ok, true)
  assert.equal(started.session.mode, 'fanfic')

  await writeProjectSettings(root, '书', { mode: 'original' })
  const resumed = await resumeChapter({ root, sessionId: started.session.id })
  assert.equal(resumed.ok, true)
  assert.equal(resumed.session.mode, 'original')
  const fan = resumed.session.context.segments.find((segment) => segment.component === 'fanfic')
  assert.equal(fan.available, false)
})

test('chapterHistory：两章收尾后按章号倒序列出，带字数与状态', async () => {
  const root = workspace()
  for (const chapter of [13, 14]) {
    const started = await startChapter({ root, book: '书', chapter })
    await writeChapter({ root, sessionId: started.session.id, text: draft })
    const done = await finishChapter({ root, sessionId: started.session.id, extraction: { segments: [{ quote: '陈凡推门进来，屋里没有别人。' }] } })
    assert.equal(done.ok, true)
  }
  const history = await chapterHistory({ root, book: '书' })
  assert.equal(history.total, 2)
  assert.deepEqual(history.chapters.map((item) => item.chapter), [14, 13])
  assert.equal(history.chapters[0].state, 'completed')
  assert.ok(history.chapters[0].chars > 0)
  assert.ok(history.chapters[0].chapterFile)
})
