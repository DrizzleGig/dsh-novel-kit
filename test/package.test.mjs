// 发布物入口的硬约束：package.json 不能被写成带 BOM 的 UTF-8。
// remote.js 用 JSON.parse 读取它；BOM 会让 Host remote 半挂，DSH 里表现为
// 「插件清单里没有 novel-kit / 侧边栏和开关都不出现」。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

test('package.json 无 BOM，Host remote 可导入', async () => {
  const file = path.join(here, '..', 'package.json')
  const bytes = readFileSync(file)
  assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'package.json 不能是带 BOM 的 UTF-8')
  const parsed = JSON.parse(bytes.toString('utf8'))
  assert.equal(parsed.name, 'dsh-novel-kit')
  assert.equal(parsed.dsh.client.platform, 'web')

  const remote = await import('../lib/host/remote.js')
  assert.equal(typeof remote, 'object')
})
