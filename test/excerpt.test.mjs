// 证据回查：getSourceExcerpt 要能从 kit 的 sources/ 与旧同人项目的 source/ 两套布局读回同一章。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import RemoteClass from '../lib/host/remote.js'

const SESSION = 'excerpt-session'
const SOURCE_ID = 'a'.repeat(64)
const BODY = '第一章 名字\n沈砚站在廊下，听见有人叫他。\n'.repeat(20)

function makeRemote(root) {
  const remote = Object.create(RemoteClass.prototype)
  remote.ctx = {
    agents: { get(id) { return { id, cwd: root, session: { id, cwd: root } } } },
    typert: { register() {} },
    get(key) {
      if (key === 'workingDirectory') return { ensure: async () => root }
      if (key === 'novelKitGate') return { isOn: () => true, isMasterOn: () => true }
      return null
    },
  }
  return remote
}

async function tempRoot() {
  return await mkdtemp(path.join(os.tmpdir(), 'kit-excerpt-'))
}

test('getSourceExcerpt：读 kit sources/<sha>/chapters/chNNN.txt', async () => {
  const root = await tempRoot()
  const dir = path.join(root, '.dsh-novel-kit', 'sources', SOURCE_ID, 'chapters')
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'ch001.txt'), BODY, 'utf8')

  const remote = makeRemote(root)
  const result = await remote.getSourceExcerpt(SESSION, { sourceId: SOURCE_ID, chapter: 1, length: 300 })
  assert.equal(result.ok, true)
  assert.equal(result.chapterId, 'ch001')
  assert.equal(result.layout, 'kit')
  assert.equal(result.length, 300)
  assert.equal(result.truncated, true)
  assert.match(result.text, /^第一章 名字/)
})

test('getSourceExcerpt：offset 生效，越界不报错', async () => {
  const root = await tempRoot()
  const dir = path.join(root, '.dsh-novel-kit', 'sources', SOURCE_ID, 'chapters')
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'ch002.txt'), BODY, 'utf8')

  const remote = makeRemote(root)
  const skipped = await remote.getSourceExcerpt(SESSION, { sourceId: SOURCE_ID, chapter: 2, offset: 5, length: 300 })
  assert.equal(skipped.offset, 5)
  assert.equal(skipped.length, 300)
  const beyond = await remote.getSourceExcerpt(SESSION, { sourceId: SOURCE_ID, chapter: 2, offset: 999999, length: 300 })
  assert.equal(beyond.ok, true, '越界只给最后一段，不抛错')
  assert.ok(beyond.length >= 0)
})

test('getSourceExcerpt：回退到旧同人项目 source/ 布局', async () => {
  const root = await tempRoot()
  const dir = path.join(root, '.dsh-novel-fanfic', '斗罗同人', 'source', SOURCE_ID, 'chapters')
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'ch003.txt'), BODY, 'utf8')

  const remote = makeRemote(root)
  const result = await remote.getSourceExcerpt(SESSION, { sourceId: SOURCE_ID, chapter: 3, length: 20 })
  assert.equal(result.ok, true)
  assert.equal(result.layout, 'fanfic:斗罗同人')
  assert.match(result.text, /沈砚/)
})

test('getSourceExcerpt：缺章时给源代码级错误，而不是空字符串', async () => {
  const root = await tempRoot()
  const remote = makeRemote(root)
  const result = await remote.getSourceExcerpt(SESSION, { sourceId: SOURCE_ID, chapter: 9 })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'source-not-found')
  assert.match(result.message, /找不到这一章的原文/)
})

test('getSourceExcerpt：参数校验', async () => {
  const root = await tempRoot()
  const remote = makeRemote(root)
  await assert.rejects(() => remote.getSourceExcerpt(SESSION, { sourceId: 'short', chapter: 1 }), /sourceId/)
  await assert.rejects(() => remote.getSourceExcerpt(SESSION, { sourceId: SOURCE_ID, chapter: 0 }), /chapter/)
})
