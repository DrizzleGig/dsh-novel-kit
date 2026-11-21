// 面向模型的 novel_* 工具定义（S1 先 4 个：start / write / finish / query）。
//
// 参数表一律编译成真正的 JSON Schema（`type:'object' + properties + required`）：
// 简写形式会让宿主把参数名当根级关键字，`title` 这类名字会直接触发 400（fanfic 0.2.0 的教训）。
import { startChapter, writeChapter, finishChapter, queryChapter } from '../engine/chapter.js'

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

export function toolDefinitions() {
  return [
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
  ]
}
