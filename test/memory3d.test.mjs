// S2：三维记忆打分与简报降级。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { memory3d, fidelityTier, memoryLine } from '../lib/engine/memory3d.js'

const fade = {
  cards: [
    { id: 'near', chapter: 11, gist: '近章细节', topic: '出城', salience: 5, entityIds: ['陈凡'], emotion: '紧张' },
    { id: 'far', chapter: 6, gist: '远章细节', topic: '旧事', salience: 2, entityIds: ['某人'], emotion: '平静' },
    { id: 'pinned', chapter: 3, gist: '钉住的细节', topic: '身份', salience: 3, entityIds: ['陈凡'], pinned: true },
  ],
}

test('memory3d：近期高重要度 → 高 fidelity；久远低重要度 → 低 fidelity', () => {
  const view = memory3d(fade, 12)
  assert.equal(view.available, true)
  const byId = Object.fromEntries(view.cards.map((card) => [card.id, card]))
  assert.ok(byId.near.fidelity > 0.6)
  assert.ok(byId.far.fidelity < byId.near.fidelity)
  assert.equal(fidelityTier(byId.near.fidelity), 'high')
  assert.equal(fidelityTier(byId.far.fidelity), 'low')
})

test('memory3d：钉卡得到 accessibility 加成', () => {
  const view = memory3d(fade, 12)
  const pinned = view.cards.find((card) => card.id === 'pinned')
  const far = view.cards.find((card) => card.id === 'far')
  assert.ok(pinned.accessibility > far.accessibility)
})

test('memoryLine：低 fidelity 不泄露细节', () => {
  const low = memoryLine({ chapter: 6, familiarity: 0.3, fidelity: 0.2, gist: '他偷了令牌', topic: '旧事', emotion: '平静' })
  assert.match(low, /细节已模糊/)
  assert.ok(!low.includes('他偷了令牌'))
  const high = memoryLine({ chapter: 11, familiarity: 0.9, fidelity: 0.9, gist: '近章细节', topic: '出城' })
  assert.match(high, /近章细节/)
})

test('memory3d：窗口外的卡不参与', () => {
  const view = memory3d({ cards: [{ id: 'old', chapter: 1, gist: 'x' }] }, 50, { span: 40 })
  assert.equal(view.cards.length, 0)
})

test('memory3d：钉卡跨窗口仍取；遗忘卡不取；omittedIds 可见', () => {
  const view = memory3d({
    cards: [
      { id: 'pinned-far', chapter: 1, gist: '钉住的身份', pinned: true },
      { id: 'old', chapter: 1, gist: '普通旧事' },
      { id: 'forgotten', chapter: 49, gist: '已忘', lifecycle: { status: 'forgotten' } },
    ],
  }, 50, { span: 40 })
  const ids = view.cards.map((card) => card.id)
  assert.ok(ids.includes('pinned-far'))
  assert.ok(!ids.includes('old'))
  assert.ok(!ids.includes('forgotten'))
  assert.ok(view.omittedIds.includes('old'))
})
