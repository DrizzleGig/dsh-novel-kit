// UI 快照验收：把 client.js 的 Panel / Workbench 真渲染成静态 HTML，再截成 PNG。
//
// 为什么要这个：客户端的视觉效果在 DSH 里只能靠重启 + 人眼看，改一次样式要等一轮。
// 这里用「最小 React 替身」把同一份 client.js 渲染到浏览器里，数据取自真实账本
// （collectSnapshot），所以看到的就是真实组件在真实数据下的样子，不是另画一套假稿。
//
// 用法：
//   node scripts/ui-snapshot.mjs            # 生成 HTML + 截图（需要本机 Edge）
//   node scripts/ui-snapshot.mjs --html     # 只生成 HTML，不截图
//
// 输出：docs/mockups/live/{panel,workbench}-{light,dark}.html / .png
import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectSnapshot } from '../lib/host/snapshot.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const outDir = path.join(repo, 'docs', 'mockups', 'live')

const WS_ROOT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'D:\\斗罗大陆'
const NO_BOOK = process.argv.includes('--no-book')
const BOOK = NO_BOOK ? null : (process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : '斗罗：开局炸毁冰火两仪眼')
const HTML_ONLY = process.argv.includes('--html')
const SNAP_WIDTH = Number(process.env.NK_SNAPSHOT_WIDTH) || 1440
const SNAP_HEIGHT = Number(process.env.NK_SNAPSHOT_HEIGHT) || 900

// ── 最小 React 替身 ─────────────────────────────────────────────────────────
// 只实现 client.js 用到的部分：createElement / useState / useMemo / useCallback /
// useRef / useEffect。setState 会标脏并触发下一遍渲染，promise 微任务跑完后再渲染一遍，
// 所以「加载中 → 就绪」的真实状态都能截到。

function createReact() {
  const stores = new Map()
  const UNIT = Symbol('unit')
  let dirty = false
  let queue = []
  let currentKey = ''
  let cursor = 0

  function slot() {
    const store = stores.get(currentKey)
    const index = cursor++
    let entry = store.list[index]
    if (!entry) { entry = {}; store.list[index] = entry }
    return entry
  }

  // useCallback 每次渲染都会给出新函数，effect 的依赖数组里常有它。
  // 快照工具里把「同槽位的函数」视作相等，否则 effect 会无限重跑。
  function sameDeps(prev, next) {
    if (!prev || !next || prev.length !== next.length) return false
    for (let i = 0; i < prev.length; i++) {
      if (prev[i] === next[i]) continue
      if (typeof prev[i] === 'function' && typeof next[i] === 'function') continue
      return false
    }
    return true
  }

  const React = {
    createElement(type, props, ...children) {
      const next = { ...(props || {}) }
      const flat = children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== true && child !== false)
      if (flat.length === 1) next.children = flat[0]
      else if (flat.length > 1) next.children = flat
      return { [UNIT]: true, type, props: next }
    },
    Fragment: 'Fragment',
    useState(initial) {
      const entry = slot()
      if (!('value' in entry)) entry.value = typeof initial === 'function' ? initial() : initial
      return [entry.value, (next) => {
        const value = typeof next === 'function' ? next(entry.value) : next
        if (!Object.is(value, entry.value)) { entry.value = value; dirty = true }
      }]
    },
    useRef(initial) {
      const entry = slot()
      if (!('ref' in entry)) entry.ref = { current: initial }
      return entry.ref
    },
    useMemo(factory, deps) {
      const entry = slot()
      if (!('value' in entry) || !sameDeps(entry.deps, deps)) { entry.value = factory(); entry.deps = deps || [] }
      return entry.value
    },
    useCallback(fn, deps) {
      const entry = slot()
      if (!('value' in entry) || !sameDeps(entry.deps, deps)) { entry.value = fn; entry.deps = deps || [] }
      return entry.value
    },
    useEffect(fn, deps) {
      const entry = slot()
      if (!('deps' in entry) || !sameDeps(entry.deps, deps)) { entry.deps = deps || []; queue.push(fn) }
    },
    useLayoutEffect(fn, deps) { React.useEffect(fn, deps) },
  }

  function walk(node, keyPath) {
    if (node === null || node === undefined || node === false || node === true) return null
    if (Array.isArray(node)) return node.map((child, index) => walk(child, keyPath + '.' + index)).filter((child) => child !== null)
    if (typeof node === 'string' || typeof node === 'number') return node
    if (typeof node !== 'object' || node[UNIT] !== true) return null
    const { type, props } = node
    if (typeof type === 'function') {
      const prevKey = currentKey
      const prevCursor = cursor
      currentKey = keyPath
      cursor = 0
      if (!stores.has(keyPath)) stores.set(keyPath, { list: [] })
      let out
      try {
        out = type(props)
      } finally {
        currentKey = prevKey
        cursor = prevCursor
      }
      return walk(out, keyPath + '>')
    }
    return { [UNIT]: true, type, props, children: walk(props.children, keyPath + '>') }
  }

  // 真实的加载是异步的：effect 里 await 完才 setState，而且快照要走真实 fs。
  // 所以每遍渲染后等一个小间隔，用「渲染结果连续两遍一致」当收敛条件。
  async function render(element, rootKey = 'root') {
    let tree = null
    let previous = null
    for (let pass = 0; pass < 30; pass++) {
      dirty = false
      queue = []
      tree = walk(element, rootKey)
      for (const fn of queue) fn()
      const html = serialize(tree)
      await new Promise((resolve) => setTimeout(resolve, 20))
      if (html === previous && !dirty) break
      previous = html
    }
    return tree
  }

  return { React, render }
}

// ── 序列化：元素树 → HTML 字符串 ───────────────────────────────────────────
const UNITLESS = new Set(['opacity', 'zIndex', 'fontWeight', 'lineHeight', 'flex', 'flexGrow', 'flexShrink', 'order', 'columnCount', 'zoom', 'aspectRatio', 'WebkitLineClamp'])
const VOID = new Set(['input', 'br', 'hr', 'img', 'meta', 'link'])

function cssName(key) {
  return key.replace(/^Webkit/, '-webkit-').replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())
}

function styleText(style) {
  if (!style || typeof style !== 'object') return ''
  return Object.keys(style)
    .filter((key) => style[key] !== null && style[key] !== undefined && style[key] !== false && style[key] !== '')
    .map((key) => {
      let value = style[key]
      if (typeof value === 'number' && !UNITLESS.has(key)) value = value + 'px'
      return cssName(key) + ':' + String(value)
    })
    .join(';')
}

function esc(text) {
  return String(text).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))
}

function serialize(node) {
  if (node === null || node === undefined || node === false || node === true) return ''
  if (Array.isArray(node)) return node.map(serialize).join('')
  if (typeof node === 'string' || typeof node === 'number') return esc(node)
  const { type, props, children } = node
  if (type === 'Fragment') return serialize(children)
  const attrs = []
  if (props) {
    if (props.className) attrs.push(' class="' + esc(props.className) + '"')
    if (props.id) attrs.push(' id="' + esc(props.id) + '"')
    const style = styleText(props.style)
    if (style) attrs.push(' style="' + esc(style) + '"')
    if (props.title) attrs.push(' title="' + esc(props.title) + '"')
    if (props.placeholder) attrs.push(' placeholder="' + esc(props.placeholder) + '"')
    if (props.disabled) attrs.push(' disabled')
    if (props.checked) attrs.push(' checked')
    if (props.href) attrs.push(' href="' + esc(props.href) + '"')
    if (props.src) attrs.push(' src="' + esc(props.src) + '"')
    if (props.type) attrs.push(' type="' + esc(props.type) + '"')
    if (props.value !== undefined && props.value !== null && typeof props.value !== 'object') attrs.push(' value="' + esc(props.value) + '"')
  }
  if (VOID.has(type)) return '<' + type + attrs.join('') + '>'
  if (type === 'textarea') return '<textarea' + attrs.join('') + '>' + esc(props && props.value !== undefined && props.value !== null ? props.value : '') + '</textarea>'
  return '<' + type + attrs.join('') + '>' + serialize(children) + '</' + type + '>'
}

// ── 样式：直接读源文件（client-src/styles.css），不再从 client.js 里抠 ──────────
async function extractCss() {
  const css = await readFile(path.join(repo, 'client-src', 'styles.css'), 'utf8')
  if (!css.trim()) throw new Error('client-src/styles.css 是空的')
  return css
}

// ── 宿主主题替身（DSH 的 alias token 由宿主注入，这里给一套等价暖纸/墨夜）──
const THEME = {
  light: {
    'bg-base': '#f6f2ea',
    'bg-layer-1': '#fffdf9',
    'border-l1': '#e4d9c7',
    'label-primary': '#241d16',
    'label-secondary': '#5b5145',
    'label-tertiary': '#8d8172',
    'label-primary-foreground': '#fff8ef',
    'brand-primary': '#b5432d',
    'interactive-bg-hover': 'rgba(181,67,45,.08)',
    'state-error-primary': '#b3352b',
    'state-warning-primary': '#9a6c1c',
    'state-success-primary': '#2f6a5a',
  },
  dark: {
    'bg-base': '#12100e',
    'bg-layer-1': '#1b1714',
    'border-l1': '#312a23',
    'label-primary': '#f3ebdf',
    'label-secondary': '#bcb0a0',
    'label-tertiary': '#7e7365',
    'label-primary-foreground': '#1b1714',
    'brand-primary': '#d4603f',
    'interactive-bg-hover': 'rgba(212,96,63,.12)',
    'state-error-primary': '#e2685c',
    'state-warning-primary': '#d79b3c',
    'state-success-primary': '#5fa38f',
  },
}

function themeCss(mode) {
  const vars = THEME[mode]
  const lines = Object.keys(vars).map((key) => '  --dsw-alias-' + key + ': ' + vars[key] + ';')
  lines.push('  --dsw-font-family: "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif;')
  lines.push('  --dsw-font-mono: "Cascadia Mono", Consolas, monospace;')
  return ':root {\n' + lines.join('\n') + '\n}'
}

function page({ title, css, body, width, height, mode }) {
  return '<!doctype html>\n<html lang="zh-CN" data-nk="' + mode + '">\n<head>\n<meta charset="utf-8">\n<title>' + esc(title) + '</title>\n<style>\n'
    + themeCss(mode) + '\n'
    + '* { box-sizing: border-box; }\n'
    + 'html, body { margin: 0; width: ' + width + 'px; height: ' + height + 'px; overflow: hidden; }\n'
    + 'body { background: ' + (mode === 'dark' ? '#0b0a09' : '#efe9de') + '; color: var(--dsw-alias-label-primary); font-family: var(--dsw-font-family); -webkit-font-smoothing: antialiased; }\n'
    + '#stage { width: ' + width + 'px; height: ' + height + 'px; overflow: hidden; background: var(--dsw-alias-bg-base); }\n'
    + css + '\n'
    + '</style>\n</head>\n<body><div id="stage">' + body + '</div></body>\n</html>'
}

// ── 主流程 ────────────────────────────────────────────────────────────────
const source = await readFile(path.join(repo, 'client.js'), 'utf8')
const UI_CSS = await extractCss()
const mini = createReact()

globalThis.window = { __ModuleLoader__: { load(definition) { globalThis.__plugin = definition } } }
globalThis.React = mini.React

await import('../client.js')
const plugin = globalThis.__plugin
if (!plugin) throw new Error('client.js 没有调用 __ModuleLoader__.load')

const registered = []
const mod = plugin.factory((name) => {
  if (name === 'react') return mini.React
  throw new Error('require 只支持 react：' + name)
})

const snapshot = await collectSnapshot({ root: WS_ROOT, book: BOOK || undefined })

// 真正的面板远端：不走 Service 构造器（需要真 Cordis 上下文），只借原型方法 + 自己的 ctx。
// 这样快照读到的是真实账本、真实会话、真实建档逻辑，不是手写夹具。
const { default: RemoteClass } = await import('../lib/host/remote.js')
const gate = { isOn: () => true, isMasterOn: () => true, master: true }
const hostCtx = {
  agents: { get(id) { return { id, cwd: WS_ROOT, session: { id, cwd: WS_ROOT } } } },
  typert: { register() {} },
  get(key) {
    if (key === 'workingDirectory') return { ensure: async () => WS_ROOT }
    if (key === 'novelKitGate') return gate
    if (key === 'pluginManager') return null
    return null
  },
}
const real = Object.create(RemoteClass.prototype)
real.ctx = hostCtx

const missing = []
const remote = new Proxy({}, {
  get(_target, prop) {
    if (typeof prop !== 'string' || prop === 'then') return undefined
    if (typeof real[prop] !== 'function') { missing.push(prop); return undefined }
    return async (...args) => {
      try {
        // NK_CANON_DEMO=1：真实工作区没有 canon 时，给同人页一份样例，方便看审阅队列。
        if (process.env.NK_CANON_DEMO === '1') {
          const demoSource = 'c'.repeat(64)
          if (prop === 'getCanon') {
            return {
              ok: true,
              value: {
                available: true, id: BOOK || '示例', title: '原著', sourceId: demoSource, revision: 7,
                canonReady: false, contractStatus: 'pending-review',
                addresses: [
                  { from: '裴照', to: '沈砚', form: '沈大人', publicForm: '沈大人', privateForm: '阿砚', fromChapter: '12' },
                  { from: '沈砚', to: '裴照', form: '裴照', publicForm: '裴校尉', privateForm: '阿照', fromChapter: '9' },
                ],
                forbidden: ['直接写出穿越者身份', '让三老提前知道本体武魂'],
                characters: [{ name: '沈砚', aliases: ['阿砚'], role: '巡夜人' }, { name: '裴照', aliases: [], role: '校尉' }],
                facts: [
                  { subject: '沈砚', key: '身份', value: '巡夜人', quote: '他把铜牌收进袖子里，没让人看见。', chapter: 12, confirmed: true },
                  { subject: '裴照', key: '称呼', value: '沈大人', quote: '“沈大人，这边请。”', chapter: 12, confirmed: true },
                ],
                worldRules: ['夜里不能点灯', '武魂不能在白日显形'],
                secrets: [{ id: 's1', what: '沈砚是穿越者', publicAtChapter: null, knownBy: [] }],
                timeline: [],
              },
            }
          }
          if (prop === 'getCanonQueue') {
            return {
              ok: true,
              value: {
                available: true, book: BOOK || '示例', sourceId: demoSource, title: '原著', status: 'pending-review', canonReady: false,
                revision: 21, contractRevision: 4, contentHash: 'demo',
                pending: [
                  { changeId: 'chg_a1', collection: 'facts', operation: 'update', changeHash: 'a1', decision: 'pending', before: { subject: '裴照', value: '沈大人' }, after: { subject: '裴照', value: '阿砚' }, evidenceRefs: [] },
                  { changeId: 'chg_a2', collection: 'addresses', operation: 'add', changeHash: 'a2', decision: 'pending', before: null, after: { from: '陈璧', to: '沈砚', form: '沈教习' }, evidenceRefs: [] },
                ],
                accepted: [
                  { changeId: 'chg_a3', collection: 'worldRules', operation: 'add', changeHash: 'a3', decision: 'accepted', appliedRevision: null, before: null, after: { text: '白日不得鸣钟' }, evidenceRefs: [] },
                ],
                rejected: [{ changeId: 'chg_a4', collection: 'forbidden', operation: 'add', changeHash: 'a4', decision: 'rejected', before: null, after: { text: '不要写感情线' } }],
                applied: [],
              },
            }
          }
          if (prop === 'getSourceExcerpt') {
            return { ok: true, value: { ok: true, sourceId: demoSource, chapter: 12, chapterId: 'ch012', layout: 'kit', chars: 1200, offset: 0, length: 120, text: '“沈大人，这边请。”裴照侧身让开路，廊下的灯影一晃，照见他袖口的铜扣。', truncated: true } }
          }
        }
        if (prop === 'getInbox' && process.env.NK_INBOX_DEMO === '1') {
          return {
            ok: true,
            value: {
              book: BOOK || '示例', total: 3, blocked: { start: true, finish: true },
              items: [
                { id: 'decision:p1', kind: 'decision', severity: 'blocker', blockScope: 'finish', title: '沈砚要不要现在叫出那个名字', summary: '叫出 / 继续装作不知道', target: { page: 'beat' }, actions: ['adopt', 'reject'], chapter: 12 },
                { id: 'canon:contract', kind: 'canon', severity: 'blocker', blockScope: 'start', title: '同人原著还没确认', summary: '当前状态：pending-review', target: { page: 'fanfic' }, actions: ['confirm'], chapter: null },
                { id: 'conflict:称呼:沈砚对裴照', kind: 'conflict', severity: 'warning', blockScope: 'none', title: '设定冲突：称呼 · 沈砚对裴照', summary: '本作「阿砚」 vs 原著「沈大人」', target: { page: 'fanfic' }, actions: ['compare'], chapter: null },
              ],
            },
          }
        }
        // 真实宿主会按绑定/当前书解析 book；快照默认补上默认书。
        // NK_AUTOBOOK=1 时不补，用来验证客户端自己的「自动选书」是否真的生效。
        if (process.env.NK_AUTOBOOK !== '1' && (prop === 'getSnapshot' || prop === 'getPlan' || prop === 'getStyle' || prop === 'getCanon' || prop === 'getMemory' || prop === 'getDecisions')) {
          const request = { ...(args[1] || {}) }
          if (!request.book && BOOK) request.book = BOOK
          args[1] = request
        }
        const value = await real[prop].apply(real, args)
        // NK_FINDINGS_DEMO=1：给正文页一份带定位的检查结果，方便看「定位」按钮。
        if (prop === 'getSnapshot' && process.env.NK_FINDINGS_DEMO === '1' && value && value.session) {
          value.session.verification = {
            ...(value.session.verification || {}),
            blockers: 1,
            warnings: 2,
            findings: [
              { code: 'forbidden', severity: 'blocker', message: '出现禁忌：手机', quote: '手机', coordinate: 'utf16', at: 3, length: 2 },
              { code: 'long-sentence', severity: 'warning', message: '句子 96 字，超过 80', quote: '他把……', coordinate: 'utf16', at: 12, length: 96 },
              { code: 'voice-band', severity: 'warning', message: '句长均值 41 超出档案区间 [18, 32]', coordinate: 'utf16', at: null, length: null },
            ],
          }
        }
        return { ok: true, value }
      } catch (error) {
        return { ok: false, error: { code: 'host-error', message: String(error?.message ?? error) } }
      }
    }
  },
})

const ctx = {
  effect(fn) { const dispose = fn(); if (typeof dispose === 'function') dispose() },
  get(key) { return key === 'remote.novelKitPanel' ? remote : null },
  remote: { $mount: async () => undefined },
  sidebarRightTabs: { register() { return () => {} } },
  sidebarRight: { openTab() {} },
  slots: {
    inject(_name, fn) { return fn() },
    register(config, Component) { registered.push({ config, Component }); return () => {} },
  },
}

await mod.apply(ctx)
await mkdir(outDir, { recursive: true })

const PAGES = [
  ['desk', '书桌'],
  ['chapter', '正文'],
  ['beat', '决策'],
  ['fade', '记忆'],
  ['voice', '风格工作室'],
  ['fanfic', '同人'],
  ['data', '资料与设置'],
]

const targets = []
for (const { config, Component } of registered) {
  if (config.name !== 'conversation.view') continue
  // 每一页各出一张：改哪页就能立刻看见哪页，不用来回点。
  for (const [key, label] of PAGES) {
    // 样例收件箱 / canon 队列各出一份单独文件，不覆盖真实账本的截图。
    let file = 'wb-' + key
    if (key === 'desk' && process.env.NK_INBOX_DEMO === '1') file = 'wb-inbox-demo'
    if (key === 'fanfic' && process.env.NK_CANON_DEMO === '1') file = 'wb-canon-demo'
    if (SNAP_WIDTH !== 1440 || SNAP_HEIGHT !== 900) file += '-' + SNAP_WIDTH + 'x' + SNAP_HEIGHT
    targets.push({
      file,
      label,
      width: SNAP_WIDTH,
      height: SNAP_HEIGHT,
      element: mini.React.createElement(Component, { sessionId: 'snapshot-session', remote, initialSection: key }),
    })
  }
}

for (const target of targets) {
  // 每个产物的根路径必须不同：hook 槽位按路径存，共用 'root' 会让两个组件串状态。
  const tree = await mini.render(target.element, 'root:' + target.file)
  const body = serialize(tree)
  for (const mode of ['light', 'dark']) {
    const html = page({
      title: 'dsh-novel-kit · ' + target.file + ' · ' + mode,
      css: UI_CSS, body, width: target.width, height: target.height, mode,
    })
    const htmlPath = path.join(outDir, target.file + '-' + mode + '.html')
    await writeFile(htmlPath, html, 'utf8')
    console.log('HTML ' + path.relative(repo, htmlPath))
    if (HTML_ONLY) continue
    const pngPath = path.join(outDir, target.file + '-' + mode + '.png')
    await shot(htmlPath, pngPath, target.width, target.height)
    console.log('PNG  ' + path.relative(repo, pngPath))
  }
}

if (missing.size) console.log('\n没有夹具的读接口（面板会显示错误态）：' + Array.from(missing).join(', '))

function shot(htmlPath, pngPath, width, height) {
  const edge = process.env.NK_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  return new Promise((resolve, reject) => {
    execFile(edge, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
      '--force-device-scale-factor=2',
      '--window-size=' + width + ',' + height,
      '--screenshot=' + pngPath,
      'file:///' + htmlPath.replace(/\\/g, '/'),
    ], { timeout: 120000 }, (error, _stdout, stderr) => {
      if (error) reject(new Error('Edge 截图失败：' + String(stderr || error.message).slice(0, 400)))
      else resolve()
    })
  })
}
