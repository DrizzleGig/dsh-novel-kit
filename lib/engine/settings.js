// 设置层：DSH profile 级总开关 + 工作区项目级模式与绑定。
//
// 与账本分开：这些是 kit 自己的偏好/业务事实，不写 beat/fade/voice/fanfic 的原文件。
// 总开关默认关：装了 kit 不等于要写小说；创作者用 DSH 做其它任务时不该被 novel_* 工具打扰。
import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readJsonSnapshot, writeJsonAtomic } from '../storage/atomic-json.js'
import { withLock } from '../storage/locks.js'
import { assertSafeName } from '../workspace.js'

export const KIT_DIR = '.dsh-novel-kit'
export const MODES = Object.freeze(['original', 'fanfic'])
export const PREFS_SCHEMA_VERSION = 1
export const SETTINGS_SCHEMA_VERSION = 1

/** DSH profile 的状态目录；测试/嵌入可用 DSH_NOVEL_KIT_STATE_DIR 显式覆盖。 */
export function profileStateDir() {
  const explicit = process.env.DSH_NOVEL_KIT_STATE_DIR
  if (explicit) return explicit
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  const cwd = process.cwd()
  const profilesRoot = path.join(home, 'profiles')
  // 实际 DSH 的 cwd 是 <DSH_HOME>/profiles/<name>；prefs/takeover 必须按 profile 隔离。
  if (cwd === profilesRoot || cwd.startsWith(profilesRoot + path.sep)) {
    return path.join(cwd, 'novel-kit')
  }
  return path.join(home, 'novel-kit')
}

export function prefsFile() {
  return path.join(profileStateDir(), 'prefs.json')
}

export function defaultPrefs() {
  return { schemaVersion: PREFS_SCHEMA_VERSION, master: false }
}

/** 同步读总开关：gate 在进程启动时要立即可用，不能等异步。损坏/缺失一律按「关」。 */
export function readPrefsSync(file = prefsFile()) {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    return { schemaVersion: PREFS_SCHEMA_VERSION, master: raw?.master === true }
  } catch {
    return defaultPrefs()
  }
}

/** 写总开关；只允许 master 一个字段，避免把项目设置混进 profile。 */
export async function writePrefs(patch = {}, file = prefsFile()) {
  const next = {
    schemaVersion: PREFS_SCHEMA_VERSION,
    master: patch?.master === true,
    updatedAt: new Date().toISOString(),
  }
  await writeJsonAtomic(file, next, { ensureDir: true })
  return next
}

export function assertMode(mode) {
  const value = String(mode ?? '')
  if (!MODES.includes(value)) throw new Error(`mode 只能是 ${MODES.join(' / ')}，收到：${JSON.stringify(mode)}`)
  return value
}

export function projectSettingsFile(root, book) {
  assertSafeName(book, 'book')
  return path.join(root, KIT_DIR, 'projects', book, 'settings.json')
}

export function defaultProjectSettings(book) {
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    book,
    bookId: null,
    mode: 'original',
    activeStyleProfileIds: [],
    activeCanonSourceId: null,
    revision: 0,
    updatedAt: null,
  }
}

function normalizeSettings(book, raw = {}) {
  const mode = MODES.includes(raw?.mode) ? raw.mode : 'original'
  const styleIds = Array.isArray(raw?.activeStyleProfileIds)
    ? [...new Set(raw.activeStyleProfileIds.filter((id) => typeof id === 'string' && id))]
    : []
  const canon = raw?.activeCanonSourceId
  const bookId = typeof raw?.bookId === 'string' && /^bk-[0-9a-f-]{36}$/u.test(raw.bookId) ? raw.bookId : null
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    book,
    bookId,
    mode,
    activeStyleProfileIds: styleIds,
    activeCanonSourceId: typeof canon === 'string' && canon ? canon : null,
    revision: Number.isInteger(raw?.revision) ? raw.revision : 0,
    updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : null,
  }
}

/** 读项目设置；没有文件给默认原创，不创建目录。 */
export async function readProjectSettings(root, book) {
  const file = projectSettingsFile(root, book)
  try {
    const snap = await readJsonSnapshot(file)
    return normalizeSettings(book, snap.json)
  } catch (error) {
    if (error?.code === 'ENOENT' || /ENOENT/.test(String(error?.message ?? ''))) {
      return defaultProjectSettings(book)
    }
    throw error
  }
}

/**
 * 写项目设置：merge → 校验 → revision+1 → 原子写。
 * @param {string} root
 * @param {string} book
 * @param {{mode?:string, activeStyleProfileIds?:string[], activeCanonSourceId?:string|null}} patch
 */
export async function writeProjectSettingsUnlocked(root, book, patch = {}) {
  const current = await readProjectSettings(root, book)
  const next = normalizeSettings(book, {
    ...current,
    ...patch,
    mode: patch.mode === undefined ? current.mode : assertMode(patch.mode),
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
  })
  await writeJsonAtomic(projectSettingsFile(root, book), next, { ensureDir: true })
  return next
}

export async function writeProjectSettings(root, book, patch = {}) {
  return withLock({ root, flowId: 'settings-write' }, () => writeProjectSettingsUnlocked(root, book, patch))
}

/** 模式切换在锁内读版本，避免两个同 revision 操作都成功。 */
export async function setProjectMode(root, book, mode, expectedRevision = null) {
  return withLock({ root, flowId: 'settings-mode' }, async () => {
    const current = await readProjectSettings(root, book)
    if (expectedRevision !== null && expectedRevision !== undefined && Number(expectedRevision) !== Number(current.revision)) {
      return { ok: false, code: 'revision-conflict', settings: current }
    }
    const settings = await writeProjectSettingsUnlocked(root, book, { mode: assertMode(mode) })
    return { ok: true, settings }
  })
}

/** 把 profile 加到项目的文风绑定里（幂等）。 */
export async function bindStyleProfile(root, book, profileId) {
  return withLock({ root, flowId: 'settings-bind' }, async () => {
    const current = await readProjectSettings(root, book)
    const ids = [...new Set([...current.activeStyleProfileIds, String(profileId)])]
    return writeProjectSettingsUnlocked(root, book, { activeStyleProfileIds: ids })
  })
}

/** 只解绑，不删除档案文件；历史/评分保留。 */
export async function unbindStyleProfile(root, book, profileId) {
  return withLock({ root, flowId: 'settings-unbind' }, async () => {
    const current = await readProjectSettings(root, book)
    const target = String(profileId ?? '')
    if (!current.activeStyleProfileIds.includes(target)) return { ok: true, idempotent: true, settings: current }
    const ids = current.activeStyleProfileIds.filter((id) => id !== target)
    const settings = await writeProjectSettingsUnlocked(root, book, { activeStyleProfileIds: ids })
    return { ok: true, idempotent: false, settings }
  })
}

/** 绑定 canon；同人模式必须由调用方显式设置 mode。 */
export async function bindCanonSource(root, book, sourceId) {
  return writeProjectSettings(root, book, { activeCanonSourceId: String(sourceId) })
}
