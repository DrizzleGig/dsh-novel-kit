// /novel 宿主命令：开关、总开关、项目模式与状态；不写账本、不调模型。
import { assertMode, writeProjectSettings } from '../engine/settings.js'

export const NOVEL_COMMAND_HINT = 'on | off | status | master on|off | mode original|fanfic <book>'

/** 解析 `/novel` 后面的参数；空参数等同 status。 */
export function parseNovelInput(rawInput) {
  const raw = String(rawInput ?? '').trim().replace(/^\/?novel\b/i, '').trim()
  const parts = raw ? raw.split(/\s+/u) : []
  const action = (parts[0] || 'status').toLowerCase()
  return { action, args: parts.slice(1) }
}

/**
 * @param {{commands:{register:Function}, gate:{isOn:Function,setOn:Function,setMaster:Function,isMasterOn:Function,keyOf:Function}, toolCount:number, rootOf?:(invocation:object)=>Promise<string>}} deps
 */
export function registerNovelCommand({ commands, gate, toolCount = 7, rootOf = null }) {
  return commands.register({
    name: 'novel',
    description: '小说整合包：/novel on 启用本会话 novel_* 工具；master 控制总开关；mode 控制原创/同人。',
    input: { hint: NOVEL_COMMAND_HINT },
    handler: async (invocation = {}) => {
      const { action, args } = parseNovelInput(invocation.rawInput)
      if (!['on', 'off', 'status', 'master', 'mode'].includes(action)) {
        return { kind: 'error', text: `用法：/novel ${NOVEL_COMMAND_HINT}` }
      }
      if (!gate.keyOf(invocation)) {
        return { kind: 'error', text: '拿不到当前会话，无法切换小说整合包。' }
      }

      if (action === 'master') {
        const value = String(args[0] ?? '').toLowerCase()
        if (value !== 'on' && value !== 'off') {
          return { kind: 'error', text: '用法：/novel master on|off' }
        }
        const result = await gate.setMaster(value === 'on')
        if (!result.saved) {
          return { kind: 'error', text: `总开关已在内存里切到「${result.master ? '开' : '关'}」，但写偏好失败：${result.error ?? '未知错误'}` }
        }
        return {
          kind: 'success',
          text: result.master
            ? '小说能力总开关已打开。本会话仍要用 /novel on 才会出现 novel_* 工具。'
            : '小说能力总开关已关闭：所有会话的 novel_* 工具都会消失；账本、正文与项目设置没有改动。',
        }
      }

      if (action === 'mode') {
        const mode = String(args[0] ?? '').toLowerCase()
        const book = String(args[1] ?? '').trim()
        if (!book) return { kind: 'error', text: '用法：/novel mode original|fanfic <书>' }
        try {
          assertMode(mode)
        } catch (error) {
          return { kind: 'error', text: String(error?.message ?? error) }
        }
        if (!rootOf) return { kind: 'error', text: '宿主没有工作区服务，无法写项目模式。' }
        const root = await rootOf(invocation)
        const next = await writeProjectSettings(root, book, { mode })
        const canon = mode === 'fanfic' && !next.activeCanonSourceId
          ? '；同人模式还没有绑定原著，novel_chapter_start 会返回 canon-required。'
          : ''
        return {
          kind: 'success',
          text: `《${book}》项目模式已设为「${mode === 'fanfic' ? '同人' : '原创'}」（revision ${next.revision}）${canon}`,
        }
      }

      if (action === 'on' || action === 'off') {
        const result = gate.setOn(invocation, action === 'on')
        if (result.ok === false) {
          if (result.code === 'master-off') {
            return { kind: 'error', text: '小说能力总开关关着：先 /novel master on，或在面板里启用小说能力。' }
          }
          return { kind: 'error', text: '拿不到当前会话，无法切换小说整合包。' }
        }
        return {
          kind: 'success',
          text: result.on
            ? `小说整合包已开启：本会话可用 ${toolCount} 个 novel_* 工具（章节引擎 start/write/finish）。`
            : '小说整合包已收起：novel_* 工具从本会话移除；账本与正文都没有改动。',
        }
      }

      const on = gate.isOn(invocation)
      const master = gate.isMasterOn()
      return {
        kind: 'success',
        text: `小说整合包：总开关${master ? '开' : '关'}，本会话${on ? '开' : '关'}；本会话工具：${on ? toolCount : 0} 个。`,
      }
    },
  })
}
