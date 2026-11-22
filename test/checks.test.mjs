// S1：确定性章节检查。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkDraft, splitSentences, checkCopy, checkNames, checkBands } from '../lib/engine/checks.js'

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

test('checkDraft：返回确定性指标（供面板对比档案）', () => {
  const result = checkDraft({ text: '他走了。她没有回头。' })
  assert.equal(typeof result.metrics.sentenceMean, 'number')
  assert.equal(typeof result.metrics.dialogueRatio, 'number')
  assert.equal(result.metrics.sentences, 2)
})

test('checkCopy：连续 20 字与原著证据相同 → blocker；短引文忽略', () => {
  const quote = '他偷去了唐门内门的秘籍之后，跳崖明志，重生于此界。'
  const draft = '而' + quote.slice(0, 20) + '。'
  const result = checkCopy({ text: draft, evidence: [{ quote }] })
  assert.equal(result.ok, false)
  assert.equal(result.blockers, 1)
  assert.equal(result.findings[0].code, 'copy')

  const short = checkCopy({ text: draft, evidence: [{ quote: '他偷去了' }] })
  assert.equal(short.ok, true)
})

test('checkNames：与 canon 人物名只差一个字 → warning；正确名字不报', () => {
  const near = checkNames({ text: '唐叁站在门口。', names: ['唐三', '小舞'] })
  assert.equal(near.warnings, 1)
  assert.equal(near.findings[0].code, 'name-near')
  assert.match(near.findings[0].message, /唐叁/)

  const clean = checkNames({ text: '唐三站在门口。', names: ['唐三'] })
  assert.equal(clean.warnings, 0)
})

test('定位：blocker 与 warning 都带 utf16 下标和覆盖长度', () => {
  const text = '他推门进来，掏出手机看了眼。'
  const forbidden = checkDraft({ text, forbidden: ['手机'] })
  const finding = forbidden.findings[0]
  assert.equal(finding.coordinate, 'utf16')
  assert.equal(finding.at, text.indexOf('手机'))
  assert.equal(finding.length, 2)
  assert.equal(text.slice(finding.at, finding.at + finding.length), '手机')

  const long = checkDraft({ text: '他' + '走'.repeat(90) + '。', maxSentence: 80 })
  const sentence = long.findings[0]
  assert.equal(sentence.code, 'long-sentence')
  assert.equal(sentence.at, 0)
  assert.equal(sentence.length, 91, '长度覆盖整句，定位能选中它')
})

test('定位：复制检查在带换行的正文里也能映射回原文下标', () => {
  const quote = '他把那枚令牌放在桌上没有解释'
  // 正文里这段被换行打断：去空白后相同，但原文下标必须落在「他把」处
  const text = '夜里很静。\n\n他把那枚令牌放\n在桌上没有解释。'
  const result = checkCopy({ text, evidence: [{ quote }], minLen: 12 })
  assert.equal(result.ok, false)
  const finding = result.findings[0]
  assert.equal(finding.coordinate, 'utf16')
  const located = text.slice(finding.at, finding.at + finding.length)
  assert.match(located, /^他把那枚令牌放/)
  assert.equal(located.replace(/\s+/gu, ''), finding.quote, '去空白后必须正好等于命中的窗口')
})

test('定位：全文级 finding（文风区间）显式给 null，不假装能定位', () => {
  const result = checkBands({
    text: '他走了。她没说话。',
    profile: { bands: { sentenceMean: { band: [50, 60] } }, identity: {} },
  })
  const band = result.findings.find((item) => item.code === 'voice-band')
  assert.ok(band)
  assert.equal(band.at, null)
  assert.equal(band.length, null)
})

