// S2 前哨：旧五件/kit 装载诊断（纯函数 + 无管理器分支）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeBundles, collectDiagnostics, SIBLINGS } from '../lib/host/diagnostics.js'

const bundles = [
  {
    name: 'dsh-novel-kit', installed: true, enabled: true, version: '0.1.0-dev',
    rows: [{ entryId: 'include:novel-kit' }, { entryId: 'include:novel-kit-remote' }],
  },
  {
    name: 'dsh-novel-beat', installed: true, enabled: true, version: '0.9.2',
    rows: [{ entryId: 'include:novel-beat' }],
  },
  {
    name: 'dsh-novel-fade', installed: true, enabled: false, version: '0.7.2',
    rows: [{ entryId: 'include:novel-fade' }],
  },
  { name: 'dsh-novel-voice', installed: false, enabled: false, rows: [] },
]
const plugins = [
  { entryId: 'include:novel-kit', fiberPhase: 'active' },
  { entryId: 'include:novel-kit-remote', fiberPhase: 'active' },
  { entryId: 'include:novel-beat', fiberPhase: 'active' },
  { entryId: 'include:novel-fade', fiberPhase: null },
]

test('summarizeBundles：kit 与五件的装载/运行状态各自独立', () => {
  const summary = summarizeBundles(bundles, plugins)
  assert.equal(summary.kit.running, true)
  assert.equal(summary.kit.version, '0.1.0-dev')
  assert.deepEqual(summary.runningSiblings, ['dsh-novel-beat'])
  assert.deepEqual(summary.installedSiblings, ['dsh-novel-beat', 'dsh-novel-fade'])
  assert.equal(summary.takeoverNeeded, true)

  const absent = summary.siblings.find((item) => item.name === 'dsh-novel-voice')
  assert.equal(absent.present, true)
  assert.equal(absent.installed, false)
  assert.deepEqual(absent.rows, [])

  const fanfic = summary.siblings.find((item) => item.name === 'dsh-novel-fanfic')
  assert.equal(fanfic.present, false)
})

test('summarizeBundles：只有 kit 时 takeoverNeeded=false', () => {
  const summary = summarizeBundles([bundles[0]], plugins)
  assert.equal(summary.runningSiblings.length, 0)
  assert.equal(summary.takeoverNeeded, false)
  assert.equal(SIBLINGS.length, 5)
})

test('collectDiagnostics：没有插件管理器时如实返回 managed:false', async () => {
  const result = await collectDiagnostics({})
  assert.equal(result.managed, false)
  assert.match(result.reason, /pluginManager/)
})

test('collectDiagnostics：有管理器时合并两份清单', async () => {
  const result = await collectDiagnostics({
    pluginManager: {
      listBundles: async () => bundles,
      listPlugins: async () => plugins,
    },
  })
  assert.equal(result.managed, true)
  assert.equal(result.kit.running, true)
  assert.deepEqual(result.runningSiblings, ['dsh-novel-beat'])
})
