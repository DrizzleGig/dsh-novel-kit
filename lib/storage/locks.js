// kit 自己的工作区写锁：.dsh-novel-kit/locks/workspace.lock。
//
// 只保护 kit 自有写入；不读写五件的锁，也不声称兼容五件的锁。
// 三态：alive（同机 PID 还在）/ dead（同机 PID 不在）/ unknown（异机、坏记录、缺身份）。
// unknown 一律拒绝自动接管；dead 才在同一仲裁下重读 token 后回收。
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { hostname } from 'node:os'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

export const LOCK_ROOT = '.dsh-novel-kit/locks'
export const LOCK_FILE = `${LOCK_ROOT}/workspace.lock`
export const LOCK_SCHEMA_VERSION = 1
export const DEFAULT_TTL_MS = 30_000

export class LockError extends Error {
  constructor(code, message, extra = {}) {
    super(message)
    this.name = 'LockError'
    this.code = code
    Object.assign(this, extra)
  }
}

export function lockDir(root) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw new LockError('bad-root', 'lock: root 必须是绝对路径')
  return path.join(root, LOCK_ROOT)
}

export function lockFile(root) {
  return path.join(lockDir(root), 'workspace.lock')
}

/** 宿主身份；测试可用 DSH_NOVEL_KIT_HOST_ID 覆盖。 */
export function hostId() {
  return process.env.DSH_NOVEL_KIT_HOST_ID || hostname() || 'unknown-host'
}

export function processStartTime(now = Date.now()) {
  return new Date(now - Math.round(process.uptime() * 1000)).toISOString()
}

export function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

export function classifyLock(record, { sameHost = hostId(), alive = isProcessAlive } = {}) {
  if (!record || record.schemaVersion !== LOCK_SCHEMA_VERSION) return 'unknown'
  if (typeof record.hostId !== 'string' || record.hostId !== sameHost) return 'unknown'
  if (!Number.isInteger(record.pid) || record.pid <= 0) return 'unknown'
  return alive(record.pid) ? 'alive' : 'dead'
}

async function readRecord(file) {
  try {
    const text = await readFile(file, 'utf8')
    return JSON.parse(text)
  } catch (error) {
    if (error?.code === 'ENOENT' || /ENOENT/.test(String(error?.message ?? ''))) return null
    return { corrupt: true, error: String(error?.message ?? error) }
  }
}

function recordOf(token, flowId) {
  return {
    schemaVersion: LOCK_SCHEMA_VERSION,
    token,
    flowId: String(flowId ?? ''),
    hostId: hostId(),
    pid: process.pid,
    processStartTime: processStartTime(),
    createdAt: new Date().toISOString(),
    heartbeatAt: new Date().toISOString(),
  }
}

async function writeExclusive(file, record) {
  const handle = await open(file, 'wx')
  try {
    await handle.writeFile(`${JSON.stringify(record, null, 2)}\n`, 'utf8')
    await handle.sync().catch(() => {})
  } finally {
    await handle.close()
  }
}

/**
 * 获取工作区写锁。
 * @returns {Promise<{token:string, file:string, record:object}>}
 */
export async function acquireLock({ root, flowId = '', ttlMs = DEFAULT_TTL_MS } = {}) {
  const file = lockFile(root)
  await mkdir(lockDir(root), { recursive: true })
  const token = `lk-${randomUUID()}`
  const record = recordOf(token, flowId)
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await writeExclusive(file, record)
      return { token, file, record }
    } catch (error) {
      if (error?.code !== 'EEXIST') throw new LockError('lock-failed', `获取锁失败：${String(error?.message ?? error)}`)
    }
    const existing = await readRecord(file)
    if (!existing) continue
    const state = classifyLock(existing)
    if (state === 'alive') throw new LockError('lock-busy', '工作区已有 kit 写入者，稍后再试', { existing })
    if (state === 'unknown') throw new LockError('lock-unknown', '锁记录无法判定（异机/损坏/缺身份），拒绝自动接管', { existing })
    // dead：重读确认还是同一条记录，再删除；删除后重试创建。
    const again = await readRecord(file)
    if (!again || again.token !== existing?.token) continue
    await rm(file, { force: true })
  }
  throw new LockError('lock-busy', '工作区锁竞争失败，稍后再试')
}

export async function inspectLock({ root } = {}) {
  const file = lockFile(root)
  const record = await readRecord(file)
  if (!record) return { state: 'free', file }
  return { state: classifyLock(record), file, record }
}

export async function renewLock({ root, token } = {}) {
  const file = lockFile(root)
  const record = await readRecord(file)
  if (!record || record.token !== token) throw new LockError('lock-lost', '锁已不属于当前写者')
  const next = { ...record, heartbeatAt: new Date().toISOString() }
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  await rename(tmp, file)
  return next
}

export async function releaseLock({ root, token } = {}) {
  const file = lockFile(root)
  const record = await readRecord(file)
  if (!record) return { released: false, reason: 'free' }
  if (record.token !== token) throw new LockError('lock-lost', '锁已不属于当前写者，拒绝释放别人的锁')
  await rm(file, { force: true })
  return { released: true }
}

/** 持锁执行；异常也释放。 */
export async function withLock({ root, flowId = '', ttlMs = DEFAULT_TTL_MS } = {}, task) {
  const lease = await acquireLock({ root, flowId, ttlMs })
  try {
    return await task(lease)
  } finally {
    await releaseLock({ root, token: lease.token }).catch(() => {})
  }
}

export async function lockExists(root) {
  try { await stat(lockFile(root)); return true } catch { return false }
}
