// dsh-novel-kit 0.7.1
//
// 独立包：一个包内实现 beat/fade/voice/fanfic/conductor 的能力。
// 本章引擎 + /novel 开关；总开关（master）与项目模式（原创/同人）从 0.2.0 起显式存在。
import { toolDefinitions } from './lib/host/tools.js'
import { createGate } from './lib/host/gate.js'
import { registerNovelCommand } from './lib/host/commands.js'

export const name = 'novel-kit'
export const inject = ['tools', 'commands', 'workingDirectory']

export async function apply(ctx) {
  const gate = createGate()
  const definitions = toolDefinitions()

  for (const definition of definitions) {
    const execute = definition.execute
    // when 只在模型步骤解析时过滤工具；执行前再查一次，防止「准入后关掉开关」仍能跑。
    const guarded = {
      ...definition,
      async execute(args, exec) {
        if (!gate.isOn(exec)) {
          return { ok: false, code: 'novel-disabled', message: '小说能力已关闭：工具已从会话移除，未执行任何操作。' }
        }
        return execute(args, exec)
      },
    }
    ctx.effect(() => ctx.tools.register(guarded, { when: (context) => gate.isOn(context) }))
  }

  // 面板 remote 读开关状态用（只读视图，避免面板另存一份状态）。
  ctx.provide?.('novelKitGate', gate)

  const commands = ctx.get?.('commands')
  if (commands?.register) {
    const rootOf = async (invocation) => {
      const workdir = ctx.get?.('workingDirectory')
      if (workdir?.ensure) {
        const agent = invocation?.agent ?? invocation
        return await workdir.ensure(agent)
      }
      return process.cwd()
    }
    ctx.effect(() => registerNovelCommand({ commands, gate, toolCount: definitions.length, rootOf }))
  }
}
