// 拍板视图：已拍板 vs 待拍板（只读，不替作者确认）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decisionsView } from '../lib/host/decisions.js'

const beat = {
  decisions: [
    { id: 'b13-1', chapter: 13, title: '谁去', change: '陈凡去', kind: '分叉', status: 'committed' },
    { id: 'b13-2', chapter: 13, title: '回退的', change: '旧值', status: 'reverted' },
    { id: 'b12-1', chapter: 12, title: '别章', change: 'x', status: 'committed' },
  ],
  obligations: [{ id: 'o1', status: 'open' }, { id: 'o2', status: 'closed' }],
}
const session = {
  chapter: 13,
  plan: { intent: '雪夜出城', proposals: [{ id: 'p1', title: '出城方式', options: [{ label: '夜行', impact: '紧张' }, { label: '白天', impact: '稳' }] }] },
}

test('decisionsView：只列本章已 committed 的决策，回退与别章不计', () => {
  const view = decisionsView(beat, session, 13)
  assert.equal(view.available, true)
  assert.deepEqual(view.committed.map((decision) => decision.id), ['b13-1'])
  assert.equal(view.committed[0].change, '陈凡去')
})

test('decisionsView：待拍板提案来自 session.plan，带选项', () => {
  const view = decisionsView(beat, session)
  assert.equal(view.chapter, 13)
  assert.equal(view.intent, '雪夜出城')
  assert.equal(view.pendingCount, 1)
  assert.equal(view.proposals[0].options.length, 2)
  assert.equal(view.proposals[0].options[0].label, '夜行')
  assert.equal(view.openObligations, 1)
})

test('decisionsView：没有账本与会话时如实不可用', () => {
  const view = decisionsView(null, null)
  assert.equal(view.available, false)
  assert.deepEqual(view.committed, [])
  assert.deepEqual(view.proposals, [])
})

test('decisionsView：已拍板/已拒绝的提案不再算待拍板', () => {
  const session = {
    chapter: 13,
    plan: {
      proposals: [
        { id: 'p1', title: '已拍', status: 'adopted', options: [{ label: 'A' }] },
        { id: 'p2', title: '被拒', status: 'rejected', options: [] },
        { id: 'p3', title: '待拍', options: [{ label: 'B' }] },
      ],
    },
  }
  const view = decisionsView(beat, session)
  assert.equal(view.pendingCount, 1)
  assert.deepEqual(view.proposals.map((item) => item.id), ['p3'])
})
