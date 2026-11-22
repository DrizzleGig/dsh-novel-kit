// F1：profile 总开关持久化 + 项目级模式/绑定。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  bindCanonSource,
  bindStyleProfile,
  defaultProjectSettings,
  prefsFile,
  profileStateDir,
  readPrefsSync,
  readProjectSettings,
  writePrefs,
  writeProjectSettings,
} from '../lib/engine/settings.js'

test('prefs：缺失按关；写入后可跨实例读回', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-prefs-'))
  const file = path.join(root, 'prefs.json')
  assert.equal(readPrefsSync(file).master, false, '没有文件默认关')

  await writePrefs({ master: true }, file)
  assert.equal(readPrefsSync(file).master, true)
  assert.equal(readPrefsSync(file).schemaVersion, 1)

  await writePrefs({ master: false }, file)
  assert.equal(readPrefsSync(file).master, false)
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(raw.master, false)
})

test('项目设置：默认原创、revision 递增、非法模式拒绝', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-settings-'))
  const fresh = await readProjectSettings(root, '长夜行')
  assert.deepEqual(fresh, defaultProjectSettings('长夜行'))
  assert.equal(fresh.mode, 'original')

  const fanfic = await writeProjectSettings(root, '长夜行', { mode: 'fanfic' })
  assert.equal(fanfic.mode, 'fanfic')
  assert.equal(fanfic.revision, 1)

  const original = await writeProjectSettings(root, '长夜行', { mode: 'original' })
  assert.equal(original.mode, 'original')
  assert.equal(original.revision, 2)

  await assert.rejects(() => writeProjectSettings(root, '长夜行', { mode: 'canon' }), /mode 只能是/)
})

test('项目设置：文风与 canon 绑定幂等、可读回', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-bind-'))
  await writeProjectSettings(root, '长夜行', { mode: 'fanfic' })
  const withStyle = await bindStyleProfile(root, '长夜行', 'sty_aaaaaaaaaaaaaaaa')
  assert.deepEqual(withStyle.activeStyleProfileIds, ['sty_aaaaaaaaaaaaaaaa'])
  const again = await bindStyleProfile(root, '长夜行', 'sty_aaaaaaaaaaaaaaaa')
  assert.deepEqual(again.activeStyleProfileIds, ['sty_aaaaaaaaaaaaaaaa'], '重复绑定不重复 id')

  const withCanon = await bindCanonSource(root, '长夜行', 'src_aaaaaaaaaaaaaaaa')
  assert.equal(withCanon.activeCanonSourceId, 'src_aaaaaaaaaaaaaaaa')
  const read = await readProjectSettings(root, '长夜行')
  assert.equal(read.mode, 'fanfic')
  assert.equal(read.activeCanonSourceId, 'src_aaaaaaaaaaaaaaaa')
})

test('项目名不能越界', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-safe-'))
  await assert.rejects(() => readProjectSettings(root, '..'), /不合法/)
})

test('profileStateDir：按 DSH profile 隔离，不跨 profile 共用总开关', () => {
  const home = mkdtempSync(path.join(os.tmpdir(), 'kit-profile-home-'))
  const profileA = path.join(home, 'profiles', 'a')
  const profileB = path.join(home, 'profiles', 'b')
  mkdirSync(profileA, { recursive: true })
  mkdirSync(profileB, { recursive: true })
  const prevHome = process.env.DSH_HOME
  const prevCwd = process.cwd()
  const prevOverride = process.env.DSH_NOVEL_KIT_STATE_DIR
  try {
    delete process.env.DSH_NOVEL_KIT_STATE_DIR
    process.env.DSH_HOME = home
    process.chdir(profileA)
    assert.equal(profileStateDir(), path.join(profileA, 'novel-kit'))
    assert.equal(prefsFile(), path.join(profileA, 'novel-kit', 'prefs.json'))
    process.chdir(profileB)
    assert.equal(profileStateDir(), path.join(profileB, 'novel-kit'))
  } finally {
    process.chdir(prevCwd)
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
    if (prevOverride === undefined) delete process.env.DSH_NOVEL_KIT_STATE_DIR
    else process.env.DSH_NOVEL_KIT_STATE_DIR = prevOverride
  }
})
