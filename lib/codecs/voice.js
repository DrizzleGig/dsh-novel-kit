// voice 书库与档案的历史格式解码（纯函数）。
//
// voice 0.2.x 的 library.json：{ schemaVersion, book, updatedAt, works[] }；
// 档案（profiles/*.json）由四层组成，S0 先把书库与档案索引解出来，档案内容在 S1 接入。
export const VOICE_SCHEMA_VERSION = 1

const list = (value) => (Array.isArray(value) ? value : [])

export function decodeVoiceLibrary(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('voice: library.json 不是对象')
  }
  const schemaVersion = Number.isInteger(raw.schemaVersion) ? raw.schemaVersion : 1
  return {
    schemaVersion,
    book: raw.book ?? null,
    updatedAt: raw.updatedAt ?? null,
    works: list(raw.works).map((work) => ({
      workId: work?.workId ?? null,
      title: work?.title ?? null,
      sourceType: work?.sourceType ?? 'reference',
      chars: Number(work?.chars) || 0,
      chapters: Number(work?.chapters) || 0,
      status: work?.status ?? null,
      hash: work?.hash ?? null,
    })),
    legacy: schemaVersion < VOICE_SCHEMA_VERSION,
  }
}

/** 书库里找一本参考作品（按 workId 或标题）。 */
export function findWork(view, key) {
  const needle = String(key ?? '')
  return view.works.find((work) => work.workId === needle || work.title === needle) ?? null
}

/** 书库摘要：给面板/诊断用的稳定形状。 */
export function voiceSummary(view) {
  return {
    book: view.book,
    works: view.works.length,
    chars: view.works.reduce((sum, work) => sum + work.chars, 0),
    chapters: view.works.reduce((sum, work) => sum + work.chapters, 0),
  }
}

/** voice 档案：bands/rules/identity 的最小只读解码。 */
export function decodeVoiceProfile(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('voice: profile.json 不是对象')
  const bands = raw.bands && typeof raw.bands === 'object' ? raw.bands : {}
  const pickBand = (key) => {
    const value = bands?.[key]
    const band = Array.isArray(value?.band) ? value.band : null
    return band && band.length === 2 ? { band: band.map(Number), n: Number(value.n) || 0 } : null
  }
  return {
    schemaVersion: Number.isInteger(raw.schemaVersion) ? raw.schemaVersion : 1,
    id: String(raw.id ?? ''),
    name: raw.name ?? '',
    book: raw.book ?? null,
    version: raw.version ?? null,
    status: raw.status ?? 'provisional',
    identity: { summary: raw.identity?.summary ?? '', keywords: Array.isArray(raw.identity?.keywords) ? raw.identity.keywords : [], avoid: Array.isArray(raw.identity?.avoid) ? raw.identity.avoid : [] },
    bands: {
      sentenceMean: pickBand('sentenceMean'),
      sentenceCv: pickBand('sentenceCv'),
      paragraphMean: pickBand('paragraphMean'),
      dialogueRatio: pickBand('dialogueRatio'),
      abstractPer1k: pickBand('abstractPer1k'),
      explanationPer1k: pickBand('explanationPer1k'),
    },
    rules: Array.isArray(raw.rules) ? raw.rules.map((rule) => ({ id: rule?.id ?? '', text: rule?.text ?? rule?.rule ?? '' })).filter((rule) => rule.text) : [],
    anchors: Array.isArray(raw.anchors) ? raw.anchors.slice(0, 20) : [],
    provisional: raw.provisional === true || raw.status === 'provisional',
  }
}
