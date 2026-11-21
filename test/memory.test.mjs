// S2：记忆卡的钉卡/遗忘/恢复（事务写 fade 账本）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { updateMemoryCard } from '../lib/engine/memory.js'

function workspace() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-memory-'))
  const dir = path.join(root, '.dsh-novel-fade', '书')
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'memory.json'), JSON.stringify({
    schemaVersion: 3,
    book: '书',
    meta: { revision: 5, revisionAt: 2 },
    chapters: {},
    cards: [
      { id: 'c1', chapter: 1, gist: '身份', status: 'active', lifecycle: { status: 'active', protection: 'none' } },
      { id: 'c2', chapter: 2, gist: '日常', status: 'active', lifecycle: { status: 'active', protection: 'none' } },
    ],
    entities: {}, places: {}, threads: [], povDistortions: [],
    audit: [{ id: 'a1' }, { id: 'a2' }],
  }, null, 2))
  return root
}

const memoryOf = (root) => JSON.parse(readFileSync(path.join(root, '.dsh-novel-fade', '书', 'memory.json'), 'utf8'))

test('pin：卡片受保护、revision+1、audit 追加', async () => {
  const root = workspace()
  const result = await updateMemoryCard({ root, book: '书', cardId: 'c1', action: 'pin' })
  assert.equal(result.ok, true)
  assert.equal(result.revision, 6)
  const memory = memoryOf(root)
  assert.equal(memory.cards[0].lifecycle.status, 'protected')
  assert.equal(memory.cards[0].pinned, true)
  assert.equal(memory.meta.revision, 6)
  assert.equal(memory.audit.length, 3)
  assert.equal(memory.audit.at(-1).kind, 'memory-pin')
})

test('forget：卡片转为 forgotten；restore 能还原', async () => {
  const root = workspace()
  await updateMemoryCard({ root, book: '书', cardId: 'c2', action: 'forget' })
  assert.equal(memoryOf(root).cards[1].status, 'forgotten')
  await updateMemoryCard({ root, book: '书', cardId: 'c2', action: 'restore' })
  const memory = memoryOf(root)
  assert.equal(memory.cards[1].status, 'active')
  assert.equal(memory.meta.revision, 7)
})

test('未知卡片与未知动作都直接报错，不写账本', async () => {
  const root = workspace()
  await assert.rejects(() => updateMemoryCard({ root, book: '书', cardId: 'nope', action: 'pin' }), /没有这张记忆卡/)
  await assert.rejects(() => updateMemoryCard({ root, book: '书', cardId: 'c1', action: 'explode' }), /不支持的动作/)
  assert.equal(memoryOf(root).meta.revision, 5)
})
