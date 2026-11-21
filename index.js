// dsh-novel-kit 0.1.0-dev
//
// 独立包：一个包内实现 beat/fade/voice/fanfic/conductor 的能力。
// S0 只读层（codecs/repositories）+ S1 章节引擎（start/write/finish/query）已就绪；
// 工具面先注册 4 个，开关与面板在 S1/S2 继续接。
import { toolDefinitions } from './lib/host/tools.js'

export const name = 'novel-kit'
export const inject = ['tools']

export async function apply(ctx) {
  for (const definition of toolDefinitions()) {
    ctx.effect(() => ctx.tools.register(definition))
  }
}
