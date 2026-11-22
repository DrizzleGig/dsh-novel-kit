// 作者命令的操作日志：operationId + 输入 hash + 状态 + 结果。
//
// 目的不是替代事务，而是让「按钮点了两次 / 请求超时 / 进程重启」有一个可查的幂等键：
//   同 operationId + 同输入 → 返回上次结果；
//   同 operationId + 不同输入 → conflict；
//   失败/中断可重试，但不会重复写业务账（业务调用自身也要幂等）。
import path from 'node:path'
import { readJsonSnapshot, sha256, writeJsonAtomic } from '../storage/atomic-json.js'
import { KIT_DIR } from './settings.js'

export const OPERATION_SCHEMA_VERSION = 1
const SAFE_OPERATION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/u

export function operationsRoot(root) {
  return path.join(root, KIT_DIR, 'operations')
}

export function operationFile(root, operationId) {
  const id = String(operationId ?? '')
  if (!SAFE_OPERATION.test(id)) throw new Error('operationId 不合法：' + JSON.stringify(id))
  return path.join(operationsRoot(root), `${id}.json`)
}

/** 稳定序列化：对象键排序，保证同输入得到同 hash。 */
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']'
  const keys = Object.keys(value).sort()
  return '{' + keys.map((key) => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}'
}

export function operationInputHash(input) {
  return sha256(stableStringify(input))
}

export async function readOperation(root, operationId) {
  try {
    const snap = await readJsonSnapshot(operationFile(root, operationId))
    return snap.json
  } catch (error) {
    if (error?.code === 'ENOENT' || /ENOENT/.test(String(error?.message ?? ''))) return null
    throw error
  }
}

function assertAuthor(actor) {
  if (!actor || actor.kind !== 'author' || actor.trusted !== true) {
    return { ok: false, code: 'author-required', message: '只有作者命令（Host/面板注入的作者身份）能执行这个操作；模型不能自己批准。' }
  }
  return null
}

const operationLocks = new Map()
async function withOperationLock(key, task) {
  const previous = operationLocks.get(key) ?? Promise.resolve()
  const run = previous.then(task, task)
  const tail = run.catch(() => {})
  operationLocks.set(key, tail)
  try {
    return await run
  } finally {
    if (operationLocks.get(key) === tail) operationLocks.delete(key)
  }
}

/**
 * 执行一个作者命令并落 operation 日志。
 * @param {{root:string, operationId:string, command:string, targetRef?:object, expectedRevision?:any, expectedDraftHash?:any, payload?:object, actor:object, execute:Function}} input
 */
export async function runOperation({ root, operationId, command, targetRef = {}, expectedRevision = null, expectedDraftHash = null, payload = {}, actor, execute }) {
  const denied = assertAuthor(actor)
  if (denied) return denied
  if (typeof operationId !== 'string' || !SAFE_OPERATION.test(operationId)) {
    return { ok: false, code: 'operation-id-required', message: 'operationId 必须是稳定的字母数字/._- 标识。' }
  }
  return withOperationLock(`${root}:${operationId}`, async () => {
  const input = { command, targetRef, expectedRevision, expectedDraftHash, payload }
  const inputHash = operationInputHash(input)
  const existing = await readOperation(root, operationId)
  if (existing) {
    if (existing.inputHash !== inputHash) {
      return {
        ok: false,
        code: 'operation-conflict',
        message: '同一个 operationId 被用于不同输入；换一个 operationId 或重新读取状态。',
        operationId,
        existing: { status: existing.status, command: existing.command, updatedAt: existing.updatedAt },
      }
    }
    if (existing.status === 'completed') {
      return { ok: true, operationId, idempotent: true, result: existing.result, receipt: existing.receipt ?? null }
    }
  }

  const now = new Date().toISOString()
  const record = {
    schemaVersion: OPERATION_SCHEMA_VERSION,
    operationId,
    command,
    targetRef,
    expectedRevision,
    expectedDraftHash,
    inputHash,
    status: 'running',
    attempts: (existing?.attempts ?? 0) + 1,
    startedAt: existing?.startedAt ?? now,
    updatedAt: now,
    result: null,
    receipt: null,
    error: null,
  }
  await writeJsonAtomic(operationFile(root, operationId), record, { ensureDir: true })

  let result
  try {
    result = await execute()
  } catch (error) {
    result = { ok: false, code: 'operation-failed', message: String(error?.message ?? error) }
  }

  const final = {
    ...record,
    status: result?.ok === false ? 'failed' : 'completed',
    updatedAt: new Date().toISOString(),
    result,
    receipt: result?.receipt ?? null,
    error: result?.ok === false ? { code: result.code ?? 'error', message: result.message ?? '' } : null,
  }
  await writeJsonAtomic(operationFile(root, operationId), final, { ensureDir: true })
  return { ...result, operationId, idempotent: false, operation: { status: final.status, attempts: final.attempts } }
  })
}
