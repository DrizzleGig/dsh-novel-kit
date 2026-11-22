// 客户端构建入口：把源文件内联进 client.js 的两个标记块。
//
// 为什么不是打包器：宿主只给 `window.__ModuleLoader__.load({id, factory(require)})`，
// factory 里 `require` 只拿得到 React；再加一层运行时模块加载会把「第二份 React」
// 和「发布产物与源码不同步」一起引进来。所以这一步只做「源文件 → 单文件产物」的
// 内联与校验，JS 仍然是一份可读的单文件。
//
// 维护两块：
//   1) NK:STYLE —— client-src/styles.css
//   2) NK:REMOTE —— lib/host/remote-contract.js 的方法表（客户端契约不再手抄）
//
// 用法：
//   node scripts/build-client.mjs           # 写入产物
//   node scripts/build-client.mjs --check   # 只校验是否需要重建（CI / 验收用）
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { REMOTE_METHOD_SPECS } from '../lib/host/remote-contract.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const clientFile = path.join(repo, 'client.js')
const styleFile = path.join(repo, 'client-src', 'styles.css')

const BEGIN = '/* NK:STYLE:BEGIN —— 由 scripts/build-client.mjs 维护 */'
const END = '/* NK:STYLE:END */'
const REMOTE_BEGIN = '/* NK:REMOTE:BEGIN —— 由 scripts/build-client.mjs 维护 */'
const REMOTE_END = '/* NK:REMOTE:END */'

function renderStyleBlock(css) {
  const body = css
    .replace(/\r\n/g, '\n')
    .replace(/^\n+/, '')
    .replace(/\s+$/, '')
    .split('\n')
    .map((line) => (line ? '      ' + line : ''))
    .join('\n')
  return `${BEGIN}\n${body}\n${END}`
}

/** 客户端 remote 契约：方法表从 Host 契约同源生成，两处不再手抄。 */
function renderRemoteBlock(specs) {
  const rows = specs.map(([method, withRequest]) => `      ['${method}', ${withRequest === true}]`).join(',\n')
  return `${REMOTE_BEGIN}\n    const REMOTE_METHOD_SPECS = [\n${rows},\n    ]\n${REMOTE_END}`
}

/** 在 source 里找到标记块，返回当前内容与「替换后写回」的函数。 */
function locateBlock(source, beginMarker, endMarker, label) {
  const beginAt = source.indexOf(beginMarker)
  const endAt = source.indexOf(endMarker)
  if (beginAt < 0 || endAt < 0 || endAt < beginAt) {
    throw new Error(label + '：client.js 里找不到标记块（' + beginMarker + ' / ' + endMarker + '）')
  }
  return {
    current: source.slice(beginAt, endAt + endMarker.length),
    apply: (value) => source.slice(0, beginAt) + value + source.slice(endAt + endMarker.length),
  }
}

export async function buildClient({ check = false } = {}) {
  const source = await readFile(clientFile, 'utf8')
  const css = await readFile(styleFile, 'utf8')
  const nextStyle = renderStyleBlock(css)
  const nextRemote = renderRemoteBlock(REMOTE_METHOD_SPECS)

  // 产物不变量：唯一入口、单份 React、没有运行时相对 require。
  const problems = []
  if (!source.includes('window.__ModuleLoader__.load(')) problems.push('缺少 window.__ModuleLoader__.load')
  if (!source.includes("id: 'dsh-novel-kit'")) problems.push("缺少 id: 'dsh-novel-kit'")
  if (/require\((['"])\.\//u.test(source)) problems.push("出现运行时相对 require('./…')：宿主只提供 React")
  if (problems.length) throw new Error('产物不变量被破坏：\n- ' + problems.join('\n- '))

  const style = locateBlock(source, BEGIN, END, '样式块')
  const remote = locateBlock(source, REMOTE_BEGIN, REMOTE_END, 'remote 契约块')
  const needsBuild = style.current !== nextStyle || remote.current !== nextRemote
  const methods = REMOTE_METHOD_SPECS.length

  if (check) return { ok: !needsBuild, needsBuild, methods }
  if (!needsBuild) return { ok: true, changed: false, methods }

  // 先换样式，再按「换过之后的文件」重新定位 remote 块，避免两处偏移互相干扰。
  const withStyle = style.apply(nextStyle)
  const remoteAfter = locateBlock(withStyle, REMOTE_BEGIN, REMOTE_END, 'remote 契约块')
  await writeFile(clientFile, remoteAfter.apply(nextRemote), 'utf8')
  return { ok: true, changed: true, methods }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const check = process.argv.includes('--check')
  const result = await buildClient({ check })
  if (check && !result.ok) {
    console.error('client.js 与源文件不一致（样式或 remote 契约）：先跑 `npm run build:client` 再提交。')
    process.exit(1)
  }
  console.log(check
    ? 'client.js 与源文件一致（样式 + ' + result.methods + ' 个 remote 方法）'
    : (result.changed ? '已内联样式与 remote 契约并写回 client.js' : '产物已是最新'))
}
