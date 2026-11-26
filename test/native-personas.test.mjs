// 0.8 voice persona 起步：提案/确认分开，未确认不进入简报。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ensureBook } from '../lib/native/store.js'
import { createPersona, confirmPersona, listPersonas, personaBrief, readPersonas } from '../lib/native/personas.js'

test('人物卡：proposed 不进简报，confirm 后进；重复确认幂等', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-native-persona-'))
  const book = await ensureBook({ root, book: '人物书' })
  const created = await createPersona({
    root, bookId: book.bookId, name: '陈凡', aliases: ['小凡'],
    fields: { narrative: '第三人称贴着走', inner: '先怀疑再行动', dialogue: '短句，少解释' },
    evidence: [{ sourceId: 'src1', chapter: 3, quote: '陈凡没说话。', kind: 'action' }],
  })
  assert.equal(created.ok, true)
  assert.equal(created.persona.status, 'proposed')

  const before = personaBrief(await readPersonas(root, book.bookId))
  assert.equal(before.available, false)
  assert.equal(before.count, 0)

  const confirmed = await confirmPersona({ root, bookId: book.bookId, personaId: created.persona.id })
  assert.equal(confirmed.ok, true)
  assert.equal(confirmed.persona.status, 'confirmed')
  const after = personaBrief(await readPersonas(root, book.bookId))
  assert.equal(after.available, true)
  assert.equal(after.count, 1)
  assert.equal(after.personas[0].name, '陈凡')
  assert.equal(after.personas[0].narrative, '第三人称贴着走')
  assert.equal(after.personas[0].evidence, undefined, '简报不带原始证据')

  const again = await confirmPersona({ root, bookId: book.bookId, personaId: created.persona.id })
  assert.equal(again.idempotent, true)
  assert.equal((await listPersonas(root, book.bookId, { status: 'confirmed' })).personas.length, 1)
  assert.equal(existsSync(path.join(root, '.dsh-novel-voice')), false)
})

test('人物卡：未知 id 报错；两份提案只有确认的那份进简报', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-native-persona-two-'))
  const book = await ensureBook({ root, book: '人物书二' })
  const a = await createPersona({ root, bookId: book.bookId, name: '甲', fields: { inner: '冷静' } })
  await createPersona({ root, bookId: book.bookId, name: '乙', fields: { inner: '冲动' } })
  await confirmPersona({ root, bookId: book.bookId, personaId: a.persona.id })
  const brief = personaBrief(await readPersonas(root, book.bookId))
  assert.deepEqual(brief.personas.map((item) => item.name), ['甲'])
  await assert.rejects(() => confirmPersona({ root, bookId: book.bookId, personaId: 'per-nope' }), /没有这张人物卡/u)
})