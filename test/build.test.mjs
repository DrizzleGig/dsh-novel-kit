// 客户端产物：样式内联必须与 client-src/styles.css 一致，产物不变量不能被破坏。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildClient } from '../scripts/build-client.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')

test('构建：client.js 内联样式与 client-src/styles.css 一致', async () => {
  const result = await buildClient({ check: true })
  assert.equal(result.ok, true, '样式块与源文件不一致：先跑 npm run build:client')
})

test('构建：产物仍是单一 ModuleLoader 入口，且没有运行时相对 require', async () => {
  const source = await readFile(path.join(repo, 'client.js'), 'utf8')
  assert.equal((source.match(/__ModuleLoader__\.load\(/gu) ?? []).length, 1, '只能有一个 load 入口')
  assert.ok(source.includes("id: 'dsh-novel-kit'"))
  assert.equal(/require\((['"])\.\//u.test(source), false, "不要出现 require('./…')：宿主只提供 React")
  assert.ok(source.includes('NK:STYLE:BEGIN'), '样式块要保留标记，构建脚本靠它定位')
  assert.ok(source.includes('NK:STYLE:END'))
})

test('构建：样式源文件非空且不含模板残留', async () => {
  const css = await readFile(path.join(repo, 'client-src', 'styles.css'), 'utf8')
  assert.ok(css.trim().length > 1000, 'styles.css 太小，可能抽错了')
  assert.equal(css.includes('NK:STYLE'), false, '源文件里不应出现标记')
  assert.equal(/\$\{/u.test(css), false, '样式是纯 CSS，不该有模板插值')
})
