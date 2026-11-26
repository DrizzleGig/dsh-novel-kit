// 旧五件与 kit 的装载诊断（纯函数保留作历史；collectDiagnostics 已改为只读 kit 原生数据）。
//
// 数据来自 pluginManager 的 listBundles() + listPlugins()；v2 运行时不调用。
import { listBooks } from '../native/store.js'
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
 * v2 只读诊断：只报告 kit 原生数据；不再查询五件插件状态、不启停插件。
 * @param {{root?:string, pluginManager?:object}} deps
 */
export async function collectDiagnostics({ root, pluginManager } = {}) {
  if (!root) return { managed: false, native: true, reason: '没有工作区：只报告 kit 原生数据，不查询五件插件状态' }
  try {
    const books = await listBooks(root)
    return {
      managed: true,
      native: true,
      pluginManager: pluginManager ? 'ignored' : 'absent',
      books: books.map((item) => ({
        bookId: item.bookId,
        displayName: item.displayName ?? item.book,
        mode: item.mode,
        migrationState: item.migrationState,
        revision: item.revision ?? 0,
      })),
    }
  } catch (error) {
    return { managed: true, native: true, books: [], error: String(error?.message ?? error) }
  }
}
