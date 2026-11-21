// S2：同人原著导入（切章 + source 布局 + project 事务更新）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { splitChapters, importSource, listSourceFiles } from '../lib/engine/import.js'

const sample = [
  '第1章 雪夜出城',
  '陈凡推门进来。',
  '',
  '第2章 城门',
  '两人一路无话。',
  '',
  '第3章 令牌',
  '唐昊把令牌放在桌上。',
].join('\n')

function workspace() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-import-'))
  const project = path.join(root, '.dsh-novel-fanfic', 'douluo')
  mkdirSync(path.join(project, 'canon'), { recursive: true })
  writeFileSync(path.join(project, 'project.json'), JSON.stringify({
    id: 'douluo', title: '旧标题', sourceId: null, revision: 3, schemaVersion: 1,
  }, null, 2))
  const file = path.join(root, '原著.txt')
  writeFileSync(file, sample, 'utf8')
  return { root, file }
}

test('splitChapters：按「第N章」切分并保留标题', () => {
  const chapters = splitChapters(sample)
  assert.equal(chapters.length, 3)
  assert.equal(chapters[0].id, 'ch000')
  assert.equal(chapters[0].title, '雪夜出城')
  assert.equal(chapters[1].id, 'ch001')
  assert.match(chapters[2].body, /令牌/)
})

test('splitChapters：没有标题时整篇一章', () => {
  const chapters = splitChapters('只有正文，没有章节标题。')
  assert.equal(chapters.length, 1)
  assert.equal(chapters[0].id, 'ch001')
})

test('importSource：写 source 布局、更新 project、重复导入幂等', async () => {
  const { root, file } = workspace()
  const first = await importSource({ root, project: 'douluo', file, title: '原著' })
  assert.equal(first.ok, true)
  assert.equal(first.chapters, 3)
  const sourceDir = path.join(root, '.dsh-novel-fanfic', 'douluo', 'source', first.sourceId)
  assert.ok(readdirSync(sourceDir).includes('meta.json'))
  assert.equal(readdirSync(path.join(sourceDir, 'chapters')).length, 3)
  const project = JSON.parse(readFileSync(path.join(root, '.dsh-novel-fanfic', 'douluo', 'project.json'), 'utf8'))
  assert.equal(project.sourceId, first.sourceId)
  assert.equal(project.revision, 4)
  assert.equal(project.title, '原著')

  const again = await importSource({ root, project: 'douluo', file })
  assert.equal(again.idempotent, true)
  const projectAgain = JSON.parse(readFileSync(path.join(root, '.dsh-novel-fanfic', 'douluo', 'project.json'), 'utf8'))
  assert.equal(projectAgain.revision, 4, '重复导入不再加 revision')
})

test('importSource：非 UTF-8 与相对路径都拒绝', async () => {
  const { root } = workspace()
  const bad = path.join(root, 'gbk.txt')
  writeFileSync(bad, Buffer.from([0xb5, 0xda, 0xd2, 0xbb, 0x20, 0x20, 0xff]))
  await assert.rejects(() => importSource({ root, project: 'douluo', file: bad }), /不是 UTF-8/)
  await assert.rejects(() => importSource({ root, project: 'douluo', file: 'relative.txt' }), /绝对路径/)
})

test('listSourceFiles：只列 txt/md', async () => {
  const { root } = workspace()
  writeFileSync(path.join(root, 'note.md'), '# x', 'utf8')
  writeFileSync(path.join(root, 'cover.png'), 'x')
  const listed = await listSourceFiles(root)
  assert.equal(listed.ok, true)
  assert.deepEqual(listed.files.map((item) => item.name), ['原著.txt', 'note.md'])
})
