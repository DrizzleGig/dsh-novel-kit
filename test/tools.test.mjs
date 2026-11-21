// S1：novel_* 工具定义（JSON Schema 编译 + 端到端调用）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { toolDefinitions } from '../lib/host/tools.js'

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

test('工具：缺参数时返回可读错误而不是抛栈', async () => {
  const root = workspace()
  const tools = Object.fromEntries(toolDefinitions().map((tool) => [tool.name, tool]))
  const write = tools.novel_chapter_write
  const bad = await write.execute({ session_id: 'nope' }, { cwd: root }).catch((error) => ({ ok: false, message: error.message }))
  assert.equal(bad.ok, false)
  assert.match(bad.message, /text 必填/)
})
