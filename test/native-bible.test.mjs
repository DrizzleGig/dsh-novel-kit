// 0.8 故事圣经：只读导出，未确认人物/媒体不进入正文，传闻不混事实。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildStoryBible } from '../lib/native/bible.js'

test('故事圣经：决策/记忆/已确认人物/事实/传闻/runbook', () => {
  const bible = buildStoryBible({
    book: '测试书',
    decisions: {
      decisions: [{ id: 'd1', chapter: 1, status: 'committed', title: '谁去', option: '夜行' }],
      requests: [{ id: 'r1', status: 'open', question: '要不要回头' }],
    },
    memory: { cards: [{ id: 'c1', chapter: 2, gist: '陈凡出城' }] },
    personas: { personas: [{ id: 'p1', name: '陈凡', status: 'confirmed', fields: { inner: '先怀疑再行动' } }, { id: 'p2', name: '未确认', status: 'proposed' }] },
    media: {
      format: 'kit.media', schemaVersion: 1, bookId: 'bk-11111111-1111-4111-8111-111111111111', book: '测试书', revision: 1,
      sources: [{ id: 's1', claimType: 'fact', visibility: 'public' }],
      evidence: [
        { id: 'e1', sourceId: 's1', status: 'confirmed', claimType: 'fact', quote: '事实引文' },
        { id: 'e2', sourceId: 's1', status: 'confirmed', claimType: 'rumor', quote: '传闻引文' },
      ],
    },
    runs: [{ runId: 'run-1', title: '第一卷', status: 'running', steps: [1, 2] }],
  })
  assert.match(bible.markdown, /测试书 · 故事圣经/u)
  assert.match(bible.markdown, /夜行/u)
  assert.match(bible.markdown, /要不要回头/u)
  assert.match(bible.markdown, /陈凡出城/u)
  assert.match(bible.markdown, /先怀疑再行动/u)
  assert.doesNotMatch(bible.markdown, /### 未确认/u)
  assert.match(bible.markdown, /\[事实\] 事实引文/u)
  assert.match(bible.markdown, /\[传闻\] 传闻引文/u)
  assert.match(bible.markdown, /第一卷/u)
})

test('故事圣经：空数据不抛错', () => {
  const bible = buildStoryBible({ book: '' })
  assert.match(bible.markdown, /未命名作品/u)
  assert.match(bible.markdown, /（暂无已拍板决策）/u)
})