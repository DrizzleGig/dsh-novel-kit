// dsh-novel-kit 0.1.0-dev
//
// 独立包：一个包内实现 beat/fade/voice/fanfic/conductor 的能力。
// S0 只读层（codecs/repositories）+ S1 章节引擎（7 个 novel_* 工具 + /novel 会话开关）。
import { toolDefinitions } from './lib/host/tools.js'
import { createGate } from './lib/host/gate.js'
import { registerNovelCommand } from './lib/host/commands.js'

export const name = 'novel-kit'
export const inject = ['tools', 'commands']

export async function apply(ctx) {
  const gate = createGate()
  const definitions = toolDefinitions()

  for (const definition of definitions) {
    ctx.effect(() => ctx.tools.register(definition, { when: (context) => gate.isOn(context) }))
  }

  const commands = ctx.get?.('commands')
  if (commands?.register) {
    ctx.effect(() => registerNovelCommand({ commands, gate, toolCount: definitions.length }))
  }
}
