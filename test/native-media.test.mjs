// 0.7 fanfic 媒体证据：导入后 unverified，作者确认/拒绝才进入 brief。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ensureBook } from '../lib/native/store.js'
import { mediaFromLegacy, mediaBrief, readMedia, reviewMediaEvidence, writeMedia } from '../lib/native/media.js'

test('媒体证据：导入默认 unverified，confirm 后进 brief，重复确认幂等', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-native-media-'))
  const book = await ensureBook({ root, book: '媒体书' })
  const doc = mediaFromLegacy({
    sources: [{ id: 'ms1', type: 'comic', title: '漫画版', status: 'verified', claimType: 'fact', visibility: 'public' }],
    evidence: [{ id: 'me1', sourceId: 'ms1', page: 2, quote: '画面证据', status: 'unverified', claimType: 'fact' }],
  }, { bookId: book.bookId, book: '媒体书' })
  await writeMedia(root, book.bookId, doc)
  assert.equal((await readMedia(root, book.bookId)).evidence[0].status, 'unverified')
  assert.equal(mediaBrief(await readMedia(root, book.bookId)).available, false)

  const confirmed = await reviewMediaEvidence({ root, bookId: book.bookId, evidenceId: 'me1', status: 'confirmed', note: '对照过' })
  assert.equal(confirmed.ok, true)
  assert.equal(confirmed.evidence.status, 'confirmed')
  const brief = mediaBrief(await readMedia(root, book.bookId))
  assert.equal(brief.available, true)
  assert.equal(brief.count, 1)
  assert.equal(brief.facts.length, 1)
  assert.equal(brief.sources.public, 1)
  assert.equal(brief.evidence[0].note, '对照过')

  const again = await reviewMediaEvidence({ root, bookId: book.bookId, evidenceId: 'me1', status: 'confirmed' })
  assert.equal(again.idempotent, true)
  assert.equal(existsSync(path.join(root, '.dsh-novel-fanfic')), false)
})

test('媒体证据：reject 不进 brief；未知证据报错', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-native-media-reject-'))
  const book = await ensureBook({ root, book: '媒体书二' })
  await writeMedia(root, book.bookId, mediaFromLegacy({ sources: [], evidence: [{ id: 'me1', quote: '待核' }] }, { bookId: book.bookId, book: '媒体书二' }))
  await reviewMediaEvidence({ root, bookId: book.bookId, evidenceId: 'me1', status: 'rejected' })
  assert.equal(mediaBrief(await readMedia(root, book.bookId)).available, false)
  await assert.rejects(() => reviewMediaEvidence({ root, bookId: book.bookId, evidenceId: 'nope', status: 'confirmed' }), /没有这条媒体证据/u)
})