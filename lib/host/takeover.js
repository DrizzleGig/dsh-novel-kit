// 接管与回退：把旧五件的 bundle 选择层暂时关掉，让 kit 成为唯一执行者。
//
// 只动「选择层」（setBundleEnabled），不卸载、不改它们的安装与启用状态。
// 接管记录持久化到 profile 的 novel-kit/takeover.json：重启后仍知道停用了哪几件；
// 没有记录时**不默认恢复全部五件**（那会打开用户自己停用的插件）。
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { writeJsonAtomic } from '../storage/atomic-json.js'
import { profileStateDir } from '../engine/settings.js'
import { SIBLINGS } from './diagnostics.js'

// 进程内缓存；文件是跨重启的来源。
let lastTakeover = null

function takeoverFile() {
  return path.join(profileStateDir(), 'takeover.json')
}

function readRecord() {
  try {
    const raw = JSON.parse(readFileSync(takeoverFile(), 'utf8'))
    const disabled = Array.isArray(raw?.disabled) ? raw.disabled.filter((name) => SIBLINGS.includes(name)) : []
    return { disabled: [...new Set(disabled)] }
  } catch {
    return { disabled: [] }
  }
}

function currentRecord() {
  if (lastTakeover) return { disabled: [...lastTakeover] }
  return readRecord()
}

async function saveRecord(disabled) {
  const list = [...new Set(disabled.filter((name) => SIBLINGS.includes(name)))]
  lastTakeover = list.length ? list : null
  // 空记录也落盘：删除失败时不会让下一次读回旧记录。
  await writeJsonAtomic(takeoverFile(), { schemaVersion: 1, disabled: list, updatedAt: new Date().toISOString() }, { ensureDir: true })
}

function validateNames(names = []) {
  const wanted = [...new Set(names.map((name) => String(name)))]
  const unknown = wanted.filter((name) => !SIBLINGS.includes(name))
  if (unknown.length > 0) throw new Error(`未知的旧插件：${unknown.join(', ')}`)
  return wanted
}

function summarize(name, result) {
  if (!result || typeof result !== 'object') return { name, ok: false, application: 'unknown', message: '插件管理器没有返回结果' }
  const application = result.application ?? 'unknown'
  return {
    name,
    ok: application === 'applied',
    application,
    changed: result.changed === true,
    message: result.error?.diagnostic ?? result.error?.code ?? null,
  }
}

/**
 * 停用旧五件（选择层）。幂等：已经关掉的再关一次不会报错。
 * @param {{pluginManager?:object, names?:string[]}} input
 */
export async function applyTakeover({ pluginManager, names = SIBLINGS } = {}) {
  const targets = validateNames(names)
  if (!pluginManager?.setBundleEnabled) {
    return { ok: false, code: 'no-plugin-manager', message: '宿主没有插件管理器，无法停用旧插件', results: [] }
  }
  const results = []
  for (const name of targets) {
    try {
      results.push(summarize(name, await pluginManager.setBundleEnabled(name, false)))
    } catch (error) {
      results.push({ name, ok: false, application: 'failed', message: String(error?.message ?? error) })
    }
  }
  const disabled = results.filter((item) => item.ok).map((item) => item.name)
  const recorded = results
    .filter((item) => item.changed === true && ['applied', 'restart-required'].includes(item.application))
    .map((item) => item.name)
  let recordError = null
  if (recorded.length > 0) {
    const previous = currentRecord().disabled
    try {
      await saveRecord([...previous, ...recorded])
    } catch (error) {
      recordError = String(error?.message ?? error)
    }
  }
  return { ok: results.every((item) => item.ok) && !recordError, results, disabled, recorded, recordError }
}

/**
 * 回退：把 kit 接管时停用的旧五件重新选上。
 * 没有记录就拒绝，不猜测「全部五件」。
 * @param {{pluginManager?:object, names?:string[]|null}} input
 */
export async function restoreBundles({ pluginManager, names = null } = {}) {
  const record = currentRecord()
  const requested = names ?? record.disabled
  if (!Array.isArray(requested) || requested.length === 0) {
    return {
      ok: false,
      code: 'no-restore-record',
      message: '没有接管记录：不知道 kit 停用了哪几件，不会默认恢复全部五件。',
      results: [],
    }
  }
  const targets = validateNames(requested)
  if (!pluginManager?.setBundleEnabled) {
    return { ok: false, code: 'no-plugin-manager', message: '宿主没有插件管理器，无法恢复旧插件', results: [] }
  }
  const results = []
  for (const name of targets) {
    try {
      results.push(summarize(name, await pluginManager.setBundleEnabled(name, true)))
    } catch (error) {
      results.push({ name, ok: false, application: 'failed', message: String(error?.message ?? error) })
    }
  }
  const restored = results.filter((item) => item.ok).map((item) => item.name)
  if (restored.length > 0) {
    await saveRecord(record.disabled.filter((name) => !restored.includes(name)))
  }
  return { ok: results.every((item) => item.ok), results, enabled: restored }
}

/** 测试用：清掉进程内缓存（不删文件）。 */
export function __resetTakeoverMemory() {
  lastTakeover = null
}
