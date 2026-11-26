// 风格档案：规则权重/状态、学习候选、历史与 stale revision。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { analyzeStyle, styleProfileFile, updateStyleRule, addStyleCandidate, readStyleHistory, readStyleProfile, compileStyleBrief, listStyleProfiles, setStyleReaderPreference, compileDecisionHint, styleQuality } from '../lib/engine/profiles.js'
import { writeJsonAtomic } from '../lib/storage/atomic-json.js'

async function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-style-rules-'))
  const profile = analyzeStyle('他推门进来，屋里没有人。\n\n“你来了。”他说。', { sourceId: 'a'.repeat(64), title: '样本', book: '规则书' })
  profile.status = 'confirmed'
  profile.rules = [
    { id: 'r-a', text: '短句', weight: 1, status: 'confirmed', evidence: [], counterExamples: ['长句堆叠'] },
    { id: 'r-b', text: '留白', weight: 3, status: 'confirmed', evidence: [] },
  ]
  await writeJsonAtomic(styleProfileFile(root, profile.id), profile, { ensureDir: true })
  return { root, profile }
}

test('风格规则：权重排序、拒绝不进简报、历史', async () => {
  const { root, profile } = await fixture()
  const updated = await updateStyleRule({ root, profileId: profile.id, ruleId: 'r-a', weight: 5, status: 'confirmed' })
  assert.equal(updated.ok, true)
  const next = await readStyleProfile(root, profile.id)
  assert.equal(next.rules.find((rule) => rule.id === 'r-a').weight, 5)
  assert.deepEqual(next.rules.find((rule) => rule.id === 'r-a').counterExamples, ['长句堆叠'])
  let brief = compileStyleBrief(next)
  assert.match(brief.markdown, /短句；留白|短句；留白/u)
  assert.ok(brief.markdown.indexOf('短句') < brief.markdown.indexOf('留白'))
  await updateStyleRule({ root, profileId: profile.id, ruleId: 'r-b', status: 'rejected' })
  brief = compileStyleBrief(await readStyleProfile(root, profile.id))
  assert.doesNotMatch(brief.markdown, /留白/u)
  const history = await readStyleHistory({ root, profileId: profile.id })
  assert.equal(history.history.length, 2)
})

test('风格学习候选：add 幂等、状态 candidate、revision 校验', async () => {
  const { root, profile } = await fixture()
  const first = await addStyleCandidate({ root, profileId: profile.id, text: '对话里留停顿' })
  assert.equal(first.idempotent, false)
  const second = await addStyleCandidate({ root, profileId: profile.id, text: '对话里留停顿' })
  assert.equal(second.idempotent, true)
  const next = await readStyleProfile(root, profile.id)
  assert.equal(next.rules.filter((rule) => rule.status === 'candidate').length, 1)
  assert.equal(compileStyleBrief(next).markdown.includes('对话里留停顿'), false)
  const listed = await listStyleProfiles(root)
  assert.ok(listed.profiles[0].rulesDetail.some((rule) => rule.status === 'candidate'))
  await assert.rejects(() => updateStyleRule({ root, profileId: profile.id, ruleId: 'r-a', expectedRevision: 1, weight: 2 }), /revision-stale/u)
  await assert.rejects(() => addStyleCandidate({ root, profileId: profile.id, text: '并发候选', expectedRevision: 1 }), /revision-stale/u)
  await assert.rejects(() => setStyleReaderPreference({ root, profileId: profile.id, text: '并发备注', expectedRevision: 1 }), /revision-stale/u)
})

test('读者偏好：作者备注只写档案，不进规则简报', async () => {
  const { root, profile } = await fixture()
  const saved = await setStyleReaderPreference({ root, profileId: profile.id, text: '读者喜欢短章' })
  assert.equal(saved.ok, true)
  const next = await readStyleProfile(root, profile.id)
  assert.equal(next.readerPreference.text, '读者喜欢短章')
  assert.doesNotMatch(compileStyleBrief(next).markdown, /读者喜欢短章/u)
  const hint = compileDecisionHint([{ status: 'provisional', rules: [{ text: '未确认', status: 'candidate' }], decisionPolicy: { restraint: '高' } }])
  assert.equal(hint, '')
  const quality = styleQuality(profile)
  assert.equal(quality.ok, false)
  assert.ok(quality.issues.includes('rules-without-evidence'))
})