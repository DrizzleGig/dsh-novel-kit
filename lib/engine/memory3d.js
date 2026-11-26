// fade 的三维记忆：familiarity（熟）/ accessibility（可取）/ fidelity（准）。
//
// 这是 kit 的确定性版本：不依赖模型，只按「距今章数、重要度、人物出场次数、是否钉卡」算。
// 输出用于简报装配与面板展示：低 fidelity 只给 gist/情绪，不给精确细节。
const clamp = (value) => Math.max(0, Math.min(1, value))
const DEAD = new Set(['forgotten', 'superseded', 'stale', 'revoked'])

/**
 * @param {object|null} fade decodeFade 视图
 * @param {number} chapter 当前章
 * @param {{span?:number, tau?:number}} [options]
 */
export function memory3d(fade, chapter, { span = 40, tau = 8 } = {}) {
  if (!fade) return { available: false, cards: [], omittedIds: [] }
  const current = Number(chapter)
  const cards = Array.isArray(fade.cards) ? fade.cards : []
  const entityCount = new Map()
  for (const card of cards) for (const id of Array.isArray(card.entityIds) ? card.entityIds : []) entityCount.set(id, (entityCount.get(id) ?? 0) + 1)

  const eligible = cards.filter((card) => {
    if (Number(card.chapter) > current) return false
    const status = card.lifecycle?.status ?? card.status
    return !DEAD.has(String(status ?? ''))
  })

  const scored = eligible
    .map((card) => {
      const distance = Math.max(0, current - Number(card.chapter))
      const salience = Math.max(1, Math.min(5, Number(card.salience) || 3))
      const entities = Array.isArray(card.entityIds) ? card.entityIds : []
      const familiarityRaw = 0.25 + 0.75 * Math.exp(-distance / tau)
      const appearance = entities.length
        ? Math.min(1, entities.reduce((sum, id) => sum + (entityCount.get(id) ?? 0), 0) / Math.max(6, cards.length / 4))
        : 0
      const familiarity = clamp(0.7 * familiarityRaw + 0.3 * appearance)
      const pinned = card.pinned === true || card.lifecycle?.status === 'protected'
      const accessibility = clamp(familiarity * (0.4 + 0.12 * salience) + (pinned ? 0.25 : 0))
      const decay = 1 - 0.15 * Math.max(0, distance - 5)
      const fidelity = clamp(accessibility * decay)
      return {
        id: card.id,
        chapter: Number(card.chapter),
        gist: String(card.gist ?? card.topic ?? ''),
        topic: String(card.topic ?? ''),
        emotion: card.emotion ?? '',
        salience,
        pinned,
        inWindow: distance <= span,
        familiarity: Math.round(familiarity * 100) / 100,
        accessibility: Math.round(accessibility * 100) / 100,
        fidelity: Math.round(fidelity * 100) / 100,
      }
    })
    // 钉卡/保护卡不受 40 章窗口限制；普通卡仍只取窗口内。排序先把保护卡放前面。
    .filter((card) => card.pinned || card.inWindow)
    .sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || (b.accessibility - a.accessibility))

  const omittedIds = eligible.filter((card) => {
    const pinned = card.pinned === true || card.lifecycle?.status === 'protected'
    return !pinned && current - Number(card.chapter) > span
  }).map((card) => card.id)

  return { available: true, chapter: current, cards: scored, omittedIds }
}

/** 按 fidelity 决定给模型看多少：高=细节+引文，中=gist，低=只有 topic/情绪。 */
export function fidelityTier(fidelity) {
  if (fidelity >= 0.66) return 'high'
  if (fidelity >= 0.33) return 'mid'
  return 'low'
}

/** 简报行：低 fidelity 不泄露精确细节。 */
export function memoryLine(card) {
  const tier = fidelityTier(card.fidelity)
  const head = `[ch${card.chapter} · 熟${Math.round(card.familiarity * 100)}% · 准${Math.round(card.fidelity * 100)}%]`
  if (tier === 'high') return `${head} ${card.gist}`
  if (tier === 'mid') return `${head} ${card.topic || card.gist}`
  return `${head} 记得${card.topic || '有个印象'}（细节已模糊）${card.emotion ? '，情绪：' + card.emotion : ''}`
}
