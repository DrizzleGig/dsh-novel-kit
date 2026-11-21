// 面向模型的 novel_* 工具定义（S1 先 4 个：start / write / finish / query）。
//
// 参数表一律编译成真正的 JSON Schema（`type:'object' + properties + required`）：
// 简写形式会让宿主把参数名当根级关键字，`title` 这类名字会直接触发 400（fanfic 0.2.0 的教训）。
import { startChapter, writeChapter, finishChapter, queryChapter, planChapter, resumeChapter, abortChapter, decideProposal } from '../engine/chapter.js'

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
  if (workdir?.ensure && exec?.agent) return await workdir.ensure(exec.agent)
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
    return parts.join(' · ')
  }
  return JSON.stringify(value).slice(0, 400)
}

/** DSH 要求每个工具声明 output { schema, render }。 */
const withOutput = (tool) => ({
  ...tool,
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
      description: '开始（或续上）一章：读 beat/fade 账本、装配四段上下文、建立章节会话。只读，不改账本。',
      parameters: parameterSchema({
        book: { type: 'string', required: true, description: '书名（账本目录名）' },
        chapter: { type: 'integer', minimum: 1, required: true, description: '章号，如 13' },
        required_capabilities: {
          type: 'array', items: { type: 'string', enum: ['beat', 'fade', 'voice', 'fanfic'] },
          description: '本章需要的能力，默认 ["beat","fade"]',
        },
      }),
      async execute(args = {}, exec = {}) {
        const root = await cwdOf(exec)
        return startChapter({
          root,
          book: String(args.book ?? ''),
          chapter: Number(args.chapter),
          requiredCapabilities: Array.isArray(args.required_capabilities) ? args.required_capabilities : ['beat', 'fade'],
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
      description: '收尾本章：校验段落引文与记忆卡，写入 beat 段落与 fade 卡片，生成事务回执。缺提取结果时返回 needs_extraction。',
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
      }),
      async execute(args = {}, exec = {}) {
        const root = await cwdOf(exec)
        return queryChapter({ root, sessionId: args.session_id ? String(args.session_id) : undefined, book: args.book ? String(args.book) : undefined })
      },
    },
    {
      name: 'novel_plan',
      description: '登记本章意图与待拍板提案：进入 awaiting_author，不替作者确认、不写账本。',
      parameters: parameterSchema({
        book: { type: 'string', required: true, description: '书名' },
        chapter: { type: 'integer', minimum: 1, required: true, description: '章号' },
        intent: { type: 'string', description: '本章一句话意图' },
        proposals: {
          type: 'array',
          description: '待拍板提案：[{id,title,options:[{label,impact}]}]',
          items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' } } },
        },
        action: { type: 'string', enum: ['propose', 'adopt', 'reject'], description: 'propose（默认）登记提案；adopt/reject 由作者拍板' },
        session_id: { type: 'string', description: 'adopt/reject 时的章节会话 id' },
        proposal_id: { type: 'string', description: 'adopt/reject 的提案 id' },
        option: { type: 'string', description: 'adopt 时选择的选项 label' },
        note: { type: 'string', description: '拍板备注' },
      }),
      async execute(args = {}, exec = {}) {
        const root = await cwdOf(exec)
        const action = String(args.action ?? 'propose')
        if (action === 'adopt' || action === 'reject') {
          return decideProposal({
            root,
            sessionId: String(args.session_id ?? ''),
            proposalId: String(args.proposal_id ?? ''),
            action,
            option: args.option ? String(args.option) : '',
            note: args.note ? String(args.note) : '',
          })
        }
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