// 本地图片裁剪（Windows 内置 System.Drawing），用于分格后 OCR，不装图像库。
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultScript = path.join(here, '..', 'scripts', 'image-crop.ps1');

export async function cropImage(file, rect, out, options = {}) {
  if (options.platform && options.platform !== 'win32') {
    return { ok: false, available: false, error: '仅 Windows 内置图像裁剪可用' };
  }
  if (!options.execFileImpl && process.platform !== 'win32') {
    return { ok: false, available: false, error: '仅 Windows 内置图像裁剪可用' };
  }
  const execFileImpl = options.execFileImpl || execFile;
  const args = [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', options.script || defaultScript,
    '-Path', path.resolve(String(file)),
    '-X', String(Math.trunc(rect.x)), '-Y', String(Math.trunc(rect.y)),
    '-W', String(Math.trunc(rect.w)), '-H', String(Math.trunc(rect.h)),
    '-Out', path.resolve(String(out)),
  ];
  const { error, stdout, stderr } = await new Promise((resolve) => {
    execFileImpl('powershell.exe', args, {
      timeout: Number(options.timeoutMs) || 30_000,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    }, (err, outText, errText) => resolve({ error: err, stdout: outText, stderr: errText }));
  });
  if (error && !stdout) return { ok: false, available: false, error: String(error.message || stderr || 'powershell 执行失败') };
  let parsed;
  try {
    parsed = JSON.parse(String(stdout || '').trim().split(/\r?\n/).filter(Boolean).pop());
  } catch {
    return { ok: false, available: false, error: '裁剪输出不是 JSON' };
  }
  if (!parsed || parsed.ok !== true) return { ok: false, available: false, error: String(parsed?.error || '裁剪失败') };
  return { ok: true, available: true, out: parsed.out || out, width: parsed.width, height: parsed.height };
}
