// 模拟验收：不启动 DSH，验证「包能被加载 + 侧栏/工作台会注册」。
// 2026-11-22 的真实事故：package.json 带 BOM → remote.js 的 JSON.parse 抛错 →
// DSH 里整个 kit 不出现。这个脚本把启动链拆开逐段验证，作为发布前的硬门。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
let passed = 0
function check(label, fn) {
  try {
    const detail = fn()
    passed += 1
    console.log(`PASS  ${label}${detail ? ' — ' + detail : ''}`)
  } catch (error) {
    console.error(`FAIL  ${label} — ${String(error?.message ?? error)}`)
    process.exitCode = 1
  }
}

const packageBytes = readFileSync(path.join(root, 'package.json'))
check('package.json 无 BOM', () => {
  assert.notDeepEqual([...packageBytes.subarray(0, 3)], [0xef, 0xbb, 0xbf])
  return packageBytes.length + ' bytes'
})
const pkg = JSON.parse(packageBytes.toString('utf8'))
check('bundle / client 元数据完整', () => {
  assert.equal(pkg.name, 'dsh-novel-kit')
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-conversation'))
  return pkg.version
})
check('cordis.patch.yml 注册 host + remote 两条 entry', () => {
  const patch = readFileSync(path.join(root, 'cordis.patch.yml'), 'utf8')
  assert.match(patch, /id:\s*novel-kit\b/)
  assert.match(patch, /name:\s*'dsh-novel-kit'/)
  assert.match(patch, /id:\s*novel-kit-remote\b/)
  assert.match(patch, /name:\s*'dsh-novel-kit\/remote'/)
  return '2 entries'
})

const host = await import('../index.js')
check('Host index 可导入', () => {
  assert.equal(host.name, 'novel-kit')
  assert.equal(typeof host.apply, 'function')
  assert.deepEqual(host.inject, ['tools', 'commands', 'workingDirectory'])
  return 'apply/inject ok'
})
const hostTools = await import('../lib/host/tools.js')
check('Host tools 可导入且是 8 个 novel_*', () => {
  const names = hostTools.toolDefinitions().map((tool) => tool.name)
  assert.equal(names.length, 8)
  assert.ok(names.includes('novel_canon'))
  return names.join(', ')
})
const remote = await import('../lib/host/remote.js')
check('Host remote 可导入（BOM 事故的直接入口）', () => {
  assert.equal(typeof remote, 'object')
  return 'remote ok'
})

let plugin = null
globalThis.window = { __ModuleLoader__: { load(definition) { plugin = definition } } }
globalThis.React = {
  createElement(type, props, ...children) { return { type, props: props ?? {}, children } },
  useState(initial) { return [typeof initial === 'function' ? initial() : initial, () => {}] },
  useCallback(fn) { return fn },
  useMemo(fn) { return fn() },
  useRef(value) { return { current: value } },
  useEffect() {},
  Fragment: 'Fragment',
}
await import('../client.js')
check('Client 包被 DSH 加载器接收', () => {
  assert.ok(plugin)
  assert.equal(plugin.id, 'dsh-novel-kit')
  return plugin.id
})
const mod = plugin.factory((name) => {
  if (name === 'react') return globalThis.React
  throw new Error('unexpected require: ' + name)
})
const registered = []
const ctx = {
  effect(fn) { const dispose = fn(); if (typeof dispose === 'function') dispose() },
  get(key) { return key === 'remote.novelKitPanel' ? {} : null },
  remote: { $mount: async () => undefined },
  sidebarRightTabs: { register(definition) { registered.push({ kind: 'tab', definition }); return () => {} } },
  sidebarRight: { openTab() {} },
  slots: { inject(_name, fn) { return fn() }, register(config, Component) { registered.push({ config, Component }); return () => {} } },
}
await mod.apply(ctx)
check('侧栏 tab / 面板 / 工作台注册', () => {
  const tab = registered.find((item) => item.kind === 'tab')
  assert.ok(tab, '缺少 sidebarRightTabs 注册')
  assert.equal(tab.definition.title(), '小说')
  const pane = registered.find((item) => item.config?.name === 'sidebar.right.pane.tab')
  assert.ok(pane, '缺少 sidebar.right.pane.tab')
  const workbench = registered.find((item) => item.config?.name === 'conversation.view')
  assert.ok(workbench, '缺少 conversation.view 工作台')
  assert.equal(workbench.config.label, '小说工作台')
  return 'tab + pane + workbench'
})

console.log(`\n${passed}/${passed + (process.exitCode ? 1 : 0)} 项通过`)
