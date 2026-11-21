// 资源绑定：多库/多项目时不猜，显式优先，同名绑定。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveBinding } from '../lib/engine/binding.js'

function workspace({ beat = ['书'], fade = ['书'], voice = [], fanfic = [] } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-binding-'))
  for (const name of beat) mkdirSync(path.join(root, '.dsh-novel-beat', name), { recursive: true })
  for (const name of fade) mkdirSync(path.join(root, '.dsh-novel-fade', name), { recursive: true })
  for (const name of voice) mkdirSync(path.join(root, '.dsh-novel-voice', name), { recursive: true })
  for (const name of fanfic) mkdirSync(path.join(root, '.dsh-novel-fanfic', name), { recursive: true })
  return root
}

test('binding：同名绑定 beat/fade，单候选才回退到 voice/fanfic', async () => {
  const root = workspace({ voice: ['斗罗大陆'], fanfic: ['douluo'] })
  const binding = await resolveBinding(root, '书')
  assert.equal(binding.beatBook, '书')
  assert.equal(binding.fadeBook, '书')
  assert.equal(binding.voiceLibrary, '斗罗大陆')
  assert.equal(binding.fanficProject, 'douluo')
  assert.equal(binding.available.voice, true)
  assert.equal(binding.available.fanfic, true)
})

test('binding：多个候选且都不同名时给 null（不拿别人的账本）', async () => {
  const root = workspace({ voice: ['甲', '乙'], fanfic: ['p1', 'p2'] })
  const binding = await resolveBinding(root, '书')
  assert.equal(binding.voiceLibrary, null)
  assert.equal(binding.fanficProject, null)
  assert.equal(binding.available.voice, false)
  assert.equal(binding.available.fanfic, false)
})

test('binding：显式指定优先于候选与同名', async () => {
  const root = workspace({ voice: ['甲', '乙'], fanfic: ['p1', 'p2'] })
  const binding = await resolveBinding(root, '书', { voiceLibrary: '乙', fanficProject: 'p2' })
  assert.equal(binding.voiceLibrary, '乙')
  assert.equal(binding.fanficProject, 'p2')
})

test('binding：与书名同名的候选优先于唯一候选', async () => {
  const root = workspace({ voice: ['书', '甲'] })
  const binding = await resolveBinding(root, '书')
  assert.equal(binding.voiceLibrary, '书')
})

test('binding：没有 beat/fade 时如实 available:false', async () => {
  const root = workspace({ beat: [], fade: [], voice: ['甲'] })
  const binding = await resolveBinding(root, '书')
  assert.equal(binding.beatBook, null)
  assert.equal(binding.fadeBook, null)
  assert.equal(binding.available.beat, false)
  assert.equal(binding.voiceLibrary, '甲')
})
