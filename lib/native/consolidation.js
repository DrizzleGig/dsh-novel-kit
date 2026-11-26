// fade 原生保留曲线/巩固计划：纯函数，不写文件；供 native/memory.js 与面板解释。
//
// 语义与 engine/memory3d 保持一致：近章更清楚、旧卡逐步变模糊；钉卡/保护卡不因窗口被丢。
const DEAD = new Set(['forgotten', 'superseded', 'stale', 'revoked'])
const clamp = (value) => Math.max(0, Math.min(1, value))

function isPinned(card) {
  return card?.pinned === true || card?.lifecycle?.status === 'protected'
}

export function retentionCurve(cards, chapter, { span = 40, tau = 8 } = {}) {
  const current = Number(chapter)
  const list = Array.isArray(cards) ? cards : []
  return list
    .filter((card) => Number(card?.chapter) <= current)
    .filter((card) => !DEAD.has(String(card?.lifecycle?.status ?? card?.status ?? '')))
    .map((card) => {
      const distance = Math.max(0, current - Number(card.chapter))
      const salience = Math.max(1, Math.min(5, Number(card.salience) || 3))
      const pinned = isPinned(card)
      const familiarity = clamp(0.25 + 0.75 * Math.exp(-distance / tau))
      const accessibility = clamp(familiarity * (0.4 + 0.12 * salience) + (pinned ? 0.25 : 0))
      const decay = 1 - 0.15 * Math.max(0, distance - 5)
      return {
        id: card.id,
        chapter: Number(card.chapter),
        salience,
        distance,
        pinned,
        inWindow: distance <= span,
        familiarity: Math.round(familiarity * 100) / 100,
        accessibility: Math.round(accessibility * 100) / 100,
        fidelity: Math.round(clamp(accessibility * decay) * 100) / 100,
      }
    })
    .sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || (b.accessibility - a.accessibility))
}

/**
 * 巩固计划：窗口外、非钉、低显著度的卡进入归档候选；归档保留对象/stub，可恢复。
 * @returns {{archiveIds:string[], keepIds:string[], curve:object[]}}
 */
export function consolidationPlan(cards, chapter, { span = 40, tau = 8, maxSalience = 2 } = {}) {
  const curve = retentionCurve(cards, chapter, { span, tau })
  const threshold = Math.max(1, Math.min(5, Number(maxSalience) || 2))
  const archiveIds = curve
    .filter((item) => !item.pinned && !item.inWindow && item.salience <= threshold)
    .map((item) => String(item.id))
  const archiveSet = new Set(archiveIds)
  const keepIds = curve.filter((item) => !archiveSet.has(String(item.id))).map((item) => String(item.id))
  return { archiveIds, keepIds, curve }
}
