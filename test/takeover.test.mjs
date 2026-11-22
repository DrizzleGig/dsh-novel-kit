// S2：接管/回退旧五件的选择层（幂等、逐步记录、不吞失败）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { applyTakeover, restoreBundles, __resetTakeoverMemory } from '../lib/host/takeover.js'

// 接管记录写到临时 profile，不碰真实 DSH_HOME。
process.env.DSH_HOME = mkdtempSync(path.join(os.tmpdir(), 'kit-takeover-'))

function fakeManager({ failOn = null } = {}) {
  const calls = []
  return {
    calls,
    async setBundleEnabled(name, enabled) {
      calls.push({ name, enabled })
      if (name === failOn) return { application: 'failed', changed: false, error: { code: 'bundle-in-use', diagnostic: '被占用' } }
      if (name === 'dsh-novel-conductor') return { application: 'restart-required', changed: true }
      return { application: 'applied', changed: true, target: name, enabled }
    },
  }
}

test('takeover：逐个停用并记录结果，可部分成功', async () => {
  const manager = fakeManager({ failOn: 'dsh-novel-voice' })
  const result = await applyTakeover({ pluginManager: manager, names: ['dsh-novel-beat', 'dsh-novel-voice'] })
  assert.equal(result.ok, false, '有失败时整体不 ok')
  assert.equal(result.results.length, 2)
  assert.deepEqual(result.disabled, ['dsh-novel-beat'])
  assert.equal(result.results[1].application, 'failed')
  assert.equal(result.results[1].message, '被占用')
  assert.deepEqual(manager.calls, [
    { name: 'dsh-novel-beat', enabled: false },
    { name: 'dsh-novel-voice', enabled: false },
  ])
})

test('takeover：restart-required 不算成功，但记入恢复名单', async () => {
  const result = await applyTakeover({ pluginManager: fakeManager(), names: ['dsh-novel-conductor'] })
  assert.equal(result.ok, false)
  assert.equal(result.results[0].application, 'restart-required')
  assert.deepEqual(result.recorded, ['dsh-novel-conductor'])
})

test('takeover：没有插件管理器时如实报错，不抛异常', async () => {
  const result = await applyTakeover({})
  assert.equal(result.ok, false)
  assert.equal(result.code, 'no-plugin-manager')
})

test('takeover：拒绝未知插件名', async () => {
  await assert.rejects(() => applyTakeover({ pluginManager: fakeManager(), names: ['dsh-novel-evil'] }), /未知的旧插件/)
})

test('restore：没有接管记录时拒绝，不默认恢复全部五件', async () => {
  process.env.DSH_HOME = mkdtempSync(path.join(os.tmpdir(), 'kit-takeover-empty-'))
  __resetTakeoverMemory()
  const manager = fakeManager()
  const result = await restoreBundles({ pluginManager: manager })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'no-restore-record')
  assert.deepEqual(manager.calls, [])
})

test('takeover：原本已关闭（changed:false）不记入恢复名单', async () => {
  process.env.DSH_HOME = mkdtempSync(path.join(os.tmpdir(), 'kit-takeover-nochange-'))
  __resetTakeoverMemory()
  const calls = []
  const manager = {
    async setBundleEnabled(name, enabled) {
      calls.push([name, enabled])
      return { application: 'applied', changed: false }
    },
  }
  const applied = await applyTakeover({ pluginManager: manager, names: ['dsh-novel-beat'] })
  assert.deepEqual(applied.disabled, ['dsh-novel-beat'])
  assert.deepEqual(applied.recorded, [])
  const restored = await restoreBundles({ pluginManager: manager })
  assert.equal(restored.code, 'no-restore-record')
  assert.deepEqual(calls, [['dsh-novel-beat', false]], '不会把用户自己关掉的插件打开')
})

test('restore：把旧五件重新选上', async () => {
  const manager = fakeManager()
  const result = await restoreBundles({ pluginManager: manager, names: ['dsh-novel-beat'] })
  assert.equal(result.ok, true)
  assert.deepEqual(result.enabled, ['dsh-novel-beat'])
  assert.deepEqual(manager.calls, [{ name: 'dsh-novel-beat', enabled: true }])
})

test('restore：只恢复 kit 上次接管停用的那几件', async () => {
  const calls = []
  const pluginManager = {
    setBundleEnabled: async (name, enabled) => {
      calls.push([name, enabled])
      return { application: 'applied', changed: true }
    },
  }
  await restoreBundles({ pluginManager }) // 清掉前面用例留下的记录
  calls.length = 0
  await applyTakeover({ pluginManager, names: ['dsh-novel-fade'] })
  calls.length = 0
  const result = await restoreBundles({ pluginManager })
  assert.deepEqual(calls, [['dsh-novel-fade', true]])
  assert.deepEqual(result.enabled, ['dsh-novel-fade'])
})
