// S1 第一批：状态机 + 可恢复事务 + 原子写。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { canTransition, transition, isTerminal, STATES } from '../lib/engine/state-machine.js'
import { planTransaction, commitTransaction, recoverTransaction, pendingTransactions, transactionDir } from '../lib/storage/transaction.js'
import { readJsonSnapshot, writeJsonAtomic, sha256 } from '../lib/storage/atomic-json.js'

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'kit-s1-'))

test('状态机：正常路径可推进，跳步与终态不可', () => {
  assert.equal(canTransition('preparing', 'writing'), true)
  assert.equal(canTransition('preparing', 'completed'), false)
  assert.equal(canTransition('writing', 'checking'), true)
  assert.equal(canTransition('checking', 'committing'), true)
  assert.equal(canTransition('committing', 'completed'), true)
  assert.equal(isTerminal('completed'), true)
  assert.equal(isTerminal('aborted'), true)
  for (const state of STATES) {
    if (state === 'completed' || state === 'aborted') assert.deepEqual(canTransition(state, 'writing'), false)
  }
})

test('状态机：blocked 能回到原状态，未知状态报错', () => {
  const blocked = transition({ state: 'writing' }, 'blocked', { reason: '上下文过期', code: 'context_stale' })
  assert.equal(blocked.state, 'blocked')
  assert.equal(blocked.lastError.code, 'context_stale')
  assert.equal(transition(blocked, 'writing').state, 'writing')
  assert.throws(() => transition({ state: 'nope' }, 'writing'), /未知状态/)
  assert.throws(() => transition({ state: 'preparing' }, 'completed'), /不允许/)
})

test('原子写：写入后可读回，哈希与内容一致', async () => {
  const root = tmp()
  const file = path.join(root, 'a.json')
  const { hash } = await writeJsonAtomic(file, { hello: '世界', n: 1 })
  const snap = await readJsonSnapshot(file)
  assert.deepEqual(snap.json, { hello: '世界', n: 1 })
  assert.equal(snap.hash, hash)
  assert.equal(hash, sha256(snap.text))
})

test('事务：计划→提交，两个文件都落盘，回执可查', async () => {
  const root = tmp()
  const a = path.join(root, 'a.json')
  const b = path.join(root, 'b.json')
  writeFileSync(a, '{"v":1}')
  const { dir, plan } = await planTransaction({
    root,
    txId: 'tx-1',
    files: [
      { path: a, after: { v: 2 } },
      { path: b, after: { created: true } },
    ],
  })
  assert.equal(plan.files.length, 2)
  assert.equal(plan.files[1].beforeHash, null, '新文件 beforeHash 为 null')
  const receipt = await commitTransaction({ root, txId: 'tx-1' })
  assert.equal(receipt.status, 'completed')
  assert.deepEqual(JSON.parse(readFileSync(a, 'utf8')), { v: 2 })
  assert.deepEqual(JSON.parse(readFileSync(b, 'utf8')), { created: true })
  assert.ok(dir.includes('transactions'))

  const recovered = await recoverTransaction({ root, txId: 'tx-1' })
  assert.equal(recovered.status, 'completed')
  assert.deepEqual(await pendingTransactions(root), [])
})

test('事务：外部修改导致冲突，提交不覆盖', async () => {
  const root = tmp()
  const a = path.join(root, 'a.json')
  writeFileSync(a, '{"v":1}')
  await planTransaction({ root, txId: 'tx-2', files: [{ path: a, after: { v: 2 } }] })
  writeFileSync(a, '{"v":99}') // 外部修改
  await assert.rejects(() => commitTransaction({ root, txId: 'tx-2' }), /冲突/)
  assert.deepEqual(JSON.parse(readFileSync(a, 'utf8')), { v: 99 })
  const recovered = await recoverTransaction({ root, txId: 'tx-2' })
  assert.equal(recovered.status, 'conflict')
  assert.deepEqual(await pendingTransactions(root), ['tx-2'])
})

test('事务：未提交时恢复为 not_started，提交一半为 partial', async () => {
  const root = tmp()
  const a = path.join(root, 'a.json')
  const b = path.join(root, 'b.json')
  writeFileSync(a, '{"v":1}')
  writeFileSync(b, '{"v":1}')
  await planTransaction({
    root,
    txId: 'tx-3',
    files: [
      { path: a, after: { v: 2 } },
      { path: b, after: { v: 2 } },
    ],
  })
  assert.equal((await recoverTransaction({ root, txId: 'tx-3' })).status, 'not_started')
  // 手工模拟「提交了一半」：a 已写成 after，b 未动
  const dir = transactionDir(root, 'tx-3')
  writeFileSync(a, readFileSync(path.join(dir, 'after', '000.txt')))
  const partial = await recoverTransaction({ root, txId: 'tx-3' })
  assert.equal(partial.status, 'partial')
  assert.deepEqual(partial.files.map((file) => file.state), ['applied', 'pending'])
})

test('事务：调用方给的前镜像哈希与磁盘不一致时立刻拒绝（并发写不被当成 before）', async () => {
  const root = tmp()
  const file = path.join(root, 'book.json')
  writeFileSync(file, JSON.stringify({ a: 1 }, null, 2))
  await assert.rejects(
    () => planTransaction({ root, txId: 'tx-early-conflict', files: [{ path: file, after: { a: 2 }, beforeHash: 'deadbeef' }] }),
    /冲突/,
  )
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { a: 1 })
})

test('事务：after 是纯文本时按原文写入（不是 JSON 字符串）', async () => {
  const root = tmp()
  const file = path.join(root, '第1章.md')
  await planTransaction({ root, txId: 'tx-text', files: [{ path: file, after: '正文第一段\n' }] })
  await commitTransaction({ root, txId: 'tx-text' })
  assert.equal(readFileSync(file, 'utf8'), '正文第一段\n')
})
