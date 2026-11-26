// 资源绑定：一本书 ↔ 四家账本的实际目录名。
//
// 真实数据里名字并不一致（beat/fade 用书名「斗罗：开局炸毁冰火两仪眼」，
// voice 书库叫「斗罗大陆」，同人项目在另一个工作区）。所以不猜：显式解析，
// 找不到就给 null，并在上下文里标 available:false。
import { discoverWorkspace } from '../workspace.js'
import { resolveBook } from '../native/store.js'
import { LEGACY_ALLOWED, LEGACY_BLOCKED } from '../native/legacy-policy.js'

/**
 * @param {string} root 工作区
 * @param {string} book 书名（beat/fade 目录名）
 * @param {{voiceLibrary?:string, fanficProject?:string}} [explicit]
 */
export async function resolveBinding(root, book, explicit = {}) {
  // 原生书：不扫描五件目录，绑定只保留 kit 自己的 bookId；voice/fanfic 只接受显式值。
  const native = await resolveBook(root, book).catch(() => null)
  if (native) {
    return {
      book,
      bookId: native.bookId,
      native: true,
      beatBook: null,
      fadeBook: null,
      voiceLibrary: explicit.voiceLibrary ?? null,
      fanficProject: explicit.fanficProject ?? null,
      available: { beat: true, fade: true, voice: Boolean(explicit.voiceLibrary), fanfic: Boolean(explicit.fanficProject) },
    }
  }
  if (!LEGACY_ALLOWED) {
    return {
      book, bookId: null, native: false, legacyBlocked: true, ...LEGACY_BLOCKED,
      beatBook: null, fadeBook: null, voiceLibrary: explicit.voiceLibrary ?? null, fanficProject: explicit.fanficProject ?? null,
      available: { beat: false, fade: false, voice: false, fanfic: false },
    }
  }
  const found = await discoverWorkspace(root)
  // 只在这几种情况下绑定：显式指定 / 名字与书一致 / 全工作区只有一个候选。
  // 有多个候选且都不叫这本书时给 null —— 宁可「没有」，也不拿别人的账本去写这一章。
  const pick = (list, wanted) => {
    if (wanted && list.includes(wanted)) return wanted
    if (list.includes(book)) return book
    if (list.length === 1) return list[0]
    return null
  }
  const voiceLibrary = pick(found.voice, explicit.voiceLibrary)
  const fanficProject = pick(found.fanfic, explicit.fanficProject)
  return {
    book,
    bookId: null,
    native: false,
    beatBook: found.beat.includes(book) ? book : null,
    fadeBook: found.fade.includes(book) ? book : null,
    voiceLibrary,
    fanficProject,
    available: {
      beat: found.beat.includes(book),
      fade: found.fade.includes(book),
      voice: Boolean(voiceLibrary),
      fanfic: Boolean(fanficProject),
    },
  }
}
