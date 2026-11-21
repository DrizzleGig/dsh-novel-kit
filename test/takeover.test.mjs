// S2：接管/回退旧五件的选择层（幂等、逐步记录、不吞失败）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyTakeover, restoreBundles } from '../lib/host/takeover.js'

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

test('takeover：restart-required 不算成功', async () => {
  const result = await applyTakeover({ pluginManager: fakeManager(), names: ['dsh-novel-conductor'] })
  assert.equal(result.ok, false)
  assert.equal(result.results[0].application, 'restart-required')
})

test('takeover：没有插件管理器时如实报错，不抛异常', async () => {
  const result = await applyTakeover({})
  assert.equal(result.ok, false)
  assert.equal(result.code, 'no-plugin-manager')
})

test('takeover：拒绝未知插件名', async () => {
  await assert.rejects(() => applyTakeover({ pluginManager: fakeManager(), names: ['dsh-novel-evil'] }), /未知的旧插件/)
})

test('restore：把旧五件重新选上', async () => {
  const manager = fakeManager()
  const result = await restoreBundles({ pluginManager: manager, names: ['dsh-novel-beat'] })
  assert.equal(result.ok, true)
  assert.deepEqual(result.enabled, ['dsh-novel-beat'])
  assert.deepEqual(manager.calls, [{ name: 'dsh-novel-beat', enabled: true }])
})
