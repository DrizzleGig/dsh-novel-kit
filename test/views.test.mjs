// S2：三块视图的纯函数。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { memoryView, styleView, canonView } from '../lib/host/views.js'

const fade = {
  revision: 13,
  drift: false,
  cards: [
    { id: 'c1', chapter: 12, salience: 5, layer: 'L0', domain: 'key', gist: '身份揭示', emotion: '震动', entityIds: ['陈凡'] },
    { id: 'c2', chapter: 12, salience: 2, domain: 'plot', gist: '赶路' },
    { id: 'c3', chapter: 11, salience: 4, domain: 'plot', gist: '冰火两仪眼被毁' },
  ],
}

test('memoryView：按章筛选、按重要度排序、给章列表', () => {
  const view = memoryView(fade, { chapter: 12 })
  assert.equal(view.available, true)
  assert.equal(view.revision, 13)
  assert.equal(view.total, 3)
  assert.deepEqual(view.cards.map((card) => card.id), ['c1', 'c2'])
  assert.deepEqual(view.chapters, [11, 12])
  assert.equal(view.cards[0].layer, 'L0')
})

test('memoryView：limit 与领域过滤，缺账本如实不可用', () => {
  const view = memoryView(fade, { limit: 1 })
  assert.equal(view.cards.length, 1)
  assert.equal(view.cards[0].id, 'c1')
  const plotOnly = memoryView(fade, { domain: 'plot' })
  assert.deepEqual(plotOnly.cards.map((card) => card.id), ['c3', 'c2'])
  assert.deepEqual(memoryView(null), { available: false, revision: null, total: 0, cards: [], chapters: [] })
})

test('styleView：书库规模汇总', () => {
  const view = styleView({ works: [{ workId: 'w1', title: '原著', chapters: 10, chars: 1000, status: 'measured' }] })
  assert.equal(view.available, true)
  assert.equal(view.chapters, 10)
  assert.equal(view.chars, 1000)
  assert.equal(styleView(null).available, false)
})

test('canonView：称呼矩阵与禁忌', () => {
  const view = canonView({
    id: 'douluo', title: '原著', sourceId: 'src_1', currentChapter: 'ch003', revision: 46,
    exports: { addresses: [{ from: '唐昊', to: '唐三', form: '小三', public: '小三', private: '小三', fromChapter: 'ch003' }], forbidden: ['不要写现代梗'] },
  })
  assert.equal(view.available, true)
  assert.equal(view.revision, 46)
  assert.equal(view.addresses.length, 1)
  assert.equal(view.addresses[0].form, '小三')
  assert.deepEqual(view.forbidden, ['不要写现代梗'])
  assert.equal(canonView(null).available, false)
})

test('styleView：带档案时给出 bands / rules / avoid', () => {
  const view = styleView({ works: [] }, [{
    id: 'p-001', name: '原著风格', version: '1.4', status: 'confirmed', provisional: false,
    identity: { avoid: ['仿佛'] },
    bands: { sentenceMean: { band: [16, 41] }, dialogueRatio: { band: [0.17, 0.29] } },
    rules: [{ text: 'a' }, { text: 'b' }],
  }])
  assert.equal(view.available, true)
  assert.equal(view.profiles.length, 1)
  assert.deepEqual(view.profiles[0].bands.sentenceMean, [16, 41])
  assert.equal(view.profiles[0].rules, 2)
  assert.deepEqual(view.profiles[0].avoid, ['仿佛'])
})
