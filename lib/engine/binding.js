// 资源绑定：一本书 ↔ 四家账本的实际目录名。
//
// 真实数据里名字并不一致（beat/fade 用书名「斗罗：开局炸毁冰火两仪眼」，
// voice 书库叫「斗罗大陆」，同人项目在另一个工作区）。所以不猜：显式解析，
// 找不到就给 null，并在上下文里标 available:false。
import { discoverWorkspace } from '../workspace.js'

/**
 * @param {string} root 工作区
 * @param {string} book 书名（beat/fade 目录名）
 * @param {{voiceLibrary?:string, fanficProject?:string}} [explicit]
 */
export async function resolveBinding(root, book, explicit = {}) {
  const found = await discoverWorkspace(root)
  const pick = (list, wanted, noFallback = false) => {
    if (wanted && list.includes(wanted)) return wanted
    if (list.includes(book)) return book
    if (noFallback) return null
    return list[0] ?? null
  }
  return {
    book,
    beatBook: found.beat.includes(book) ? book : null,
    fadeBook: found.fade.includes(book) ? book : null,
    voiceLibrary: pick(found.voice, explicit.voiceLibrary),
    fanficProject: pick(found.fanfic, explicit.fanficProject),
    available: {
      beat: found.beat.includes(book),
      fade: found.fade.includes(book),
      voice: found.voice.length > 0,
      fanfic: found.fanfic.length > 0,
    },
  }
}
