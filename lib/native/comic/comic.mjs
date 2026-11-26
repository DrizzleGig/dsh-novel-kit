// 本地漫画读取：CBZ/ZIP、图片文件、图片目录。不接平台、不做整本 OCR。
// ZIP 解析只支持 stored/deflate（CBZ 常态），拒绝加密/ZIP64/路径穿越/超大页。
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { ocrImage } from './windows-ocr.mjs';
import { loadGray } from './image-gray.mjs';
import { cropImage } from './image-crop.mjs';
import { detectPanels } from './panel-detect.mjs';

const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;
const MAX_COMIC_BYTES = 200 * 1024 * 1024;
const MAX_PAGE_BYTES = 20 * 1024 * 1024;
const MAX_PAGES = 200;
const MAX_OCR_PAGES = 30;
const MAX_OCR_CHARS = 30_000;

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

function naturalCompare(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function imageExtension(name) {
  const match = String(name || '').match(IMAGE_EXT);
  return match ? match[1].toLowerCase().replace('jpeg', 'jpg') : '';
}

async function readZipEntries(file) {
  const buffer = await readFile(file);
  if (buffer.length > MAX_COMIC_BYTES) throw new Error('CBZ 超过 200MB');
  let eocd = -1;
  const min = Math.max(0, buffer.length - 22 - 0xffff);
  for (let i = buffer.length - 22; i >= min; i--) {
    if (buffer.readUInt32LE(i) === SIG_EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('不是有效 ZIP/CBZ（找不到 EOCD）');
  const commentLen = buffer.readUInt16LE(eocd + 20);
  if (eocd + 22 + commentLen > buffer.length) throw new Error('ZIP EOCD 注释越界');
  const total = buffer.readUInt16LE(eocd + 10);
  const cdSize = buffer.readUInt32LE(eocd + 12);
  const cdOffset = buffer.readUInt32LE(eocd + 16);
  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw new Error('暂不支持 ZIP64');
  if (cdOffset + cdSize > eocd) throw new Error('ZIP 中央目录越界');
  if (cdOffset < 0 || cdOffset + cdSize > buffer.length) throw new Error('ZIP 中央目录越界');
  if (total > 10_000) throw new Error('ZIP 条目过多');

  const entries = [];
  let at = cdOffset;
  for (let i = 0; i < total; i++) {
    if (at + 46 > cdOffset + cdSize || buffer.readUInt32LE(at) !== SIG_CENTRAL) throw new Error('ZIP 中央目录损坏');
    const flags = buffer.readUInt16LE(at + 8);
    const method = buffer.readUInt16LE(at + 10);
    const compressedSize = buffer.readUInt32LE(at + 20);
    const uncompressedSize = buffer.readUInt32LE(at + 24);
    const nameLen = buffer.readUInt16LE(at + 28);
    const extraLen = buffer.readUInt16LE(at + 30);
    const commentLen = buffer.readUInt16LE(at + 32);
    const localOffset = buffer.readUInt32LE(at + 42);
    if (at + 46 + nameLen + extraLen + commentLen > cdOffset + cdSize) throw new Error('ZIP 中央目录条目越界');
    const name = buffer.toString('utf8', at + 46, at + 46 + nameLen);
    at += 46 + nameLen + extraLen + commentLen;
    if (!name || name.endsWith('/')) continue;
    if (name.includes('..') || name.startsWith('/') || name.includes('\\')) continue;
    if (flags & 0x1) continue; // encrypted
    if (!imageExtension(name)) continue;
    if (![0, 8].includes(method)) continue;
    if (uncompressedSize > MAX_PAGE_BYTES || compressedSize > MAX_PAGE_BYTES) continue;
    if (method === 0 && compressedSize !== uncompressedSize) continue;
    if (localOffset + 30 > cdOffset) continue;
    entries.push({ name, method, compressedSize, uncompressedSize, localOffset, flags });
  }
  entries.sort((a, b) => naturalCompare(a.name, b.name));
  if (entries.length > MAX_PAGES) throw new Error(`漫画页数超过 ${MAX_PAGES}`);
  return { type: 'cbz', buffer, entries };
}

function readZipPage(source, entry) {
  const buffer = source.buffer;
  const at = entry.localOffset;
  if (at + 30 > buffer.length || buffer.readUInt32LE(at) !== SIG_LOCAL) throw new Error('ZIP 本地头损坏');
  const nameLen = buffer.readUInt16LE(at + 26);
  const extraLen = buffer.readUInt16LE(at + 28);
  const start = at + 30 + nameLen + extraLen;
  const end = start + entry.compressedSize;
  if (start > end || end > buffer.length) throw new Error('ZIP 页数据越界');
  const raw = buffer.subarray(start, end);
  if (entry.method === 0) {
    if (raw.length !== entry.uncompressedSize) throw new Error('ZIP stored 页尺寸不符');
    return Buffer.from(raw);
  }
  try {
    const out = inflateRawSync(raw, { maxOutputLength: MAX_PAGE_BYTES });
    if (out.length !== entry.uncompressedSize) throw new Error('ZIP 页解压尺寸不符');
    return out;
  } catch {
    throw new Error('ZIP 页解压失败');
  }
}

async function loadImageFile(file) {
  const info = await stat(file);
  if (!info.isFile()) throw new Error('不是图片文件');
  if (info.size > MAX_PAGE_BYTES) throw new Error('图片超过 20MB');
  return {
    type: 'image',
    pages: [{
      index: 0,
      name: path.basename(file),
      size: info.size,
      read: async () => await readFile(file),
    }],
  };
}

async function loadImageDirectory(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && IMAGE_EXT.test(entry.name)).map((entry) => entry.name).sort(naturalCompare);
  if (!files.length) throw new Error('目录里没有 PNG/JPEG/WebP 图片');
  if (files.length > MAX_PAGES) throw new Error(`漫画页数超过 ${MAX_PAGES}`);
  const pages = [];
  for (let i = 0; i < files.length; i++) {
    const file = path.join(dir, files[i]);
    const info = await stat(file);
    if (info.size > MAX_PAGE_BYTES) throw new Error(`单页超过 20MB：${files[i]}`);
    pages.push({ index: i, name: files[i], size: info.size, read: async () => await readFile(file) });
  }
  return { type: 'directory', pages };
}

async function loadComic(file) {
  const absolute = path.resolve(String(file || ''));
  const info = await stat(absolute).catch(() => null);
  if (!info) throw new Error(`找不到漫画文件/目录：${absolute}`);
  if (info.isDirectory()) return { ...(await loadImageDirectory(absolute)), file: absolute };
  if (info.size > MAX_COMIC_BYTES) throw new Error('漫画超过 200MB');
  const ext = path.extname(absolute).toLowerCase();
  if (ext === '.cbz' || ext === '.zip') {
    const source = await readZipEntries(absolute);
    return {
      type: 'cbz',
      file: absolute,
      pages: source.entries.map((entry, index) => ({
        index, name: entry.name, size: entry.uncompressedSize, read: async () => readZipPage(source, entry),
      })),
    };
  }
  if (IMAGE_EXT.test(ext)) return { ...(await loadImageFile(absolute)), file: absolute };
  throw new Error('只支持 CBZ/ZIP、PNG/JPEG/WebP 或图片目录');
}

export async function listComicPages(file) {
  const comic = await loadComic(file);
  return {
    ok: true,
    type: comic.type,
    file: comic.file,
    pages: comic.pages.map((page) => ({ index: page.index, name: page.name, size: page.size })),
  };
}

export async function extractComicPage(file, index) {
  const comic = await loadComic(file);
  const page = comic.pages[Number(index)];
  if (!page) throw new Error(`页码越界：${index}`);
  return await page.read();
}

/**
 * 单页分格：Windows 内置 System.Drawing 读灰度，纯 JS 投影切分。
 * 返回原图坐标的面板矩形；失败不写盘、不留临时文件。
 */
export async function detectComicPanels(file, index, options = {}) {  const comic = await loadComic(file);
  const page = comic.pages[Number(index)];
  if (!page) throw new Error(`页码越界：${index}`);
  const grayImpl = options.loadGrayImpl || loadGray;
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'fanfic-panel-'));
  const temp = path.join(tempDir, `page.${imageExtension(page.name) || 'png'}`);
  try {
    await writeFile(temp, await page.read());
    const gray = await grayImpl(temp, {
      maxWidth: Number(options.maxWidth) || 240,
      maxHeight: Number(options.maxHeight) || 360,
    });
    if (!gray || !gray.ok) throw new Error(gray?.error || '图像灰度读取失败');
    const panels = detectPanels(gray.gray, gray.width, gray.height, options);
    const sx = gray.originalWidth / gray.width;
    const sy = gray.originalHeight / gray.height;
    return {
      ok: true,
      type: comic.type,
      file: comic.file,
      page: { index, name: page.name, width: gray.originalWidth, height: gray.originalHeight },
      panels: panels.map((panel) => ({
        x: Math.round(panel.x * sx),
        y: Math.round(panel.y * sy),
        w: Math.max(1, Math.round(panel.w * sx)),
        h: Math.max(1, Math.round(panel.h * sy)),
      })),
    };
  } finally {
    await rm(temp, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * 分格 OCR：先分格，再逐格裁剪/OCR，按面板顺序拼文本；无面板时回退整页 OCR。
 * options.loadGrayImpl/cropImpl/ocrImpl 仅供测试注入。
 */
export async function ocrComicPanels(file, index, options = {}) {
  const detected = await detectComicPanels(file, index, options);
  if (!detected.panels.length) {
    const fallback = await ocrComicPages(file, [index], options);
    return { ...fallback, split: false, fallback: true };
  }
  const pageBytes = await extractComicPage(file, index);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'fanfic-panel-ocr-'));
  const pagePath = path.join(tempDir, 'page.png');
  const ocrImpl = options.ocrImpl || ocrImage;
  const cropImpl = options.cropImpl || cropImage;
  const panels = [];
  let chars = 0;
  try {
    await writeFile(pagePath, pageBytes);
    for (let i = 0; i < detected.panels.length && i < 8 && chars < MAX_OCR_CHARS; i++) {
      const rect = detected.panels[i];
      const cropPath = path.join(tempDir, `panel-${i}.png`);
      try {
        const cropped = await cropImpl(pagePath, rect, cropPath);
        if (!cropped || !cropped.ok) throw new Error(cropped?.error || '裁剪失败');
        const ocr = await ocrImpl(cropPath);
        if (ocr && ocr.ok) {
          const text = String(ocr.text || '').slice(0, Math.max(0, MAX_OCR_CHARS - chars));
          chars += text.length;
          panels.push({ index: i, rect, ok: true, text, chars: text.length });
        } else {
          panels.push({ index: i, rect, ok: false, text: '', chars: 0, error: String(ocr?.error || 'OCR 失败') });
        }
      } catch (error) {
        panels.push({ index: i, rect, ok: false, text: '', chars: 0, error: String(error?.message || error) });
      } finally {
        await rm(cropPath, { force: true }).catch(() => {});
      }
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
  return {
    ok: panels.some((panel) => panel.ok),
    split: true,
    type: detected.type,
    file: detected.file,
    page: detected.page,
    panels,
    chars,
    text: panels.filter((panel) => panel.ok).map((panel) => panel.text).join('\n\n').slice(0, MAX_OCR_CHARS),
    truncated: chars >= MAX_OCR_CHARS,
  };
}

/**
 * 只对作者选中的页做 OCR；临时文件在系统 temp，完成后删除。
 * options.ocrImpl 仅供测试注入；生产用 Windows 内置 OCR。
 */
export async function ocrComicPages(file, indices, options = {}) {
  const comic = await loadComic(file);
  const selected = (Array.isArray(indices) && indices.length ? indices : [0])
    .map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0 && n < comic.pages.length)
    .slice(0, MAX_OCR_PAGES);
  if (!selected.length) throw new Error('没有有效的页码');
  const ocrImpl = options.ocrImpl || ocrImage;
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'fanfic-comic-'));
  const out = [];
  let chars = 0;
  try {
    for (const index of selected) {
      const page = comic.pages[index];
      const ext = imageExtension(page.name) || 'png';
      const temp = path.join(tempDir, `page-${index}.${ext}`);
      try {
        const bytes = await page.read();
        await writeFile(temp, bytes);
        const ocr = await ocrImpl(temp);
        if (ocr && ocr.ok) {
          const text = String(ocr.text || '').slice(0, Math.max(0, MAX_OCR_CHARS - chars));
          chars += text.length;
          out.push({ index, name: page.name, ok: true, text, chars: text.length, lang: ocr.lang || '' });
        } else {
          out.push({ index, name: page.name, ok: false, error: String(ocr?.error || 'OCR 失败'), text: '', chars: 0 });
        }
      } catch (error) {
        out.push({ index, name: page.name, ok: false, error: String(error?.message || error), text: '', chars: 0 });
      } finally {
        await rm(temp, { force: true }).catch(() => {});
      }
      if (chars >= MAX_OCR_CHARS) break;
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
  return {
    ok: out.some((page) => page.ok),
    type: comic.type,
    file: comic.file,
    pages: out,
    chars,
    truncated: chars >= MAX_OCR_CHARS,
  };
}
