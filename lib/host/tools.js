// 面向模型的 novel_* 工具定义（S1 先 4 个：start / write / finish / query）。
//
// 参数表一律编译成真正的 JSON Schema（`type:'object' + properties + required`）：
// 简写形式会让宿主把参数名当根级关键字，`title` 这类名字会直接触发 400（fanfic 0.2.0 的教训）。
import { startChapter, writeChapter, finishChapter, queryChapter, planChapter, resumeChapter, abortChapter } from '../engine/chapter.js'
import { readSourceMeta, readSourceChapter } from '../engine/sources.js'
import { proposeCanonChanges } from '../engine/canon.js'
import { readProjectSettings } from '../engine/settings.js'

/** 简写 → JSON Schema（与五件仓库里的 tool-schema 守卫同义）。 */
export function parameterSchema(properties) {
  const required = []
  const props = {}
  for (const [name, spec] of Object.entries(properties)) {
    const { required: isRequired, ...rest } = spec ?? {}
    props[name] = rest
    if (isRequired) required.push(name)
  }
  return { type: 'object', properties: props, required, additionalProperties: false }
}

async function cwdOf(exec) {
  if (typeof exec?.cwd === 'string' && exec.cwd) return exec.cwd
  const workdir = exec?.ctx?.get?.('workingDirectory')
  if (workdir?.ensure && exec?.agent) {
    const dir = await workdir.ensure(exec.agent)
    if (typeof dir === 'string' && dir) return dir
  }
  // headless / CLI / 嵌入式宿主没有 exec.cwd，也可能没有 agent 级 workingDirectory。
  // 进程 cwd 就是启动时选定的工作区；不兜底会让 8 个工具在 L2 全线不可用。
  if (typeof process.cwd === 'function') return process.cwd()
  throw new Error('拿不到工作区：exec.cwd 或 workingDirectory 必需')
}

const fail = (message, code = 'error') => ({ ok: false, code, message })

/** 工具返回值的人话摘要（模型看 text；结构化字段仍原样保留）。 */
function humanize(value) {
  if (!value || typeof value !== 'object') return String(value ?? '')
  if (value.ok === false) return `失败${value.code ? `（${value.code}）` : ''}：${value.message ?? ''}`
  const session = value.session
  if (session) {
    const parts = [`会话 ${session.id}`, `第 ${session.chapter} 章`, session.state]
    if (value.resumed) parts.push('（续上已有会话）')
    if (session.draft) parts.push(`草稿 v${session.draft.version}`)
    if (value.receipt) parts.push(`事务 ${value.receipt.txId}`)
    if (value.pending !== undefined) parts.push(`待拍板 ${value.pending}`)
    if (value.styleHint) parts.push(value.styleHint)
    if (value.contract) {
      const facts = Array.isArray(value.contract.facts) ? value.contract.facts.length : 0
      const people = Array.isArray(value.contract.characters) ? value.contract.characters.length : 0
      const rules = Array.isArray(value.contract.worldRules) ? value.contract.worldRules.length : 0
      parts.push(`canon ${value.contract.status ?? '?'} · 事实 ${facts} · 人物 ${people} · 规则 ${rules}`)
    }
    if (value.context?.segments) {
      const context = value.context.segments
        .filter((segment) => segment.available && segment.markdown)
        .map((segment) => `【${segment.component}】\n${segment.markdown}`)
        .join('\n\n')
      if (context) parts.push(context)
    }
    return parts.join(' · ')
  }
  // canon/memory 查询是模型实际阅读的数据，400 字符会把数组截在半条记录上；
  // 给一个有界的 4000 字符窗口，并明确标出截断，避免模型把残片当完整事实。
  const text = JSON.stringify(value)
  return text.length > 4000 ? `${text.slice(0, 4000)}…（已截断，完整结果请缩小查询范围）` : text
}

/** DSH 要求每个工具声明 output { schema, render }。 */
function lossless(value) {
  if (value === undefined) return null
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return { ok: false, code: 'output-not-serializable', message: '工具结果含不可序列化字段，已拒绝输出。' }
  }
}

const withOutput = (tool) => ({
  ...tool,
  // 宿主按 lossless JSON 校验工具返回值：对象里的 undefined / 函数会让整个工具报
  // "value is not lossless JSON"（novel_query view=ledgers 的实测根因）。
  async execute(args, exec) {
    return lossless(await tool.execute(args, exec))
  },
  output: {
    schema: {
      type: 'object',
      additionalProperties: true,
      properties: { ok: { type: 'boolean' }, text: { type: 'string' } },
    },
    render: (_args, value) => [{ type: 'text', text: humanize(value) }],
  },
})

export function toolDefinitions() {
  return ([
    {
      name: 'novel_chapter_start',
      description: '开始（或续上）一章：读 kit 原生决策/记忆/风格/canon 账本，装配四段上下文，建立章节会话。只读，不改账本。required_capabilities 是兼容标签，只检查 kit 原生数据是否可用，不依赖、也不会调用已安装的五件插件。',
      parameters: parameterSchema({
        book: { type: 'string', required: true, description: '书名（账本目录名）' },
        chapter: { type: 'integer', minimum: 1, required: true, description: '章号，如 13' },
        required_capabilities: {
          type: 'array', items: { type: 'string', enum: ['beat', 'fade', 'voice', 'fanfic'] },
          description: '本章需要的能力标签，默认 ["beat","fade"]；只映射到 kit 原生账本/档案，不读取五件目录',
        },
        strict: { type: 'boolean', description: '只检查 required_capabilities 里的能力，不越权扫无关账本' },
      }),
      async execute(args = {}, exec = {}) {
        const root = await cwdOf(exec)
        return startChapter({
          root,
          book: String(args.book ?? ''),
          chapter: Number(args.chapter),
          requiredCapabilities: Array.isArray(args.required_capabilities) ? args.required_capabilities : ['beat', 'fade'],
          strict: args.strict === true,
        })
      },
    },
    {
      name: 'novel_chapter_write',
      description: '保存本章正文草稿（新版本）。正文一变，基于旧稿的检查结果作废。',
      parameters: parameterSchema({
        session_id: { type: 'string', required: true, description: '章节会话 id' },
        text: { type: 'string', required: true, description: '本章正文全文' },
      }),
      async execute(args = {}, exec = {}) {
        const root = await cwdOf(exec)
        if (typeof args.text !== 'string' || args.text.length === 0) return fail('text 必填', 'invalid-args')
        return writeChapter({ root, sessionId: String(args.session_id ?? ''), text: args.text })
      },
    },
    {
      name: 'novel_chapter_finish',
      description: '收尾本章：校验段落引文与记忆卡，写入 kit 原生段落/记忆账，生成事务回执。缺提取结果时返回 needs_extraction。不写 beat/fade 目录。',
      parameters: parameterSchema({
        session_id: { type: 'string', required: true, description: '章节会话 id' },
        segments: {
          type: 'array', required: true,
          description: '段落映射：{start,end,quote,decisionIds[]}；quote 必须与正文逐字相同',
          items: {
            type: 'object',
            properties: {
              start: { type: 'integer', minimum: 0 },
              end: { type: 'integer', minimum: 1 },
              quote: { type: 'string' },
              decisionIds: { type: 'array', items: { type: 'string' } },
            },
            required: ['quote'],
          },
        },
        memory: {
          type: 'object',
          description: '记忆提取：{cards:[{topic,gist,quote,salience,emotion,entityIds[],placeId}]}',
          properties: {
            cards: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  topic: { type: 'string' },
                  gist: { type: 'string' },
                  quote: { type: 'string' },
                  salience: { type: 'integer', minimum: 1, maximum: 5 },
                  emotion: { type: 'string' },
                  entityIds: { type: 'array', items: { type: 'string' } },
                  placeId: { type: 'string' },
                },
                required: ['quote'],
              },
            },
          },
        },
      }),
      async execute(args = {}, exec = {}) {
        const root = await cwdOf(exec)
        return finishChapter({
          root,
          sessionId: String(args.session_id ?? ''),
          extraction: { segments: args.segments, memory: args.memory },
        })
      },
    },
    {
      name: 'novel_query',
      description: '查询章节会话状态、上下文摘要与未完成事务。',
      parameters: parameterSchema({
        session_id: { type: 'string', description: '章节会话 id（与 book 二选一）' },
        book: { type: 'string', description: '按书查最近的活动会话' },
        view: { type: 'string', enum: ['session', 'conflicts', 'memory', 'style', 'canon', 'ledgers', 'history'], description: 'session=会话状态；conflicts=冲突；memory/style/canon/ledgers=只读视图' },
        query: { type: 'string', description: 'view=memory 时的检索词' },
        chapter: { type: 'integer', minimum: 1, description: 'view=memory 时的当前章（影响 fidelity）' },
      }),
      async execute(args = {}, exec = {}) {
        const root = await cwdOf(exec)
        return queryChapter({
          root,
          sessionId: args.session_id ? String(args.session_id) : undefined,
          book: args.book ? String(args.book) : undefined,
          view: args.view ? String(args.view) : null,
          query: args.query ? String(args.query) : '',
          chapter: args.chapter ? Number(args.chapter) : null,
        })
      },
    },
    {
      name: 'novel_plan',
      description: '登记本章意图与待拍板提案：只能 propose，进入 awaiting_author。adopt/reject 必须由作者在面板/作者命令完成，模型不能批准。选项可带 styleFit/styleWhy，返回文风决策提示。',
      parameters: parameterSchema({
        book: { type: 'string', required: true, description: '书名' },
        chapter: { type: 'integer', minimum: 1, required: true, description: '章号' },
        intent: { type: 'string', description: '本章一句话意图' },
        proposals: {
          type: 'array',
          description: '待拍板提案：[{id,title,options:[{label,impact,styleFit?,styleWhy?}]}]',
          items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' } } },
        },
      }),
      async execute(args = {}, exec = {}) {
        const root = await cwdOf(exec)
        return planChapter({
          root,
          book: String(args.book ?? ''),
          chapter: Number(args.chapter),
          intent: args.intent ? String(args.intent) : '',
          proposals: Array.isArray(args.proposals) ? args.proposals : [],
        })
      },
    },
    {
      name: 'novel_canon',
      description: '同人 canon：outline 列原著章节；read 读某章原文（offset/limit 分页，默认 3000 字，用 nextOffset 续读）；propose 提交「一条」候选变更（collection + operation + after/entryId）。propose 只进待审队列，作者逐条接受并应用后才进写作依据；模型不能批准或发布。',
      parameters: parameterSchema({
        action: { type: 'string', enum: ['outline', 'read', 'propose'], required: true, description: 'outline / read / propose' },
        source_id: { type: 'string', required: true, description: 'SourceDocument 的完整 SHA-256' },
        book: { type: 'string', description: 'propose 时的书名' },
        chapter_id: { type: 'string', description: 'read 时的章节 id（chNNN）' },
        offset: { type: 'integer', minimum: 0, description: 'read 的起始字符偏移（Unicode 字符），默认 0' },
        limit: { type: 'integer', minimum: 1, maximum: 20000, description: 'read 的单页字符数，默认 3000；配合 nextOffset 翻页' },
        change: {
          type: 'object',
          description: 'propose 的单条候选：{ collection, operation: add|update|remove, entryId?, after?, evidenceRefs? }',
          additionalProperties: true,
        },
        expected_revision: { type: 'number', description: 'propose 时的文档 revision（可选，CAS）' },
        base_contract_revision: { type: 'number', description: '这条候选基于哪个生效版本（可选，过期会被拒）' },
        base_content_hash: { type: 'string', description: '这条候选基于的生效内容指纹（可选）' },
      }),
      async execute(args = {}, exec = {}) {
        const root = await cwdOf(exec)
        const sourceId = String(args.source_id ?? '')
        const action = String(args.action ?? '')
        if (action === 'outline') {
          const meta = await readSourceMeta(root, sourceId)
          return { ok: true, action, sourceId, title: meta.title, chapterCount: meta.chapterCount, chapters: meta.chapters ?? [] }
        }
        if (action === 'read') {
          const text = await readSourceChapter(root, sourceId, String(args.chapter_id ?? ''))
          const chars = [...text]
          const offset = Math.max(0, Number.isInteger(args.offset) ? args.offset : 0)
          const limit = Math.min(20000, Math.max(1, Number.isInteger(args.limit) ? args.limit : 3000))
          const end = Math.min(chars.length, offset + limit)
          const page = chars.slice(offset, end).join('')
          return {
            ok: true, action, sourceId, chapterId: String(args.chapter_id ?? ''),
            chars: chars.length, offset, limit, end,
            truncated: end < chars.length,
            nextOffset: end < chars.length ? end : null,
            text: page,
          }
        }
        if (action === 'propose') {
          const book = String(args.book ?? '')
          if (!book) return fail('propose 需要 book', 'invalid-args')
          const settings = await readProjectSettings(root, book)
          if (settings.mode !== 'fanfic' || settings.activeCanonSourceId !== sourceId) {
            return fail('当前项目没有绑定这个 canon：先导入原著并切到同人模式', 'canon-not-bound')
          }
          if (args.contract && typeof args.contract === 'object') {
            return fail('整份 contract 参数已停用：改成单条 change 提交候选（先 novel_query 拿版本和 entryId）。', 'canon-queue-required')
          }
          const change = args.change && typeof args.change === 'object' ? args.change : null
          if (!change) return fail('propose 需要 change 对象：{ collection, operation, after|entryId }', 'canon-invalid-change')
          const result = await proposeCanonChanges({
            root, book, sourceId,
            changes: [change],
            expectedRevision: args.expected_revision ?? null,
            baseContractRevision: args.base_contract_revision ?? null,
            baseContentHash: args.base_content_hash ?? null,
            proposedBy: { kind: 'model' },
          })
          if (result && result.ok === false) return fail(result.message || '提交候选失败', result.code || 'canon-propose-failed')
          return {
            ok: true,
            action,
            sourceId,
            book,
            created: result.created ?? [],
            pending: result.pending ?? 0,
            revision: result.revision ?? null,
            contractRevision: result.contractRevision ?? null,
            message: (result.created ?? []).length
              ? '已提交 ' + result.created.length + ' 条候选变更：等作者在「同人 · 待审阅队列」逐条接受并应用。应用前不会进入写作依据。'
              : '这条候选已经在队列里了。',
          }
        }
        return fail('action 只能是 outline / read / propose', 'invalid-args')
      },
    },
    {
      name: 'novel_chapter_resume',
      description: '续跑一章：回读会话与未完成事务，告诉模型下一步该做什么（不改账本）。',
      parameters: parameterSchema({
        session_id: { type: 'string', required: true, description: '章节会话 id' },
      }),
      async execute(args = {}, exec = {}) {
        const root = await cwdOf(exec)
        return resumeChapter({ root, sessionId: String(args.session_id ?? '') })
      },
    },
    {
      name: 'novel_chapter_abort',
      description: '中止本章：停止后续执行，保留正文草稿与已提交账本。',
      parameters: parameterSchema({
        session_id: { type: 'string', required: true, description: '章节会话 id' },
        reason: { type: 'string', description: '中止原因' },
      }),
      async execute(args = {}, exec = {}) {
        const root = await cwdOf(exec)
        return abortChapter({ root, sessionId: String(args.session_id ?? ''), reason: args.reason ? String(args.reason) : '' })
      },
    },
  ]).map(withOutput)
}
