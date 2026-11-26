// 资料页导入卡片的 remote 后端：previewLegacy → importLegacy，只读源、落原生。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import RemoteClass from '../lib/host/remote.js'
import { resolveBook } from '../lib/native/store.js'

function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function fakeRemote(root) {
  const remote = Object.create(RemoteClass.prototype)
  remote.agent = () => ({ id: 's-test' })
  remote.rootOf = async () => root
  remote.assertMaster = () => {}
  remote.ctx = { get: () => null }
  return remote
}

test('remote.previewLegacy/importLegacy：面板导入走同一 native 导入，不改五件', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-remote-import-'))
  writeJson(path.join(root, '.dsh-novel-beat', '斗罗', 'book.json'), {
    schemaVersion: 3, book: '斗罗', decisions: [{ id: 'd1', chapter: 1, title: '谁去', status: 'committed' }],
    segments: [], canon: [], obligations: [], audit: [], revisions: [], revision: 2,
  })
  writeJson(path.join(root, '.dsh-novel-fade', '斗罗', 'memory.json'), {
    schemaVersion: 3, book: '斗罗', meta: { revision: 1 }, cards: [{ id: 'c1', chapter: 1, gist: '入学' }],
    entities: {}, places: {}, threads: [], audit: [],
  })
  const beatFile = path.join(root, '.dsh-novel-beat', '斗罗', 'book.json')
  const before = readFileSync(beatFile, 'utf8')
  const remote = fakeRemote(root)

  const preview = await remote.previewLegacy('s-test')
  assert.ok(Array.isArray(preview.items))
  assert.ok(preview.items.some((item) => item.book === '斗罗'))

  const imported = await remote.importLegacy('s-test', { book: '斗罗' })
  assert.equal(imported.ok, true)
  const record = await resolveBook(root, '斗罗')
  assert.equal(record.bookId, imported.bookId)
  assert.equal(readFileSync(beatFile, 'utf8'), before)
})