// 旧五件与 kit 的装载诊断（只读）：面板告诉作者「现在跑的是谁」。
//
// 数据来自 pluginManager 的 listBundles() + listPlugins()：
// bundle 给 installed/enabled/version，plugin 行给 fiberPhase；按 entryId 关联。
export const SIBLINGS = Object.freeze([
  'dsh-novel-beat',
  'dsh-novel-fade',
  'dsh-novel-voice',
  'dsh-novel-fanfic',
  'dsh-novel-conductor',
])

/**
 * 纯函数：把两份清单合成面板要的形状。
 * @param {Array<{name:string,installed?:boolean,enabled?:boolean,version?:string,rows?:Array<{entryId?:string}>}>} bundles
 * @param {Array<{entryId:string,fiberPhase?:string|null,moduleName?:string}>} plugins
 */
export function summarizeBundles(bundles = [], plugins = []) {
  const phaseById = new Map(plugins.map((plugin) => [plugin.entryId, plugin.fiberPhase ?? null]))
  const byName = new Map(bundles.map((bundle) => [bundle.name, bundle]))
  const describe = (name) => {
    const bundle = byName.get(name)
    if (!bundle) return { name, present: false }
    const rows = (bundle.rows ?? []).map((row) => ({ entryId: row.entryId ?? null, fiberPhase: row.entryId ? (phaseById.get(row.entryId) ?? null) : null }))
    return {
      name,
      present: true,
      installed: bundle.installed === true,
      enabled: bundle.enabled === true,
      version: bundle.version ?? null,
      rows,
      running: rows.some((row) => row.fiberPhase === 'active'),
    }
  }
  const siblings = SIBLINGS.map(describe)
  return {
    kit: describe('dsh-novel-kit'),
    siblings,
    runningSiblings: siblings.filter((item) => item.running).map((item) => item.name),
    installedSiblings: siblings.filter((item) => item.installed).map((item) => item.name),
    takeoverNeeded: siblings.some((item) => item.running),
  }
}

/**
 * 从宿主读诊断；没有插件管理器时如实报 managed:false。
 * @param {{pluginManager?:{listBundles?:Function,listPlugins?:Function}}} deps
 */
export async function collectDiagnostics({ pluginManager } = {}) {
  if (!pluginManager?.listBundles || !pluginManager?.listPlugins) {
    return { managed: false, reason: '宿主没有插件管理器（pluginManager）' }
  }
  const [bundles, plugins] = await Promise.all([pluginManager.listBundles(), pluginManager.listPlugins()])
  return { managed: true, ...summarizeBundles(bundles, plugins) }
}
