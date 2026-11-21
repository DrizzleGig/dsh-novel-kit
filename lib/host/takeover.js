// 接管与回退：把旧五件的 bundle 选择层暂时关掉，让 kit 成为唯一执行者。
//
// 只动「选择层」（setBundleEnabled），不卸载、不改它们的安装与启用状态，
// 所以随时可以 restore 回来。每一步都如实记录 application/error，不吞失败。
import { SIBLINGS } from './diagnostics.js'

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
  return { ok: results.every((item) => item.ok), results, disabled: results.filter((item) => item.ok).map((item) => item.name) }
}

/**
 * 回退：把旧五件重新选上。
 * @param {{pluginManager?:object, names?:string[]}} input
 */
export async function restoreBundles({ pluginManager, names = SIBLINGS } = {}) {
  const targets = validateNames(names)
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
  return { ok: results.every((item) => item.ok), results, enabled: results.filter((item) => item.ok).map((item) => item.name) }
}
