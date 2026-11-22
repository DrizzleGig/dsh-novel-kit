// 同人 canon：抽取提交（pending-review）→ 作者确认（confirmed）→ start 可用。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { importCanon, updateWorldContract, confirmWorldContract, isCanonReady, readWorldContract } from '../lib/engine/canon.js'
import { readSourceMeta, readSourceChapter } from '../lib/engine/sources.js'
import { readProjectSettings } from '../lib/engine/settings.js'
import { executeAuthorCommand } from '../lib/engine/author.js'
import { collectSnapshot } from '../lib/host/snapshot.js'

const sample = [
  '第1章 雪夜',
  '陈凡推门进来。唐昊把令牌放在桌上。',
  '',
  '第2章 城门',
  '两人一路无话。',
].join('\n')

function workspace() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-canon-'))
  const file = path.join(root, '原著.txt')
  writeFileSync(file, sample, 'utf8')
  return { root, file }
}

test('canon：outline/read 共用 SourceDocument；propose 进入 pending-review，不自动确认', async () => {
  const { root, file } = workspace()
  const imported = await importCanon({ root, book: '书', file, title: '原著', confirmMode: true })
  assert.equal(imported.ok, true)
  const meta = await readSourceMeta(root, imported.sourceId)
  assert.equal(meta.chapterCount, 2)
  const text = await readSourceChapter(root, imported.sourceId, 'ch000')
  assert.match(text, /陈凡推门进来/)

  const proposed = await updateWorldContract({
    root, book: '书', sourceId: imported.sourceId,
    patch: {
      facts: [{ id: 'f1', entity: '唐昊', key: '身份', value: '封号斗罗' }],
      characters: [{ name: '陈凡' }, { name: '唐昊' }],
      worldRules: ['封港后不能点灯'],
    },
  })
  assert.equal(proposed.ok, true)
  assert.equal(proposed.contract.status, 'pending-review')
  assert.equal(isCanonReady(proposed.contract), false, '待审阅不算就绪')

  const confirmed = await confirmWorldContract({ root, book: '书', sourceId: imported.sourceId })
  assert.equal(confirmed.ok, true)
  assert.equal(confirmed.contract.status, 'confirmed')
  assert.equal(isCanonReady(confirmed.contract), true)
  const readBack = await readWorldContract(root, '书', imported.sourceId)
  assert.equal(readBack.facts.length, 1)
})

test('canon：空契约不能确认', async () => {
  const { root, file } = workspace()
  const imported = await importCanon({ root, book: '书', file, confirmMode: true })
  const result = await confirmWorldContract({ root, book: '书', sourceId: imported.sourceId })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'canon-empty')
})

test('canon：快照给任务卡 pending/ready 状态', async () => {
  const { root, file } = workspace()
  const imported = await importCanon({ root, book: '书', file, confirmMode: true })
  const pending = await collectSnapshot({ root, book: '书' })
  assert.equal(pending.canon.status, 'pending-extraction')
  assert.equal(pending.canon.ready, false)
  await updateWorldContract({ root, book: '书', sourceId: imported.sourceId, patch: { worldRules: ['封港后不能点灯'] } })
  await confirmWorldContract({ root, book: '书', sourceId: imported.sourceId })
  const ready = await collectSnapshot({ root, book: '书' })
  assert.equal(ready.canon.ready, true)
  assert.equal(ready.canon.worldRules, 1)
})

test('canon：无效条目不能确认，也不会让装配崩溃', async () => {
  const { root, file } = workspace()
  const imported = await importCanon({ root, book: '书', file, confirmMode: true })
  const updated = await updateWorldContract({
    root, book: '书', sourceId: imported.sourceId,
    patch: { worldRules: ['   '], facts: [null], characters: [{}] },
  })
  assert.equal(updated.ok, true)
  const confirmed = await confirmWorldContract({ root, book: '书', sourceId: imported.sourceId })
  assert.equal(confirmed.ok, false)
  assert.equal(confirmed.code, 'canon-empty')
  assert.equal(isCanonReady(updated.contract), false)
})

test('canon：expectedRevision 防覆盖；并发编辑只有一个成功', async () => {
  const { root, file } = workspace()
  const imported = await importCanon({ root, book: '书', file, confirmMode: true })
  const startRevision = imported.contract?.revision ?? 1
  const first = await updateWorldContract({
    root, book: '书', sourceId: imported.sourceId, expectedRevision: startRevision,
    patch: { characters: [{ name: '陈凡' }] },
  })
  assert.equal(first.ok, true)
  const stale = await updateWorldContract({
    root, book: '书', sourceId: imported.sourceId, expectedRevision: startRevision,
    patch: { characters: [{ name: '唐昊' }] },
  })
  assert.equal(stale.ok, false)
  assert.equal(stale.code, 'canon-conflict')

  const [a, b] = await Promise.all([
    updateWorldContract({ root, book: '书', sourceId: imported.sourceId, expectedRevision: first.contract.revision, patch: { worldRules: ['规则 A'] } }),
    updateWorldContract({ root, book: '书', sourceId: imported.sourceId, expectedRevision: first.contract.revision, patch: { worldRules: ['规则 B'] } }),
  ])
  assert.equal([a, b].filter((item) => item.ok).length, 1)
  assert.equal([a, b].filter((item) => item.code === 'canon-conflict').length, 1)
})

test('canon：已确认后模型 propose 不能悄悄取消确认；作者编辑可以', async () => {
  const { root, file } = workspace()
  const imported = await importCanon({ root, book: '书', file, confirmMode: true })
  await updateWorldContract({ root, book: '书', sourceId: imported.sourceId, patch: { characters: [{ name: '陈凡' }] } })
  await confirmWorldContract({ root, book: '书', sourceId: imported.sourceId })
  const model = await updateWorldContract({ root, book: '书', sourceId: imported.sourceId, patch: { characters: [{ name: '唐昊' }] } })
  assert.equal(model.ok, false)
  assert.equal(model.code, 'canon-confirmed')
  const actor = { kind: 'author', trusted: true, source: 'panel' }
  const author = await executeAuthorCommand({
    root, operationId: 'op-canon-reopen-1', command: 'canon.update',
    targetRef: { book: '书', sourceId: imported.sourceId },
    payload: { patch: { characters: [{ name: '唐昊' }] } }, actor,
  })
  assert.equal(author.ok, true)
  assert.equal(author.contract.status, 'pending-review')
})

test('作者命令：canon.confirm 走 operation，且必须绑定当前 canon', async () => {
  const { root, file } = workspace()
  const imported = await importCanon({ root, book: '书', file, confirmMode: true })
  const actor = { kind: 'author', trusted: true, source: 'panel' }
  const updated = await executeAuthorCommand({
    root, operationId: 'op-canon-update-1', command: 'canon.update',
    targetRef: { book: '书', sourceId: imported.sourceId },
    payload: { patch: { characters: [{ name: '陈凡' }] } }, actor,
  })
  assert.equal(updated.ok, true)
  assert.equal(updated.contract.status, 'pending-review')
  const ok = await executeAuthorCommand({
    root, operationId: 'op-canon-confirm-1', command: 'canon.confirm',
    targetRef: { book: '书', sourceId: imported.sourceId }, actor,
  })
  assert.equal(ok.ok, true)
  assert.equal(ok.contract.status, 'confirmed')
  const settings = await readProjectSettings(root, '书')
  assert.equal(settings.activeCanonSourceId, imported.sourceId)

  const wrong = await executeAuthorCommand({
    root, operationId: 'op-canon-confirm-2', command: 'canon.confirm',
    targetRef: { book: '书', sourceId: 'c'.repeat(64) }, actor,
  })
  assert.equal(wrong.ok, false)
  assert.equal(wrong.code, 'canon-not-bound')
})
