// 五件单向导入：只读源、复制到 kit 原生、生成 manifest；不改源文件。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { sha256 } from '../lib/storage/atomic-json.js'
import { previewLegacy, importLegacyBook } from '../lib/native/import/legacy.js'
import { resolveBook, bodyDir, importsDir } from '../lib/native/store.js'
import { readDecisions } from '../lib/native/decisions.js'
import { readMemory } from '../lib/native/memory.js'
import { readMedia } from '../lib/native/media.js'
import { readProjectSettings } from '../lib/engine/settings.js'
import { startChapter } from '../lib/engine/chapter.js'

function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function legacyWorkspace() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-legacy-'))
  const beat = {
    schemaVersion: 3,
    book: '斗罗',
    meta: { title: '斗罗' },
    decisions: [{ id: 'd1', chapter: 1, title: '谁去', status: 'committed', requestId: 'r1' }],
    segments: [{ id: 's1', chapter: 1, decisionIds: ['d1'] }],
    canon: [{ entity: '唐三', key: '身份', value: '史莱克学员' }],
    obligations: [], audit: [], revisions: [], revision: 7,
  }
  writeJson(path.join(root, '.dsh-novel-beat', '斗罗', 'book.json'), beat)
  const memory = {
    schemaVersion: 3,
    book: '斗罗',
    meta: { revision: 4, revisionAt: 1 },
    cards: [{ id: 'c1', chapter: 1, gist: '唐三入学', salience: 4 }],
    entities: { 唐三: { name: '唐三' } }, places: {}, threads: [], povDistortions: [], audit: [{ id: 'a1' }],
  }
  writeJson(path.join(root, '.dsh-novel-fade', '斗罗', 'memory.json'), memory)
  writeJson(path.join(root, '.dsh-novel-voice', '斗罗', 'library.json'), { schemaVersion: 1, book: '斗罗', works: [{ workId: 'w1', title: '原著', chapters: 1, chars: 10 }] })
  writeJson(path.join(root, '.dsh-novel-voice', '斗罗', 'profiles', 'p1', 'profile.json'), { schemaVersion: 1, id: 'p1', name: '原著风格', status: 'confirmed', bands: { sentenceMean: { band: [10, 20], n: 1 } }, rules: [] })
  writeJson(path.join(root, '.dsh-novel-fanfic', 'douluo', 'project.json'), { schemaVersion: 2, id: 'douluo', title: '斗罗同人', revision: 3 })
  writeJson(path.join(root, '.dsh-novel-fanfic', 'douluo', 'canon', 'facts.json'), [{ id: 'f1', entity: '唐三', key: '身份', value: '学员' }])
  writeJson(path.join(root, '.dsh-novel-fanfic', 'douluo', 'media.json'), {
    schemaVersion: 1, project: 'douluo', mediaRevision: 2,
    sources: [{ id: 'ms1', type: 'comic', title: '漫画版', status: 'verified' }],
    evidence: [{ id: 'me1', sourceId: 'ms1', kind: 'panel', page: 3, quote: '唐三入学', status: 'unverified' }],
  })
  mkdirSync(path.join(root, '.dsh-novel-fanfic', 'douluo', 'source', 'src1'), { recursive: true })
  writeFileSync(path.join(root, '.dsh-novel-fanfic', 'douluo', 'source', 'src1', 'raw.txt'), '第一章 原文', 'utf8')
  writeJson(path.join(root, '.dsh-novel-conductor', 'book.json'), { schemaVersion: 1, bookId: 'bk-x', book: '斗罗' })
  mkdirSync(path.join(root, '正文'), { recursive: true })
  writeFileSync(path.join(root, '正文', '第1章_开端.md'), '唐三走进学院。', 'utf8')
  return root
}

test('previewLegacy：只读列出 beat/fade/fanfic/正文，不创建 kit 原生目录', async () => {
  const root = legacyWorkspace()
  const preview = await previewLegacy(root)
  const douluo = preview.items.find((item) => item.book === '斗罗')
  assert.ok(douluo)
  assert.equal(douluo.beat.schemaVersion, 3)
  assert.equal(douluo.fade.cards, 1)
  assert.equal(douluo.body, 1)
  const fanfic = preview.items.find((item) => item.book === 'douluo')
  assert.ok(fanfic)
  assert.equal(fanfic.hasFanfic, true)
  assert.equal(existsSync(path.join(root, '.dsh-novel-kit')), false)
})

test('importLegacyBook：fanfic + mode=fanfic 建立原生 canon 绑定并可原生开章', async () => {
  const root = legacyWorkspace()
  writeJson(path.join(root, '.dsh-novel-fanfic', 'douluo', 'canon', 'characters.json'), [{ id: 'c1', name: '唐三', aliases: ['小三'], status: 'confirmed' }])
  writeJson(path.join(root, '.dsh-novel-fanfic', 'douluo', 'canon', 'addresses.json'), [{ id: 'a1', from: '小舞', to: '唐三', form: '三哥', status: 'confirmed' }])
  const result = await importLegacyBook({ root, book: '斗罗', mode: 'fanfic', sources: { fanfic: 'douluo' } })
  assert.equal(result.ok, true)
  assert.equal(result.canon?.bound, true)
  assert.equal(result.canon?.ready, true)
  assert.ok(result.canon.sourceId)

  const settings = await readProjectSettings(root, '斗罗')
  assert.equal(settings.mode, 'fanfic')
  assert.equal(settings.activeCanonSourceId, result.canon.sourceId)

  const started = await startChapter({ root, book: '斗罗', chapter: 2, requiredCapabilities: ['fanfic'], strict: true })
  assert.equal(started.ok, true)
  assert.equal(started.session.mode, 'fanfic')
  assert.equal(started.context.segments.find((segment) => segment.component === 'fanfic')?.available, true)
})

test('importLegacyBook：多来源无法按 sourceId 匹配时拒绝，不写半成品', async () => {
  const root = legacyWorkspace()
  mkdirSync(path.join(root, '.dsh-novel-fanfic', 'douluo', 'source', 'src2'), { recursive: true })
  writeFileSync(path.join(root, '.dsh-novel-fanfic', 'douluo', 'source', 'src2', 'raw.txt'), '第二章 另一个来源', 'utf8')
  writeJson(path.join(root, '.dsh-novel-fanfic', 'douluo', 'project.json'), {
    schemaVersion: 2, id: 'douluo', title: '斗罗同人', revision: 3, sourceId: 'src-not-there',
  })
  await assert.rejects(
    () => importLegacyBook({ root, book: '斗罗', mode: 'fanfic', sources: { fanfic: 'douluo' } }),
    /无法按 sourceId 唯一确定/,
  )
  assert.equal(existsSync(path.join(root, '.dsh-novel-kit', 'books.json')), false)
})

test('importLegacyBook：原文不变但 fanfic canon 变化时拒绝复用旧投影', async () => {
  const root = legacyWorkspace()
  writeJson(path.join(root, '.dsh-novel-fanfic', 'douluo', 'canon', 'facts.json'), [
    { id: 'f1', subject: '唐三', predicate: '身份', value: '学员', status: 'confirmed' },
  ])
  await importLegacyBook({ root, book: '斗罗', mode: 'fanfic', sources: { fanfic: 'douluo' } })
  writeJson(path.join(root, '.dsh-novel-fanfic', 'douluo', 'canon', 'facts.json'), [
    { id: 'f1', subject: '唐三', predicate: '身份', value: '史莱克学员', status: 'confirmed' },
  ])
  await assert.rejects(
    () => importLegacyBook({ root, book: '斗罗', mode: 'fanfic', replace: true, sources: { fanfic: 'douluo' } }),
    /投影已变化/,
  )
})

test('importLegacyBook：复制到原生、写 manifest、源文件字节不变、正文按 bookId 隔离', async () => {
  const root = legacyWorkspace()
  const beatFile = path.join(root, '.dsh-novel-beat', '斗罗', 'book.json')
  const fadeFile = path.join(root, '.dsh-novel-fade', '斗罗', 'memory.json')
  const before = { beat: sha256(readFileSync(beatFile, 'utf8')), fade: sha256(readFileSync(fadeFile, 'utf8')) }

  const result = await importLegacyBook({ root, book: '斗罗', sources: { voice: '斗罗', fanfic: 'douluo' } })
  assert.equal(result.ok, true)
  assert.equal(result.imported.decisions, 1)
  assert.equal(result.imported.cards, 1)
  assert.equal(result.imported.mediaSources, 1)
  assert.equal(result.imported.mediaEvidence, 1)
  assert.equal(result.imported.body, 1)
  assert.ok(result.batchId)

  const after = { beat: sha256(readFileSync(beatFile, 'utf8')), fade: sha256(readFileSync(fadeFile, 'utf8')) }
  assert.deepEqual(after, before, '五件源文件必须保持不变')

  const record = await resolveBook(root, '斗罗')
  assert.equal(record.bookId, result.bookId)
  const decisions = await readDecisions(root, result.bookId)
  assert.equal(decisions.decisions[0].id, 'd1')
  assert.equal(decisions.importedFrom.kind, 'beat')
  const memory = await readMemory(root, result.bookId)
  assert.equal(memory.cards[0].id, 'c1')
  assert.equal(memory.importedFrom.sourceRevision, 4)
  const media = await readMedia(root, result.bookId)
  assert.equal(media.sources[0].id, 'ms1')
  assert.equal(media.evidence[0].status, 'unverified')

  assert.equal(readFileSync(path.join(bodyDir(root, result.bookId), '第1章_开端.md'), 'utf8'), '唐三走进学院。')
  assert.ok(existsSync(path.join(importsDir(root), result.batchId, 'manifest.json')))
  assert.ok(existsSync(path.join(importsDir(root), result.batchId, 'fanfic', 'canon', 'facts.json')))
  assert.ok(existsSync(path.join(importsDir(root), result.batchId, 'voice', 'profiles', 'p1.json')))
  assert.equal(existsSync(path.join(root, '.dsh-novel-kit', '.dsh-novel-beat')), false)
})

test('重复导入默认拒绝；replace:true 生成新批次', async () => {
  const root = legacyWorkspace()
  const first = await importLegacyBook({ root, book: '斗罗' })
  await assert.rejects(() => importLegacyBook({ root, book: '斗罗' }), /已有原生数据|正文目录已有/u)
  const second = await importLegacyBook({ root, book: '斗罗', replace: true })
  assert.notEqual(second.batchId, first.batchId)
  assert.ok(existsSync(path.join(importsDir(root), second.batchId, 'manifest.json')))
})

test('没有旧数据时报错，不静默建空书', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-legacy-empty-'))
  await assert.rejects(() => importLegacyBook({ root, book: '空书' }), /没有找到可导入的旧数据/u)
})

test('BOM 源文件可读；kit 来源标记识别为 kit-legacy-or-mixed', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-legacy-bom-'))
  const dir = path.join(root, '.dsh-novel-beat', '旧书')
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'book.json'), '\uFEFF' + JSON.stringify({
    schemaVersion: 2,
    book: '旧书',
    meta: { title: '旧书', source: 'dsh-novel-kit' },
    decisions: [], segments: [], canon: [], obligations: [], audit: [], revisions: [], revision: 2,
  }), 'utf8')
  const preview = await previewLegacy(root)
  const item = preview.items.find((entry) => entry.book === '旧书')
  assert.equal(item.origin, 'kit-legacy-or-mixed')
  const result = await importLegacyBook({ root, book: '旧书', sources: { fade: false, conductor: false } })
  assert.equal(result.ok, true)
  assert.equal((await readDecisions(root, result.bookId)).revision, 1)
})
