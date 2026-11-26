// 作者命令入口：把「作者在面板/宿主里做的动作」包成 operation，模型工具不能调用。
//
// 命令只做业务调用；幂等/冲突/日志由 operations.js 管。业务函数自己也要幂等
// （例如 decideProposal 对已处理提案返回 idempotent，writeChapter 带 expectedVersion）。
import { decideProposal, writeChapter, startChapter, reviseDecision } from './chapter.js'
import { readProjectSettings, writeProjectSettings, setProjectMode } from './settings.js'
import { importStyle, confirmStyleProfile } from './profiles.js'
import { importCanon, proposeCanonChanges, reviewCanonChange, applyCanonChanges } from './canon.js'
import { ensureBook } from './book.js'
import { saveChapterPlan } from './plan.js'
import { runOperation } from './operations.js'

export const AUTHOR_COMMANDS = Object.freeze([
  'decision.adopt',
  'decision.reject',
  'decision.revise',
  'plan.save',
  'book.create',
  'chapter.start',
  'draft.save',
  'mode.set',
  'import.style',
  'style.confirm',
  'import.canon',
  'canon.update',
  'canon.confirm',
  'canon.propose',
  'canon.review',
  'canon.apply',
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
      if (command === 'plan.save') {
        return saveChapterPlan({
          root,
          book: String(targetRef.book ?? payload.book ?? ''),
          chapter: Number(targetRef.chapter ?? payload.chapter),
          intent: String(payload.intent ?? ''),
          pov: String(payload.pov ?? ''),
          time: String(payload.time ?? ''),
          place: String(payload.place ?? ''),
          scenes: Array.isArray(payload.scenes) ? payload.scenes : [],
          expectedRevision: payload.expectedRevision ?? null,
        })
      }
      if (command === 'decision.revise') {
        return reviseDecision({
          root,
          book: String(targetRef.book ?? payload.book ?? ''),
          decisionId: String(targetRef.decisionId ?? payload.decisionId ?? ''),
          newOption: String(payload.option ?? payload.newOption ?? ''),
          note: payload.note ? String(payload.note) : '',
        })
      }
      if (command === 'book.create') {
        return ensureBook({
          root,
          book: String(targetRef.book ?? payload.book ?? ''),
          mode: payload.mode === 'fanfic' ? 'fanfic' : 'original',
        })
      }
      if (command === 'chapter.start') {
        return startChapter({
          root,
          book: String(targetRef.book ?? payload.book ?? ''),
          chapter: Number(targetRef.chapter ?? payload.chapter),
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
        const result = await setProjectMode(root, book, String(payload.mode ?? ''), expectedRevision ?? null)
        if (!result.ok) return result.code === 'revision-conflict' ? revisionConflict(result.settings) : result
        return { ok: true, settings: result.settings }
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
      if (command === 'style.confirm') {
        return confirmStyleProfile({
          root,
          profileId: String(targetRef.profileId ?? payload.profileId ?? ''),
          expectedRevision: payload.expectedRevision ?? expectedRevision,
        })
      }
      if (command === 'canon.update') {
        return {
          ok: false,
          code: 'canon-queue-required',
          message: '整份更新已停用：用 canon.propose 提交候选变更，再在「同人 · 待审阅队列」逐条审阅并应用。',
        }
      }
      if (command === 'canon.propose') {
        const book = String(targetRef.book ?? payload.book ?? '')
        const sourceId = String(targetRef.sourceId ?? payload.sourceId ?? '')
        const settings = await readProjectSettings(root, book)
        if (settings.mode !== 'fanfic' || settings.activeCanonSourceId !== sourceId) {
          return { ok: false, code: 'canon-not-bound', message: '当前项目没有绑定这个 canon；先导入并切换到同人模式。' }
        }
        return proposeCanonChanges({
          root, book, sourceId,
          changes: Array.isArray(payload.changes) ? payload.changes : [],
          expectedRevision: payload.expectedRevision ?? expectedRevision,
          baseContractRevision: payload.baseContractRevision ?? null,
          baseContentHash: payload.baseContentHash ?? null,
          proposedBy: { kind: 'author' },
        })
      }
      if (command === 'canon.confirm') {
        return {
          ok: false,
          code: 'canon-queue-required',
          message: '整份确认已停用：接受并应用候选后，契约会自动成为已确认。',
        }
      }
      if (command === 'canon.review') {
        const book = String(targetRef.book ?? payload.book ?? '')
        const sourceId = String(targetRef.sourceId ?? payload.sourceId ?? '')
        const settings = await readProjectSettings(root, book)
        if (settings.mode !== 'fanfic' || settings.activeCanonSourceId !== sourceId) {
          return { ok: false, code: 'canon-not-bound', message: '当前项目没有绑定这个 canon；先导入并切换到同人模式。' }
        }
        return reviewCanonChange({
          root, book, sourceId,
          changeId: String(targetRef.changeId ?? payload.changeId ?? ''),
          action: String(payload.action ?? ''),
          note: payload.note ? String(payload.note) : '',
          reviewedBy: 'author',
          expectedChangeHash: payload.expectedChangeHash ? String(payload.expectedChangeHash) : null,
          expectedRevision: payload.expectedRevision ?? expectedRevision,
        })
      }
      if (command === 'canon.apply') {
        const book = String(targetRef.book ?? payload.book ?? '')
        const sourceId = String(targetRef.sourceId ?? payload.sourceId ?? '')
        const settings = await readProjectSettings(root, book)
        if (settings.mode !== 'fanfic' || settings.activeCanonSourceId !== sourceId) {
          return { ok: false, code: 'canon-not-bound', message: '当前项目没有绑定这个 canon；先导入并切换到同人模式。' }
        }
        return applyCanonChanges({
          root, book, sourceId,
          changeIds: Array.isArray(payload.changeIds) ? payload.changeIds : [],
          expectedRevision: payload.expectedRevision ?? expectedRevision,
          operationId: 'canon-apply:' + operationId,
          inputHash: payload.inputHash ? String(payload.inputHash) : null,
        })
      }
      return { ok: false, code: 'unknown-command', message: '未处理的作者命令：' + command }
    },
  })
}
