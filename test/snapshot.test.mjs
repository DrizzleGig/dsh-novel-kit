// S2 前哨：面板只读快照。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { collectSnapshot } from '../lib/host/snapshot.js'
import { startChapter, writeChapter } from '../lib/engine/chapter.js'

function workspace() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-snap-'))
  const beatDir = path.join(root, '.dsh-novel-beat', '书')
  mkdirSync(beatDir, { recursive: true })
  writeFileSync(path.join(beatDir, 'book.json'), JSON.stringify({
    schemaVersion: 2, book: '书', meta: {}, chapters: { ch012: {} },
    decisions: [{ id: 'd1', chapter: 13, status: 'committed' }], canon: [{ entity: 'A', key: 'k', value: 'v' }],
    obligations: [], segments: [{ id: 's1', chapter: 12 }], audit: [{ id: 'a1' }], revisions: [], revision: 41,
  }, null, 2))
  const fadeDir = path.join(root, '.dsh-novel-fade', '书')
  mkdirSync(fadeDir, { recursive: true })
  writeFileSync(path.join(fadeDir, 'memory.json'), JSON.stringify({
    schemaVersion: 3, book: '书', meta: { revision: 18, revisionAt: 2 },
    chapters: {}, cards: [{ id: 'c1', chapter: 12, gist: '前情', salience: 4 }],
    entities: {}, places: {}, threads: [], povDistortions: [], audit: [{ id: 'a1' }, { id: 'a2' }],
  }, null, 2))
  return root
}

test('快照：没有会话时也给出账本 revision 与四段占位', async () => {
  const root = workspace()
  const snap = await collectSnapshot({ root, book: '书' })
  assert.equal(snap.book, '书')
  assert.equal(snap.session, null)
  assert.deepEqual(snap.workspace.beat, ['书'])
  assert.equal(snap.ledgers.beat.revision, 41)
  assert.equal(snap.ledgers.beat.segments, 1)
  assert.equal(snap.ledgers.fade.revision, 18)
  assert.equal(snap.ledgers.fade.cards, 1)
  assert.deepEqual(snap.contexts, [])
  assert.deepEqual(snap.issues, [])
})

test('快照：有活动会话时给出状态、草稿与四段摘要', async () => {
  const root = workspace()
  const { session } = await startChapter({ root, book: '书', chapter: 13 })
  await writeChapter({ root, sessionId: session.id, text: '正文一段。' })
  const snap = await collectSnapshot({ root, book: '书' })
  assert.equal(snap.session.state, 'writing')
  assert.equal(snap.session.draft.version, 1)
  assert.equal(snap.contexts.length, 4)
  assert.deepEqual(snap.contexts.map((item) => item.component), ['beat', 'fanfic', 'fade', 'voice'])
  assert.equal(snap.contexts[0].available, true)
  assert.equal(snap.contexts[1].available, false)
})

test('快照：缺账本记 issue，不抛错；开关状态按 agent 读', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-snap-empty-'))
  const gate = { isOn: (agent) => agent?.session?.id === 'on' }
  const snap = await collectSnapshot({ root, book: '没有', gate, agent: { session: { id: 'on' } } })
  assert.equal(snap.driving, true)
  assert.equal(snap.session, null)
  assert.equal(existsSync(path.join(root, '.dsh-novel-kit')), false, '快照不能创建目录')
})

test('快照：真实书只读（不改任何账本文件）', { skip: !existsSync('D:\\斗罗大陆\\.dsh-novel-beat') }, async () => {
  const root = 'D:\\斗罗大陆'
  const book = '斗罗：开局炸毁冰火两仪眼'
  const before = readFileSync(path.join(root, '.dsh-novel-beat', book, 'book.json'), 'utf8')
  const snap = await collectSnapshot({ root, book, library: '斗罗大陆' })
  const after = readFileSync(path.join(root, '.dsh-novel-beat', book, 'book.json'), 'utf8')
  assert.equal(before, after)
  assert.equal(snap.ledgers.beat.chapters, 12)
  assert.equal(snap.ledgers.fade.cards, 73)
  assert.equal(snap.ledgers.voice.chapters, 687)
})
