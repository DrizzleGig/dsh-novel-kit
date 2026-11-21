// S0：账本 codec 的只读兼容测试。
//
// 这些断言来自五件的真实语义：
// - beat 旧账本没有 revision → revisions.length + audit.length（novel-beat store.js:283）；
// - fade meta.revision 缺失 → audit.length；revisionAt 落后 → drift（dsh-novel-fade store.js:40）；
// - chapters/entities/places 是字典，cards/threads/audit 是数组——两种都要收。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { decodeBeat, beatRevision, decisionsForChapter } from '../lib/codecs/beat.js'
import { decodeFade, fadeRevision, cardsForChapter } from '../lib/codecs/fade.js'
import { decodeVoiceLibrary, findWork } from '../lib/codecs/voice.js'
import { decodeFanficProject, addressesAt } from '../lib/codecs/fanfic.js'
import { discoverWorkspace } from '../lib/workspace.js'
import { readBeat, readFade, readVoice, readFanfic, readAll } from '../lib/repositories/ledger.js'

const REAL_BOOK_ROOT = 'D:\\斗罗大陆'
const REAL_BOOK = '斗罗：开局炸毁冰火两仪眼'
const REAL_FANFIC_ROOT = 'D:\\Novel-gate'
const hasRealBook = existsSync(path.join(REAL_BOOK_ROOT, '.dsh-novel-beat', REAL_BOOK, 'book.json'))
const hasRealFanfic = existsSync(path.join(REAL_FANFIC_ROOT, '.dsh-novel-fanfic', 'douluo', 'project.json'))

test('beat：旧账本用 revisions+audit 兜底 revision，不改文件', () => {
  assert.equal(beatRevision({}), 0)
  assert.equal(beatRevision({ revision: 41 }), 41)
  assert.equal(beatRevision({ revisions: [1, 2], audit: [1, 2, 3] }), 5)
  const view = decodeBeat({ schemaVersion: 1, chapters: { ch001: { id: 'ch001' } }, decisions: [], audit: [1] })
  assert.equal(view.revision, 1)
  assert.equal(view.legacy, true)
  assert.equal(view.chapters.length, 1)
  assert.match(view.warnings.join('\n'), /只读兼容/)
})

test('beat：本章决策只取已拍板且未回退的', () => {
  const view = decodeBeat({
    schemaVersion: 2,
    decisions: [
      { id: 'd1', chapter: 13, status: 'committed' },
      { id: 'd2', chapter: 13, status: 'reverted' },
      { id: 'd3', chapter: 12, status: 'committed' },
    ],
  })
  assert.deepEqual(decisionsForChapter(view, 13).map((d) => d.id), ['d1'])
})

test('fade：meta.revision 缺失用 audit 兜底；revisionAt 落后标 drift', () => {
  assert.deepEqual(fadeRevision({ audit: [{}, {}] }), { revision: 2, drift: false })
  assert.deepEqual(fadeRevision({ meta: { revision: 5, revisionAt: 1 }, audit: [{}, {}, {}] }), { revision: 5, drift: true })
  const view = decodeFade({ schemaVersion: 2, cards: [{ chapter: 13, status: 'active' }], chapters: { ch013: {} } })
  assert.equal(view.legacy, true)
  assert.equal(view.chapters.length, 1)
  assert.equal(cardsForChapter(view, 13).length, 1)
})

test('voice：书库解出作品索引，按 workId 能找参考作品', () => {
  const view = decodeVoiceLibrary({
    schemaVersion: 1,
    book: '书',
    works: [{ workId: 'w-1', title: '原著', chars: 100, chapters: 2, status: 'measured' }],
  })
  assert.equal(view.works.length, 1)
  assert.equal(findWork(view, 'w-1').title, '原著')
  assert.equal(findWork(view, 'nope'), null)
})

test('fanfic：项目头与契约导出解码，称呼按章过滤', () => {
  const project = decodeFanficProject({
    id: 'p1', title: '书', sourceId: 'src_1', revision: 46, schemaVersion: 1,
    exports: { schemaVersion: 1, revision: 46, addresses: [{ from: 'A', to: 'B', fromChapter: 'ch003' }] },
  })
  assert.equal(project.revision, 46)
  assert.equal(project.exports.addresses.length, 1)
  assert.equal(addressesAt(project, 'ch002').length, 0)
  assert.equal(addressesAt(project, 'ch004').length, 1)
})

test('workspace：只读发现五本账的目录，不创建任何目录', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-ws-'))
  mkdirSync(path.join(root, '.dsh-novel-beat', '书'), { recursive: true })
  mkdirSync(path.join(root, '.dsh-novel-fade', '书'), { recursive: true })
  const found = await discoverWorkspace(root)
  assert.deepEqual(found.beat, ['书'])
  assert.deepEqual(found.fade, ['书'])
  assert.deepEqual(found.voice, [])
  assert.equal(existsSync(path.join(root, '.dsh-novel-voice')), false, '发现过程不能创建目录')
})

test('repositories：缺账本返回 null，非法名字直接拒绝', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-repo-'))
  const all = await readAll(root, { book: '没有这本书' })
  assert.equal(all.beat, null)
  assert.equal(all.fade, null)
  await assert.rejects(() => readBeat(root, '../escape'), /单个目录名/)
})

test('真实书：只读解码 斗罗同人（12 章 / 73 卡）', { skip: !hasRealBook }, async () => {
  const beat = await readBeat(REAL_BOOK_ROOT, REAL_BOOK)
  assert.equal(beat.chapters.length, 12)
  assert.equal(beat.decisions.length, 35)
  assert.equal(beat.canon.length, 67)
  assert.equal(beat.obligations.length, 0)
  assert.equal(beat.audit.length, 82)
  assert.equal(beat.revision, beat.revisions.length + beat.audit.length)

  const fade = await readFade(REAL_BOOK_ROOT, REAL_BOOK)
  assert.equal(fade.chapters.length, 12)
  assert.equal(fade.cards.length, 73)
  assert.equal(fade.entities.length, 33)
  assert.equal(fade.threads.length, 38)
  assert.equal(fade.revision, fade.audit.length)

  const voice = await readVoice(REAL_BOOK_ROOT, '斗罗大陆')
  assert.equal(voice.works.length, 1)
  assert.equal(voice.works[0].chapters, 687)
  assert.equal(voice.works[0].chars, 2854436)
})

test('真实同人项目：只读解码 douluo（revision 46）', { skip: !hasRealFanfic }, async () => {
  const project = await readFanfic(REAL_FANFIC_ROOT, 'douluo')
  assert.equal(project.id, 'douluo')
  assert.equal(project.revision, 46)
  assert.ok(project.exports.addresses.length > 0)
})
