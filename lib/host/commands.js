// /novel 宿主命令：只做开关与状态，不写账本、不调模型。
export const NOVEL_COMMAND_HINT = 'on | off | status'

/** 解析 `/novel` 后面的参数；空参数等同 status。 */
export function parseNovelInput(rawInput) {
  const raw = String(rawInput ?? '').trim().replace(/^\/?novel\b/i, '').trim()
  const action = (raw.split(/\s+/)[0] || 'status').toLowerCase()
  return { action }
}

/**
 * @param {{commands:{register:Function}, gate:{isOn:Function,setOn:Function,keyOf:Function}, toolCount:number}} deps
 */
export function registerNovelCommand({ commands, gate, toolCount = 7 }) {
  return commands.register({
    name: 'novel',
    description: '小说整合包：/novel on 启用 novel_* 工具，/novel off 收起，/novel status 看状态。',
    input: { hint: NOVEL_COMMAND_HINT },
    handler: async (invocation = {}) => {
      const { action } = parseNovelInput(invocation.rawInput)
      if (action !== 'on' && action !== 'off' && action !== 'status') {
        return { kind: 'error', text: `用法：/novel ${NOVEL_COMMAND_HINT}` }
      }
      if (!gate.keyOf(invocation)) {
        return { kind: 'error', text: '拿不到当前会话，无法切换小说整合包。' }
      }
      if (action === 'on' || action === 'off') {
        const result = gate.setOn(invocation, action === 'on')
        return {
          kind: 'success',
          text: result.on
            ? `小说整合包已开启：本会话可用 ${toolCount} 个 novel_* 工具（章节引擎 start/write/finish）。`
            : '小说整合包已收起：novel_* 工具从本会话移除；账本与正文都没有改动。',
        }
      }
      const on = gate.isOn(invocation)
      return {
        kind: 'success',
        text: `小说整合包：${on ? '开' : '关'}（/novel on 开，/novel off 关）；本会话工具：${on ? toolCount : 0} 个。`,
      }
    },
  })
}
