// 重测：从原来源重算统计，保留作者规则。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { analyzeStyle, styleProfileFile, remeasureStyle, readStyleProfile } from '../lib/engine/profiles.js'
import { writeJsonAtomic } from '../lib/storage/atomic-json.js'

test('风格重测：保留规则/评分，更新 bands 与 revision', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-style-remeasure-'))
  const sourceId = 'c'.repeat(64)
  mkdirSync(path.join(root, '.dsh-novel-kit', 'sources', sourceId), { recursive: true })
  writeFileSync(path.join(root, '.dsh-novel-kit', 'sources', sourceId, 'raw.txt'), '他推门进来。\n\n“你来了。”他说。', 'utf8')
  const profile = analyzeStyle('旧文本', { sourceId, title: '重测样本', book: '重测书' })
  profile.status = 'confirmed'
  profile.rules = [{ id: 'r-keep', text: '保留规则', status: 'confirmed', weight: 2, evidence: [] }]
  profile.ratings = [{ stars: 4, by: 'author', at: new Date().toISOString() }]
  await writeJsonAtomic(styleProfileFile(root, profile.id), profile, { ensureDir: true })
  const result = await remeasureStyle({ root, profileId: profile.id })
  assert.equal(result.ok, true)
  const next = await readStyleProfile(root, profile.id)
  assert.equal(next.rules[0].text, '保留规则')
  assert.equal(next.ratings.length, 1)
  assert.ok(next.metrics.paragraphs >= 1)
  assert.equal(next.revision, 2)
})