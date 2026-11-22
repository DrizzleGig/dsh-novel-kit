// 客户端渲染冒烟：用最小 React/宿主替身把 client.js 装起来并渲染 Panel / Workbench，
// 捕捉 TDZ、hooks 顺序、undefined 属性这类只有真渲染才会炸的问题。
import { test } from 'node:test'
import assert from 'node:assert/strict'

const created = []

function makeReact() {
  const React = {
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children: children.flat(Infinity).filter((child) => child !== null && child !== false && child !== undefined) }
    },
    useState(initial) {
      const value = typeof initial === 'function' ? initial() : initial
      return [value, () => {}]
    },
    useCallback(fn) { return fn },
    useMemo(fn) { return fn() },
    useRef(value) { return { current: value } },
    useEffect() {},
    useLayoutEffect() {},
    Fragment: 'Fragment',
  }
  return React
}

const fakeRemote = new Proxy({}, {
  get(_target, prop) {
    if (prop === 'then') return undefined
    return async () => ({ ok: true, results: [], session: null, contexts: [], ledgers: {}, workspace: {}, conflicts: { available: false, total: 0, items: [] } })
  },
})

function collectText(node, out = []) {
  if (node === null || node === undefined || node === false) return out
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out }
  if (Array.isArray(node)) { for (const child of node) collectText(child, out); return out }
  if (typeof node === 'object' && node.props) {
    if (typeof node.props.children === 'object') collectText(node.props.children, out)
    else collectText(node.children, out)
  }
  return out
}

test('client.js：能装进宿主替身并渲染小说工作台，不抛异常', async () => {
  const registered = []
  let plugin = null
  globalThis.window = {
    __ModuleLoader__: {
      load(definition) { plugin = definition },
    },
  }
  globalThis.React = makeReact()

  await import('../client.js')
  assert.ok(plugin, 'window.__ModuleLoader__.load 被调用')
  assert.equal(plugin.id, 'dsh-novel-kit')

  const factory = plugin.factory
  const mod = factory((name) => {
    if (name === 'react') return globalThis.React
    throw new Error('unexpected require: ' + name)
  })

  const ctx = {
    effect(fn) { const dispose = fn(); if (typeof dispose === 'function') dispose() },
    get(key) { return key === 'remote.novelKitPanel' ? fakeRemote : null },
    remote: { $mount: async () => undefined },
    slots: {
      inject(_name, fn) { return fn() },
      register(config, Component) {
        registered.push({ config, Component })
        return () => {}
      },
    },
  }
  await mod.apply(ctx)

  assert.equal(registered.length, 1, '只剩一个入口：conversation.view')
  const { config, Component } = registered[0]
  assert.equal(config.name, 'conversation.view')
  assert.equal(typeof Component, 'function', config.name + ' 组件是函数')
  const tree = Component({ sessionId: 's-test', remote: fakeRemote })
  assert.ok(tree, config.name + ' 渲染出树')
  const text = collectText(tree).join(' ')
  assert.match(text, /小说工作台|加载|章节|书桌/, config.name + ' 首屏文案')
})
