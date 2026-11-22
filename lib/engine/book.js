// kit-only 作品初始化：不依赖 beat/fade 插件，也能新建一本书的剧情账与记忆账。
//
// 目录格式与旧五件冻结契约一致，所以日后装了旧件也能读；但创建动作由 kit 自己做。
import path from 'node:path'
import { readJsonSnapshot, writeJsonAtomic } from '../storage/atomic-json.js'
import { LEDGER_DIRS, assertSafeName } from '../workspace.js'
import { readProjectSettings, writeProjectSettings } from './settings.js'

const beatFile = (root, book) => path.join(root, LEDGER_DIRS.beat, book, 'book.json')
const fadeFile = (root, book) => path.join(root, LEDGER_DIRS.fade, book, 'memory.json')

async function exists(file) {
  try { await readJsonSnapshot(file); return true } catch { return false }
}

function defaultBeat(book) {
  return {
    schemaVersion: 2,
    book,
    meta: { title: book, createdAt: new Date().toISOString(), source: 'dsh-novel-kit' },
    chapters: {},
    decisions: [],
    canon: [],
    obligations: [],
    segments: [],
    audit: [],
    revisions: [],
    revision: 0,
  }
}

function defaultFade(book) {
  return {
    schemaVersion: 3,
    book,
    meta: { revision: 0, revisionAt: 0, createdAt: new Date().toISOString(), source: 'dsh-novel-kit' },
    chapters: {},
    cards: [],
    entities: {},
    places: {},
    threads: [],
    povDistortions: [],
    audit: [],
  }
}

/** 创建（或确认存在）一本书的 beat/fade 账本与项目设置；幂等。 */
export async function ensureBook({ root, book, mode = 'original' }) {
  assertSafeName(book, 'book')
  const created = []
  if (!(await exists(beatFile(root, book)))) {
    await writeJsonAtomic(beatFile(root, book), defaultBeat(book), { ensureDir: true })
    created.push('beat')
  }
  if (!(await exists(fadeFile(root, book)))) {
    await writeJsonAtomic(fadeFile(root, book), defaultFade(book), { ensureDir: true })
    created.push('fade')
  }
  const settings = await readProjectSettings(root, book)
  if (!settings || settings.revision === 0) {
    await writeProjectSettings(root, book, { mode })
    created.push('settings')
  }
  return { ok: true, book, created, createdCount: created.length }
}
