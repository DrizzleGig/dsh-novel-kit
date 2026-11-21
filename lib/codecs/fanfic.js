// fanfic 项目账本的历史格式解码（纯函数）。
//
// fanfic 0.2.x 的 project.json：{ id, title, sourceId, currentChapter, activeBranch,
// revision, schemaVersion, exports? }。canon 各桶是独立文件（canon/*.json），
// 由 repositories/fanfic.js 按需读取；这里只解项目头与导出的契约摘要。
export const FANFIC_SCHEMA_VERSION = 1

export function decodeFanficProject(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('fanfic: project.json 不是对象')
  }
  const schemaVersion = Number.isInteger(raw.schemaVersion) ? raw.schemaVersion : 1
  const exports = raw.exports && typeof raw.exports === 'object' ? raw.exports : null
  return {
    id: String(raw.id ?? ''),
    title: raw.title ?? null,
    sourceId: raw.sourceId ?? null,
    currentChapter: raw.currentChapter ?? null,
    activeBranch: raw.activeBranch ?? null,
    revision: Number.isInteger(raw.revision) ? raw.revision : 0,
    schemaVersion,
    exports: exports
      ? {
        schemaVersion: Number(exports.schemaVersion) || 0,
        revision: Number(exports.revision) || 0,
        generatedAt: exports.generatedAt ?? null,
        forbidden: Array.isArray(exports.forbidden) ? exports.forbidden : [],
        addresses: Array.isArray(exports.addresses) ? exports.addresses : [],
        knowledge: Array.isArray(exports.knowledge) ? exports.knowledge : [],
      }
      : null,
    legacy: schemaVersion < FANFIC_SCHEMA_VERSION,
  }
}

/** 称呼矩阵里某一章的写法（fanfic exports.addresses 是扁平表）。 */
export function addressesAt(project, chapter) {
  const rows = project.exports?.addresses ?? []
  const n = Number(String(chapter).replace(/^ch/, ''))
  return rows.filter((row) => {
    const from = Number(String(row?.fromChapter ?? 'ch000').replace(/^ch/, ''))
    return Number.isFinite(n) ? from <= n : true
  })
}

/** 原著 canon 的只读摘要：人物名/别名、秘密、证据引文（用于重复与称呼检查）。 */
export function decodeFanficCanon({ characters = [], secrets = [], facts = [] } = {}) {
  const list = (value) => (Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : [])
  const names = []
  const people = []
  for (const character of list(characters)) {
    if (character?.name) names.push(String(character.name))
    for (const alias of Array.isArray(character?.aliases) ? character.aliases : []) names.push(String(alias))
    if (character?.name) people.push({ name: String(character.name), aliases: Array.isArray(character.aliases) ? character.aliases.map(String) : [], role: character.role ?? null })
  }
  const evidence = []
  for (const entry of [...list(characters), ...list(secrets), ...list(facts)]) {
    for (const item of Array.isArray(entry?.evidence) ? entry.evidence : []) {
      const quote = String(item?.quote ?? '').trim()
      if (quote.length >= 8) evidence.push({ quote, chapter: item?.chapter ?? null })
    }
  }
  return {
    names: [...new Set(names.filter(Boolean))],
    characters: people,
    secrets: list(secrets).map((secret) => ({
      id: secret?.id ?? '', what: secret?.what ?? '', publicAtChapter: secret?.publicAtChapter ?? null,
      knownBy: Array.isArray(secret?.knownBy) ? secret.knownBy : [], status: secret?.status ?? 'confirmed',
    })),
    evidence: evidence.slice(0, 500),
  }
}
