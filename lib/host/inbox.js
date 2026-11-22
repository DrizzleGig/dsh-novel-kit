/**
 * 统一收件箱：把「这本书还有什么没办」从客户端拼字符串改成 Host 聚合。
 *
 * 只做纯函数，不读盘：调用方把 decisions / snapshot / operations 传进来。
 * 每条都带 target.page，客户端据此跳页；severity 决定排序，blockScope 决定它
 * 会不会拦住开章（start）或收尾（finish），不拦的只提示。
 */

const SEVERITY_ORDER = { blocker: 0, warning: 1, info: 2 }

/**
 * @param {{
 *   book?: string|null,
 *   decisions?: object|null,
 *   snapshot?: object|null,
 *   operations?: {items?: object[]}|null,
 *   limit?: number,
 * }} input
 */
export function buildInbox({ book = null, decisions = null, snapshot = null, operations = null, limit = 40 } = {}) {
  const items = []
  const push = (item) => items.push(item)

  // 1) 待拍板提案：不回话就收不了尾
  for (const proposal of decisions?.proposals ?? []) {
    push({
      id: 'decision:' + (proposal.id || '?'),
      kind: 'decision',
      severity: 'blocker',
      blockScope: 'finish',
      title: proposal.title || '待你拍板的提案',
      summary: (proposal.options || []).map((option) => option.label).join(' / '),
      target: { page: 'beat' },
      actions: ['adopt', 'reject'],
      chapter: decisions?.chapter ?? null,
    })
  }

  // 2) 同人 canon 没确认：开章就缺世界段
  const mode = snapshot?.settings?.mode
  const canon = snapshot?.canon
  if (mode === 'fanfic' && (!canon || canon.ready !== true)) {
    push({
      id: 'canon:contract',
      kind: 'canon',
      severity: 'blocker',
      blockScope: 'start',
      title: '同人原著还没确认',
      summary: canon ? '当前状态：' + (canon.status || 'unknown') : '还没有绑定原著',
      target: { page: 'fanfic' },
      actions: ['confirm'],
      chapter: null,
    })
  }

  // 3) 设定冲突：只报告，不裁决（不能自动重试覆盖）
  for (const item of snapshot?.conflicts?.items ?? []) {
    push({
      id: 'conflict:' + (item.entity || '?') + ':' + (item.key || '?'),
      kind: 'conflict',
      severity: 'warning',
      blockScope: 'none',
      title: '设定冲突：' + (item.entity || '?') + ' · ' + (item.key || '?'),
      summary: '本作「' + (item.beat?.value ?? '?') + '」 vs 原著「' + (item.fanfic?.value ?? '?') + '」',
      target: { page: 'fanfic' },
      actions: ['compare'],
      chapter: null,
    })
  }

  // 4) 本章检查有阻断项：收尾会失败
  const session = snapshot?.session ?? null
  const verification = session?.verification
  if (verification && Number(verification.blockers) > 0) {
    push({
      id: 'check:ch' + (session.chapter ?? 0),
      kind: 'check',
      severity: 'blocker',
      blockScope: 'finish',
      title: '第 ' + session.chapter + ' 章有 ' + verification.blockers + ' 个阻断检查',
      summary: '收尾会被拦下；先在正文页改，再重新检查。',
      target: { page: 'chapter', chapterSessionId: session.id },
      actions: ['open'],
      chapter: session.chapter ?? null,
    })
  }

  // 5) 失败的操作：可以重试，但要先核实结果
  for (const operation of (operations?.items ?? []).filter((item) => item?.status === 'failed')) {
    push({
      id: 'operation:' + (operation.operationId || '?'),
      kind: 'operation',
      severity: 'warning',
      blockScope: 'none',
      title: '操作失败：' + (operation.command || operation.operationId),
      summary: operation.error?.message || '可以重试；结果未核实时按「待核实」显示。',
      target: { page: 'data' },
      actions: ['retry'],
      chapter: null,
    })
  }

  // 同一严重度内保持插入顺序（先决策、后 canon、再检查…），排序必须稳定。
  items.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9))

  const blocked = {
    start: items.some((item) => item.blockScope === 'start'),
    finish: items.some((item) => item.blockScope === 'finish'),
  }
  return { book, total: items.length, items: items.slice(0, Math.max(1, limit)), blocked }
}
