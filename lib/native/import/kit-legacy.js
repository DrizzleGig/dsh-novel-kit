// kit 0.5.x 自有数据的迁移：把 kit 自己写出的 beat/fade 账本与平铺正文转成 v2 原生书。
//
// 与“五件导入”分开：
// - 五件导入：用户先用了 beat/fade/voice/fanfic/conductor；源文件不是 kit 写的。
// - kit legacy：kit 0.5.x 的 ensureBook 在 .dsh-novel-beat/-fade 里写了 meta.source='dsh-novel-kit' 的账，
//   正文在 正文/ 平铺；settings 已存在但没有 bookId。
// 两者都只读源、复制到 kit 原生；区别是归属判断与提示。
import { readLegacyBeat, importLegacyBook } from './legacy.js'
import { readProjectSettings, writeProjectSettings } from '../../engine/settings.js'

export async function isKitLegacyBook({ root, book } = {}) {
  const beat = await readLegacyBeat(root, book).catch(() => null)
  return beat?.kitOrigin === true
}

/**
 * 迁移一本 kit 0.5.x 的书；幂等：已有 bookId 直接返回。
 * @returns {{ok:boolean, code?:string, book?:string, bookId?:string, idempotent?:boolean, imported?:object, warnings?:string[]}}
 */
export async function migrateKitBook({ root, book, replace = false } = {}) {
  const settings = await readProjectSettings(root, book)
  if (settings.bookId) {
    return { ok: true, idempotent: true, book, bookId: settings.bookId, message: '已经是原生书' }
  }
  const beat = await readLegacyBeat(root, book).catch(() => null)
  if (!beat) return { ok: false, code: 'no-kit-legacy', message: '没有找到 kit 0.5.x 的 beat 账本' }
  if (!beat.kitOrigin) {
    return {
      ok: false,
      code: 'not-kit-legacy',
      message: '这份 beat 账本不是 kit 写的（缺少 meta.source=dsh-novel-kit）；请走“五件继承导入”，不要当 kit legacy 迁移。',
    }
  }
  const result = await importLegacyBook({
    root,
    book,
    mode: settings.mode === 'fanfic' ? 'fanfic' : 'original',
    replace,
    sources: { voice: null, fanfic: null, conductor: false },
  })
  const nextSettings = await writeProjectSettings(root, book, {
    bookId: result.bookId,
    mode: settings.mode === 'fanfic' ? 'fanfic' : 'original',
  })
  return { ...result, idempotent: false, settings: nextSettings }
}
