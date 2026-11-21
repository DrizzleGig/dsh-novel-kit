// 一章完整流程验收（在本机临时工作区跑，不动真实账本）。
//
// 覆盖：plan → adopt → start → write（故意触发 verify 失败）→ 改写 → finish →
// query → resume → snapshot。每一步打印 PASS/FAIL 与证据，最后给出汇总。
//
// 运行：npm run acceptance
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { planChapter, decideProposal, startChapter, writeChapter, finishChapter, queryChapter, resumeChapter } from '../lib/engine/chapter.js'
import { collectSnapshot } from '../lib/host/snapshot.js'
import { updateMemoryCard } from '../lib/engine/memory.js'

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

function workspace() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-accept-'))
  const beat = path.join(root, '.dsh-novel-beat', '书')
  mkdirSync(beat, { recursive: true })
  writeFileSync(path.join(beat, 'book.json'), JSON.stringify({
    schemaVersion: 2, book: '书', meta: { title: '书' },
    chapters: { ch012: {} },
    decisions: [{ id: 'b12-1', chapter: 12, title: '旧决策', change: '旧值', status: 'committed' }],
    canon: [{ entity: '陈凡', key: '身份', value: '多出来的人' }],
    obligations: [{ id: 'o1', status: 'open', text: '还未交代的债' }],
    segments: [{ id: 's-1', chapter: 12 }],
    audit: [{ id: 'a-1' }], revisions: [], revision: 41,
  }, null, 2))
  const fade = path.join(root, '.dsh-novel-fade', '书')
  mkdirSync(fade, { recursive: true })
  writeFileSync(path.join(fade, 'memory.json'), JSON.stringify({
    schemaVersion: 3, book: '书', meta: { revision: 18, revisionAt: 2 },
    chapters: {}, cards: [{ id: 'c1', chapter: 12, gist: '前情', salience: 4 }],
    entities: {}, places: {}, threads: [{ id: 't1', status: 'open', text: '线索' }], povDistortions: [],
    audit: [{ id: 'a1' }, { id: 'a2' }],
  }, null, 2))
  const fic = path.join(root, '.dsh-novel-fanfic', 'douluo')
  mkdirSync(path.join(fic, 'canon'), { recursive: true })
  writeFileSync(path.join(fic, 'project.json'), JSON.stringify({
    id: 'douluo', title: '原著', sourceId: 'src_1', revision: 7, schemaVersion: 1,
    exports: { schemaVersion: 1, revision: 7, forbidden: ['手机'], addresses: [{ from: '唐昊', to: '唐三', form: '小三', fromChapter: 'ch001' }] },
  }, null, 2))
  writeFileSync(path.join(fic, 'canon', 'facts.json'), JSON.stringify([
    { id: 'f1', evidence: [{ chapter: 'ch001', quote: '他偷去了唐门内门的秘籍之后，跳崖明志，重生于此界。' }] },
  ], null, 2))
  writeFileSync(path.join(fic, 'canon', 'characters.json'), JSON.stringify([{ id: 'char_001', name: '唐三', aliases: ['小三'], role: '主角' }], null, 2))
  return root
}

const root = workspace()
const book = '书'

// 1) 计划与拍板
const planned = await planChapter({
  root, book, chapter: 13, intent: '雪夜出城',
  proposals: [{ id: 'p1', title: '出城方式', options: [{ label: '夜行', impact: '紧张' }, { label: '白天', impact: '稳' }] }],
})
check('plan 建立待拍板提案', planned.pending === 1, `pending=${planned.pending}`)
const adopted = await decideProposal({ root, sessionId: planned.session.id, proposalId: 'p1', action: 'adopt', option: '夜行' })
check('adopt 写入 beat 决策', adopted.written === true, `decision=${adopted.decision?.id}`)
const beatAfterAdopt = JSON.parse(readFileSync(path.join(root, '.dsh-novel-beat', book, 'book.json'), 'utf8'))
check('beat revision 增加 1', beatAfterAdopt.revision === 42, `rev=${beatAfterAdopt.revision}`)

// 2) 开始（四段上下文）
const started = await startChapter({ root, book, chapter: 13, requiredCapabilities: ['beat', 'fade', 'fanfic'] })
const segments = Object.fromEntries(started.context.segments.map((segment) => [segment.component, segment.available]))
check('start 装配四段（beat/fade/fanfic 可用）', started.ok && segments.beat && segments.fade && segments.fanfic, JSON.stringify(segments))
check('上下文有拍板与称呼', /本章已拍板/.test(started.context.segments[0].markdown) && /称呼/.test(started.context.segments[1].markdown), `总 ${started.context.chars} 字`)

// 3) 故意写错：禁忌词 → verify 失败且不落账
const sessionId = started.session.id
await writeChapter({ root, sessionId, text: '陈凡掏出手机看了一眼，然后跟着唐昊出城。' })
const failed = await finishChapter({ root, sessionId, extraction: { segments: [{ quote: '陈凡掏出手机' }] } })
check('禁忌词触发 verify-failed', failed.ok === false && failed.code === 'verify-failed', failed.findings?.map((item) => item.code).join(','))
const beatAfterFail = JSON.parse(readFileSync(path.join(root, '.dsh-novel-beat', book, 'book.json'), 'utf8'))
check('verify 失败时不落段落', beatAfterFail.segments.length === 1, `segments=${beatAfterFail.segments.length}`)

// 4) 改写后收尾
const good = '陈凡推门进来，屋里没有别人。\n\n“小三，走吧。”唐昊说。\n\n他把令牌放在桌上，没有解释。'
await writeChapter({ root, sessionId, text: good })
const quote = '他把令牌放在桌上，没有解释。'
const done = await finishChapter({
  root, sessionId,
  extraction: {
    segments: [{ quote, decisionIds: [] }],
    memory: { cards: [{ topic: '令牌', gist: '唐昊留下令牌', quote, salience: 4, entityIds: ['唐昊'] }] },
  },
})
check('finish 完成并返回回执', done.ok === true && done.session.state === 'completed' && Boolean(done.receipt), `tx=${done.receipt?.txId}`)
const beatAfter = JSON.parse(readFileSync(path.join(root, '.dsh-novel-beat', book, 'book.json'), 'utf8'))
const fadeAfter = JSON.parse(readFileSync(path.join(root, '.dsh-novel-fade', book, 'memory.json'), 'utf8'))
check('beat 段落 +1', beatAfter.segments.length === 2, `segments=${beatAfter.segments.length}`)
check('fade 卡 +1 且 revision +1', fadeAfter.cards.length === 2 && fadeAfter.meta.revision === 19, `cards=${fadeAfter.cards.length} rev=${fadeAfter.meta.revision}`)

// 5) 查询 / 恢复 / 快照
const queried = await queryChapter({ root, sessionId })
check('query 读到 completed', queried.session.state === 'completed')
const resumed = await resumeChapter({ root, sessionId })
check('resume 事务状态 completed', resumed.recovery?.status === 'completed', JSON.stringify(resumed.recovery))
const snapshot = await collectSnapshot({ root, book })
check('快照给出会话/四段/账本', snapshot.session?.state === 'completed' && snapshot.contexts.length === 4 && snapshot.ledgers.beat.segments === 2, `beat rev=${snapshot.ledgers.beat.revision}`)

// 6) 记忆钉卡
const pinned = await updateMemoryCard({ root, book, cardId: 'c1', action: 'pin' })
check('钉卡写 fade 账本', pinned.ok === true && pinned.revision === 20, `rev=${pinned.revision}`)

const passed = results.filter((item) => item.ok).length
console.log(`\n${passed}/${results.length} 项通过`)
if (passed !== results.length) process.exitCode = 1
