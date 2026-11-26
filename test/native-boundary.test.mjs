// 生产默认边界：没有 legacy 环境开关时，未迁移的五件书不能开章（不读五件）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

test('无 DSH_NOVEL_KIT_ALLOW_LEGACY 时，旧五件书返回 legacy-migration-required', () => {
  const script = `
    import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
    import os from 'node:os'
    import path from 'node:path'
    import { startChapter } from './lib/engine/chapter.js'
    const root = mkdtempSync(path.join(os.tmpdir(), 'kit-boundary-'))
    mkdirSync(path.join(root, '.dsh-novel-beat', '旧书'), { recursive: true })
    writeFileSync(path.join(root, '.dsh-novel-beat', '旧书', 'book.json'), JSON.stringify({ schemaVersion: 2, book: '旧书', decisions: [], segments: [], canon: [], obligations: [], audit: [], revisions: [], revision: 1 }))
    mkdirSync(path.join(root, '.dsh-novel-fade', '旧书'), { recursive: true })
    writeFileSync(path.join(root, '.dsh-novel-fade', '旧书', 'memory.json'), JSON.stringify({ schemaVersion: 3, book: '旧书', meta: { revision: 1 }, cards: [], entities: {}, places: {}, threads: [], audit: [] }))
    const result = await startChapter({ root, book: '旧书', chapter: 1 })
    console.log(JSON.stringify({ ok: result.ok, code: result.code }))
  `
  const env = { ...process.env }
  delete env.DSH_NOVEL_KIT_ALLOW_LEGACY
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: process.cwd(), env, encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  const result = JSON.parse(run.stdout.trim().split(/\r?\n/u).pop())
  assert.equal(result.ok, false)
  assert.equal(result.code, 'legacy-migration-required')
})

test('无 legacy 开关时，显式导入后可以原生开章', () => {
  const script = `
    import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
    import os from 'node:os'
    import path from 'node:path'
    import { importLegacyBook } from './lib/native/import/legacy.js'
    import { startChapter } from './lib/engine/chapter.js'
    const root = mkdtempSync(path.join(os.tmpdir(), 'kit-boundary-import-'))
    mkdirSync(path.join(root, '.dsh-novel-beat', '旧书'), { recursive: true })
    writeFileSync(path.join(root, '.dsh-novel-beat', '旧书', 'book.json'), JSON.stringify({ schemaVersion: 2, book: '旧书', decisions: [{ id: 'd1', chapter: 1, title: '谁去', status: 'committed' }], segments: [], canon: [], obligations: [], audit: [], revisions: [], revision: 1 }))
    mkdirSync(path.join(root, '.dsh-novel-fade', '旧书'), { recursive: true })
    writeFileSync(path.join(root, '.dsh-novel-fade', '旧书', 'memory.json'), JSON.stringify({ schemaVersion: 3, book: '旧书', meta: { revision: 1 }, cards: [{ id: 'c1', chapter: 1, gist: '旧事' }], entities: {}, places: {}, threads: [], audit: [] }))
    const imported = await importLegacyBook({ root, book: '旧书' })
    const started = await startChapter({ root, book: '旧书', chapter: 1 })
    console.log(JSON.stringify({ imported: imported.ok, bookId: imported.bookId, started: started.ok, sessionBookId: started.session && started.session.bookId }))
  `
  const env = { ...process.env }
  delete env.DSH_NOVEL_KIT_ALLOW_LEGACY
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: process.cwd(), env, encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  const result = JSON.parse(run.stdout.trim().split(/\r?\n/u).pop())
  assert.equal(result.imported, true)
  assert.equal(result.started, true)
  assert.equal(result.sessionBookId, result.bookId)
})
