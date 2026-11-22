// F3：按模式装配 + 硬预算。原创不装配 canon；任何一段不超过预算。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assembleContext, BUDGETS, CONTEXT_FINGERPRINT_VERSION } from '../lib/engine/context.js'

function beatOf(extraCanon = 0) {
  return {
    revision: 1,
    chapters: [],
    decisions: [{ chapter: 13, title: '谁去', change: '陈凡去', status: 'committed' }],
    canon: Array.from({ length: extraCanon }, (_, index) => ({ entity: '实体' + index, key: '设定', value: '值'.repeat(120) })),
    obligations: [],
    segments: [],
    audit: [],
    revisions: [],
  }
}

const fade = { revision: 1, cards: [], entities: [], threads: [], drift: false }
const fanfic = {
  id: 'douluo', title: '原著', revision: 7, currentChapter: 13,
  exports: { forbidden: [], addresses: [{ from: 'A', to: 'B', form: 'B哥', fromChapter: 'ch001' }] },
}
const voice = { works: [] }

test('原创模式：即使传入 fanfic 项目，也不装配世界段', () => {
  const context = assembleContext({ beat: beatOf(), fade, voice, fanfic, chapter: 13, mode: 'original' })
  assert.equal(context.mode, 'original')
  const fan = context.segments.find((segment) => segment.component === 'fanfic')
  assert.equal(fan.available, false)
  assert.equal(fan.chars, 0)
  assert.equal(context.segments.find((segment) => segment.component === 'beat').available, true)
})

test('同人模式：装配世界段，称呼可见', () => {
  const context = assembleContext({ beat: beatOf(), fade, voice, fanfic, chapter: 13, mode: 'fanfic' })
  assert.equal(context.mode, 'fanfic')
  const fan = context.segments.find((segment) => segment.component === 'fanfic')
  assert.equal(fan.available, true)
  assert.match(fan.markdown, /称呼/)
  assert.match(fan.markdown, /B哥/)
})

test('硬预算：beat 段不超过 800 字，截断有标记', () => {
  const context = assembleContext({ beat: beatOf(40), fade, voice, fanfic: null, chapter: 13, mode: 'original' })
  const beat = context.segments.find((segment) => segment.component === 'beat')
  assert.ok(beat.chars <= BUDGETS.beat, `beat chars=${beat.chars}`)
  assert.equal(beat.budgetChars, BUDGETS.beat)
  assert.equal(beat.truncated, true)
})

test('硬预算：fanfic 段不超过 800 字', () => {
  const big = {
    ...fanfic,
    exports: {
      forbidden: Array.from({ length: 20 }, (_, index) => '禁忌' + index + '：' + '禁'.repeat(80)),
      addresses: Array.from({ length: 30 }, (_, index) => ({ from: '甲' + index, to: '乙' + index, form: '称呼' + index, fromChapter: 'ch001' })),
    },
  }
  const context = assembleContext({ beat: beatOf(), fade, voice, fanfic: big, chapter: 13, mode: 'fanfic' })
  const fan = context.segments.find((segment) => segment.component === 'fanfic')
  assert.ok(fan.chars <= BUDGETS.fanfic, `fanfic chars=${fan.chars}`)
  assert.equal(fan.truncated, true)
})

test('指纹包含 mode 带来的差异：原创与同人的指纹不同', () => {
  const original = assembleContext({ beat: beatOf(), fade, voice, fanfic, chapter: 13, mode: 'original' })
  const fanficCtx = assembleContext({ beat: beatOf(), fade, voice, fanfic, chapter: 13, mode: 'fanfic' })
  assert.notEqual(original.fingerprint, fanficCtx.fingerprint)
})

test('指纹覆盖裁剪之外的内容：canon 内容指纹变了，即使装配文本一样也要变', () => {
  const big = {
    ...fanfic,
    kitCanon: {
      contentHash: 'hash-a',
      facts: Array.from({ length: 30 }, (_, index) => ({ entity: '实体' + index, key: '设定', value: '值'.repeat(40) })),
    },
  }
  const same = assembleContext({ beat: beatOf(), fade, voice, fanfic: big, chapter: 13, mode: 'fanfic' })
  const changed = assembleContext({
    beat: beatOf(), fade, voice, chapter: 13, mode: 'fanfic',
    fanfic: { ...big, kitCanon: { ...big.kitCanon, contentHash: 'hash-b' } },
  })
  const markdown = (context) => context.segments.find((segment) => segment.component === 'fanfic').markdown
  assert.equal(markdown(same), markdown(changed), '装配文本相同（改动在预算之外）')
  assert.notEqual(same.fingerprint, changed.fingerprint, '内容指纹变了，依据必须失效')
})

test('指纹覆盖账本修订号：同内容但 revision 变了也要失效', () => {
  const a = assembleContext({ beat: beatOf(), fade, voice, fanfic, chapter: 13, mode: 'fanfic' })
  const b = assembleContext({ beat: { ...beatOf(), revision: 2 }, fade, voice, fanfic, chapter: 13, mode: 'fanfic' })
  assert.equal(a.segments.find((s) => s.component === 'beat').markdown, b.segments.find((s) => s.component === 'beat').markdown)
  assert.notEqual(a.fingerprint, b.fingerprint)
})

test('指纹带口径版本号', () => {
  const context = assembleContext({ beat: beatOf(), fade, voice, fanfic, chapter: 13, mode: 'fanfic' })
  assert.equal(context.fingerprintVersion, CONTEXT_FINGERPRINT_VERSION)
  assert.equal(typeof context.dependency.beat, 'number')
  assert.equal(context.dependency.fanficTitle, '原著')
})
