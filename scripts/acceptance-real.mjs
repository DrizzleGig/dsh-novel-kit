// 真实数据验收：把一本真实书的 .dsh-novel-* 复制到临时工作区，用 kit 引擎走完一章。
//
// 只读真实目录（复制），全部写入都在临时副本里。
// 运行：node scripts/acceptance-real.mjs [书目录] [书名]
import { cp, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { planChapter, startChapter, writeChapter, finishChapter, queryChapter } from '../lib/engine/chapter.js'
import { collectSnapshot } from '../lib/host/snapshot.js'

const source = process.argv[2] ?? 'D:\\斗罗大陆'
const book = process.argv[3] ?? '斗罗：开局炸毁冰火两仪眼'
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

const root = await mkdtemp(path.join(os.tmpdir(), 'kit-real-'))
for (const dir of ['.dsh-novel-beat', '.dsh-novel-fade', '.dsh-novel-voice', '.dsh-novel-fanfic']) {
  try {
    await cp(path.join(source, dir), path.join(root, dir), { recursive: true })
  } catch {
    // 没有这个账本就跳过
  }
}
console.log('工作区副本：' + root)

const beatDir = path.join(root, '.dsh-novel-beat', book)
const beatRaw = JSON.parse(await readFile(path.join(beatDir, 'book.json'), 'utf8'))
const chapter = Number(process.argv[4] ?? (Array.isArray(beatRaw.chapters) ? beatRaw.chapters.length + 1 : 13))
check('读真实 beat 账本', true, 'chapters=' + (Array.isArray(beatRaw.chapters) ? beatRaw.chapters.length : 0) + ' decisions=' + (beatRaw.decisions?.length ?? 0) + ' rev=' + (beatRaw.revision ?? '?'))

const planned = await planChapter({ root, book, chapter, intent: '真实数据验收章', proposals: [{ id: 'p1', title: '验收拍板', options: [{ label: '照写', impact: '无' }] }] })
check('plan 成功', planned.ok !== false, 'session=' + planned.session?.id)

const started = await startChapter({ root, book, chapter, requiredCapabilities: ['beat', 'fade'] })
if (!started.ok) console.log('start 失败：' + started.code + ' ' + (started.message ?? ''))
const components = started.ok ? Object.fromEntries(started.context.segments.map((segment) => [segment.component, segment.available])) : {}
check('四段上下文装配', started.ok === true, JSON.stringify(components) + ' chars=' + (started.context?.chars ?? 0))
check('至少 beat/fade 两段可用', components.beat === true && components.fade === true, '')

const text = '陈凡推门进来，屋里没有别人。\n\n“走吧。”唐昊说。\n\n他把令牌放在桌上，没有解释。'
await writeChapter({ root, sessionId: started.session.id, text })
const quote = '他把令牌放在桌上，没有解释。'
const done = await finishChapter({ root, sessionId: started.session.id, extraction: { segments: [{ quote }], memory: { cards: [{ topic: '令牌', gist: '唐昊留下令牌', quote, salience: 4 }] } } })
check('finish 落账', done.ok === true && done.session.state === 'completed', done.ok ? 'tx=' + done.receipt?.txId : done.code + ':' + done.message)

const beatAfter = JSON.parse(await readFile(path.join(beatDir, 'book.json'), 'utf8'))
check('beat 段落 +1', beatAfter.segments.length === (beatRaw.segments?.length ?? 0) + 1, 'segments=' + beatAfter.segments.length)

const memoryAfter = JSON.parse(await readFile(path.join(root, '.dsh-novel-fade', book, 'memory.json'), 'utf8'))
check('fade 有本会话新卡', memoryAfter.cards.some((card) => String(card.gist ?? '').includes('令牌')), 'cards=' + memoryAfter.cards.length)

const snapshot = await collectSnapshot({ root, book })
check('快照可读', snapshot.session?.state === 'completed' && snapshot.contexts.length === 4, 'beat rev=' + snapshot.ledgers.beat.revision + ' conflicts=' + snapshot.conflicts.total)
check('冲突扫描在真实数据上可跑', typeof snapshot.conflicts.total === 'number', 'total=' + snapshot.conflicts.total)

const conflicts = await queryChapter({ root, book, view: 'conflicts' })
check('query conflicts 有结构', conflicts.ok === true && Array.isArray(conflicts.conflicts), 'total=' + conflicts.total)

const passed = results.filter((item) => item.ok).length
console.log(`\n${passed}/${results.length} 项通过（临时副本：${root}）`)
if (passed !== results.length) process.exitCode = 1
