// kit 原生故事总控 runbook：只存 kit 自己的运行记录，不恢复五件的调度/锁/会话。
//
// 目录：.dsh-novel-kit/runs/<bookId>/<runId>.json
import { mkdir, readdir } from 'node:fs/promises'
import path from 'node:path'
import { readJsonSnapshot, writeJsonAtomic } from '../storage/atomic-json.js'
import { withLock } from '../storage/locks.js'
import { assertBookId, RUN_FORMAT } from './schema.js'
import { bookRecordFile, runsDir, runFile } from './store.js'

const RUN_STATUS = new Set(['planned', 'running', 'paused', 'completed', 'failed', 'aborted'])
const STEP_STATUS = new Set(['pending', 'running', 'completed', 'skipped', 'failed'])

function nowIso() {
  return new Date().toISOString()
}

async function fallbackBookName(root, bookId) {
  try {
    const record = (await readJsonSnapshot(bookRecordFile(root, bookId))).json
    return typeof record?.book === 'string' && record.book ? record.book : bookId
  } catch {
    return bookId
  }
}

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeStep(step, index) {
  const status = STEP_STATUS.has(step?.status) ? step.status : 'pending'
  return {
    id: String(step?.id ?? `step-${index + 1}`),
    kind: String(step?.kind ?? 'action'),
    title: String(step?.title ?? ''),
    status,
    ...(step?.startedAt ? { startedAt: String(step.startedAt) } : {}),
    ...(step?.finishedAt ? { finishedAt: String(step.finishedAt) } : {}),
    ...(step?.note ? { note: String(step.note) } : {}),
    ...(step?.receipt && typeof step.receipt === 'object' ? { receipt: step.receipt } : {}),
  }
}

export function validateRun(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('run 必须是对象')
  if (data.format !== RUN_FORMAT) throw new Error(`run.format 必须是 ${RUN_FORMAT}`)
  if (data.schemaVersion !== 1) throw new Error('run.schemaVersion 必须是 1')
  assertBookId(data.bookId)
  if (typeof data.runId !== 'string' || !data.runId) throw new Error('run.runId 必填')
  if (!Array.isArray(data.steps)) throw new Error('run.steps 必须是数组')
  if (!RUN_STATUS.has(data.status)) throw new Error(`run.status 不支持：${data.status}`)
  return data
}

export async function createRun({ root, bookId, title = '', flowId = '', steps = [] } = {}) {
  assertBookId(bookId)
  return withLock({ root, flowId: 'run-create' }, async () => {
    const now = nowIso()
    const runId = makeId('run')
    const document = validateRun({
      format: RUN_FORMAT,
      schemaVersion: 1,
      runId,
      bookId,
      book: await fallbackBookName(root, bookId),
      title: String(title ?? ''),
      flowId: String(flowId ?? ''),
      status: 'planned',
      steps: (Array.isArray(steps) ? steps : []).map(normalizeStep),
      createdAt: now,
      updatedAt: now,
      revision: 0,
    })
    await writeJsonAtomic(runFile(root, bookId, runId), document, { ensureDir: true })
    return { ok: true, run: document }
  })
}

export async function readRun({ root, bookId, runId } = {}) {
  assertBookId(bookId)
  const snap = await readJsonSnapshot(runFile(root, bookId, String(runId ?? '')))
  return validateRun(snap.json)
}

export async function listRuns({ root, bookId, limit = 50 } = {}) {
  assertBookId(bookId)
  let entries = []
  try {
    entries = await readdir(runsDir(root, bookId), { withFileTypes: true })
  } catch {
    return { ok: true, runs: [] }
  }
  const runs = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    try {
      runs.push(validateRun((await readJsonSnapshot(path.join(runsDir(root, bookId), entry.name))).json))
    } catch {
      // 坏 run 不阻塞列表；诊断另行报
    }
  }
  runs.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  return { ok: true, runs: runs.slice(0, Math.max(1, Math.min(200, Number(limit) || 50))) }
}

export async function updateRun({ root, bookId, runId, patch = {}, expectedRevision = null } = {}) {
  assertBookId(bookId)
  return withLock({ root, flowId: 'run-update' }, async () => {
    const current = await readRun({ root, bookId, runId })
    if (Number.isInteger(expectedRevision) && current.revision !== expectedRevision) {
      throw new Error(`run revision 冲突：期望 ${expectedRevision}，实际 ${current.revision}`)
    }
    const status = patch.status ? String(patch.status) : current.status
    if (!RUN_STATUS.has(status)) throw new Error(`run.status 不支持：${status}`)
    const next = validateRun({
      ...current,
      ...(patch.title !== undefined ? { title: String(patch.title) } : {}),
      ...(patch.flowId !== undefined ? { flowId: String(patch.flowId) } : {}),
      status,
      steps: patch.steps !== undefined
        ? (Array.isArray(patch.steps) ? patch.steps.map(normalizeStep) : current.steps)
        : current.steps,
      updatedAt: nowIso(),
      revision: current.revision + 1,
    })
    await writeJsonAtomic(runFile(root, bookId, current.runId), next, { ensureDir: true })
    return { ok: true, run: next }
  })
}

/** 更新单步；找不到 step 报错，不新建。 */
export async function updateRunStep({ root, bookId, runId, stepId, patch = {}, expectedRevision = null } = {}) {
  assertBookId(bookId)
  const current = await readRun({ root, bookId, runId })
  const index = current.steps.findIndex((item) => String(item?.id) === String(stepId))
  if (index < 0) throw new Error(`没有这个 run step：${stepId}`)
  const status = patch.status ? String(patch.status) : current.steps[index].status
  if (!STEP_STATUS.has(status)) throw new Error(`step.status 不支持：${status}`)
  const steps = current.steps.map((item, i) => i === index ? normalizeStep({
    ...item,
    status,
    ...(status === 'running' && !item.startedAt ? { startedAt: nowIso() } : {}),
    ...( ['completed', 'skipped', 'failed'].includes(status) ? { finishedAt: nowIso() } : {}),
    ...(patch.note !== undefined ? { note: String(patch.note) } : {}),
    ...(patch.receipt !== undefined ? { receipt: patch.receipt } : {}),
  }, i) : item)
  return updateRun({ root, bookId, runId, patch: { steps }, expectedRevision })
}
