// 客户端构建入口：把 client-src/styles.css 内联进 client.js 的标记块。
//
// 为什么不是打包器：宿主只给 `window.__ModuleLoader__.load({id, factory(require)})`，
// factory 里 `require` 只拿得到 React；再加一层运行时模块加载会把「第二份 React」
// 和「发布产物与源码不同步」一起引进来。所以这一步只做「源文件 → 单文件产物」的
// 内联与校验，JS 仍然是一份可读的单文件。
//
// 用法：
//   node scripts/build-client.mjs           # 写入产物
//   node scripts/build-client.mjs --check   # 只校验是否需要重建（CI / 验收用）
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const clientFile = path.join(repo, 'client.js')
const styleFile = path.join(repo, 'client-src', 'styles.css')

const BEGIN = '/* NK:STYLE:BEGIN —— 由 scripts/build-client.mjs 维护 */'
const END = '/* NK:STYLE:END */'

function renderBlock(css) {
  const body = css
    .replace(/\r\n/g, '\n')
    .replace(/^\n+/, '')
    .replace(/\s+$/, '')
    .split('\n')
    .map((line) => (line ? '      ' + line : ''))
    .join('\n')
  return `${BEGIN}\n${body}\n${END}`
}

export async function buildClient({ check = false } = {}) {
  const source = await readFile(clientFile, 'utf8')
  const css = await readFile(styleFile, 'utf8')
  const beginAt = source.indexOf(BEGIN)
  const endAt = source.indexOf(END)
  if (beginAt < 0 || endAt < 0 || endAt < beginAt) {
    throw new Error('client.js 里找不到样式标记块（NK:STYLE:BEGIN / END）')
  }
  const current = source.slice(beginAt, endAt + END.length)
  const next = renderBlock(css)
  const problems = []

  // 产物不变量：唯一入口、单份 React、没有运行时相对 require。
  if (!source.includes('window.__ModuleLoader__.load(')) problems.push('缺少 window.__ModuleLoader__.load')
  if (!source.includes("id: 'dsh-novel-kit'")) problems.push("缺少 id: 'dsh-novel-kit'")
  if (/require\((['"])\.\//u.test(source)) problems.push("出现运行时相对 require('./…')：宿主只提供 React")
  if (problems.length) throw new Error('产物不变量被破坏：\n- ' + problems.join('\n- '))

  const needsBuild = current !== next
  if (check) return { ok: !needsBuild, needsBuild, currentChars: current.length, nextChars: next.length }
  if (!needsBuild) return { ok: true, changed: false, chars: next.length }
  const rebuilt = source.slice(0, beginAt) + next + source.slice(endAt + END.length)
  await writeFile(clientFile, rebuilt, 'utf8')
  return { ok: true, changed: true, chars: next.length }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const check = process.argv.includes('--check')
  const result = await buildClient({ check })
  if (check && !result.ok) {
    console.error('client.js 的样式块与 client-src/styles.css 不一致：先跑 `npm run build:client` 再提交。')
    process.exit(1)
  }
  console.log(check ? 'client.js 样式块与源文件一致' : (result.changed ? '已内联样式并写回 client.js' : '样式无需重建'))
}
