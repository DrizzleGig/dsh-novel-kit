// 统一收件箱：聚合顺序、阻断范围、按书隔离、不可自动重试的冲突。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildInbox } from '../lib/host/inbox.js'

const decisions = {
  chapter: 12,
  proposals: [
    { id: 'p1', title: '沈砚要不要现在叫出那个名字', options: [{ label: '叫出' }, { label: '继续装作不知道' }] },
  ],
}

const snapshot = {
  settings: { mode: 'fanfic' },
  canon: { ready: false, status: 'pending-review' },
  session: { id: 's-1', chapter: 12, verification: { blockers: 2, warnings: 1 } },
  conflicts: { total: 1, items: [{ entity: '称呼', key: '沈砚对裴照', beat: { value: '阿砚' }, fanfic: { value: '沈大人' } }] },
}

const operations = {
  items: [
    { operationId: 'op-1', command: 'draft.save', status: 'failed', error: { message: '写入超时' } },
    { operationId: 'op-2', command: 'draft.save', status: 'completed' },
  ],
}

test('buildInbox：五类事项都进得来，blocker 排在最前', () => {
  const inbox = buildInbox({ book: '长夜行', decisions, snapshot, operations })
  assert.equal(inbox.book, '长夜行')
  assert.equal(inbox.total, 5, 'decision + canon + conflict + check + operation')
  const kinds = inbox.items.map((item) => item.kind)
  assert.deepEqual(kinds, ['decision', 'canon', 'check', 'conflict', 'operation'])
  assert.equal(inbox.items[0].severity, 'blocker')
  assert.equal(inbox.items[0].blockScope, 'finish')
  assert.deepEqual(inbox.items[0].actions, ['adopt', 'reject'])
})

test('buildInbox：canon 未确认会拦开章，检查阻断会拦收尾', () => {
  const inbox = buildInbox({ decisions: { chapter: 12, proposals: [] }, snapshot, operations: { items: [] } })
  assert.equal(inbox.blocked.start, true, 'canon 未确认拦开章')
  assert.equal(inbox.blocked.finish, true, '检查阻断拦收尾')
  const canon = inbox.items.find((item) => item.kind === 'canon')
  assert.equal(canon.target.page, 'fanfic')
  assert.equal(canon.summary, '当前状态：pending-review')
})

test('buildInbox：冲突只报告，不给自动重试', () => {
  const inbox = buildInbox({ decisions: { chapter: 12, proposals: [] }, snapshot: { ...snapshot, canon: { ready: true }, session: null }, operations: { items: [] } })
  const conflict = inbox.items.find((item) => item.kind === 'conflict')
  assert.ok(conflict, '冲突要进收件箱')
  assert.deepEqual(conflict.actions, ['compare'], '只能去对比，不能重试覆盖')
  assert.equal(conflict.blockScope, 'none')
  assert.match(conflict.summary, /阿砚/)
})

test('buildInbox：没有失败操作时不把已完成的操作塞进收件箱', () => {
  const inbox = buildInbox({
    decisions: { chapter: 12, proposals: [] },
    snapshot: { settings: { mode: 'original' }, canon: null, session: null, conflicts: { items: [] } },
    operations: { items: [{ operationId: 'op-2', command: 'draft.save', status: 'completed' }] },
  })
  assert.equal(inbox.total, 0)
  assert.equal(inbox.blocked.start, false)
  assert.equal(inbox.blocked.finish, false)
})

test('buildInbox：原创模式不因缺 canon 报警', () => {
  const inbox = buildInbox({ decisions: { chapter: 3, proposals: [] }, snapshot: { settings: { mode: 'original' }, canon: null, session: null }, operations: { items: [] } })
  assert.equal(inbox.items.length, 0)
})

test('buildInbox：limit 生效且 total 仍是全量', () => {
  const inbox = buildInbox({ decisions, snapshot, operations, limit: 2 })
  assert.equal(inbox.items.length, 2)
  assert.equal(inbox.total, 5)
})
