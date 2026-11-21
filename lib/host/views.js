// 面板三块只读视图的纯函数：记忆 / 文风 / 设定。
// 入参都是 codec 解出来的只读视图；不出网、不写盘。
const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback)

/** 记忆：按章与重要度筛卡片，给面板列表用。 */
export function memoryView(fade, { chapter = null, limit = 40, domain = null } = {}) {
  if (!fade) return { available: false, revision: null, total: 0, cards: [], chapters: [] }
  const all = fade.cards
  const filtered = all
    .filter((card) => (chapter === null ? true : num(card.chapter) === num(chapter)))
    .filter((card) => (domain ? card.domain === domain : true))
    .sort((a, b) => num(b.salience) - num(a.salience))
    .slice(0, Math.max(1, Math.min(200, num(limit, 40))))
    .map((card) => ({
      id: card.id,
      chapter: num(card.chapter),
      salience: num(card.salience, 3),
      layer: card.layer ?? card.lifecycle?.layer ?? 'L2',
      domain: card.domain ?? 'plot',
      status: card.status ?? card.lifecycle?.status ?? 'active',
      gist: String(card.gist ?? card.topic ?? ''),
      emotion: card.emotion ?? '',
      entityIds: Array.isArray(card.entityIds) ? card.entityIds : [],
    }))
  const chapters = [...new Set(all.map((card) => num(card.chapter)))].sort((a, b) => a - b)
  return { available: true, revision: fade.revision, drift: fade.drift === true, total: all.length, cards: filtered, chapters }
}

/** 文风：书库作品与规模（规则档案在 S2 的 Style Compiler 之后接入）。 */
export function styleView(library, profiles = []) {
  const profileRows = (profiles ?? []).map((profile) => ({
    id: profile.id,
    name: profile.name,
    version: profile.version,
    status: profile.status,
    provisional: profile.provisional === true,
    bands: Object.fromEntries(Object.entries(profile.bands ?? {}).filter(([, value]) => value && Array.isArray(value.band)).map(([key, value]) => [key, value.band])),
    rules: (profile.rules ?? []).length,
    avoid: profile.identity?.avoid ?? [],
  }))
  if (!library) return { available: profiles.length > 0, works: [], chapters: 0, chars: 0, profiles: profileRows }
  const works = (library.works ?? []).map((work) => ({
    workId: work.workId,
    title: work.title,
    chapters: num(work.chapters),
    chars: num(work.chars),
    status: work.status ?? null,
  }))
  return {
    available: true,
    works,
    profiles: profileRows,
    chapters: works.reduce((sum, work) => sum + work.chapters, 0),
    chars: works.reduce((sum, work) => sum + work.chars, 0),
  }
}

/** 设定：同人契约（称呼矩阵 + 禁忌）与项目头。 */
export function canonView(project, canon = null) {
  if (!project) return { available: false }
  const exports = project.exports ?? null
  return {
    available: true,
    id: project.id,
    title: project.title,
    sourceId: project.sourceId,
    currentChapter: project.currentChapter,
    revision: project.revision,
    addresses: (exports?.addresses ?? []).map((row) => ({
      from: row.from ?? '',
      to: row.to ?? '',
      form: row.form ?? '',
      publicForm: row.public ?? row.form ?? '',
      privateForm: row.private ?? row.form ?? '',
      fromChapter: row.fromChapter ?? '',
    })),
    forbidden: (exports?.forbidden ?? []).map((item) => (typeof item === 'string' ? item : item?.text ?? '')).filter(Boolean),
    characters: (canon?.characters ?? []).map((person) => ({ name: person.name, aliases: person.aliases ?? [], role: person.role ?? null })),
    secrets: (canon?.secrets ?? []).map((secret) => ({ id: secret.id, what: secret.what, publicAtChapter: secret.publicAtChapter, knownBy: secret.knownBy ?? [] })),
  }
}
