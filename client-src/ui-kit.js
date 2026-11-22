// 纯展示工具：不读账本、不调 remote、不改状态，只把数据变成元素。
//
// 这个文件既被测试直接 import，也会被 scripts/build-client.mjs 内联进 client.js
// 的 NK:UIKIT 块（内联时去掉 export）。新增函数请保持「只依赖入参」。
export function createUiKit({ h, c } = {}) {
  function fmtNum(value) {
    const number = Number(value)
    if (!Number.isFinite(number)) return String(value ?? '—')
    return number.toLocaleString('zh-CN')
  }

  function pageStat(label, value, tone) {
    return h('div', { className: 'nk-stat' },
      h('div', { className: 'nk-stat-label' }, label),
      h('div', { className: 'nk-stat-value' + (tone ? ' ' + tone : '') }, typeof value === 'number' ? fmtNum(value) : String(value)))
  }

  function inlineEmpty(text) {
    return h('div', { className: 'nk-tiny', style: { padding: '12px 2px' } }, text)
  }

  function badge(text, tone) {
    return h('span', { className: 'nk-badge' + (tone ? ' ' + tone : '') }, text)
  }

  /** 一段「主文案 + 附注」的紧凑行；没有附注时只出主文案。 */
  function metaLine(text, hint) {
    return h('div', { className: 'nk-tiny', style: { lineHeight: 1.7 } },
      String(text ?? ''),
      hint ? h('span', { style: { marginLeft: 8, color: c.faint } }, String(hint)) : null)
  }

  return { fmtNum, pageStat, inlineEmpty, badge, metaLine }
}
