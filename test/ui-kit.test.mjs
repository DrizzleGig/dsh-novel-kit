// 纯展示工具：可以被测试直接 import（同时也会被构建内联进 client.js）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createUiKit } from '../client-src/ui-kit.js'

// 最小 h：把元素拍平成 { type, props, children }，够断言结构与类名。
function h(type, props, ...children) {
  const flat = children.flat(Infinity).filter((child) => child !== null && child !== undefined)
  return { type, props: props ?? {}, children: flat }
}

const c = { faint: 'faint-token' }
const ui = createUiKit({ h, c })

test('fmtNum：千分位；非数字原样返回', () => {
  assert.equal(ui.fmtNum(1234567), '1,234,567')
  assert.equal(ui.fmtNum(0), '0')
  assert.equal(ui.fmtNum(undefined), '—')
  assert.equal(ui.fmtNum('第3章'), '第3章')
})

test('pageStat：数字走格式化，字符串原样；tone 追加到值上', () => {
  const stat = ui.pageStat('记忆卡', 12000)
  assert.equal(stat.props.className, 'nk-stat')
  assert.equal(stat.children[0].children[0], '记忆卡')
  assert.equal(stat.children[1].props.className, 'nk-stat-value')
  assert.equal(stat.children[1].children[0], '12,000')

  const toned = ui.pageStat('待办', 3, 'warn')
  assert.match(toned.children[1].props.className, /warn$/)
})

test('inlineEmpty：一句话空态，不吞 null 以外的内容', () => {
  const empty = ui.inlineEmpty('还没有记忆卡。')
  assert.equal(empty.props.className, 'nk-tiny')
  assert.equal(empty.children[0], '还没有记忆卡。')
})

test('badge：带 tone 时追加类名', () => {
  assert.equal(ui.badge('已核实').props.className, 'nk-badge')
  assert.equal(ui.badge('冲突', 'warn').props.className, 'nk-badge warn')
})

test('metaLine：有附注时两段，没有附注只出一段', () => {
  const bare = ui.metaLine('正文')
  assert.equal(bare.children.length, 1)
  const withHint = ui.metaLine('正文', '第 3 章')
  assert.equal(withHint.children.length, 2)
  assert.equal(withHint.children[1].props.style.color, 'faint-token')
})
