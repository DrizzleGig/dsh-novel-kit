// 章节状态机：只允许明确的转移，任何未知事件都报错而不是静默推进。
//
// 正常路径：
//   preparing → awaiting_author → writing → checking → committing → completed
// 旁路：
//   preparing/awaiting_author/writing/checking/committing → blocked（可返回原状态）
//   任意非终态 → aborted
//   blocked → 原状态（resume）
export const STATES = Object.freeze([
  'preparing',
  'awaiting_author',
  'writing',
  'checking',
  'committing',
  'blocked',
  'completed',
  'aborted',
])

export const TERMINAL = Object.freeze(['completed', 'aborted'])

const TRANSITIONS = Object.freeze({
  preparing: ['awaiting_author', 'writing', 'blocked', 'aborted'],
  awaiting_author: ['writing', 'blocked', 'aborted'],
  writing: ['checking', 'awaiting_author', 'blocked', 'aborted'],
  checking: ['writing', 'committing', 'blocked', 'aborted'],
  committing: ['completed', 'blocked', 'aborted'],
  blocked: ['preparing', 'awaiting_author', 'writing', 'checking', 'committing', 'aborted'],
  completed: [],
  aborted: [],
})

export function canTransition(from, to) {
  if (!STATES.includes(from) || !STATES.includes(to)) return false
  return (TRANSITIONS[from] ?? []).includes(to)
}

/**
 * 校验并返回一个状态转移（不改入参）。
 * @param {{state:string}} session
 * @param {string} to
 * @param {{reason?:string}} [meta]
 */
export function transition(session, to, meta = {}) {
  const from = session?.state
  if (!STATES.includes(from)) throw new Error(`state-machine: 未知状态 ${from}`)
  if (!canTransition(from, to)) throw new Error(`state-machine: 不允许 ${from} → ${to}`)
  const next = { ...session, state: to }
  if (meta.reason) next.lastReason = String(meta.reason)
  if (to === 'blocked') next.lastError = { code: meta.code ?? 'blocked', retryable: meta.retryable !== false }
  if (to !== 'blocked') next.lastError = session.lastError === undefined ? null : session.lastError
  return next
}

/** 该状态是否还能继续推进。 */
export function isTerminal(state) {
  return TERMINAL.includes(state)
}

/** 从 blocked 恢复时的默认目标（回到出错前的状态）。 */
export function resumeTarget(session) {
  if (session?.state !== 'blocked') return null
  const hint = session?.blockedFrom
  return STATES.includes(hint) && hint !== 'blocked' ? hint : 'preparing'
}
