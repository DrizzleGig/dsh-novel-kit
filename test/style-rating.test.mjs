// 0.7 voice：文风档案评分（只追加作者/读者评分，不改规则；不输出跨作品总分）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { rateStyleProfile, readStyleRatingSummary, styleProfileFile, styleProfileId } from '../lib/engine/profiles.js'
import { writeJsonAtomic } from '../lib/storage/atomic-json.js'

const profileId = styleProfileId('source-1')

test('文风评分：作者/读者追加，摘要只给本条档案', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-style-rating-'))
  await writeJsonAtomic(styleProfileFile(root, profileId), {
    schemaVersion: 1, id: profileId, name: '测试风格', status: 'confirmed', revision: 0,
    rules: [], identity: { avoid: [] }, decisionPolicy: {},
  }, { ensureDir: true })

  const one = await rateStyleProfile({ root, profileId, stars: 5, note: '句子喜欢', by: 'author' })
  assert.equal(one.ok, true)
  assert.equal(one.summary.count, 1)
  assert.equal(one.summary.average, 5)
  assert.equal(one.profile.rules.length, 0)

  const two = await rateStyleProfile({ root, profileId, stars: 4, note: '读者觉得好', by: 'reader' })
  assert.equal(two.summary.count, 2)
  assert.equal(two.summary.average, 4.5)
  assert.equal((await readStyleRatingSummary(root, profileId)).average, 4.5)
})

test('文风评分：非法分数/身份拒绝；revision 冲突不写', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-style-rating-errors-'))
  await writeJsonAtomic(styleProfileFile(root, profileId), {
    schemaVersion: 1, id: profileId, name: '测试风格', status: 'confirmed', revision: 0,
    rules: [], identity: { avoid: [] }, decisionPolicy: {},
  }, { ensureDir: true })
  await assert.rejects(() => rateStyleProfile({ root, profileId, stars: 6 }), /1-5/u)
  await assert.rejects(() => rateStyleProfile({ root, profileId, stars: 3, by: 'model' }), /author \/ reader/u)
  const conflict = await rateStyleProfile({ root, profileId, stars: 3, expectedRevision: 9 })
  assert.equal(conflict.ok, false)
  assert.equal(conflict.code, 'style-conflict')
})