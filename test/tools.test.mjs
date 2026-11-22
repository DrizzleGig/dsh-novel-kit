// S1：novel_* 工具定义（JSON Schema 编译 + 端到端调用）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { toolDefinitions } from '../lib/host/tools.js'
import { importCanon, readWorldContract, getPublishedCanon } from '../lib/engine/canon.js'

const RESERVED = ['title', 'description', 'type', 'required', 'enum', 'items', 'default', 'format', 'pattern', 'properties', 'additionalProperties']

function workspace() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-tools-'))
  const beatDir = path.join(root, '.dsh-novel-beat', '书')
  mkdirSync(beatDir, { recursive: true })
  writeFileSync(path.join(beatDir, 'book.json'), JSON.stringify({
    schemaVersion: 2, book: '书', meta: {}, chapters: {}, decisions: [], canon: [], obligations: [],
    segments: [], audit: [], revisions: [], revision: 1,
  }, null, 2))
  const fadeDir = path.join(root, '.dsh-novel-fade', '书')
  mkdirSync(fadeDir, { recursive: true })
  writeFileSync(path.join(fadeDir, 'memory.json'), JSON.stringify({
    schemaVersion: 3, book: '书', meta: { revision: 1, revisionAt: 1 },
    chapters: {}, cards: [], entities: {}, places: {}, threads: [], povDistortions: [], audit: [{ id: 'a1' }],
  }, null, 2))
  return root
}

test('工具参数是合法 JSON Schema：根级 object、required 是名字数组、没有保留字', () => {
  for (const tool of toolDefinitions()) {
    const schema = tool.parameters
    assert.equal(schema.type, 'object', `${tool.name} 的参数根级必须是 object`)
    assert.equal(typeof schema.properties, 'object')
    assert.ok(Array.isArray(schema.required))
    for (const name of schema.required) {
      assert.equal(typeof name, 'string')
      assert.ok(schema.properties[name], `${tool.name}.required 里的 ${name} 必须在 properties 里`)
    }
    for (const name of Object.keys(schema.properties)) {
      assert.ok(!RESERVED.includes(name), `${tool.name} 的根级参数名不能是 ${name}`)
      assert.equal(schema.properties[name].required, undefined, `${tool.name}.${name} 的属性里不能带 required`)
    }
  }
})

test('端到端：start → write → finish → query 通过工具调用完成', async () => {
  const root = workspace()
  const tools = Object.fromEntries(toolDefinitions().map((tool) => [tool.name, tool]))
  const exec = { cwd: root }

  const started = await tools.novel_chapter_start.execute({ book: '书', chapter: 13 }, exec)
  assert.equal(started.ok, true)
  const sessionId = started.session.id

  const text = '陈凡把令牌放在桌上。\n\n“走吧。”他说。'
  const written = await tools.novel_chapter_write.execute({ session_id: sessionId, text }, exec)
  assert.equal(written.ok, true)
  assert.equal(written.session.draft.version, 1)

  const quote = '陈凡把令牌放在桌上。'
  const finished = await tools.novel_chapter_finish.execute({
    session_id: sessionId,
    segments: [{ start: 0, end: quote.length, quote }],
    memory: { cards: [{ gist: quote, quote, salience: 3 }] },
  }, exec)
  assert.equal(finished.ok, true)
  assert.equal(finished.session.state, 'completed')

  const queried = await tools.novel_query.execute({ session_id: sessionId }, exec)
  assert.equal(queried.session.state, 'completed')
})

test('novel_canon：outline / read / propose 通过工具调用', async () => {
  const root = workspace()
  const file = path.join(root, '原著.txt')
  writeFileSync(file, '第1章 雪夜\n陈凡推门进来。唐昊把令牌放在桌上。\n\n第2章 城门\n两人一路无话。', 'utf8')
  const imported = await importCanon({ root, book: '书', file, title: '原著', confirmMode: true })
  const tools = Object.fromEntries(toolDefinitions().map((tool) => [tool.name, tool]))
  const exec = { cwd: root }

  const outline = await tools.novel_canon.execute({ action: 'outline', source_id: imported.sourceId }, exec)
  assert.equal(outline.ok, true)
  assert.equal(outline.chapterCount, 2)

  const read = await tools.novel_canon.execute({ action: 'read', source_id: imported.sourceId, chapter_id: 'ch000' }, exec)
  assert.equal(read.ok, true)
  assert.match(read.text, /陈凡推门进来/)

  const proposed = await tools.novel_canon.execute({
    action: 'propose', book: '书', source_id: imported.sourceId,
    contract: { characters: [{ name: '陈凡' }], facts: [{ entity: '唐昊', key: '身份', value: '封号斗罗' }] },
  }, exec)
  assert.equal(proposed.ok, true)
  assert.equal(Array.isArray(proposed.created), true)
  assert.equal(proposed.created.length, 2, 'characters + facts 各一条候选')
  assert.match(proposed.message, /待审阅队列/, '结果要告诉模型去等作者审阅')

  // 提案不碰生效内容：契约状态不变、候选只在队列里、投影里没有。
  const contract = await readWorldContract(root, '书', imported.sourceId)
  assert.equal(contract.status, 'pending-extraction', '提案不改契约状态')
  assert.equal(contract.pendingChanges.length, 2)
  assert.equal(contract.contractRevision, 0)
  assert.equal(getPublishedCanon(contract), null, '没有生效版本时投影必须是 null，不能拿候选冒充')
})

test('工具：缺参数时返回可读错误而不是抛栈', async () => {
  const root = workspace()
  const tools = Object.fromEntries(toolDefinitions().map((tool) => [tool.name, tool]))
  const write = tools.novel_chapter_write
  const bad = await write.execute({ session_id: 'nope' }, { cwd: root }).catch((error) => ({ ok: false, message: error.message }))
  assert.equal(bad.ok, false)
  assert.match(bad.message, /text 必填/)
})
