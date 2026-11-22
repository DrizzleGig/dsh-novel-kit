// S1：宿主接线——总开关 master + /novel 会话开关 + 7 个工具按会话门控 + 项目模式。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { apply } from '../index.js'

// 总开关偏好写到临时 DSH_HOME，不碰真实 profile。
const dshHome = mkdtempSync(path.join(os.tmpdir(), 'kit-home-'))
process.env.DSH_HOME = dshHome

function fakeHost({ root = null } = {}) {
  const tools = []
  const commands = []
  const services = new Map([['commands', {
    register(definition) {
      commands.push(definition)
      return () => {}
    },
  }]])
  if (root) {
    services.set('workingDirectory', { ensure: async () => root })
  }
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
    provide() {},
    effect(fn) {
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : () => {}
    },
  }
  return { ctx, tools, commands }
}

const agentOf = (id) => ({ session: { id } })

test('apply：注册 7 个 novel_* 工具 + /novel 命令；总开关默认关', async () => {
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

test('/novel master on|off：总开关关掉时 /novel on 不越权', async () => {
  const { ctx, tools, commands } = fakeHost()
  await apply(ctx)
  const command = commands[0]
  const a = agentOf('session-a')
  const visible = (agent) => tools.filter(({ when }) => when?.(agent)).length

  const denied = await command.handler({ agent: a, rawInput: 'on' })
  assert.equal(denied.kind, 'error')
  assert.match(denied.text, /总开关/)

  const masterOn = await command.handler({ agent: a, rawInput: 'master on' })
  assert.equal(masterOn.kind, 'success')
  assert.match(masterOn.text, /总开关已打开/)

  const on = await command.handler({ agent: a, rawInput: 'on' })
  assert.equal(on.kind, 'success')
  assert.match(on.text, /已开启/)
  assert.equal(visible(a), 7, '本会话 7 个工具可见')

  const b = agentOf('session-b')
  assert.equal(visible(b), 0, '别的会话不受影响')

  const status = await command.handler({ agent: a, rawInput: 'status' })
  assert.match(status.text, /总开关开，本会话开/)

  const off = await command.handler({ agent: a, rawInput: 'off' })
  assert.match(off.text, /已收起/)
  assert.equal(visible(a), 0)

  const masterOff = await command.handler({ agent: a, rawInput: 'master off' })
  assert.equal(masterOff.kind, 'success')
  const again = await command.handler({ agent: a, rawInput: 'on' })
  assert.equal(again.kind, 'error')

  const bad = await command.handler({ agent: a, rawInput: 'explode' })
  assert.equal(bad.kind, 'error')
  assert.match(bad.text, /用法/)
})

test('工具执行前再查开关：准入后关 master 不会执行', async () => {
  const { ctx, tools, commands } = fakeHost()
  await apply(ctx)
  const command = commands[0]
  const agent = agentOf('session-exec')
  await command.handler({ agent, rawInput: 'master on' })
  await command.handler({ agent, rawInput: 'on' })
  const queryTool = tools.find(({ definition }) => definition.name === 'novel_query').definition
  await command.handler({ agent, rawInput: 'master off' })
  const result = await queryTool.execute({ book: '书' }, { agent })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'novel-disabled')
})

test('/novel mode：写项目设置，非法模式拒绝', async () => {  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-mode-'))
  const { ctx, commands } = fakeHost({ root })
  await apply(ctx)
  const command = commands[0]
  const agent = agentOf('session-mode')

  const bad = await command.handler({ agent, rawInput: 'mode canon book' })
  assert.equal(bad.kind, 'error')
  assert.match(bad.text, /mode 只能是/)

  const ok = await command.handler({ agent, rawInput: 'mode fanfic 长夜行' })
  assert.equal(ok.kind, 'success')
  assert.match(ok.text, /同人/)
  assert.match(ok.text, /canon-required/)

  const file = path.join(root, '.dsh-novel-kit', 'projects', '长夜行', 'settings.json')
  const saved = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(saved.mode, 'fanfic')
  assert.equal(saved.revision, 1)
  assert.equal(saved.activeCanonSourceId, null)

  const back = await command.handler({ agent, rawInput: 'mode original 长夜行' })
  assert.equal(back.kind, 'success')
  const savedBack = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(savedBack.mode, 'original')
  assert.equal(savedBack.revision, 2)
})
