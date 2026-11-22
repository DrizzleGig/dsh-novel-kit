// 客户端结构 + 只读契约对齐。
//
// 0.4.0 起只有**一个**界面入口：conversation.view「小说工作台」。
// 右栏页签、会话头部按钮都已删除，这里用测试把「不能偷偷加回第二个入口」锁住。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

function fakeReact() {
  return {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: (initial) => [initial, () => {}],
    useEffect: () => {},
    useCallback: (fn) => fn,
  }
}

async function loadClient() {
  const source = await readFile(path.join(here, '..', 'client.js'), 'utf8')
  const loaded = []
  const window = { __ModuleLoader__: { load: (definition) => loaded.push(definition) } }
  const require = (id) => {
    if (id === 'react') return fakeReact()
    throw new Error(`unexpected require: ${id}`)
  }
  new Function('window', 'require', source)(window, require)
  assert.equal(loaded.length, 1)
  return loaded[0].factory(require)
}

function fakeCtx() {
  const calls = { tabs: [], registered: [], injected: [], mounted: 0, openedTab: null }
  const panel = {
    identity: async () => ({ ok: true, value: { plugin: 'dsh-novel-kit' } }),
    getSnapshot: async (sessionId, request) => ({
      ok: true,
      value: { schemaVersion: 1, book: request?.book ?? null, workspace: { beat: ['书'] }, contexts: [], ledgers: {}, issues: [] },
    }),
  }
  const ctx = {
    slots: {
      inject(key, cb) { calls.injected.push(key); return cb() },
      register(options, component) { calls.registered.push({ options, component }); return () => {} },
    },
    // 宿主仍然提供这两个服务；插件不该再用它们。
    sidebarRightTabs: {
      register(definition) { calls.tabs.push(definition); return () => {} },
    },
    sidebarRight: {
      openTab(kind) { calls.openedTab = kind },
    },
    remote: {
      async $mount(contract) { calls.mounted += 1; calls.contract = contract; return () => {} },
    },
    get(key) { return key === 'remote.novelKitPanel' ? panel : undefined },
    effect(fn) { const dispose = fn(); return typeof dispose === 'function' ? dispose : () => {} },
  }
  return { ctx, calls, panel }
}

test('client：只注册一个界面入口——conversation.view「小说工作台」', async () => {
  const module = await loadClient()
  const { ctx, calls } = fakeCtx()
  await module.apply(ctx)

  assert.equal(calls.mounted, 1, '仍然挂载 panel remote')
  assert.equal(calls.registered.length, 1, '只能有一个 slot 注册')
  assert.equal(calls.injected.length, 1, '只注入 conversation.view')
  assert.equal(calls.injected[0], 'conversation.view')

  const view = calls.registered[0].options
  assert.equal(view.name, 'conversation.view')
  assert.equal(view.id, 'novel-kit.chapter')
  assert.equal(view.label, '小说工作台')
  assert.equal(typeof calls.registered[0].component, 'function')
  const props = view.inject('session-1')
  assert.equal(props.sessionId, 'session-1')
  assert.equal(typeof props.remote.getSnapshot, 'function')
})

test('client：不再注册右栏页签与会话头部按钮', async () => {
  const module = await loadClient()
  const { ctx, calls } = fakeCtx()
  await module.apply(ctx)

  assert.equal(calls.tabs.length, 0, '不该再注册 sidebarRightTabs')
  assert.equal(calls.openedTab, null, '不该再有 openTab 之类的跳转')
  const names = calls.registered.map(({ options }) => options.name)
  assert.ok(!names.includes('sidebar.right.pane.tab'), '右栏「小说」页签必须删除')
  assert.ok(!names.includes('conversation.session.header.utilities'), '头部「小说 / 工作台」按钮必须删除')
})

test('client：工作台数据走 snapshot remote，不执行命令', async () => {
  const module = await loadClient()
  const { ctx, calls, panel } = fakeCtx()
  let executed = 0
  ctx.remote.commands = { execute: async () => { executed += 1; throw new Error('界面不应执行命令') } }
  await module.apply(ctx)
  const face = calls.registered[0].options.inject('session-1')
  const snap = await face.remote.getSnapshot('session-1', { book: '书' })
  assert.equal(snap.ok, true)
  assert.equal(snap.value.workspace.beat[0], '书')
  assert.equal(executed, 0)
  assert.equal(typeof panel.getSnapshot, 'function')
})

test('契约两侧一致：客户端方法表与 Host 同源', async () => {
  const client = await readFile(path.join(here, '..', 'client.js'), 'utf8')
  // 客户端的方法表由构建脚本从 remote-contract.js 生成：这里逐行核对，防止有人手改产物。
  const { REMOTE_METHOD_SPECS } = await import('../lib/host/remote-contract.js')
  for (const [method, withRequest] of REMOTE_METHOD_SPECS) {
    assert.ok(client.includes(`['${method}', ${withRequest === true}]`), `client.js 缺少 ${method} 的契约方法行`)
  }
  assert.ok(client.includes("descriptors: REMOTE_METHOD_SPECS.map(function (spec)"), '客户端应从方法表生成 descriptors')
  assert.ok(client.includes('$mount(TYPERT_REMOTE)'))
  assert.ok(!client.includes('commands.execute('), '界面不允许执行命令')
})

test('client：源码里不再残留右栏面板与头部按钮', async () => {
  const client = await readFile(path.join(here, '..', 'client.js'), 'utf8')
  for (const marker of ['function Panel(', 'sidebar.right.pane.tab', 'sidebarRightTabs.register', 'conversation.session.header.utilities']) {
    assert.ok(!client.includes(marker), `client.js 不该再包含 ${marker}`)
  }
})
