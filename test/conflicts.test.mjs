// S3：冲突扫描（只报告，不裁决）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scanConflicts } from '../lib/engine/conflicts.js'

const beat = {
  canon: [
    { entity: '陈凡', key: '身份', value: '多出来的人', chapter: 1, decisionId: 'b1-1' },
    { entity: '唐昊', key: '状态', value: '存活', chapter: 2 },
  ],
}
const canon = {
  facts: [
    { id: 'f1', subjectName: '陈凡', predicate: '身份', object: '穿越者', chapter: 'ch001', status: 'confirmed', quote: '他是穿越者' },
    { id: 'f2', subjectName: '唐昊', predicate: '状态', object: '存活', chapter: 'ch001', status: 'confirmed' },
    { id: 'f3', subjectName: '小舞', predicate: '身份', object: '魂兽', chapter: 'ch005', status: 'rejected' },
  ],
}

test('scanConflicts：同键不同值才报，同值与非 confirmed 不报', () => {
  const result = scanConflicts(beat, canon)
  assert.equal(result.available, true)
  assert.equal(result.total, 1)
  const conflict = result.conflicts[0]
  assert.equal(conflict.entity, '陈凡')
  assert.equal(conflict.key, '身份')
  assert.equal(conflict.beat.value, '多出来的人')
  assert.equal(conflict.fanfic.value, '穿越者')
  assert.equal(conflict.beat.decisionId, 'b1-1')
})

test('scanConflicts：缺一本账时如实不可用', () => {
  assert.equal(scanConflicts(null, canon).available, false)
  assert.equal(scanConflicts(beat, null).available, false)
})

test('scanConflicts：两边键对不上时不误报', () => {
  const other = { facts: [{ subjectName: '陈凡', predicate: '年龄', object: '六岁', status: 'confirmed' }] }
  assert.equal(scanConflicts(beat, other).total, 0)
})
