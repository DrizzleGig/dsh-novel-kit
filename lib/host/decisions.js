// 拍板视图：本章已拍板的决策 + 会话里待拍板的提案。
// beat 只给已 committed 的事实；待拍板提案来自 session.plan，模型不能自己确认。
// 与 beat 的 runbook 不重叠：这里只读，不改决策状态。
const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback)

/**
 * @param {object|null} beat decodeBeat 视图
 * @param {object|null} session 章节会话
 * @param {number} chapter
 */
export function decisionsView(beat, session, chapter = null) {
  const target = num(chapter ?? session?.chapter, 0)
  const committed = (beat?.decisions ?? [])
    .filter((decision) => num(decision.chapter) === target && (decision.status ?? 'committed') === 'committed')
    .map((decision) => ({
      id: decision.id,
      title: decision.title ?? '',
      change: decision.change ?? '',
      kind: decision.kind ?? '',
      chapter: num(decision.chapter),
    }))
  const proposals = (session?.plan?.proposals ?? [])
    .filter((proposal) => (proposal?.status ?? 'pending') === 'pending')
    .map((proposal, index) => ({
    id: String(proposal?.id ?? `p-${index + 1}`),
    title: proposal?.title ?? '',
    options: (Array.isArray(proposal?.options) ? proposal.options : []).map((option) => ({
      label: option?.label ?? '',
      impact: option?.impact ?? '',
      styleFit: option?.styleFit ?? null,
      styleWhy: option?.styleWhy ?? '',
    })),
    status: 'pending',
  }))
  const obligations = (beat?.obligations ?? []).filter((item) => item?.status === 'open')
  return {
    available: Boolean(beat) || Boolean(session),
    chapter: target,
    intent: session?.plan?.intent ?? '',
    styleHint: session?.plan?.styleHint ?? '',
    committed,
    proposals,
    pendingCount: proposals.length,
    openObligations: obligations.length,
  }
}
