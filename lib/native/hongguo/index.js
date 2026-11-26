// 红果短剧只读适配：vendored openhongguo WASM（Apache-2.0）。
//
// 刻意只暴露元数据/弹幕方法：
//   search / getSeries / listEpisodes / listDanmaku
// 不暴露 resolvePlayback，不读取/保存播放地址或内容密钥。
// 设备档案放在内存，不写用户目录；进程退出后重置（匿名设备）。
import { createClient, memoryProfileStore } from './vendor/openhongguo/index.js';

let clientPromise = null;

export function safeHongguoClient(client) {
  if (!client || typeof client !== 'object') throw new Error('红果客户端不可用');
  const pick = (name) => {
    if (typeof client[name] !== 'function') throw new Error(`红果客户端缺少 ${name}`);
    return client[name].bind(client);
  };
  return {
    search: pick('search'),
    getSeries: pick('getSeries'),
    listEpisodes: pick('listEpisodes'),
    listDanmaku: pick('listDanmaku'),
  };
}

export async function hongguoClient() {
  if (!clientPromise) {
    const pending = createClient({ profile: memoryProfileStore(), timeoutMs: 20_000 });
    const wrapped = pending.catch((error) => {
      if (clientPromise === wrapped) clientPromise = null;
      throw error;
    });
    clientPromise = wrapped;
  }
  return safeHongguoClient(await clientPromise);
}

export async function hongguoSearch(query, options = {}) {
  const client = await hongguoClient();
  return await client.search(String(query || ''), options);
}

export async function hongguoSeries(seriesId) {
  const client = await hongguoClient();
  return await client.getSeries(String(seriesId || ''));
}

export async function hongguoEpisodes(seriesId, options = {}) {
  const client = await hongguoClient();
  return await client.listEpisodes(String(seriesId || ''), options);
}

export async function hongguoDanmaku(seriesId, episodeId, options = {}) {
  const client = await hongguoClient();
  return await client.listDanmaku(String(seriesId || ''), String(episodeId || ''), options);
}
