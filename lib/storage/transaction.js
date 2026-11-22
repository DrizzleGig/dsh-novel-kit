// 可恢复事务：先落计划与前后镜像，再逐文件替换，最后回读核对。
//
// 这不是「跨文件原子提交」——崩溃后按磁盘事实判断每一项：
//   当前 hash == before → 该项未提交
//   当前 hash == after  → 该项已提交
//   两者都不同           → 外部修改，进入冲突，禁止盲目重放
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileHashOrNull, readJsonSnapshot, sha256, writeJsonAtomic, writeTextAtomic } from './atomic-json.js'

export const TX_ROOT = '.dsh-novel-kit/transactions'

export const SAFE_TX = /^(?!.*[.]{2})[A-Za-z0-9._-]{1,120}$/

function assertTxId(txId) {
  if (!SAFE_TX.test(String(txId ?? ''))) throw new Error('txId 不合法：' + JSON.stringify(String(txId)))
  return String(txId)
}

export function transactionDir(root, txId) {
  assertTxId(txId)
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw new Error('transaction: root 必须是绝对路径')
  if (typeof txId !== 'string' || !/^[A-Za-z0-9._-]{1,120}$/.test(txId)) throw new Error('transaction: txId 不合法')
  return path.join(root, TX_ROOT, txId)
}

/**
 * 落事务计划；此时业务文件一个字节都不改。
 * @param {{root:string, txId:string, files:Array<{path:string, after:object|string}>}} input
 */
export async function planTransaction({ root, txId, files }) {
  if (!Array.isArray(files) || files.length === 0) throw new Error('transaction: files 不能为空')
  const dir = transactionDir(root, txId)
  await mkdir(path.join(dir, 'before'), { recursive: true })
  await mkdir(path.join(dir, 'after'), { recursive: true })

  const entries = []
  for (const [index, file] of files.entries()) {
    if (typeof file?.path !== 'string' || !path.isAbsolute(file.path)) {
      throw new Error(`transaction: files[${index}].path 必须是绝对路径`)
    }
    const beforeHash = await fileHashOrNull(file.path)
    // 调用方若给了「我看到的前镜像哈希」，必须与磁盘一致，避免把并发写当成自己的 before。
    if (file.beforeHash && file.beforeHash !== beforeHash) {
      throw new Error(`transaction: 冲突（${path.basename(file.path)} 在计划之前已被修改）`)
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
    schemaVersion: 1,
    txId,
    createdAt: new Date().toISOString(),
    status: 'planned',
    files: entries,
  }
  await writeJsonAtomic(path.join(dir, 'plan.json'), plan)
  return { dir, plan }
}

/**
 * 提交事务：逐项 CAS（当前 hash 必须等于 beforeHash），全部成功才写回执。
 * 失败时不回滚已写文件——恢复器按前后镜像判断。
 */
export async function commitTransaction({ root, txId }) {  const dir = transactionDir(root, txId)
  const { json: plan } = await readJsonSnapshot(path.join(dir, 'plan.json'))
  const effects = []
  for (const [index, file] of plan.files.entries()) {
    const current = await fileHashOrNull(file.path)
    if (current !== file.beforeHash) {
      throw new Error(`transaction: 冲突（${path.basename(file.path)} 已被外部修改）`)
    }
    const text = await readFile(path.join(dir, 'after', `${String(index).padStart(3, '0')}.txt`), 'utf8')
    // 只按计划里的 after 文本写，不猜内容类型：正文恰好是合法 JSON 时也不能被重新序列化。
    const written = await writeTextAtomic(file.path, text)
    if (written.hash !== file.afterHash) throw new Error('transaction: 写入回读哈希不一致')
    effects.push({ path: file.path, beforeHash: file.beforeHash, afterHash: file.afterHash })
  }
  const receipt = {
    schemaVersion: 1,
    txId,
    status: 'completed',
    completedAt: new Date().toISOString(),
    effects,
  }
  await writeJsonAtomic(path.join(dir, 'receipt.json'), receipt)
  return receipt
}

/** 读已提交事务的回执；崩溃后恢复会话时用（不依赖原进程内存）。 */
export async function readTransactionReceipt({ root, txId }) {
  const { json } = await readJsonSnapshot(path.join(transactionDir(root, txId), 'receipt.json'))
  return json
}

/**
 * 按磁盘事实判断事务进度。
 * @returns {{status:'completed'|'not_started'|'partial'|'conflict', files:Array<{path:string,state:string}>}}
 */
export async function recoverTransaction({ root, txId }) {
  const dir = transactionDir(root, txId)
  const { json: plan } = await readJsonSnapshot(path.join(dir, 'plan.json'))
  const files = []
  for (const file of plan.files) {
    const current = await fileHashOrNull(file.path)
    let state
    if (current === file.afterHash) state = 'applied'
    else if (current === file.beforeHash) state = 'pending'
    else state = 'conflict'
    files.push({ path: file.path, state })
  }
  if (files.every((file) => file.state === 'applied')) return { status: 'completed', files }
  if (files.every((file) => file.state === 'pending')) return { status: 'not_started', files }
  if (files.some((file) => file.state === 'conflict')) return { status: 'conflict', files }
  return { status: 'partial', files }
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
      out.push(txId)
    }
  }
  return out
}
