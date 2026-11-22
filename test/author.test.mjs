// 作者命令：operationId 幂等、输入冲突、revision/hash 校验。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { startChapter, planChapter, writeChapter, readDraft } from '../lib/engine/chapter.js'
import { readProjectSettings } from '../lib/engine/settings.js'
import { readOperation } from '../lib/engine/operations.js'
import { executeAuthorCommand } from '../lib/engine/author.js'

function workspace() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-author-'))
  const beatDir = path.join(root, '.dsh-novel-beat', '书')
  mkdirSync(beatDir, { recursive: true })
  writeFileSync(path.join(beatDir, 'book.json'), JSON.stringify({
    schemaVersion: 2, book: '书', meta: { title: '书' }, chapters: { ch012: {} },
    decisions: [], canon: [], obligations: [], segments: [], audit: [], revisions: [], revision: 0,
  }, null, 2))
  const fadeDir = path.join(root, '.dsh-novel-fade', '书')
  mkdirSync(fadeDir, { recursive: true })
  writeFileSync(path.join(fadeDir, 'memory.json'), JSON.stringify({
    schemaVersion: 3, book: '书', meta: { revision: 0, revisionAt: 0 }, chapters: {}, cards: [],
    entities: {}, places: {}, threads: [], povDistortions: [], audit: [],
  }, null, 2))
  return root
}

const AUTHOR = { kind: 'author', trusted: true, source: 'panel' }
const MODEL = { kind: 'model', trusted: false, source: 'tool' }

test('作者命令：非作者身份被拒，不落 operation', async () => {
  const root = workspace()
  const result = await executeAuthorCommand({
    root, operationId: 'op-model-1', command: 'mode.set', targetRef: { book: '书' }, payload: { mode: 'fanfic' }, actor: MODEL,
  })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'author-required')
  assert.equal(await readOperation(root, 'op-model-1'), null)
})

test('作者命令：decision.adopt 幂等，同 operation 不同输入冲突', async () => {
  const root = workspace()
  const planned = await planChapter({
    root, book: '书', chapter: 13,
    proposals: [{ id: 'p1', title: '谁去', options: [{ label: '夜行', impact: '紧张' }, { label: '白天', impact: '稳' }] }],
  })
  const base = {
    root, command: 'decision.adopt', targetRef: { sessionId: planned.session.id, proposalId: 'p1' }, actor: AUTHOR,
  }
  const first = await executeAuthorCommand({ ...base, operationId: 'op-adopt-1', payload: { option: '夜行' } })
  assert.equal(first.ok, true)
  assert.equal(first.written, true)
  const again = await executeAuthorCommand({ ...base, operationId: 'op-adopt-1', payload: { option: '夜行' } })
  assert.equal(again.ok, true)
  assert.equal(again.idempotent, true)

  const beat = JSON.parse(readFileSync(path.join(root, '.dsh-novel-beat', '书', 'book.json'), 'utf8'))
  assert.equal(beat.decisions.length, 1, '幂等不重复写决策')

  const conflict = await executeAuthorCommand({ ...base, operationId: 'op-adopt-1', payload: { option: '白天' } })
  assert.equal(conflict.ok, false)
  assert.equal(conflict.code, 'operation-conflict')
  const log = await readOperation(root, 'op-adopt-1')
  assert.equal(log.status, 'completed')
  assert.equal(log.command, 'decision.adopt')
})

test('作者命令：draft.save 带 expectedVersion/hash；operation 记录结果', async () => {
  const root = workspace()
  const { session } = await startChapter({ root, book: '书', chapter: 14 })
  const text = '正文'.repeat(4000)
  const result = await executeAuthorCommand({
    root, operationId: 'op-draft-1', command: 'draft.save',
    targetRef: { sessionId: session.id }, payload: { text, expectedVersion: 0 }, actor: AUTHOR,
  })
  assert.equal(result.ok, true)
  assert.equal(result.draft.version, 1)
  assert.equal(result.draft.chars, 8000)
  const read = await readDraft({ root, sessionId: session.id })
  assert.equal(read.draft.text, text)

  const again = await executeAuthorCommand({
    root, operationId: 'op-draft-1', command: 'draft.save',
    targetRef: { sessionId: session.id }, payload: { text, expectedVersion: 0 }, actor: AUTHOR,
  })
  assert.equal(again.idempotent, true)

  const conflict = await executeAuthorCommand({
    root, operationId: 'op-draft-2', command: 'draft.save',
    targetRef: { sessionId: session.id }, payload: { text: '新稿', expectedVersion: 0 }, actor: AUTHOR,
  })
  assert.equal(conflict.ok, false)
  assert.equal(conflict.code, 'draft-conflict')
})

test('作者命令：mode.set 带 expectedRevision', async () => {
  const root = workspace()
  const ok = await executeAuthorCommand({
    root, operationId: 'op-mode-1', command: 'mode.set', targetRef: { book: '书' },
    expectedRevision: 0, payload: { mode: 'fanfic' }, actor: AUTHOR,
  })
  assert.equal(ok.ok, true)
  const settings = await readProjectSettings(root, '书')
  assert.equal(settings.mode, 'fanfic')
  assert.equal(settings.revision, 1)

  const stale = await executeAuthorCommand({
    root, operationId: 'op-mode-2', command: 'mode.set', targetRef: { book: '书' },
    expectedRevision: 0, payload: { mode: 'original' }, actor: AUTHOR,
  })
  assert.equal(stale.ok, false)
  assert.equal(stale.code, 'revision-conflict')
})

test('作者命令：同 operationId 并发不同输入只成功一个', async () => {
  const root = workspace()
  const base = { root, operationId: 'op-race', command: 'mode.set', targetRef: { book: '书' }, actor: AUTHOR }
  const [a, b] = await Promise.all([
    executeAuthorCommand({ ...base, payload: { mode: 'fanfic' } }),
    executeAuthorCommand({ ...base, payload: { mode: 'original' } }),
  ])
  assert.equal([a, b].filter((item) => item.ok).length, 1)
  assert.equal([a, b].filter((item) => item.code === 'operation-conflict').length, 1)
})

test('作者命令：未知命令与非法 operationId 被拒', async () => {
  const root = workspace()
  const unknown = await executeAuthorCommand({ root, operationId: 'op-x', command: 'nope', actor: AUTHOR })
  assert.equal(unknown.ok, false)
  assert.equal(unknown.code, 'unknown-command')
  const badId = await executeAuthorCommand({ root, operationId: '../x', command: 'mode.set', targetRef: { book: '书' }, payload: { mode: 'original' }, actor: AUTHOR })
  assert.equal(badId.ok, false)
  assert.equal(badId.code, 'operation-id-required')
})
