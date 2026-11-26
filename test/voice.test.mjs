// voice：指标、档案检查、文风简报（含真实档案读取）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { textMetrics, sentencesOf, paragraphsOf } from '../lib/engine/metrics.js'
import { checkBands } from '../lib/engine/checks.js'
import { voiceContext } from '../lib/engine/context.js'
import { decodeVoiceProfile } from '../lib/codecs/voice.js'
import { readVoiceProfiles } from '../lib/repositories/ledger.js'

const profile = decodeVoiceProfile({
  schemaVersion: 1, id: 'p-001', name: '原著风格', version: '1.4', status: 'confirmed',
  identity: { summary: '句子偏长', avoid: ['仿佛'] },
  bands: {
    sentenceMean: { band: [16, 41], n: 100 },
    dialogueRatio: { band: [0.17, 0.29], n: 100 },
    paragraphMean: { band: [39, 92], n: 100 },
  },
  rules: [{ id: 'r-1', text: '少用形容词堆叠' }],
})

test('metrics：句长均值/CV、段长、对话占比', () => {
  const text = '他走了。她没有回头。\n\n“走吧。”他说。'
  const metrics = textMetrics(text)
  assert.equal(metrics.sentences, 4)
  assert.equal(metrics.paragraphs, 2)
  assert.ok(metrics.sentenceMean > 0)
  assert.ok(metrics.dialogueRatio > 0)
  assert.deepEqual(sentencesOf('甲。乙！'), ['甲', '乙'])
  assert.deepEqual(paragraphsOf('甲\n\n乙'), ['甲', '乙'])
})

test('checkBands：越界只算 warning，avoid 词也提示', () => {
  const result = checkBands({ text: '他仿佛走了很久。', profile })
  assert.equal(result.ok, true)
  assert.ok(result.warnings >= 1)
  const codes = result.findings.map((item) => item.code)
  assert.ok(codes.includes('voice-avoid'))
  assert.ok(codes.includes('voice-band'))
})

test('voiceContext：有 confirmed 档案时给 bands 与规则，不超预算', () => {
  const ctx = voiceContext({ works: [] }, [profile])
  assert.equal(ctx.available, true)
  assert.match(ctx.markdown, /文风档案/)
  assert.match(ctx.markdown, /句长 16–41/)
  assert.match(ctx.markdown, /少用形容词堆叠/)
  assert.equal(ctx.profileId, 'p-001')
  assert.ok(ctx.chars <= 600 * 2)
})

test('真实档案：斗罗书库能解出 confirmed 档案与 bands', { skip: !existsSync('D:\\斗罗大陆\\.dsh-novel-voice\\斗罗大陆\\profiles') }, async () => {
  const profiles = await readVoiceProfiles('D:\\斗罗大陆', '斗罗大陆')
  assert.ok(profiles.length >= 1)
  const confirmed = profiles.find((item) => item.status === 'confirmed')
  assert.ok(confirmed, '应有一个 confirmed 档案')
  assert.ok(confirmed.bands.sentenceMean.band.length === 2)
  const ctx = voiceContext({ works: [] }, profiles)
  assert.match(ctx.markdown, /文风档案/)
})
