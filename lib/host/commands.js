// /novel 宿主命令：开关、总开关、项目模式、旧账本接管与状态；不调模型。
import { stat } from 'node:fs/promises'
import { assertMode, projectSettingsFile, writeProjectSettings } from '../engine/settings.js'
import { discoverWorkspace } from '../workspace.js'

export const NOVEL_COMMAND_HINT = 'on | off | status | master on|off | mode original|fanfic <book> | legacy'

async function exists(file) {
  try { await stat(file); return true } catch { return false }
}

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
      if (!['on', 'off', 'status', 'master', 'mode', 'legacy'].includes(action)) {
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

      if (action === 'legacy') {
        if (!rootOf) return { kind: 'error', text: '宿主没有工作区服务，无法扫描旧账本。' }
        const root = await rootOf(invocation)
        const found = await discoverWorkspace(root)
        const books = [...new Set([...found.beat, ...found.fade, ...found.fanfic])]
        if (books.length === 0) {
          return { kind: 'success', text: '没有发现旧五件账本（.dsh-novel-beat / fade / fanfic）。' }
        }
        const adopted = []
        const skipped = []
        const failed = []
        for (const book of books.sort()) {
          try {
            const file = projectSettingsFile(root, book)
            if (await exists(file)) { skipped.push(book); continue }
            const mode = found.fanfic.includes(book) ? 'fanfic' : 'original'
            await writeProjectSettings(root, book, { mode })
            adopted.push({ book, mode })
          } catch (error) {
            failed.push({ book, message: String(error?.message ?? error) })
          }
        }
        const lines = [
          `旧账本扫描：beat ${found.beat.length} / fade ${found.fade.length} / voice ${found.voice.length} / fanfic ${found.fanfic.length} / conductor ${found.conductor.length}`,
          adopted.length ? `已接管：${adopted.map((item) => `${item.book}（${item.mode}）`).join('、')}` : '没有新项目需要接管。',
          skipped.length ? `已有项目设置，跳过：${skipped.join('、')}` : null,
          failed.length ? `无法接管：${failed.map((item) => `${item.book}（${item.message}）`).join('、')}` : null,
          '旧账本仍在原目录，kit 就地读写；卸载五件不会删除这些文件。卸载前请先备份工作区。',
        ].filter(Boolean)
        return { kind: 'success', text: lines.join('\n') }
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
