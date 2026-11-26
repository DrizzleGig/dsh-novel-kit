// 记忆总览：curve/health 只读派生，不写账本。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { memoryView, searchMemory } from '../lib/host/views.js'

test('memoryView: 曲线与健康按当前章派生', () => {
  const fade = {
    revision: 3,
    cards: [
      { id: 'c1', chapter: 1, salience: 2, gist: '旧卡', quote: '旧引文', sourceId: 'a'.repeat(64), lifecycle: { status: 'active' } },
      { id: 'c2', chapter: 9, salience: 4, gist: '近卡', pinned: true, lifecycle: { status: 'active' } },
      { id: 'c3', chapter: 10, salience: 3, gist: '当前卡', lifecycle: { status: 'active' } },
    ],
    threads: [],
    archive: { stubs: [] },
  }
  const view = memoryView(fade, { currentChapter: 10, limit: 10 })
  assert.equal(view.curve.length, 3)
  assert.ok(view.curve.find((item) => item.id === 'c1').fidelity < view.curve.find((item) => item.id === 'c3').fidelity)
  assert.equal(view.health.pinned, 1)
  assert.equal(view.health.currentChapter, 10)
  assert.equal(view.health.outOfWindow, 0)
  assert.equal(view.lowest[0].id, 'c1')
  assert.equal(view.total, 3)
  const hits = searchMemory(fade, '旧卡', { limit: 5 })
  assert.equal(hits.hits[0].sourceId, 'a'.repeat(64))
})