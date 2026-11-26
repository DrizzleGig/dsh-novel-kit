// 0.7 全书分析：只读汇总决策/记忆/媒体/人物/runbook，不写、不跨书。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeBook } from '../lib/native/analysis.js'

test('analysis：汇总结论/未答/归档/媒体状态/人物/runbook', () => {
  const decisions = {
    format: 'kit.decisions', schemaVersion: 1, bookId: 'bk-11111111-1111-4111-8111-111111111111', book: '书', revision: 3,
    requests: [{ id: 'r1', status: 'answered', answeredAt: 'x' }, { id: 'r2', status: 'open' }],
    answers: [{ id: 'a1', requestId: 'r1' }],
    decisions: [{ id: 'd1', status: 'committed', requestId: 'r1', answerId: 'a1' }, { id: 'd2', status: 'committed', requestId: 'r2' }],
    segments: [], canon: [], obligations: [], revisions: [], audit: [], integrity: {},
  }
  const memory = { revision: 4, cards: [{ id: 'c1', pinned: true, chapter: 1 }, { id: 'c2', chapter: 2 }], archive: { stubs: [{ cardId: 'c3' }] } }
  const media = { sources: [{ id: 's1' }], evidence: [{ id: 'e1', status: 'confirmed', kind: 'panel' }, { id: 'e2', status: 'unverified', kind: 'panel' }] }
  const personas = { personas: [{ id: 'p1', status: 'proposed' }, { id: 'p2', status: 'confirmed' }] }
  const runs = [{ status: 'running' }, { status: 'completed' }, { status: 'failed' }]
  const analysis = analyzeBook({ bookId: 'bk-1', decisions, memory, media, personas, runs })
  assert.equal(analysis.decisions.total, 2)
  assert.equal(analysis.decisions.unanswered, 1)
  assert.equal(analysis.decisions.gateOk, false, 'r2 未答会报 gate error')
  assert.equal(analysis.memory.cards, 2)
  assert.equal(analysis.memory.pinned, 1)
  assert.equal(analysis.memory.archived, 1)
  assert.equal(analysis.media.byStatus.confirmed, 1)
  assert.equal(analysis.personas.confirmed, 1)
  assert.equal(analysis.runs.running, 1)
})

test('analysis：空数据不抛错', () => {
  const analysis = analyzeBook({})
  assert.equal(analysis.ok, true)
  assert.equal(analysis.decisions.total, 0)
  assert.equal(analysis.memory.cards, 0)
  assert.equal(analysis.runs.total, 0)
})