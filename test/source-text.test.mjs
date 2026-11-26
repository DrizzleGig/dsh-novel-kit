// 原文摄入：分章与 UTF-8/BOM 解码（替代删除的旧 fanfic 导入测试的这部分覆盖）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeSourceText, sha256Hex, splitChapters } from '../lib/engine/source-text.js'

test('splitChapters：按「第N章」切分；无标题整篇一章', () => {
  const text = '第一章 开端\n\n甲。\n\n第二章 转折\n\n乙。'
  const chapters = splitChapters(text)
  assert.equal(chapters.length, 2)
  assert.equal(chapters[0].id, 'ch000')
  assert.match(chapters[0].heading, /第一章/u)
  assert.equal(chapters[1].id, 'ch001')
  const single = splitChapters('只有一段。')
  assert.equal(single.length, 1)
  assert.equal(single[0].id, 'ch001')
})

test('decodeSourceText：UTF-8 与 BOM；非法 UTF-8 报错', () => {
  assert.deepEqual(decodeSourceText(Buffer.from('正文', 'utf8'), 'a.txt'), { text: '正文', encoding: 'utf-8' })
  const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('正文', 'utf8')])
  assert.deepEqual(decodeSourceText(bom, 'a.txt'), { text: '正文', encoding: 'utf-8-bom' })
  assert.throws(() => decodeSourceText(Buffer.from([0xff, 0xfe, 0x00]), 'a.txt'), /不是 UTF-8/u)
  assert.equal(sha256Hex('正文'), sha256Hex('正文'))
})
