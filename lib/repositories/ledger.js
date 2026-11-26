// 四本账的只读仓库：读文件 → codec 解码 → 稳定视图。
// 只读：不创建目录、不写回、不迁移。写路径在 S1 的事务层里另建。
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { LEDGER_DIRS } from '../workspace.js'
import { decodeBeat } from '../codecs/beat.js'
import { decodeFade } from '../codecs/fade.js'
import { decodeVoiceLibrary, decodeVoiceProfile } from '../codecs/voice.js'
import { decodeFanficProject, decodeFanficCanon } from '../codecs/fanfic.js'
import { resolveBook } from '../native/store.js'
import { readDecisions, decisionsView } from '../native/decisions.js'
import { readMemory, memoryView } from '../native/memory.js'
import { LEGACY_ALLOWED, LEGACY_BLOCKED } from '../native/legacy-policy.js'

async function readJson(target) {
  const text = await readFile(target, 'utf8')
  return JSON.parse(text)
}

function assertName(value, label) {
  if (typeof value !== 'string' || value.length === 0 || /[\\/\u0000]/.test(value)) {
    throw new Error(`${label} 必须是单个目录名`)
  }
  return value
}

async function nativeRecord(root, book) {
  try {
    return await resolveBook(root, book)
  } catch {
    return null
  }
}

function assertLegacyAllowed() {
  if (!LEGACY_ALLOWED) throw Object.assign(new Error(LEGACY_BLOCKED.message), LEGACY_BLOCKED)
}

export async function readBeat(root, book) {
  const record = await nativeRecord(root, book)
  if (record) return decisionsView(await readDecisions(root, record.bookId))
  if (!LEGACY_ALLOWED) throw Object.assign(new Error(LEGACY_BLOCKED.message), LEGACY_BLOCKED)
  const dir = path.join(root, LEDGER_DIRS.beat, assertName(book, 'book'))
  return decodeBeat(await readJson(path.join(dir, 'book.json')))
}

export async function readFade(root, book) {
  const record = await nativeRecord(root, book)
  if (record) return memoryView(await readMemory(root, record.bookId))
  if (!LEGACY_ALLOWED) throw Object.assign(new Error(LEGACY_BLOCKED.message), LEGACY_BLOCKED)
  const dir = path.join(root, LEDGER_DIRS.fade, assertName(book, 'book'))
  return decodeFade(await readJson(path.join(dir, 'memory.json')))
}

export async function readVoice(root, library) {
  assertLegacyAllowed()
  const dir = path.join(root, LEDGER_DIRS.voice, assertName(library, 'library'))
  return decodeVoiceLibrary(await readJson(path.join(dir, 'library.json')))
}

export async function readFanfic(root, project) {
  assertLegacyAllowed()
  const dir = path.join(root, LEDGER_DIRS.fanfic, assertName(project, 'project'))
  return decodeFanficProject(await readJson(path.join(dir, 'project.json')))
}

/** 一次读齐四本账；缺哪本给 null，不抛。 */
export async function readAll(root, { book, library, project } = {}) {
  const safe = async (fn, ...args) => {
    try {
      return await fn(root, ...args)
    } catch {
      return null
    }
  }
  return {
    beat: book ? await safe(readBeat, book) : null,
    fade: book ? await safe(readFade, book) : null,
    voice: library ? await safe(readVoice, library) : null,
    fanfic: project ? await safe(readFanfic, project) : null,
  }
}

/** 读一本书的全部 voice 档案（profiles/<id>/profile.json）。 */
export async function readVoiceProfiles(root, library) {
  assertLegacyAllowed()
  const dir = path.join(root, LEDGER_DIRS.voice, assertName(library, 'library'), 'profiles')
  let names = []
  try {
    names = (await readdir(dir, { withFileTypes: true })).filter((entry) => entry.isDirectory() && !entry.name.startsWith('_')).map((entry) => entry.name).sort()
  } catch {
    return []
  }
  const out = []
  for (const name of names) {
    try {
      out.push(decodeVoiceProfile(await readJson(path.join(dir, name, 'profile.json'))))
    } catch {
      // 损坏的档案不阻塞其它
    }
  }
  return out
}

/** 读同人项目的 canon 摘要（characters / secrets / facts）。缺文件给空数组。 */
export async function readFanficCanon(root, project) {
  assertLegacyAllowed()
  const dir = path.join(root, LEDGER_DIRS.fanfic, assertName(project, 'project'), 'canon')
  const readOptional = async (name) => {
    try {
      return await readJson(path.join(dir, name))
    } catch {
      return []
    }
  }
  return decodeFanficCanon({
    characters: await readOptional('characters.json'),
    secrets: await readOptional('secrets.json'),
    facts: await readOptional('facts.json'),
  })
}
