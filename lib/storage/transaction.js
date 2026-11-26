// 可恢复事务：先落计划与前后镜像，再逐文件替换，最后回读核对。
//
// 这不是「跨文件原子提交」——崩溃后按磁盘事实判断每一项：
//   当前 hash == before → 该项未提交
//   当前 hash == after  → 该项已提交
//   两者都不同           → 外部修改，进入冲突，禁止盲目重放
//
// v2 硬化：
// - 同 txId 的计划/镜像不可变；重复 plan 直接拒绝。
// - 显式 beforeHash=null 表示「计划时文件必须不存在」，不能当没传。
// - 全部 after 但缺回执时，可由计划补回执；提交/恢复幂等。
// - resume 只补 after / 跳过已 after；rollback 只撤仍为 after 的目标。
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileHashOrNull, readJsonSnapshot, sha256, writeJsonAtomic, writeTextAtomic } from './atomic-json.js'

export const TX_ROOT = '.dsh-novel-kit/transactions'
export const TX_SCHEMA_VERSION = 1
export const SAFE_TX = /^(?!.*[.]{2})[A-Za-z0-9._-]{1,120}$/u

export class TransactionError extends Error {
  constructor(code, message, extra = {}) {
    super(message)
    this.name = 'TransactionError'
    this.code = code
    Object.assign(this, extra)
  }
}

function assertTxId(txId) {
  if (!SAFE_TX.test(String(txId ?? ''))) throw new TransactionError('bad-tx-id', 'txId 不合法：' + JSON.stringify(String(txId)))
  return String(txId)
}

export function transactionDir(root, txId) {
  assertTxId(txId)
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw new TransactionError('bad-root', 'transaction: root 必须是绝对路径')
  return path.join(root, TX_ROOT, assertTxId(txId))
}

async function readPlan(root, txId) {
  const file = path.join(transactionDir(root, txId), 'plan.json')
  try {
    const snap = await readJsonSnapshot(file)
    if (!snap.json || snap.json.txId !== txId || !Array.isArray(snap.json.files)) {
      throw new TransactionError('transaction-unreadable', `事务计划损坏：${txId}`)
    }
    return snap.json
  } catch (error) {
    if (error instanceof TransactionError) throw error
    throw new TransactionError('transaction-unreadable', `事务计划读不出来：${txId}（${String(error?.message ?? error)}）`)
  }
}

async function readReceiptOrNull(root, txId) {
  try {
    return (await readJsonSnapshot(path.join(transactionDir(root, txId), 'receipt.json'))).json
  } catch (error) {
    if (error?.code === 'ENOENT' || /ENOENT/.test(String(error?.message ?? ''))) return null
    throw new TransactionError('transaction-unreadable', `事务回执读不出来：${txId}（${String(error?.message ?? error)}）`)
  }
}

function sameHash(a, b) {
  return (a ?? null) === (b ?? null)
}

/**
 * 落事务计划；此时业务文件一个字节都不改。
 * @param {{root:string, txId:string, files:Array<{path:string, after:object|string, beforeHash?:string|null}>}} input
 */
export async function planTransaction({ root, txId, files } = {}) {
  assertTxId(txId)
  if (!Array.isArray(files) || files.length === 0) throw new TransactionError('empty-files', 'transaction: files 不能为空')
  const dir = transactionDir(root, txId)
  const planFile = path.join(dir, 'plan.json')
  try {
    await readJsonSnapshot(planFile)
    throw new TransactionError('transaction-exists', `事务计划已存在，不能覆盖：${txId}`)
  } catch (error) {
    if (error instanceof TransactionError) throw error
    if (!(error?.code === 'ENOENT' || /ENOENT/.test(String(error?.message ?? '')))) {
      throw new TransactionError('transaction-unreadable', `事务目录不可用：${txId}（${String(error?.message ?? error)}）`)
    }
  }
  await mkdir(path.join(dir, 'before'), { recursive: true })
  await mkdir(path.join(dir, 'after'), { recursive: true })

  const entries = []
  try {
    for (const [index, file] of files.entries()) {
      if (typeof file?.path !== 'string' || !path.isAbsolute(file.path)) {
        throw new TransactionError('bad-path', `transaction: files[${index}].path 必须是绝对路径`)
      }
      const beforeHash = await fileHashOrNull(file.path)
      if (Object.hasOwn(file, 'beforeHash') && !sameHash(file.beforeHash, beforeHash)) {
        throw new TransactionError('transaction-conflict', `transaction: 冲突（${path.basename(file.path)} 在计划之前已被修改）`)
      }
      const afterText = typeof file.after === 'string' ? file.after : `${JSON.stringify(file.after, null, 2)}\n`
      const afterHash = sha256(afterText)
      const name = String(index).padStart(3, '0')
      if (beforeHash !== null) {
        await writeFile(path.join(dir, 'before', `${name}.txt`), await readFile(file.path, 'utf8'), 'utf8')
      }
      await writeFile(path.join(dir, 'after', `${name}.txt`), afterText, 'utf8')
      entries.push({ path: file.path, beforeHash, afterHash, bytes: Buffer.byteLength(afterText) })
    }

    const plan = {
      format: 'kit.transaction',
      schemaVersion: TX_SCHEMA_VERSION,
      txId,
      createdAt: new Date().toISOString(),
      status: 'planned',
      files: entries,
    }
    await writeJsonAtomic(planFile, plan, { ensureDir: true })
    return { dir, plan }
  } catch (error) {
    // 计划未落盘：清掉本次写出的镜像，避免半个计划目录被误认为可恢复事务。
    await rm(dir, { recursive: true, force: true }).catch(() => {})
    throw error
  }
}

async function writeReceipt(root, txId, status, effects) {
  const receipt = {
    format: 'kit.transaction.receipt',
    schemaVersion: TX_SCHEMA_VERSION,
    txId,
    status,
    completedAt: new Date().toISOString(),
    effects,
  }
  await writeJsonAtomic(path.join(transactionDir(root, txId), 'receipt.json'), receipt, { ensureDir: true })
  return receipt
}

async function applyOne(dir, file, index) {
  const name = String(index).padStart(3, '0')
  const text = await readFile(path.join(dir, 'after', `${name}.txt`), 'utf8')
  const written = await writeTextAtomic(file.path, text)
  if (written.hash !== file.afterHash) throw new TransactionError('write-back-mismatch', `transaction: 写入回读哈希不一致（${path.basename(file.path)}）`)
  return { path: file.path, beforeHash: file.beforeHash, afterHash: file.afterHash }
}

/**
 * 提交事务：逐项 CAS（当前 hash 必须等于 beforeHash 或已是 after），全部成功才写回执。
 * 幂等：已有回执直接返回；全部 after 但缺回执时由计划补回执。
 */
export async function commitTransaction({ root, txId } = {}) {
  assertTxId(txId)
  const plan = await readPlan(root, txId)
  const existing = await readReceiptOrNull(root, txId)
  if (existing) return existing
  const dir = transactionDir(root, txId)
  const effects = []
  for (const [index, file] of plan.files.entries()) {
    const current = await fileHashOrNull(file.path)
    if (sameHash(current, file.afterHash)) {
      effects.push({ path: file.path, beforeHash: file.beforeHash, afterHash: file.afterHash })
      continue
    }
    if (!sameHash(current, file.beforeHash)) {
      throw new TransactionError('transaction-conflict', `transaction: 冲突（${path.basename(file.path)} 已被外部修改）`, { files: [{ path: file.path, current }] })
    }
    effects.push(await applyOne(dir, file, index))
  }
  return writeReceipt(root, txId, 'completed', effects)
}

/** 读已提交事务的回执；崩溃后恢复会话时用（不依赖原进程内存）。 */
export async function readTransactionReceipt({ root, txId } = {}) {
  assertTxId(txId)
  const receipt = await readReceiptOrNull(root, txId)
  if (!receipt) throw new TransactionError('receipt-missing', `事务还没有回执：${txId}`)
  return receipt
}

/**
 * 按磁盘事实判断事务进度。
 * @returns {{status:'completed'|'not_started'|'partial'|'conflict', files:Array<{path:string,state:string}>,
 *  receiptMissing:boolean, receipt:object|null, plan:object}}
 */
export async function recoverTransaction({ root, txId } = {}) {
  assertTxId(txId)
  const plan = await readPlan(root, txId)
  const receipt = await readReceiptOrNull(root, txId)
  if (receipt) {
    return { status: receipt.status === 'rolledBack' ? 'rolledBack' : 'completed', files: plan.files.map((file) => ({ path: file.path, state: 'decided' })), receiptMissing: false, receipt, plan }
  }
  const files = []
  for (const file of plan.files) {
    const current = await fileHashOrNull(file.path)
    let state
    if (sameHash(current, file.afterHash)) state = 'applied'
    else if (sameHash(current, file.beforeHash)) state = 'pending'
    else state = 'conflict'
    files.push({ path: file.path, state })
  }
  if (files.every((file) => file.state === 'applied')) {
    return { status: 'completed', files, receiptMissing: true, receipt: null, plan }
  }
  if (files.every((file) => file.state === 'pending')) return { status: 'not_started', files, receiptMissing: false, receipt: null, plan }
  if (files.some((file) => file.state === 'conflict')) return { status: 'conflict', files, receiptMissing: false, receipt: null, plan }
  return { status: 'partial', files, receiptMissing: false, receipt: null, plan }
}

/** 只读检查：恢复分类 + 计划/回执，不写任何业务文件。 */
export async function inspectTransaction({ root, txId } = {}) {
  return recoverTransaction({ root, txId })
}

/**
 * 续交一个 partial 事务：after 跳过、pending 补交；conflict 拒绝。
 * 全部落盘后补回执，再返回。
 */
export async function resumeTransaction({ root, txId } = {}) {
  assertTxId(txId)
  const current = await recoverTransaction({ root, txId })
  if (current.status === 'completed') {
    if (current.receipt) return current.receipt
    return writeReceipt(root, txId, 'completed', current.plan.files.map((file) => ({ path: file.path, beforeHash: file.beforeHash, afterHash: file.afterHash })))
  }
  if (current.status === 'conflict') throw new TransactionError('transaction-conflict', `事务存在冲突，不能续交：${txId}`, { recovery: current })
  if (current.status === 'rolledBack') throw new TransactionError('transaction-rolled-back', `事务已回滚，不能续交：${txId}`)
  if (current.status === 'not_started') return commitTransaction({ root, txId })

  const dir = transactionDir(root, txId)
  const effects = []
  for (const [index, file] of current.plan.files.entries()) {
    const state = current.files[index].state
    if (state === 'applied') {
      effects.push({ path: file.path, beforeHash: file.beforeHash, afterHash: file.afterHash })
      continue
    }
    if (state !== 'pending') throw new TransactionError('transaction-conflict', `事务存在冲突，不能续交：${txId}`)
    effects.push(await applyOne(dir, file, index))
  }
  return writeReceipt(root, txId, 'completed', effects)
}

/**
 * 回滚：只对仍为 after 的文件恢复 before；before=null 的新文件只删除仍为 after 的目标。
 * conflict 一律拒绝，保留现场。
 */
export async function rollbackTransaction({ root, txId } = {}) {
  assertTxId(txId)
  const current = await recoverTransaction({ root, txId })
  if (current.status === 'rolledBack') return current.receipt
  if (current.status === 'conflict') throw new TransactionError('transaction-conflict', `事务存在冲突，不能回滚：${txId}`, { recovery: current })
  const dir = transactionDir(root, txId)
  const effects = []
  for (const [index, file] of current.plan.files.entries()) {
    const state = current.files[index].state
    if (state !== 'applied') {
      effects.push({ path: file.path, beforeHash: file.beforeHash, afterHash: file.afterHash, restored: false })
      continue
    }
    const name = String(index).padStart(3, '0')
    if (file.beforeHash === null) {
      await rm(file.path, { force: true })
    } else {
      const text = await readFile(path.join(dir, 'before', `${name}.txt`), 'utf8')
      const written = await writeTextAtomic(file.path, text)
      if (written.hash !== file.beforeHash) throw new TransactionError('rollback-mismatch', `回滚回读哈希不一致：${path.basename(file.path)}`)
    }
    effects.push({ path: file.path, beforeHash: file.beforeHash, afterHash: file.afterHash, restored: true })
  }
  return writeReceipt(root, txId, 'rolledBack', effects)
}

/** 列出未完成的事务 id（有 plan、无 receipt）。 */
export async function pendingTransactions(root) {
  const dir = path.join(root, TX_ROOT)
  let names = []
  try {
    names = (await readdir(dir, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  } catch {
    return []
  }
  const out = []
  for (const txId of names) {
    try {
      await readFile(path.join(dir, txId, 'receipt.json'))
    } catch {
      // plan 也没有的目录不算 pending
      try { await readFile(path.join(dir, txId, 'plan.json')); out.push(txId) } catch { /* ignore */ }
    }
  }
  return out
}
