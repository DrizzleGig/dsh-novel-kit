// 0.7 原生 runbook：kit 自己的 run/step 记录，不恢复五件调度。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ensureBook, runsDir } from '../lib/native/store.js'
import { createRun, readRun, listRuns, updateRun, updateRunStep } from '../lib/native/runs.js'

test('原生 runbook：建 run → 列表 → 步骤状态推进 → 收尾', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-native-runs-'))
  const book = await ensureBook({ root, book: '总控书' })
  const created = await createRun({
    root, bookId: book.bookId, title: '第一卷 roll', flowId: 'flow-1',
    steps: [{ id: 's1', kind: 'plan', title: '定计划' }, { id: 's2', kind: 'write', title: '写正文' }],
  })
  assert.equal(created.ok, true)
  assert.equal(created.run.status, 'planned')
  assert.equal(created.run.steps.length, 2)
  assert.ok(existsSync(runsDir(root, book.bookId)))

  const listed = await listRuns({ root, bookId: book.bookId })
  assert.equal(listed.runs.length, 1)

  const running = await updateRunStep({ root, bookId: book.bookId, runId: created.run.runId, stepId: 's1', patch: { status: 'running' } })
  assert.equal(running.run.steps[0].status, 'running')
  assert.ok(running.run.steps[0].startedAt)

  const completed = await updateRunStep({ root, bookId: book.bookId, runId: created.run.runId, stepId: 's1', patch: { status: 'completed', note: '计划定稿' } })
  assert.equal(completed.run.steps[0].status, 'completed')
  assert.ok(completed.run.steps[0].finishedAt)
  assert.equal(completed.run.revision, 2)

  const done = await updateRun({ root, bookId: book.bookId, runId: created.run.runId, patch: { status: 'completed' } })
  assert.equal(done.run.status, 'completed')
  assert.equal((await readRun({ root, bookId: book.bookId, runId: created.run.runId })).status, 'completed')
  assert.equal(existsSync(path.join(root, '.dsh-novel-conductor')), false)
})

test('原生 runbook：未知 run/step 报错，revision 冲突不写', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-native-runs-errors-'))
  const book = await ensureBook({ root, book: '总控书二' })
  await assert.rejects(() => readRun({ root, bookId: book.bookId, runId: 'run-missing-1' }), /ENOENT|no such file/u)
  const created = await createRun({ root, bookId: book.bookId, steps: [{ id: 's1' }] })
  await assert.rejects(() => updateRunStep({ root, bookId: book.bookId, runId: created.run.runId, stepId: 'nope', patch: { status: 'completed' } }), /没有这个 run step/u)
  await assert.rejects(() => updateRun({ root, bookId: book.bookId, runId: created.run.runId, patch: { status: 'completed' }, expectedRevision: 99 }), /revision 冲突/u)
})