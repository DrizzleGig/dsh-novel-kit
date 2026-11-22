// S2：三块视图的纯函数。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { memoryView, styleView, canonView, searchMemory } from '../lib/host/views.js'

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

test('canonView：带 canon 时给出人物与秘密', () => {
  const view = canonView(
    { id: 'douluo', revision: 46, exports: { addresses: [], forbidden: [] } },
    {
      characters: [{ name: '唐三', aliases: ['小三'], role: '主角' }],
      secrets: [{ id: 'secret_001', what: '前世是唐门弟子', publicAtChapter: 'ch010', knownBy: ['唐三'] }],
    },
  )
  assert.equal(view.available, true)
  assert.deepEqual(view.characters, [{ name: '唐三', aliases: ['小三'], role: '主角' }])
  assert.equal(view.secrets.length, 1)
  assert.equal(view.secrets[0].publicAtChapter, 'ch010')
})

test('memoryView：未回收线索与人物出场统计', () => {
  const view = memoryView({
    revision: 1,
    cards: [{ id: 'a', chapter: 1, entityIds: ['陈凡', '唐昊'] }, { id: 'b', chapter: 2, entityIds: ['陈凡'] }],
    threads: [{ id: 't1', status: 'open', text: '秘密' }, { id: 't2', status: 'closed', text: 'x' }],
  })
  assert.equal(view.threads.length, 1)
  assert.equal(view.threads[0].text, '秘密')
  assert.equal(view.entities[0].name, '陈凡')
  assert.equal(view.entities[0].mentions, 2)
})

test('searchMemory：按词命中 gist/实体，按重要度排序，空词不返回', () => {
  const fade = {
    revision: 3,
    cards: [
      { id: 'a', chapter: 1, salience: 2, gist: '陈凡确认穿越', entityIds: ['陈凡'] },
      { id: 'b', chapter: 2, salience: 5, gist: '陈凡与唐昊出城', entityIds: ['陈凡', '唐昊'] },
      { id: 'c', chapter: 3, salience: 4, gist: '小舞登场' },
    ],
  }
  const hits = searchMemory(fade, '陈凡')
  assert.equal(hits.total, 2)
  assert.deepEqual(hits.hits.map((item) => item.id), ['b', 'a'])
  assert.equal(searchMemory(fade, '').total, 0)
  assert.equal(searchMemory(null, 'x').available, false)
})

test('memoryView：给 currentChapter 时附带 fidelity', () => {
  const view = memoryView({ revision: 1, cards: [{ id: 'a', chapter: 3, gist: 'x', salience: 5, entityIds: [] }] }, { currentChapter: 4 })
  assert.equal(typeof view.cards[0].fidelity, 'number')
  assert.equal(typeof view.cards[0].familiarity, 'number')
})

test('memoryView：保留引文、钉住状态与三维可及性', () => {
  const view = memoryView({
    revision: 1,
    cards: [{ id: 'c-quote', chapter: 3, salience: 5, gist: '令牌', quote: '城门在子时落锁', pinned: true, entityIds: ['守城人'] }],
  }, { currentChapter: 3 })
  assert.equal(view.cards[0].quote, '城门在子时落锁')
  assert.equal(view.cards[0].pinned, true)
  assert.equal(typeof view.cards[0].accessibility, 'number')
  assert.deepEqual(view.cards[0].entityIds, ['守城人'])
})

test('canonView：事实带原文引文', () => {
  const view = canonView({
    id: 'douluo', revision: 1,
    exports: { facts: [{ subject: '陈凡', key: '令牌', value: '唐昊所留', chapter: 2, evidence: [{ quote: '把令牌放在桌上' }] }] },
  })
  assert.equal(view.facts.length, 1)
  assert.equal(view.facts[0].quote, '把令牌放在桌上')
  assert.equal(view.facts[0].chapter, 2)
})
