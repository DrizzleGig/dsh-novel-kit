// 只解绑不删档案；重复解绑幂等。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { bindStyleProfile, unbindStyleProfile, readProjectSettings } from '../lib/engine/settings.js'
import { analyzeStyle, styleProfileFile, removeStyleProfile } from '../lib/engine/profiles.js'
import { writeJsonAtomic } from '../lib/storage/atomic-json.js'

test('风格解绑：保留档案、幂等', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-style-unbind-'))
  const profile = analyzeStyle('他推门进来。', { sourceId: 'b'.repeat(64), title: '解绑样本', book: '解绑书' })
  await writeJsonAtomic(styleProfileFile(root, profile.id), profile, { ensureDir: true })
  await bindStyleProfile(root, '解绑书', profile.id)
  assert.deepEqual((await readProjectSettings(root, '解绑书')).activeStyleProfileIds, [profile.id])
  const first = await unbindStyleProfile(root, '解绑书', profile.id)
  assert.equal(first.ok, true)
  assert.equal(first.idempotent, false)
  assert.deepEqual((await readProjectSettings(root, '解绑书')).activeStyleProfileIds, [])
  assert.equal(existsSync(styleProfileFile(root, profile.id)), true)
  const second = await unbindStyleProfile(root, '解绑书', profile.id)
  assert.equal(second.idempotent, true)

  await bindStyleProfile(root, '解绑书', profile.id)
  const removed = await removeStyleProfile({ root, profileId: profile.id, book: '解绑书' })
  assert.equal(removed.ok, true)
  assert.equal(existsSync(styleProfileFile(root, profile.id)), false)
  assert.ok(removed.movedTo.includes('trash'))
  assert.deepEqual((await readProjectSettings(root, '解绑书')).activeStyleProfileIds, [])
})