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

// 七个页面都要能真渲染：只测书桌，其它页写崩了也发现不了。
const SECTIONS = ['desk', 'chapter', 'beat', 'fade', 'voice', 'fanfic', 'data']

test('client.js：七页逐页渲染都不抛异常', async () => {
  let plugin = null
  globalThis.window = { __ModuleLoader__: { load(definition) { plugin = definition } } }
  globalThis.React = makeReact()
  // 带 query 的 import：否则拿到的是上一个测试缓存过的模块，__ModuleLoader__.load 不会再触发。
  await import('../client.js?seven-pages')
  assert.ok(plugin, 'client.js 重新注册')

  const mod = plugin.factory((name) => {
    if (name === 'react') return globalThis.React
    throw new Error('unexpected require: ' + name)
  })
  let Component = null
  const ctx = {
    effect(fn) { const dispose = fn(); if (typeof dispose === 'function') dispose() },
    get(key) { return key === 'remote.novelKitPanel' ? fakeRemote : null },
    remote: { $mount: async () => undefined },
    slots: {
      inject(_name, fn) { return fn() },
      register(_config, component) { Component = component; return () => {} },
    },
  }
  await mod.apply(ctx)
  assert.ok(Component, '拿到工作台组件')

  for (const section of SECTIONS) {
    const tree = Component({ sessionId: 's-test', remote: fakeRemote, initialSection: section })
    assert.ok(tree, section + ' 渲染出树')
    assert.ok(collectText(tree).join(' ').length > 0, section + ' 渲染出文本')
  }
})
