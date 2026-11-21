// S1：确定性章节检查。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkDraft, splitSentences } from '../lib/engine/checks.js'

test('splitSentences：按中英文句末标点切分', () => {
  assert.deepEqual(splitSentences('他走了。她没说话！真的吗？'), ['他走了', '她没说话', '真的吗'])
  assert.deepEqual(splitSentences(''), [])
})

test('checkDraft：禁忌词是 blocker，带位置与引文', () => {
  const result = checkDraft({ text: '他掏出手机看了眼。', forbidden: ['手机'] })
  assert.equal(result.ok, false)
  assert.equal(result.blockers, 1)
  assert.equal(result.findings[0].code, 'forbidden')
  assert.equal(result.findings[0].at, 3)
  assert.equal(result.findings[0].quote, '手机')
})

test('checkDraft：长句只是 warning，不阻止落账', () => {
  const long = '他' + '走'.repeat(90) + '。'
  const result = checkDraft({ text: long, maxSentence: 80 })
  assert.equal(result.ok, true)
  assert.equal(result.warnings, 1)
  assert.equal(result.findings[0].code, 'long-sentence')
})

test('checkDraft：称呼矩阵——附近没有期望称呼就 warning', () => {
  const addresses = [{ from: '唐昊', to: '唐三', form: '小三' }]
  const bad = checkDraft({ text: '唐昊看着唐三说：“走吧。”', addresses })
  assert.equal(bad.ok, true)
  assert.equal(bad.warnings, 1)
  assert.equal(bad.findings[0].code, 'address')

  const good = checkDraft({ text: '唐昊看着唐三说：“小三，走吧。”', addresses })
  assert.equal(good.findings.filter((item) => item.code === 'address').length, 0)
})

test('checkDraft：统计字数/句数/平均句长，空文不炸', () => {
  const result = checkDraft({ text: '他走了。她没有回头。' })
  assert.equal(result.ok, true)
  assert.deepEqual(result.stats, { chars: 10, sentences: 2, avgSentence: 4 })
  assert.equal(checkDraft({ text: '' }).stats.sentences, 0)
})
