// kit 工作区写锁：同机活进程拒绝、死进程回收、未知身份拒接管、token 释放。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  acquireLock, releaseLock, inspectLock, withLock, hostId, lockFile, lockDir,
} from '../lib/storage/locks.js'

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'kit-lock-'))

function writeRecord(root, record) {
  mkdirSync(lockDir(root), { recursive: true })
  writeFileSync(lockFile(root), `${JSON.stringify(record, null, 2)}\n`, 'utf8')
}

test('acquire/release：同一时刻只有一个写者', async () => {
  const root = tmp()
  const lease = await acquireLock({ root, flowId: 'f1' })
  assert.equal((await inspectLock({ root })).state, 'alive')
  await assert.rejects(() => acquireLock({ root, flowId: 'f2' }), /已有 kit 写入者/u)
  await releaseLock({ root, token: lease.token })
  assert.equal((await inspectLock({ root })).state, 'free')
})

test('release：错误 token 不能释放别人的锁', async () => {
  const root = tmp()
  const lease = await acquireLock({ root })
  await assert.rejects(() => releaseLock({ root, token: 'wrong' }), /不属于当前写者/u)
  await releaseLock({ root, token: lease.token })
})

test('dead 记录可回收；unknown 异机记录拒接管', async () => {
  const root = tmp()
  writeRecord(root, {
    schemaVersion: 1, token: 'dead', flowId: '', hostId: hostId(), pid: 99999999,
    processStartTime: new Date().toISOString(), createdAt: new Date().toISOString(), heartbeatAt: new Date().toISOString(),
  })
  assert.equal((await inspectLock({ root })).state, 'dead')
  const lease = await acquireLock({ root })
  assert.ok(lease.token)
  await releaseLock({ root, token: lease.token })

  writeRecord(root, {
    schemaVersion: 1, token: 'remote', flowId: '', hostId: 'other-host', pid: 1234,
    processStartTime: new Date().toISOString(), createdAt: new Date().toISOString(), heartbeatAt: new Date().toISOString(),
  })
  assert.equal((await inspectLock({ root })).state, 'unknown')
  await assert.rejects(() => acquireLock({ root }), /拒绝自动接管/u)
})

test('坏记录按 unknown 拒绝；withLock 异常也释放', async () => {
  const root = tmp()
  mkdirSync(lockDir(root), { recursive: true })
  writeFileSync(lockFile(root), '{broken', 'utf8')
  assert.equal((await inspectLock({ root })).state, 'unknown')
  await assert.rejects(() => acquireLock({ root }), /拒绝自动接管/u)

  const root2 = tmp()
  await assert.rejects(() => withLock({ root: root2 }, async () => { throw new Error('boom') }), /boom/u)
  assert.equal((await inspectLock({ root: root2 })).state, 'free')
})
