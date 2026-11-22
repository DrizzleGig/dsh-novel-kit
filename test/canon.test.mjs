// 同人 canon：候选队列是唯一写入口；旧整份更新/确认已停用。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import {
  importCanon, isCanonReady, readWorldContract, computeContentHash, contractHash,
  defaultWorldContract, worldContractFile, proposeCanonChanges,
  updateWorldContract, confirmWorldContract,
} from '../lib/engine/canon.js'
import { writeJsonAtomic } from '../lib/storage/atomic-json.js'
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

/** 测试种子：直接落一份合法契约（生产路径只能走队列）。 */
async function putContract(root, book, sourceId, patch = {}, { status = 'pending-review', contractRevision = 1 } = {}) {
  let current
  try {
    current = await readWorldContract(root, book, sourceId)
  } catch {
    current = defaultWorldContract({ book, sourceId })
  }
  const next = { ...current }
  for (const field of ['facts', 'characters', 'relationships', 'addresses', 'secrets', 'worldRules', 'timeline', 'forbidden']) {
    if (Array.isArray(patch[field])) next[field] = patch[field]
  }
  if (patch.title) next.title = patch.title
  next.status = status
  next.contractRevision = contractRevision
  next.revision = (Number.isInteger(current.revision) ? current.revision : 0) + 1
  next.contentHash = computeContentHash(next)
  next.hash = contractHash(next)
  const file = worldContractFile(root, book, sourceId)
  await mkdir(path.dirname(file), { recursive: true })
  await writeJsonAtomic(file, next, { ensureDir: true })
  return next
}

test('canon：outline/read 共用 SourceDocument；候选只进队列，不自动确认', async () => {
  const { root, file } = workspace()
  const imported = await importCanon({ root, book: '书', file, title: '原著', confirmMode: true })
  assert.equal(imported.ok, true)
  const meta = await readSourceMeta(root, imported.sourceId)
  assert.equal(meta.chapterCount, 2)
  const text = await readSourceChapter(root, imported.sourceId, 'ch000')
  assert.match(text, /陈凡推门进来/)

  const proposed = await proposeCanonChanges({
    root, book: '书', sourceId: imported.sourceId,
    changes: [
      { collection: 'facts', operation: 'add', after: { id: 'f1', entity: '唐昊', key: '身份', value: '封号斗罗' } },
      { collection: 'characters', operation: 'add', after: { id: 'c1', name: '陈凡' } },
      { collection: 'worldRules', operation: 'add', after: { id: 'r1', text: '封港后不能点灯' } },
    ],
  })
  assert.equal(proposed.ok, true)
  assert.equal(proposed.created.length, 3)

  const contract = await readWorldContract(root, '书', imported.sourceId)
  assert.equal(contract.status, 'pending-extraction', '候选不改契约状态')
  assert.equal(contract.contractRevision, 0)
  assert.equal(isCanonReady(contract), false, '待审阅不算就绪')
  assert.equal(contract.facts.length, 0, '候选不进生效区')
})

test('旧整份更新 / 确认已停用，返回 canon-queue-required', async () => {
  const { root, file } = workspace()
  const imported = await importCanon({ root, book: '书', file, confirmMode: true })
  const updated = await updateWorldContract({ root, book: '书', sourceId: imported.sourceId, patch: { worldRules: ['规则'] } })
  assert.equal(updated.ok, false)
  assert.equal(updated.code, 'canon-queue-required')
  const confirmed = await confirmWorldContract({ root, book: '书', sourceId: imported.sourceId })
  assert.equal(confirmed.ok, false)
  assert.equal(confirmed.code, 'canon-queue-required')
})

test('canon：快照给任务卡 pending/ready 状态', async () => {
  const { root, file } = workspace()
  const imported = await importCanon({ root, book: '书', file, confirmMode: true })
  const pending = await collectSnapshot({ root, book: '书' })
  assert.equal(pending.canon.status, 'pending-extraction')
  assert.equal(pending.canon.ready, false)

  await putContract(root, '书', imported.sourceId, { worldRules: [{ id: 'r1', text: '封港后不能点灯' }] }, { status: 'confirmed', contractRevision: 1 })
  const ready = await collectSnapshot({ root, book: '书' })
  assert.equal(ready.canon.ready, true)
  assert.equal(ready.canon.worldRules, 1)
})

test('canon：无效条目不能进队列', async () => {
  const { root, file } = workspace()
  const imported = await importCanon({ root, book: '书', file, confirmMode: true })
  const blank = await proposeCanonChanges({
    root, book: '书', sourceId: imported.sourceId,
    changes: [{ collection: 'worldRules', operation: 'add', after: { text: '   ' } }],
  })
  assert.equal(blank.ok, false)
  assert.equal(blank.code, 'canon-invalid-change')

  const nullFact = await proposeCanonChanges({
    root, book: '书', sourceId: imported.sourceId,
    changes: [{ collection: 'facts', operation: 'add', after: null }],
  })
  assert.equal(nullFact.ok, false)
  assert.equal(nullFact.code, 'canon-invalid-change')
})

test('canon：expectedRevision 防覆盖；并发提案只有一个成功', async () => {
  const { root, file } = workspace()
  const imported = await importCanon({ root, book: '书', file, confirmMode: true })
  const startRevision = (await readWorldContract(root, '书', imported.sourceId)).revision

  const first = await proposeCanonChanges({
    root, book: '书', sourceId: imported.sourceId, expectedRevision: startRevision,
    changes: [{ collection: 'characters', operation: 'add', after: { id: 'c1', name: '陈凡' } }],
  })
  assert.equal(first.ok, true)
  const stale = await proposeCanonChanges({
    root, book: '书', sourceId: imported.sourceId, expectedRevision: startRevision,
    changes: [{ collection: 'characters', operation: 'add', after: { id: 'c2', name: '唐昊' } }],
  })
  assert.equal(stale.ok, false)
  assert.equal(stale.code, 'canon-conflict')

  const [a, b] = await Promise.all([
    proposeCanonChanges({ root, book: '书', sourceId: imported.sourceId, expectedRevision: first.revision, changes: [{ collection: 'worldRules', operation: 'add', after: { id: 'rA', text: '规则 A' } }] }),
    proposeCanonChanges({ root, book: '书', sourceId: imported.sourceId, expectedRevision: first.revision, changes: [{ collection: 'worldRules', operation: 'add', after: { id: 'rB', text: '规则 B' } }] }),
  ])
  assert.equal([a, b].filter((item) => item.ok).length, 1)
  assert.equal([a, b].filter((item) => item.code === 'canon-conflict').length, 1)
})

function placeholderRemoved() {}

test('作者命令：canon.update / confirm 停用，canon.propose 只产候选', async () => {
  const { root, file } = workspace()
  const imported = await importCanon({ root, book: '书', file, confirmMode: true })
  const actor = { kind: 'author', trusted: true, source: 'panel' }

  const legacyUpdate = await executeAuthorCommand({
    root, operationId: 'op-canon-update-1', command: 'canon.update',
    targetRef: { book: '书', sourceId: imported.sourceId },
    payload: { patch: { characters: [{ name: '陈凡' }] } }, actor,
  })
  assert.equal(legacyUpdate.ok, false)
  assert.equal(legacyUpdate.code, 'canon-queue-required')

  const proposed = await executeAuthorCommand({
    root, operationId: 'op-canon-propose-1', command: 'canon.propose',
    targetRef: { book: '书', sourceId: imported.sourceId },
    payload: { changes: [{ collection: 'characters', operation: 'add', after: { id: 'c1', name: '陈凡' } }] }, actor,
  })
  assert.equal(proposed.ok, true)
  assert.equal(proposed.created.length, 1)

  const legacyConfirm = await executeAuthorCommand({
    root, operationId: 'op-canon-confirm-1', command: 'canon.confirm',
    targetRef: { book: '书', sourceId: imported.sourceId }, actor,
  })
  assert.equal(legacyConfirm.ok, false)
  assert.equal(legacyConfirm.code, 'canon-queue-required')
})

test('作者命令：评审 + 应用闭环后契约自动成为已确认', async () => {
  const { root, file } = workspace()
  const imported = await importCanon({ root, book: '书', file, confirmMode: true })
  const actor = { kind: 'author', trusted: true, source: 'panel' }
  const proposed = await executeAuthorCommand({
    root, operationId: 'op-canon-propose-2', command: 'canon.propose',
    targetRef: { book: '书', sourceId: imported.sourceId },
    payload: { changes: [{ collection: 'worldRules', operation: 'add', after: { id: 'r1', text: '封港后不能点灯' } }] }, actor,
  })
  assert.equal(proposed.ok, true)

  await executeAuthorCommand({
    root, operationId: 'op-canon-review-2', command: 'canon.review',
    targetRef: { book: '书', sourceId: imported.sourceId, changeId: proposed.created[0] },
    payload: { action: 'accepted' }, actor,
  })
  const applied = await executeAuthorCommand({
    root, operationId: 'op-canon-apply-2', command: 'canon.apply',
    targetRef: { book: '书', sourceId: imported.sourceId },
    payload: { changeIds: proposed.created }, actor,
  })
  assert.equal(applied.ok, true)
  assert.equal(applied.contractRevision, 1)

  const contract = await readWorldContract(root, '书', imported.sourceId)
  assert.equal(contract.status, 'confirmed', '应用候选后自动确认')
  assert.equal(isCanonReady(contract), true)
  const settings = await readProjectSettings(root, '书')
  assert.equal(settings.activeCanonSourceId, imported.sourceId)
})

test('作者命令：未绑定的 canon 不能评审', async () => {
  const { root, file } = workspace()
  const imported = await importCanon({ root, book: '书', file, confirmMode: true })
  const actor = { kind: 'author', trusted: true, source: 'panel' }
  const wrong = await executeAuthorCommand({
    root, operationId: 'op-canon-review-3', command: 'canon.review',
    targetRef: { book: '书', sourceId: 'c'.repeat(64), changeId: 'anything' }, actor,
  })
  assert.equal(wrong.ok, false)
  assert.equal(wrong.code, 'canon-not-bound')
  assert.equal(imported.ok, true)
})
