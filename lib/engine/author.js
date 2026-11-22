// 作者命令入口：把「作者在面板/宿主里做的动作」包成 operation，模型工具不能调用。
//
// 命令只做业务调用；幂等/冲突/日志由 operations.js 管。业务函数自己也要幂等
// （例如 decideProposal 对已处理提案返回 idempotent，writeChapter 带 expectedVersion）。
import { decideProposal, writeChapter } from './chapter.js'
import { readProjectSettings, writeProjectSettings } from './settings.js'
import { importStyle } from './profiles.js'
import { importCanon, confirmWorldContract } from './canon.js'
import { runOperation } from './operations.js'

export const AUTHOR_COMMANDS = Object.freeze([
  'decision.adopt',
  'decision.reject',
  'draft.save',
  'mode.set',
  'import.style',
  'import.canon',
  'canon.confirm',
])

function revisionConflict(current) {
  return {
    ok: false,
    code: 'revision-conflict',
    message: '项目设置已被其它操作改过；刷新后再试。',
    current: { revision: current.revision, mode: current.mode },
  }
}

/**
 * @param {{root:string, operationId:string, command:string, targetRef?:object, expectedRevision?:number|null, expectedDraftHash?:string|null, payload?:object, actor:{kind:string,trusted:boolean,source?:string}}} input
 */
export async function executeAuthorCommand({
  root, operationId, command, targetRef = {}, expectedRevision = null, expectedDraftHash = null, payload = {}, actor,
}) {
  if (!AUTHOR_COMMANDS.includes(command)) {
    return { ok: false, code: 'unknown-command', message: '未知作者命令：' + String(command) }
  }
  return runOperation({
    root,
    operationId,
    command,
    targetRef,
    expectedRevision,
    expectedDraftHash,
    payload,
    actor,
    execute: async () => {
      if (command === 'decision.adopt' || command === 'decision.reject') {
        return decideProposal({
          root,
          sessionId: String(targetRef.sessionId ?? payload.sessionId ?? ''),
          proposalId: String(targetRef.proposalId ?? payload.proposalId ?? ''),
          action: command === 'decision.reject' ? 'reject' : 'adopt',
          option: payload.option ? String(payload.option) : '',
          note: payload.note ? String(payload.note) : '',
        })
      }
      if (command === 'draft.save') {
        const result = await writeChapter({
          root,
          sessionId: String(targetRef.sessionId ?? ''),
          text: String(payload.text ?? ''),
          expectedVersion: payload.expectedVersion ?? expectedRevision,
          expectedDraftHash: expectedDraftHash ?? payload.expectedDraftHash ?? null,
        })
        if (result.ok === false) return result
        return {
          ok: true,
          draft: { version: result.draft?.version, hash: result.draft?.hash, chars: result.session?.draftChars ?? null },
          sessionId: result.session?.id,
          state: result.session?.state,
        }
      }
      if (command === 'mode.set') {
        const book = String(targetRef.book ?? payload.book ?? '')
        const current = await readProjectSettings(root, book)
        if (expectedRevision !== null && expectedRevision !== undefined && Number(expectedRevision) !== current.revision) {
          return revisionConflict(current)
        }
        const settings = await writeProjectSettings(root, book, { mode: String(payload.mode ?? '') })
        return { ok: true, settings }
      }
      if (command === 'import.style' || command === 'import.canon') {
        const book = String(targetRef.book ?? payload.book ?? '')
        const current = await readProjectSettings(root, book)
        if (expectedRevision !== null && expectedRevision !== undefined && Number(expectedRevision) !== current.revision) {
          return revisionConflict(current)
        }
        if (command === 'import.style') {
          return importStyle({ root, book, file: String(payload.file ?? ''), title: payload.title ? String(payload.title) : '' })
        }
        return importCanon({
          root,
          book,
          file: String(payload.file ?? ''),
          title: payload.title ? String(payload.title) : '',
          confirmMode: payload.confirmMode === true,
        })
      }
      if (command === 'canon.confirm') {
        const book = String(targetRef.book ?? payload.book ?? '')
        const sourceId = String(targetRef.sourceId ?? payload.sourceId ?? '')
        const settings = await readProjectSettings(root, book)
        if (settings.mode !== 'fanfic' || settings.activeCanonSourceId !== sourceId) {
          return { ok: false, code: 'canon-not-bound', message: '当前项目没有绑定这个 canon；先导入并切换到同人模式。' }
        }
        return confirmWorldContract({ root, book, sourceId })
      }
      return { ok: false, code: 'unknown-command', message: '未处理的作者命令：' + command }
    },
  })
}
