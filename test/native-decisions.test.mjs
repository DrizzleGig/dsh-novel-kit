// 0.7 原生决策 v3 形状：request/answer/decision 分离，作者拍板才落 answeredAt。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ensureBook } from '../lib/engine/book.js'
import { planChapter, decideProposal, readContext, startChapter, writeChapter, finishChapter } from '../lib/engine/chapter.js'
import { readDecisions, decisionGate, decisionsView, decisionLoop } from '../lib/native/decisions.js'

test('原生决策：plan → 作者 adopt → requests/answers/decision 同时落账，重复不重复写', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-native-decision-'))
  const book = await ensureBook({ root, book: '决策书' })
  const planned = await planChapter({
    root,
    book: '决策书',
    chapter: 1,
    proposals: [{ id: 'p1', title: '谁去', options: [{ label: '夜行', impact: '紧张' }, { label: '白天', impact: '稳' }] }],
  })
  assert.equal(planned.session.bookId, book.bookId)
  const adopted = await decideProposal({ root, sessionId: planned.session.id, proposalId: 'p1', action: 'adopt', option: '夜行' })
  assert.equal(adopted.ok, true)
  assert.equal(adopted.written, true)
  assert.ok(adopted.decision.requestId)
  assert.ok(adopted.decision.answerId)

  const decisions = await readDecisions(root, book.bookId)
  assert.equal(decisions.requests.length, 1)
  assert.equal(decisions.answers.length, 1)
  assert.equal(decisions.requests[0].id, adopted.decision.requestId)
  assert.equal(decisions.requests[0].status, 'answered')
  assert.ok(decisions.requests[0].answeredAt)
  assert.equal(decisions.answers[0].requestId, adopted.decision.requestId)
  assert.equal(decisions.answers[0].option, '夜行')
  assert.equal(decisions.answers[0].by, 'author')
  assert.equal(decisions.decisions[0].requestId, adopted.decision.requestId)

  const again = await decideProposal({ root, sessionId: planned.session.id, proposalId: 'p1', action: 'adopt', option: '夜行' })
  assert.equal(again.idempotent, true)
  const after = await readDecisions(root, book.bookId)
  assert.equal(after.requests.length, 1)
  assert.equal(after.answers.length, 1)
  assert.equal(after.decisions.length, 1)
  assert.equal(decisionsView(after).gate.ok, true)
  assert.equal(decisionsView(after).loop.done, true)
  assert.equal(decisionLoop({ ...after, requests: [{ id: 'r-open', status: 'open' }] }).open, 1)
  assert.equal(decisionGate({ ...after, answers: [] }).ok, false)
  assert.equal(decisionGate({ ...after, requests: [] }).ok, false)

  const started = await startChapter({ root, book: '决策书', chapter: 1 })
  assert.equal(started.ok, true)
  const text = '陈凡连夜出城。'
  await writeChapter({ root, sessionId: started.session.id, text })
  const done = await finishChapter({ root, sessionId: started.session.id, extraction: { segments: [{ quote: text }] } })
  assert.equal(done.ok, true)
  assert.equal(done.session.state, 'completed')
})

test('原生决策：planChapter 产出的 session 带 bookId，生产口径可继续', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-native-decision-ctx-'))
  const book = await ensureBook({ root, book: '决策书二' })
  const planned = await planChapter({ root, book: '决策书二', chapter: 1 })
  const ctx = await readContext(root, '决策书二')
  assert.equal(ctx.bookId, book.bookId)
  assert.equal(planned.session.bookId, book.bookId)
})