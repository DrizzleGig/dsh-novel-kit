// Windows 自带 OCR 适配：Windows.Media.Ocr，不安装外部 OCR。
// 只在本机 Windows 调用 powershell.exe；其他平台返回 unavailable。
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultScript = path.join(here, 'win-ocr.ps1');

export function normalizeOcrText(text) {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/(?<=[\u3400-\u9fff])[ \t]+(?=[\u3400-\u9fff])/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function runPowerShell(file, options = {}) {
  const execFileImpl = options.execFileImpl || execFile;
  const script = options.script || defaultScript;
  return new Promise((resolve) => {
    execFileImpl(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Path', file],
      { timeout: Number(options.timeoutMs) || 30_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => resolve({ error, stdout, stderr }),
    );
  });
}

/**
 * OCR 一张本地图片。返回 {ok,text,lines,lang,error}。
 * options.execFileImpl 仅用于测试注入；生产不传。
 */
export async function ocrImage(file, options = {}) {
  if (options.platform && options.platform !== 'win32') {
    return { ok: false, available: false, error: '仅 Windows 内置 OCR 可用', text: '', lines: [] };
  }
  if (!options.execFileImpl && process.platform !== 'win32') {
    return { ok: false, available: false, error: '仅 Windows 内置 OCR 可用', text: '', lines: [] };
  }
  const { error, stdout, stderr } = await runPowerShell(path.resolve(String(file)), options);
  if (error && !stdout) {
    return { ok: false, available: false, error: String(error.message || stderr || 'powershell 执行失败'), text: '', lines: [] };
  }
  let parsed;
  try {
    parsed = JSON.parse(String(stdout || '').trim().split(/\r?\n/).filter(Boolean).pop());
  } catch {
    return { ok: false, available: false, error: 'OCR 输出不是 JSON', text: '', lines: [] };
  }
  if (!parsed || parsed.ok !== true) {
    return { ok: false, available: false, error: String(parsed?.error || 'OCR 失败'), text: '', lines: [] };
  }
  const lines = Array.isArray(parsed.lines) ? parsed.lines.map((line) => String(line)).filter(Boolean) : [];
  const text = normalizeOcrText(parsed.text || lines.join('\n'));
  return { ok: true, available: true, text, lines, lang: parsed.lang || '', error: '' };
}
