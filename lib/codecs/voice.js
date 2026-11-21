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
