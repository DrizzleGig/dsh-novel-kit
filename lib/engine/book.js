// kit 原生作品初始化：只建 .dsh-novel-kit/ 与 正文/<bookId>/，不创建五件目录。
//
// v2：新书一律原生；旧五件/kit 0.5 数据走导入/迁移，不在这里猜绑定。
import { ensureBook as ensureNativeBook } from '../native/store.js'
import { assertSafeName } from '../workspace.js'
import { readProjectSettings, writeProjectSettings } from './settings.js'

/** 创建（或确认存在）一本原生书与项目设置；幂等。 */
export async function ensureBook({ root, book, mode = 'original' }) {
  assertSafeName(book, 'book')
  const native = await ensureNativeBook({ root, book, mode })
  let settings = await readProjectSettings(root, book)
  const created = [...native.created]
  if (!settings.bookId) {
    settings = await writeProjectSettings(root, book, { mode, bookId: native.bookId })
    created.push('settings')
  }
  return {
    ok: true,
    book,
    bookId: native.bookId,
    created,
    createdCount: created.length,
    settings,
    record: native.record,
  }
}

