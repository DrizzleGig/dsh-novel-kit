// 读取本地图片为灰度像素（Windows 内置 System.Drawing，不装图像库）。
// 用于漫画分格；输出缩放后的灰度，原图尺寸一并返回。
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultScript = path.join(here, '..', 'scripts', 'image-gray.ps1');

function runPowerShell(file, options) {
  const execFileImpl = options.execFileImpl || execFile;
  const script = options.script || defaultScript;
  const args = [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script,
    '-Path', path.resolve(String(file)),
    '-MaxWidth', String(Math.max(80, Math.min(800, Number(options.maxWidth) || 240))),
    '-MaxHeight', String(Math.max(80, Math.min(1200, Number(options.maxHeight) || 360))),
  ];
  return new Promise((resolve) => {
    execFileImpl('powershell.exe', args, {
      timeout: Number(options.timeoutMs) || 30_000,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    }, (error, stdout, stderr) => resolve({ error, stdout, stderr }));
  });
}

export async function loadGray(file, options = {}) {
  if (options.platform && options.platform !== 'win32') {
    return { ok: false, available: false, error: '仅 Windows 内置图像读取可用' };
  }
  if (!options.execFileImpl && process.platform !== 'win32') {
    return { ok: false, available: false, error: '仅 Windows 内置图像读取可用' };
  }
  const { error, stdout, stderr } = await runPowerShell(file, options);
  if (error && !stdout) {
    return { ok: false, available: false, error: String(error.message || stderr || 'powershell 执行失败') };
  }
  let parsed;
  try {
    parsed = JSON.parse(String(stdout || '').trim().split(/\r?\n/).filter(Boolean).pop());
  } catch {
    return { ok: false, available: false, error: '灰度输出不是 JSON' };
  }
  if (!parsed || parsed.ok !== true) {
    return { ok: false, available: false, error: String(parsed?.error || '灰度读取失败') };
  }
  const gray = Buffer.from(String(parsed.gray || ''), 'base64');
  if (!parsed.width || !parsed.height || gray.length !== parsed.width * parsed.height) {
    return { ok: false, available: false, error: '灰度像素数量不符' };
  }
  return {
    ok: true,
    available: true,
    width: Number(parsed.width),
    height: Number(parsed.height),
    originalWidth: Number(parsed.originalWidth) || Number(parsed.width),
    originalHeight: Number(parsed.originalHeight) || Number(parsed.height),
    scale: Number(parsed.scale) || 1,
    gray: new Uint8Array(gray.buffer, gray.byteOffset, gray.byteLength),
  };
}
