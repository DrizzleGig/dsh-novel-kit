import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { extractComicPage, listComicPages, ocrComicPages, detectComicPanels, ocrComicPanels } from '../lib/native/comic/comic.mjs';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);

function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.from(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

test('CBZ：列页/取页，跳过非图片和路径穿越', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fanfic-comic-zip-'));
  try {
    const file = path.join(root, 'book.cbz');
    await writeFile(file, makeZip([
      { name: '002.png', data: PNG_1X1 },
      { name: '001.png', data: PNG_1X1 },
      { name: '../evil.png', data: PNG_1X1 },
      { name: 'notes.txt', data: Buffer.from('x') },
    ]));
    const listed = await listComicPages(file);
    assert.equal(listed.ok, true);
    assert.equal(listed.type, 'cbz');
    assert.deepEqual(listed.pages.map((p) => p.name), ['001.png', '002.png']);
    const page = await extractComicPage(file, 0);
    assert.deepEqual(page, PNG_1X1);
    await assert.rejects(listComicPages(path.join(root, 'missing.cbz')), /找不到/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('图片目录/单图：只收 PNG/JPEG/WebP，按自然序', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fanfic-comic-dir-'));
  try {
    await writeFile(path.join(root, '10.png'), PNG_1X1);
    await writeFile(path.join(root, '2.jpg'), PNG_1X1);
    await writeFile(path.join(root, 'notes.txt'), 'x');
    const listed = await listComicPages(root);
    assert.equal(listed.type, 'directory');
    assert.deepEqual(listed.pages.map((p) => p.name), ['2.jpg', '10.png']);
    assert.equal((await extractComicPage(path.join(root, '2.jpg'), 0)).length, PNG_1X1.length);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('OCR 只处理选中页；失败页保留错误，不中断其他页', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fanfic-comic-ocr-'));
  try {
    const file = path.join(root, 'book.cbz');
    await writeFile(file, makeZip([
      { name: '001.png', data: PNG_1X1 },
      { name: '002.png', data: PNG_1X1 },
    ]));
    const seen = [];
    const result = await ocrComicPages(file, [0, 1], {
      ocrImpl: async (temp) => {
        seen.push(path.basename(temp));
        if (seen.length === 2) return { ok: false, error: 'ocr failed' };
        return { ok: true, text: '唐 三', lang: 'zh-Hans-CN' };
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.pages.length, 2);
    assert.equal(result.pages[0].text, '唐 三');
    assert.equal(result.pages[1].ok, false);
    assert.equal(seen.length, 2);
    assert.equal(seen[0].startsWith('page-0.'), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('OCR 拒绝空/越界页码', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fanfic-comic-bad-'));
  try {
    const file = path.join(root, 'one.png');
    await writeFile(file, PNG_1X1);
    await assert.rejects(ocrComicPages(file, [5], { ocrImpl: async () => ({ ok: true, text: 'x' }) }), /没有有效/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('分格 OCR：先分格再逐格 OCR，按面板顺序拼文本', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fanfic-comic-panel-ocr-'));
  try {
    const file = path.join(root, 'one.png');
    await writeFile(file, PNG_1X1);
    const gray = new Uint8Array(100 * 100).fill(255);
    for (let y = 0; y < 100; y++) {
      for (let x = 0; x < 44; x++) gray[y * 100 + x] = 0;
      for (let x = 56; x < 100; x++) gray[y * 100 + x] = 0;
    }
    let n = 0;
    const result = await ocrComicPanels(file, 0, {
      loadGrayImpl: async () => ({ ok: true, width: 100, height: 100, originalWidth: 100, originalHeight: 100, scale: 1, gray }),
      cropImpl: async (source, rect, out) => ({ ok: true, out, width: rect.w, height: rect.h }),
      ocrImpl: async () => ({ ok: true, text: n++ === 0 ? '第一格' : '第二格' }),
    });
    assert.equal(result.split, true);
    assert.equal(result.panels.length, 2);
    assert.equal(result.panels[0].text, '第一格');
    assert.equal(result.panels[1].text, '第二格');
    assert.equal(result.text, '第一格\n\n第二格');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('分格：灰度投影切 2 格，并按原图尺寸缩放', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fanfic-comic-panel-'));
  try {
    const file = path.join(root, 'one.png');
    await writeFile(file, PNG_1X1);
    const gray = new Uint8Array(100 * 100).fill(255);
    for (let y = 0; y < 100; y++) {
      for (let x = 0; x < 44; x++) gray[y * 100 + x] = 0;
      for (let x = 56; x < 100; x++) gray[y * 100 + x] = 0;
    }
    const result = await detectComicPanels(file, 0, {
      loadGrayImpl: async () => ({
        ok: true, width: 100, height: 100, originalWidth: 200, originalHeight: 200, scale: 0.5, gray,
      }),
    });
    assert.equal(result.ok, true);
    assert.equal(result.page.width, 200);
    assert.equal(result.panels.length, 2);
    assert.deepEqual(result.panels.map((p) => [p.x, p.w]), [[0, 88], [112, 88]]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
