// 场景计划：kit 自有业务事实，原子写 + revision + 冲突。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readChapterPlan, saveChapterPlan, compilePlanBrief } from '../lib/engine/plan.js'
import { executeAuthorCommand } from '../lib/engine/author.js'

const root = () => mkdtempSync(path.join(os.tmpdir(), 'kit-plan-'))

test('场景计划：读写、revision 冲突、brief 截断', async () => {
  const dir = root()
  const empty = await readChapterPlan({ root: dir, book: '书', chapter: 3 })
  assert.equal(empty.available, false)
  assert.equal(empty.revision, 0)

  const saved = await saveChapterPlan({
    root: dir, book: '书', chapter: 3,
    intent: '让沈砚叫出那个名字', pov: '沈砚', place: '塔下',
    scenes: [
      { title: '塔下', goal: '确认名字', conflict: '裴照不承认', turn: '沈砚先开口', exit: '名字落地', cast: ['沈砚', '裴照'], targetChars: 1200 },
      { title: '最后一页', goal: '收尾', status: 'planned' },
    ],
  })
  assert.equal(saved.ok, true)
  assert.equal(saved.plan.revision, 1)
  const plan = await readChapterPlan({ root: dir, book: '书', chapter: 3 })
  assert.equal(plan.available, true)
  assert.equal(plan.scenes.length, 2)
  assert.equal(plan.scenes[0].goal, '确认名字')
  assert.equal(plan.scenes[0].cast.length, 2)

  const conflict = await saveChapterPlan({ root: dir, book: '书', chapter: 3, expectedRevision: 0, scenes: [] })
  assert.equal(conflict.ok, false)
  assert.equal(conflict.code, 'plan-conflict')

  const brief = compilePlanBrief(plan, { maxChars: 60 })
  assert.equal(brief.available, true)
  assert.ok(brief.chars <= 60)
  assert.ok(brief.markdown.includes('本章场景'))
})

test('作者命令：plan.save 带 operation 幂等', async () => {
  const dir = root()
  const input = {
    root: dir, operationId: 'op-plan-1', command: 'plan.save',
    targetRef: { book: '书', chapter: 2 },
    payload: { intent: '开局', scenes: [{ title: '雪夜出城', goal: '出城' }], expectedRevision: null },
    actor: { kind: 'author', trusted: true, source: 'panel' },
  }
  const first = await executeAuthorCommand(input)
  assert.equal(first.ok, true)
  assert.equal(first.plan.revision, 1)
  const again = await executeAuthorCommand(input)
  assert.equal(again.ok, true)
  assert.equal(again.idempotent, true)
})
