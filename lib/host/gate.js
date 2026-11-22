// 三层开关的会话层：
//   master（DSH profile，持久化，默认关） → 关掉时任何会话都不能开 novel_*；
//   session（本进程内存，/novel on|off） → 只影响本会话；
//   项目 mode 在 settings.js，不在这里。
//
// 为什么不用「注销工具」做总开关：宿主在 apply 时注册、用 when 控制呈现，热切换注册/注销
// 会牵动生命周期和重复注册；沿用 when 更稳。写操作（remote）仍要自己检查 master。
import { readPrefsSync, writePrefs } from '../engine/settings.js'

/**
 * @param {{prefsFile?:string, initialMaster?:boolean, persist?:boolean}} [options]
 */
export function createGate({ prefsFile = undefined, initialMaster = undefined, persist = true } = {}) {
  const loaded = initialMaster === undefined ? readPrefsSync(prefsFile) : { master: initialMaster === true }
  let master = loaded.master === true
  const enabled = new Set()

  const keyOf = (context) => {
    const agent = context?.agent ?? context
    const id = agent?.session?.id ?? agent?.id
    return typeof id === 'string' && id ? id : null
  }

  return {
    keyOf,
    isMasterOn() {
      return master
    },
    isOn(context) {
      if (!master) return false
      const key = keyOf(context)
      return key ? enabled.has(key) : false
    },
    setOn(context, value) {
      const key = keyOf(context)
      if (!key) return { ok: false, code: 'no-session', sessionId: null, on: false }
      if (value === true && !master) {
        return { ok: false, code: 'master-off', sessionId: key, on: false }
      }
      if (value) enabled.add(key)
      else enabled.delete(key)
      return { ok: true, sessionId: key, on: value === true }
    },
    async setMaster(value) {
      master = value === true
      if (!master) enabled.clear()
      let saved = true
      let error = null
      if (persist) {
        try {
          await writePrefs({ master }, prefsFile)
        } catch (cause) {
          saved = false
          error = String(cause?.message ?? cause)
        }
      }
      return { ok: true, master, saved, error }
    },
    snapshot() {
      return { master, sessions: enabled.size }
    },
    count() {
      return enabled.size
    },
  }
}
