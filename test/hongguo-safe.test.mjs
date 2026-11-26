// 红果适配：只暴露四个只读方法，不暴露播放地址/密钥。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { safeHongguoClient } from '../lib/native/hongguo/index.js'

test('红果适配只暴露只读元数据/弹幕方法', () => {
  const calls = []
  const client = {
    search: (q) => { calls.push(['search', q]); return [] },
    getSeries: (id) => { calls.push(['series', id]); return {} },
    listEpisodes: (id) => { calls.push(['episodes', id]); return [] },
    listDanmaku: (series, episode) => { calls.push(['danmaku', series, episode]); return [] },
    resolvePlayback: () => { throw new Error('must not expose') },
  }
  const safe = safeHongguoClient(client)
  assert.deepEqual(Object.keys(safe).sort(), ['getSeries', 'listDanmaku', 'listEpisodes', 'search'])
  assert.equal('resolvePlayback' in safe, false)
  safe.search('剧名')
  safe.listDanmaku('s1', 'e1')
  assert.deepEqual(calls, [['search', '剧名'], ['danmaku', 's1', 'e1']])
  assert.throws(() => safeHongguoClient({ search: () => [] }), /缺少 getSeries/u)
})