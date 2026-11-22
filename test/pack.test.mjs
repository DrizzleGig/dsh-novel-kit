// 发布产物边界：市场安装包不该把 36 张开发截图一起带上。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')

test('发布清单：包含运行必需文件与 README 用到的三张图', async () => {
  const pkg = JSON.parse(await readFile(path.join(repo, 'package.json'), 'utf8'))
  const files = pkg.files ?? []
  for (const needle of ['index.js', 'client.js', 'lib', 'locale', 'cordis.patch.yml', 'README.md', 'LICENSE']) {
    assert.ok(files.includes(needle), '发布清单缺少 ' + needle)
  }
  for (const shot of ['wb-desk-dark.png', 'wb-chapter-light.png', 'wb-canon-demo-light.png']) {
    assert.ok(files.some((item) => item.endsWith(shot)), 'README 引用的截图没有进包：' + shot)
  }
})

test('发布清单：不整体打包 docs（避免 4.9MB 开发截图进安装包）', async () => {
  const pkg = JSON.parse(await readFile(path.join(repo, 'package.json'), 'utf8'))
  assert.equal((pkg.files ?? []).includes('docs'), false, 'docs 整目录会把 mockups 全部带进包')
  assert.ok((pkg.files ?? []).includes('docs/*.md'), '文档正文仍然要进包')
})

test('README 引用的本地图片都真实存在', async () => {
  const readme = await readFile(path.join(repo, 'README.md'), 'utf8')
  const refs = [...readme.matchAll(/!\[[^\]]*\]\((docs\/[^)\s]+)\)/gu)].map((match) => match[1])
  assert.ok(refs.length >= 2, 'README 至少要有一张真实界面图')
  for (const rel of refs) {
    const absolute = path.join(repo, rel)
    const exists = await readFile(absolute).then(() => true).catch(() => false)
    assert.equal(exists, true, 'README 引用的图片不存在：' + rel)
  }
})
