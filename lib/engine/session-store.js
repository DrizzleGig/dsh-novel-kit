// 章节会话的持久化：一章节一个 session.json，放在 <root>/.dsh-novel-kit/sessions/<id>/。
// 读写都走原子写；读回带 revision 与状态，供 resume/query 使用。
import { mkdir, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { writeJsonAtomic } from '../storage/atomic-json.js'

export const SESSION_ROOT = '.dsh-novel-kit/sessions'

export function sessionsDir(root) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw new Error('session-store: root 必须是绝对路径')
  return path.join(root, SESSION_ROOT)
}

export function sessionDir(root, sessionId) {
  if (typeof sessionId !== 'string' || !/^[A-Za-z0-9._-]{6,80}$/.test(sessionId)) {
    throw new Error('session-store: sessionId 不合法')
  }
  return path.join(sessionsDir(root), sessionId)
}

export function newSessionId(now = Date.now()) {
  const rand = Math.random().toString(36).slice(2, 8)
  return `s-${now.toString(36)}-${rand}`
}

export async function saveSession(root, session) {
  const dir = sessionDir(root, session.id)
  await mkdir(dir, { recursive: true })
  session.revision = Number.isInteger(session.revision) ? session.revision + 1 : 1
  session.updatedAt = new Date().toISOString()
  await writeJsonAtomic(path.join(dir, 'session.json'), session)
  return session
}

export async function loadSession(root, sessionId) {
  const file = path.join(sessionDir(root, sessionId), 'session.json')
  return JSON.parse(await readFile(file, 'utf8'))
}

export async function listSessions(root) {
  try {
    const dirs = (await readdir(sessionsDir(root), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
    return dirs
  } catch {
    return []
  }
}

/** 这本书最近一个未完成会话（completed/aborted 之外的）。 */
export async function activeSession(root, book) {
  const out = []
  for (const id of await listSessions(root)) {
    try {
      const session = await loadSession(root, id)
      if (session.book === book && !['completed', 'aborted'].includes(session.state)) out.push(session)
    } catch {
      // 损坏的会话不阻塞其它会话
    }
  }
  out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
  return out[0] ?? null
}

/** 这本书最近一个会话（不分状态）；面板要能看到刚收完的章。 */
export async function latestSession(root, book) {
  const out = []
  for (const id of await listSessions(root)) {
    try {
      const session = await loadSession(root, id)
      if (session.book === book) out.push(session)
    } catch {
      // 损坏的会话不影响其它
    }
  }
  out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
  return out[0] ?? null
}

/** 这本书的全部会话（按 updatedAt 倒序）。 */
export async function sessionsForBook(root, book) {
  const out = []
  for (const id of await listSessions(root)) {
    try {
      const session = await loadSession(root, id)
      if (session.book === book) out.push(session)
    } catch {
      // 损坏的会话跳过
    }
  }
  out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
  return out
}
