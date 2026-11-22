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
