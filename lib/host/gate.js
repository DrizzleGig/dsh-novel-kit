// 会话级开关：/novel on 只影响本会话（与五件的「每会话」语义一致）。
// S1 先放内存；S1.1 再落 prefs.json（跨重启继承）。
export function createGate() {
  const enabled = new Set()

  const keyOf = (context) => {
    const agent = context?.agent ?? context
    const id = agent?.session?.id ?? agent?.id
    return typeof id === 'string' && id ? id : null
  }

  return {
    keyOf,
    isOn(context) {
      const key = keyOf(context)
      return key ? enabled.has(key) : false
    },
    setOn(context, value) {
      const key = keyOf(context)
      if (!key) return null
      if (value) enabled.add(key)
      else enabled.delete(key)
      return { sessionId: key, on: value === true }
    },
    count() {
      return enabled.size
    },
  }
}
