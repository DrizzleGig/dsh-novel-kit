// v2 事务硬化：计划不可变、显式 null 前镜像、续交/回滚/补回执。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  planTransaction, commitTransaction, recoverTransaction, resumeTransaction,
  rollbackTransaction, readTransactionReceipt, transactionDir,
} from '../lib/storage/transaction.js'

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'kit-txv2-'))

test('同 txId 不能重复 plan；显式 beforeHash=null 表示文件必须不存在', async () => {
  const root = tmp()
  const file = path.join(root, 'a.json')
  writeFileSync(file, '{"v":1}')
  await assert.rejects(
    () => planTransaction({ root, txId: 'tx-a', files: [{ path: file, beforeHash: null, after: { v: 2 } }] }),
    /冲突/u,
  )
  await planTransaction({ root, txId: 'tx-a', files: [{ path: file, after: { v: 2 } }] })
  await assert.rejects(
    () => planTransaction({ root, txId: 'tx-a', files: [{ path: file, after: { v: 3 } }] }),
    /已存在/u,
  )
})

test('all-applied 但缺回执：resumeTransaction 核验计划后补回执', async () => {
  const root = tmp()
  const a = path.join(root, 'a.json')
  const b = path.join(root, 'b.json')
  writeFileSync(a, '{"v":1}')
  writeFileSync(b, '{"v":1}')
  await planTransaction({ root, txId: 'tx-b', files: [{ path: a, after: { v: 2 } }, { path: b, after: { v: 2 } }] })
  const dir = transactionDir(root, 'tx-b')
  writeFileSync(a, readFileSync(path.join(dir, 'after', '000.txt')))
  writeFileSync(b, readFileSync(path.join(dir, 'after', '001.txt')))
  const recovered = await recoverTransaction({ root, txId: 'tx-b' })
  assert.equal(recovered.status, 'completed')
  assert.equal(recovered.receiptMissing, true)
  const receipt = await resumeTransaction({ root, txId: 'tx-b' })
  assert.equal(receipt.status, 'completed')
  assert.equal((await readTransactionReceipt({ root, txId: 'tx-b' })).txId, 'tx-b')
})

test('partial 续交：applied 跳过、pending 补交，回执只写一次', async () => {
  const root = tmp()
  const a = path.join(root, 'a.json')
  const b = path.join(root, 'b.json')
  writeFileSync(a, '{"v":1}')
  writeFileSync(b, '{"v":1}')
  await planTransaction({ root, txId: 'tx-c', files: [{ path: a, after: { v: 2 } }, { path: b, after: { v: 2 } }] })
  const dir = transactionDir(root, 'tx-c')
  writeFileSync(a, readFileSync(path.join(dir, 'after', '000.txt')))
  assert.equal((await recoverTransaction({ root, txId: 'tx-c' })).status, 'partial')
  const receipt = await resumeTransaction({ root, txId: 'tx-c' })
  assert.equal(receipt.status, 'completed')
  assert.deepEqual(JSON.parse(readFileSync(a, 'utf8')), { v: 2 })
  assert.deepEqual(JSON.parse(readFileSync(b, 'utf8')), { v: 2 })
  const again = await commitTransaction({ root, txId: 'tx-c' })
  assert.equal(again.completedAt, receipt.completedAt, '重复提交返回同一回执')
})

test('rollback：只恢复仍为 after 的文件；新文件删除；pending 保持', async () => {
  const root = tmp()
  const a = path.join(root, 'a.json')
  const b = path.join(root, 'b.json')
  const created = path.join(root, 'new.json')
  writeFileSync(a, '{"v":1}')
  writeFileSync(b, '{"v":1}')
  await planTransaction({
    root,
    txId: 'tx-d',
    files: [
      { path: a, after: { v: 2 } },
      { path: b, after: { v: 2 } },
      { path: created, after: 'new' },
    ],
  })
  const dir = transactionDir(root, 'tx-d')
  writeFileSync(a, readFileSync(path.join(dir, 'after', '000.txt')))
  writeFileSync(created, readFileSync(path.join(dir, 'after', '002.txt')))
  const receipt = await rollbackTransaction({ root, txId: 'tx-d' })
  assert.equal(receipt.status, 'rolledBack')
  assert.deepEqual(JSON.parse(readFileSync(a, 'utf8')), { v: 1 })
  assert.deepEqual(JSON.parse(readFileSync(b, 'utf8')), { v: 1 })
  assert.equal(existsSync(created), false, 'before=null 的新文件在回滚时删除')
})
