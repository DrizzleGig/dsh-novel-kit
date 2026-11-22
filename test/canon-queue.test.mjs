// canon 审阅队列：提案 / 接受 / 拒绝 / 应用，以及双版本与整批原子性。
//
// 这组用例对应 v0.4.0 设计文档 §7.4 的六条验收。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  defaultWorldContract, computeContentHash, contractHash, getPublishedCanon,
  readWorldContract, proposeCanonChanges, reviewCanonChange, applyCanonChanges,
  diffContractPatch, worldContractFile, migrateWorldContract,
} from '../lib/engine/canon.js'
import { worldContractView } from '../lib/host/views.js'

const BOOK = '长夜行'
const SOURCE = 'b'.repeat(64)

async function makeContract(extra = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kit-canon-'))
  const contract = {
    ...defaultWorldContract({ book: BOOK, sourceId: SOURCE, title: '原著' }),
    status: 'confirmed',
    contractRevision: 4,
    facts: [
      { id: 'f1', subject: '沈砚', key: '身份', value: '巡夜人' },
      { id: 'f2', subject: '裴照', key: '称呼', value: '沈大人' },
    ],
    characters: [{ id: 'c1', name: '沈砚' }],
    worldRules: ['夜里不能点灯'],
    revision: 19,
  }
  contract.contentHash = computeContentHash(contract)
  contract.hash = contractHash(contract)
  const file = worldContractFile(root, BOOK, SOURCE)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(contract, null, 2), 'utf8')
  return { root, file, contract }
}

async function readFileJson(file) {
  return JSON.parse(await readFile(file, 'utf8'))
}

test('提案不动生效版本：contractRevision 与 contentHash 都不变', async () => {
  const { root, file } = await makeContract()
  const proposed = await proposeCanonChanges({
    root, book: BOOK, sourceId: SOURCE,
    changes: [{ collection: 'facts', operation: 'add', after: { id: 'f3', subject: '陈璧', key: '身份', value: '教习' } }],
    expectedRevision: 19,
  })
  assert.equal(proposed.ok, true)
  assert.equal(proposed.revision, 20, '文档 revision +1')
  assert.equal(proposed.contractRevision, 4, '生效版本不动')

  const after = await readFileJson(file)
  assert.equal(after.contractRevision, 4)
  assert.equal(after.contentHash, computeContentHash(after))
  const published = getPublishedCanon(after)
  assert.equal(published.facts.length, 2, '待审候选不进生效投影')
  assert.equal('pendingChanges' in published, false)
})

test('拒绝与「接受但未应用」都不改生效内容', async () => {
  const { root, file } = await makeContract()
  const proposed = await proposeCanonChanges({
    root, book: BOOK, sourceId: SOURCE,
    changes: [
      { collection: 'facts', operation: 'add', after: { id: 'f3', subject: '陈璧', key: '身份', value: '教习' } },
      { collection: 'facts', operation: 'update', entryId: 'f2', after: { id: 'f2', subject: '裴照', key: '称呼', value: '阿砚' } },
    ],
    expectedRevision: 19,
  })
  assert.equal(proposed.ok, true)
  const [first, second] = proposed.created

  const rejected = await reviewCanonChange({ root, book: BOOK, sourceId: SOURCE, changeId: first, action: 'rejected', expectedRevision: 20 })
  assert.equal(rejected.ok, true)
  const accepted = await reviewCanonChange({ root, book: BOOK, sourceId: SOURCE, changeId: second, action: 'accepted', expectedRevision: 21 })
  assert.equal(accepted.ok, true)

  const after = await readFileJson(file)
  assert.equal(after.contractRevision, 4, '没有应用就不改生效版本')
  assert.equal(after.contentHash, computeContentHash(after))
  const published = getPublishedCanon(after)
  assert.equal(published.facts.find((item) => item.id === 'f2').value, '沈大人', '接受未应用也不进上下文')
})

test('应用：整批生效、生效版本 +1、内容指纹重算', async () => {
  const { root } = await makeContract()
  const before = await readWorldContract(root, BOOK, SOURCE)
  const proposed = await proposeCanonChanges({
    root, book: BOOK, sourceId: SOURCE,
    changes: [{ collection: 'facts', operation: 'update', entryId: 'f2', after: { id: 'f2', subject: '裴照', key: '称呼', value: '阿砚' } }],
    expectedRevision: 19,
  })
  const changeId = proposed.created[0]
  await reviewCanonChange({ root, book: BOOK, sourceId: SOURCE, changeId, action: 'accepted', expectedRevision: 20 })

  const applied = await applyCanonChanges({ root, book: BOOK, sourceId: SOURCE, changeIds: [changeId], expectedRevision: 21, operationId: 'op-apply-1', inputHash: 'h1' })
  assert.equal(applied.ok, true)
  assert.equal(applied.contractRevision, 5)
  assert.equal(applied.contentHash, computeContentHash({ ...(await readWorldContract(root, BOOK, SOURCE)) }))
  assert.notEqual(applied.contentHash, before.contentHash, '生效内容变了，指纹必须变')

  const after = await readWorldContract(root, BOOK, SOURCE)
  assert.equal(getPublishedCanon(after).facts.find((item) => item.id === 'f2').value, '阿砚')
  assert.equal(after.pendingChanges.find((item) => item.changeId === changeId).appliedRevision, 5)
})

test('同一批里有一条漂移：整批不写', async () => {
  const { root, file } = await makeContract()
  const proposed = await proposeCanonChanges({
    root, book: BOOK, sourceId: SOURCE,
    changes: [
      { collection: 'facts', operation: 'update', entryId: 'f1', after: { id: 'f1', subject: '沈砚', key: '身份', value: '巡夜人统领' } },
      { collection: 'facts', operation: 'update', entryId: 'f2', after: { id: 'f2', subject: '裴照', key: '称呼', value: '阿砚' } },
    ],
    expectedRevision: 19,
  })
  assert.equal(proposed.ok, true)
  for (const changeId of proposed.created) {
    await reviewCanonChange({ root, book: BOOK, sourceId: SOURCE, changeId, action: 'accepted', expectedRevision: proposed.revision })
    proposed.revision += 1
  }

  // 模拟外部把 f2 改掉（不改 revision，属于界面外的编辑）
  const raw = await readFileJson(file)
  raw.facts = raw.facts.map((item) => (item.id === 'f2' ? { ...item, value: '沈公子' } : item))
  await writeFile(file, JSON.stringify(raw, null, 2), 'utf8')

  const applied = await applyCanonChanges({ root, book: BOOK, sourceId: SOURCE, changeIds: proposed.created, expectedRevision: raw.revision })
  assert.equal(applied.ok, false)
  assert.equal(applied.code, 'canon-entry-drift')

  const after = await readFileJson(file)
  assert.equal(after.facts.find((item) => item.id === 'f1').value, '巡夜人', '一条冲突整批不写')
  assert.equal(after.contractRevision, 4)
})

test('丢掉回执后重试：同 operationId 同输入幂等', async () => {
  const { root } = await makeContract()
  const proposed = await proposeCanonChanges({
    root, book: BOOK, sourceId: SOURCE,
    changes: [{ collection: 'worldRules', operation: 'add', after: { id: 'r2', text: '白日不得鸣钟' } }],
    expectedRevision: 19,
  })
  const changeId = proposed.created[0]
  await reviewCanonChange({ root, book: BOOK, sourceId: SOURCE, changeId, action: 'accepted', expectedRevision: 20 })

  const first = await applyCanonChanges({ root, book: BOOK, sourceId: SOURCE, changeIds: [changeId], expectedRevision: 21, operationId: 'op-1', inputHash: 'hash-a' })
  assert.equal(first.ok, true)
  const retry = await applyCanonChanges({ root, book: BOOK, sourceId: SOURCE, changeIds: [changeId], expectedRevision: 21, operationId: 'op-1', inputHash: 'hash-a' })
  assert.equal(retry.ok, true)
  assert.equal(retry.idempotent, true)
  assert.equal(retry.contractRevision, first.contractRevision, '重试不再推进版本')

  const conflict = await applyCanonChanges({ root, book: BOOK, sourceId: SOURCE, changeIds: [changeId], expectedRevision: 21, operationId: 'op-1', inputHash: 'hash-b' })
  assert.equal(conflict.ok, false)
  assert.equal(conflict.code, 'operation-conflict')
})

test('基线过期：接受被拒，应用也被拒', async () => {
  const { root } = await makeContract()
  const proposed = await proposeCanonChanges({
    root, book: BOOK, sourceId: SOURCE,
    changes: [{ collection: 'facts', operation: 'add', after: { id: 'f9', subject: '陈璧', key: '身份', value: '教习' } }],
    expectedRevision: 19,
  })
  const changeId = proposed.created[0]
  // 模拟另一批提案应用后生效版本 +1
  const raw = await readWorldContract(root, BOOK, SOURCE)
  const other = await proposeCanonChanges({
    root, book: BOOK, sourceId: SOURCE,
    changes: [{ collection: 'facts', operation: 'update', entryId: 'f1', after: { id: 'f1', subject: '沈砚', key: '身份', value: '巡夜人统领' } }],
    expectedRevision: raw.revision,
  })
  await reviewCanonChange({ root, book: BOOK, sourceId: SOURCE, changeId: other.created[0], action: 'accepted', expectedRevision: other.revision })
  await applyCanonChanges({ root, book: BOOK, sourceId: SOURCE, changeIds: other.created, expectedRevision: other.revision + 1 })

  const reviewed = await reviewCanonChange({ root, book: BOOK, sourceId: SOURCE, changeId, action: 'accepted', expectedRevision: other.revision + 2 })
  assert.equal(reviewed.ok, false)
  assert.equal(reviewed.code, 'canon-base-stale')
})

test('schema 1 契约读时升级：有确认内容就给 contractRevision 1 与内容指纹', () => {
  const legacy = {
    schemaVersion: 1,
    book: BOOK,
    sourceId: SOURCE,
    status: 'confirmed',
    facts: [{ subject: '沈砚', key: '身份', value: '巡夜人' }],
    characters: [{ name: '沈砚' }],
    revision: 3,
  }
  const migrated = migrateWorldContract(legacy)
  assert.equal(migrated.schemaVersion, 2)
  assert.equal(migrated.contractRevision, 1)
  assert.equal(migrated.contentHash, computeContentHash(migrated))
  assert.deepEqual(migrated.pendingChanges, [])
  assert.deepEqual(migrated.appliedOperations, [])
})

test('diffContractPatch：整份替换换算成 add / update / remove', async () => {
  const { root } = await makeContract()
  const current = await readWorldContract(root, BOOK, SOURCE)
  const changes = diffContractPatch(current, {
    facts: [
      { id: 'f1', subject: '沈砚', key: '身份', value: '巡夜人统领' }, // update
      { id: 'f3', subject: '陈璧', key: '身份', value: '教习' }, // add
      // f2 没出现在 patch 里 → remove
    ],
    characters: [{ id: 'c1', name: '沈砚' }], // 与现有相同 → 无变更
  })
  const ops = changes.map((change) => change.operation + ':' + (change.entryId ?? change.after.id)).sort()
  assert.deepEqual(ops, ['add:f3', 'remove:f2', 'update:f1'])
  assert.equal(changes.every((change) => change.collection === 'facts'), true, '只有 facts 有改动')
})

test('schema 1 未确认契约迁移：旧条目全部转成待审候选，生效区清空', () => {
  const legacy = {
    schemaVersion: 1,
    book: BOOK,
    sourceId: SOURCE,
    status: 'pending-review',
    facts: [{ subject: '沈砚', key: '身份', value: '巡夜人' }],
    characters: [{ name: '沈砚' }, { name: '沈砚' }],
    revision: 7,
  }
  const first = migrateWorldContract(legacy, { book: BOOK, sourceId: SOURCE })
  assert.equal(first.contractRevision, 0)
  assert.equal(first.contentHash, null, '没有生效版本时不能拿空数组 hash 冒充')
  assert.equal(first.revision, 7, '迁移不重置文档 revision')
  assert.deepEqual(first.facts, [], '未确认内容不能留在生效区')
  assert.equal(first.pendingChanges.length, 3, '3 条旧条目全部转候选（含重复条目）')

  const ids = first.pendingChanges.map((item) => item.entryId)
  assert.equal(new Set(ids).size, 3, '重复条目不合并、ID 不碰撞')
  assert.equal(first.pendingChanges.every((item) => item.operation === 'add' && item.baseContractRevision === 0), true)

  const second = migrateWorldContract(legacy, { book: BOOK, sourceId: SOURCE })
  assert.deepEqual(
    second.pendingChanges.map((item) => item.changeId),
    first.pendingChanges.map((item) => item.changeId),
    '反复迁移必须得到同一组 changeId',
  )
  assert.equal(first.legacyV1.schemaVersion, 1, '原始资料要留档')
})

test('投影：没有生效版本时返回 null；有生效版本时是深拷贝', () => {
  const draft = { ...defaultWorldContract({ book: BOOK, sourceId: SOURCE }), facts: [{ subject: '沈砚' }], contractRevision: 0 }
  assert.equal(getPublishedCanon(draft), null)

  const live = { ...draft, contractRevision: 2, contentHash: computeContentHash(draft) }
  const published = getPublishedCanon(live)
  assert.ok(published)
  published.facts.push({ subject: '改投影' })
  assert.equal(live.facts.length, 1, '改投影不能污染原文档')
  assert.equal('pendingChanges' in published, false)
})

test('内容指纹：键顺序无关、数组顺序有关、审阅元数据无关', () => {
  const base = { ...defaultWorldContract({ book: BOOK, sourceId: SOURCE }), contractRevision: 1 }
  const ordered = { ...base, facts: [{ id: 'f1', subject: 'A', value: '1' }, { id: 'f2', subject: 'B', value: '2' }] }
  const reorderedKeys = { ...base, facts: [{ value: '1', subject: 'A', id: 'f1' }, { id: 'f2', value: '2', subject: 'B' }] }
  assert.equal(computeContentHash(ordered), computeContentHash(reorderedKeys), '对象键顺序不影响指纹')

  const swapped = { ...base, facts: [ordered.facts[1], ordered.facts[0]] }
  assert.notEqual(computeContentHash(ordered), computeContentHash(swapped), '数组顺序影响指纹（装配取前 N 条）')

  const reviewed = structuredClone(ordered)
  reviewed.facts[0].reviewedAt = '2026-11-23T00:00:00Z'
  reviewed.facts[0].note = '作者备注'
  assert.equal(computeContentHash(reviewed), computeContentHash(ordered), '审阅元数据不进指纹')
})

test('审阅历史追加而不覆盖；已应用的提案不能再审阅', async () => {
  const { root } = await makeContract()
  const proposed = await proposeCanonChanges({
    root, book: BOOK, sourceId: SOURCE,
    changes: [{ collection: 'facts', operation: 'add', after: { id: 'f7', subject: '陈璧', key: '身份', value: '教习' } }],
    expectedRevision: 19,
  })
  const changeId = proposed.created[0]

  const accepted = await reviewCanonChange({ root, book: BOOK, sourceId: SOURCE, changeId, action: 'accepted', expectedRevision: proposed.revision })
  assert.equal(accepted.ok, true)
  // 已接受未应用，可以改判为拒绝
  const rejected = await reviewCanonChange({ root, book: BOOK, sourceId: SOURCE, changeId, action: 'rejected', expectedRevision: proposed.revision + 1 })
  assert.equal(rejected.ok, true)

  const after = await readWorldContract(root, BOOK, SOURCE)
  const change = after.pendingChanges.find((item) => item.changeId === changeId)
  assert.equal(change.decision, 'rejected')
  assert.equal(change.reviewHistory.length, 2, '两次审阅都要留痕')
  assert.equal(change.reviewHistory[0].decision, 'accepted')
  assert.equal(change.reviewHistory[1].decision, 'rejected')

  // 拒绝后不能再应用
  const applied = await applyCanonChanges({ root, book: BOOK, sourceId: SOURCE, changeIds: [changeId], expectedRevision: after.revision })
  assert.equal(applied.ok, false)
  assert.equal(applied.code, 'canon-not-accepted')
})

test('已应用的提案不能再审阅', async () => {
  const { root } = await makeContract()
  const proposed = await proposeCanonChanges({
    root, book: BOOK, sourceId: SOURCE,
    changes: [{ collection: 'facts', operation: 'add', after: { id: 'f8', subject: '陈璧', key: '身份', value: '教习' } }],
    expectedRevision: 19,
  })
  const changeId = proposed.created[0]
  await reviewCanonChange({ root, book: BOOK, sourceId: SOURCE, changeId, action: 'accepted', expectedRevision: proposed.revision })
  const applied = await applyCanonChanges({ root, book: BOOK, sourceId: SOURCE, changeIds: [changeId], expectedRevision: proposed.revision + 1 })
  assert.equal(applied.ok, true)

  const again = await reviewCanonChange({ root, book: BOOK, sourceId: SOURCE, changeId, action: 'rejected', expectedRevision: applied.revision })
  assert.equal(again.ok, false)
  assert.equal(again.code, 'canon-already-applied')
})

test('expectedChangeHash 不匹配时拒绝审阅', async () => {
  const { root } = await makeContract()
  const proposed = await proposeCanonChanges({
    root, book: BOOK, sourceId: SOURCE,
    changes: [{ collection: 'facts', operation: 'add', after: { id: 'f9', subject: '陈璧', key: '身份', value: '教习' } }],
    expectedRevision: 19,
  })
  const changeId = proposed.created[0]
  const result = await reviewCanonChange({
    root, book: BOOK, sourceId: SOURCE, changeId, action: 'accepted',
    expectedChangeHash: 'not-the-hash', expectedRevision: proposed.revision,
  })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'canon-change-conflict')
})

test('worldContractView：版本分开、没有生效版本时投影为 null、审阅计数正确', () => {
  const draft = {
    ...defaultWorldContract({ book: BOOK, sourceId: SOURCE }),
    revision: 5,
    pendingChanges: [
      { changeId: 'c1', decision: 'pending', appliedRevision: null, collection: 'facts' },
      { changeId: 'c2', decision: 'accepted', appliedRevision: null, collection: 'facts' },
      { changeId: 'c3', decision: 'rejected', appliedRevision: null, collection: 'facts' },
      { changeId: 'c4', decision: 'accepted', appliedRevision: 2, collection: 'facts' },
    ],
  }
  const view = worldContractView(draft)
  assert.equal(view.available, true)
  assert.equal(view.revision, 5)
  assert.equal(view.contractRevision, 0)
  assert.equal(view.published, null, '没有生效版本时不该给投影')
  assert.deepEqual(view.reviewSummary, { pending: 1, accepted: 1, rejected: 1, applied: 1, total: 4 })
  assert.equal(view.changes.length, 4)
})

test('同一批不允许同一条目出现两条变更', async () => {
  const { root } = await makeContract()
  const result = await proposeCanonChanges({
    root, book: BOOK, sourceId: SOURCE,
    changes: [
      { collection: 'facts', operation: 'update', entryId: 'f1', after: { id: 'f1', subject: '沈砚', key: '身份', value: 'A' } },
      { collection: 'facts', operation: 'update', entryId: 'f1', after: { id: 'f1', subject: '沈砚', key: '身份', value: 'B' } },
    ],
    expectedRevision: 19,
  })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'canon-batch-duplicate')
})
