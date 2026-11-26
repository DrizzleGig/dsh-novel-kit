// kit 0.5.x 自有数据迁移：识别来源、复制到原生、写 settings.bookId、幂等。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { sha256 } from '../lib/storage/atomic-json.js'
import { migrateKitBook, isKitLegacyBook } from '../lib/native/import/kit-legacy.js'
import { readProjectSettings, writeProjectSettings } from '../lib/engine/settings.js'
import { resolveBook, bodyDir } from '../lib/native/store.js'
import { readDecisions } from '../lib/native/decisions.js'
import { readMemory } from '../lib/native/memory.js'

function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function kitLegacyWorkspace() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-legacy-migrate-'))
  writeJson(path.join(root, '.dsh-novel-beat', '旧书', 'book.json'), {
    schemaVersion: 2, book: '旧书', meta: { title: '旧书', source: 'dsh-novel-kit' },
    decisions: [{ id: 'd1', chapter: 1, title: '谁去', status: 'committed' }],
    segments: [{ id: 's1', chapter: 1 }], canon: [], obligations: [], audit: [], revisions: [], revision: 5,
  })
  writeJson(path.join(root, '.dsh-novel-fade', '旧书', 'memory.json'), {
    schemaVersion: 3, book: '旧书', meta: { revision: 3, revisionAt: 1 },
    chapters: {}, cards: [{ id: 'c1', chapter: 1, gist: '他来了', salience: 4 }],
    entities: {}, places: {}, threads: [], povDistortions: [], audit: [{ id: 'a1' }],
  })
  mkdirSync(path.join(root, '正文'), { recursive: true })
  writeFileSync(path.join(root, '正文', '第1章_开端.md'), '旧稿正文。', 'utf8')
  return root
}

test('isKitLegacyBook：只认 meta.source=dsh-novel-kit', async () => {
  const root = kitLegacyWorkspace()
  assert.equal(await isKitLegacyBook({ root, book: '旧书' }), true)
  writeJson(path.join(root, '.dsh-novel-beat', '五件书', 'book.json'), { schemaVersion: 3, book: '五件书', meta: {}, decisions: [], segments: [], canon: [], obligations: [], audit: [], revisions: [], revision: 1 })
  assert.equal(await isKitLegacyBook({ root, book: '五件书' }), false)
})

test('migrateKitBook：复制 beat/fade/正文，settings 写 bookId，源不变，重复幂等', async () => {
  const root = kitLegacyWorkspace()
  await writeProjectSettings(root, '旧书', { mode: 'original' })
  const beatFile = path.join(root, '.dsh-novel-beat', '旧书', 'book.json')
  const before = sha256(readFileSync(beatFile, 'utf8'))
  const result = await migrateKitBook({ root, book: '旧书' })
  assert.equal(result.ok, true)
  assert.equal(await isKitLegacyBook({ root, book: '旧书' }), true)
  assert.equal(sha256(readFileSync(beatFile, 'utf8')), before, '源账本不被修改')

  const record = await resolveBook(root, '旧书')
  assert.equal(record.bookId, result.bookId)
  const settings = await readProjectSettings(root, '旧书')
  assert.equal(settings.bookId, result.bookId)
  assert.equal((await readDecisions(root, result.bookId)).decisions[0].id, 'd1')
  assert.equal((await readMemory(root, result.bookId)).cards[0].id, 'c1')
  assert.equal(readFileSync(path.join(bodyDir(root, result.bookId), '第1章_开端.md'), 'utf8'), '旧稿正文。')

  const again = await migrateKitBook({ root, book: '旧书' })
  assert.equal(again.idempotent, true)
  assert.equal(again.bookId, result.bookId)
})

test('migrateKitBook：五件来源拒绝走 kit legacy 迁移', async () => {
  const root = kitLegacyWorkspace()
  writeJson(path.join(root, '.dsh-novel-beat', '五件书', 'book.json'), { schemaVersion: 3, book: '五件书', meta: {}, decisions: [], segments: [], canon: [], obligations: [], audit: [], revisions: [], revision: 1 })
  const result = await migrateKitBook({ root, book: '五件书' })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'not-kit-legacy')
  assert.equal(existsSync(path.join(root, '.dsh-novel-kit', 'books.json')), false)
})