// S2：客户端面板结构 + 只读契约对齐。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DESCRIPTORS } from '../lib/host/remote-contract.js'

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

test('client：注册「小说」tab、面板与会话头入口，并挂载 panel remote', async () => {
  const module = await loadClient()
  const { ctx, calls } = fakeCtx()
  await module.apply(ctx)

  assert.equal(calls.mounted, 1)
  assert.equal(calls.contract.package, 'dsh-novel-kit')
  assert.equal(calls.tabs.length, 1)
  assert.equal(calls.tabs[0].id, 'novel-kit')
  assert.equal(calls.tabs[0].kind, 'novel-kit')
  assert.equal(calls.tabs[0].title(), '小说')

  const pane = calls.registered.find(({ options }) => options.name === 'sidebar.right.pane.tab')
  assert.ok(pane)
  assert.equal(pane.options.key, 'novel-kit')
  assert.equal(typeof pane.options.inject, 'function')
  const props = pane.options.inject('session-1')
  assert.equal(props.sessionId, 'session-1')
  assert.equal(typeof props.remote.getSnapshot, 'function')

  const header = calls.registered.find(({ options }) => options.name === 'conversation.session.header.utilities')
  assert.ok(header)
  header.options.inject('session-1').open()
  assert.equal(calls.openedTab, 'novel-kit')
})

test('client：面板数据走 snapshot remote，不执行命令', async () => {
  const module = await loadClient()
  const { ctx, calls, panel } = fakeCtx()
  let executed = 0
  ctx.remote.commands = { execute: async () => { executed += 1; throw new Error('面板不应执行命令') } }
  await module.apply(ctx)
  const pane = calls.registered.find(({ options }) => options.name === 'sidebar.right.pane.tab')
  const face = pane.options.inject('session-1')
  const snap = await face.remote.getSnapshot('session-1', { book: '书' })
  assert.equal(snap.ok, true)
  assert.equal(snap.value.workspace.beat[0], '书')
  assert.equal(executed, 0)
  assert.equal(typeof panel.getSnapshot, 'function')
})

test('契约两侧一致：客户端内嵌的 descriptor 与 Host 相同', async () => {
  const client = await readFile(path.join(here, '..', 'client.js'), 'utf8')
  for (const descriptor of DESCRIPTORS) {
    assert.ok(client.includes(`method: '${descriptor.method}'`), `client.js 缺少 ${descriptor.method} 的 descriptor`)
  }
  assert.ok(client.includes('$mount(TYPERT_REMOTE)'))
  assert.ok(!client.includes("commands.execute("), '面板不允许执行命令')
})

test('client：注册 conversation.view 章节工作台', async () => {
  const module = await loadClient()
  const { ctx, calls } = fakeCtx()
  await module.apply(ctx)
  const view = calls.registered.find(({ options }) => options.name === 'conversation.view')
  assert.ok(view, '要注册 conversation.view')
  assert.equal(view.options.id, 'novel-kit.chapter')
  assert.equal(view.options.label, '小说工作台')
  assert.equal(typeof view.component, 'function')
  const props = view.options.inject('session-1')
  assert.equal(props.sessionId, 'session-1')
  assert.equal(typeof props.remote.getSnapshot, 'function')
})

