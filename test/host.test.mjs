// S1：宿主接线——/novel 会话开关 + 7 个工具按会话门控。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../index.js'

function fakeHost() {
  const tools = []
  const commands = []
  const services = new Map([['commands', {
    register(definition) {
      commands.push(definition)
      return () => {}
    },
  }]])
  const ctx = {
    tools: {
      register(definition, options) {
        tools.push({ definition, when: options?.when })
        return () => {}
      },
    },
    get(key) {
      return services.get(key)
    },
    effect(fn) {
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : () => {}
    },
  }
  return { ctx, tools, commands }
}

const agentOf = (id) => ({ session: { id } })

test('apply：注册 7 个 novel_* 工具 + /novel 命令，默认按会话关闭', async () => {
  const { ctx, tools, commands } = fakeHost()
  await apply(ctx)
  assert.equal(tools.length, 7)
  assert.deepEqual(tools.map(({ definition }) => definition.name).sort(), [
    'novel_chapter_abort',
    'novel_chapter_finish',
    'novel_chapter_resume',
    'novel_chapter_start',
    'novel_chapter_write',
    'novel_plan',
    'novel_query',
  ])
  assert.equal(commands.length, 1)
  assert.equal(commands[0].name, 'novel')
  assert.equal(typeof commands[0].input?.hint, 'string')

  const gate = (entry) => entry.when?.(agentOf('s1'))
  assert.equal(gate(tools[0]), false, '默认关：工具不可见')
})

test('/novel on|status|off：只影响本会话', async () => {
  const { ctx, tools, commands } = fakeHost()
  await apply(ctx)
  const command = commands[0]
  const a = agentOf('session-a')
  const b = agentOf('session-b')

  const on = await command.handler({ agent: a, rawInput: 'on' })
  assert.equal(on.kind, 'success')
  assert.match(on.text, /已开启/)

  const visible = (agent) => tools.filter(({ when }) => when?.(agent)).length
  assert.equal(visible(a), 7, '本会话 7 个工具可见')
  assert.equal(visible(b), 0, '别的会话不受影响')

  const status = await command.handler({ agent: a, rawInput: 'status' })
  assert.match(status.text, /小说整合包：开/)
  const statusB = await command.handler({ agent: b, rawInput: '' })
  assert.match(statusB.text, /小说整合包：关/)

  const off = await command.handler({ agent: a, rawInput: 'off' })
  assert.match(off.text, /已收起/)
  assert.equal(visible(a), 0)

  const bad = await command.handler({ agent: a, rawInput: 'explode' })
  assert.equal(bad.kind, 'error')
  assert.match(bad.text, /用法/)
})
