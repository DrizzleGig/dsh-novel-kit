// 纯函数分格：输入灰度像素，输出面板矩形。用于本地漫画页。
// 思路：先找列方向的整列空白（gutters），再在每个列带里找行空白，递归切分。
// 不是视觉模型；对白边明确的漫画页有效，失败时 UI/作者可手动框选。

const DEFAULTS = {
  white: 245,          // 灰度 >= white 视为纸白
  gutterRatio: 0.985,  // 整列/行 >= 98.5% 是纸白，才算装订线
  minGutter: 0.018,    // 装订线至少占宽/高的 1.8%
  minPanel: 0.055,     // 面板至少占宽/高的 5.5%
  maxDepth: 4,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function profile(gray, width, height, region, axis) {
  const out = new Array(axis === 'x' ? region.w : region.h).fill(0);
  for (let y = region.y; y < region.y + region.h; y++) {
    for (let x = region.x; x < region.x + region.w; x++) {
      if (gray[y * width + x] >= DEFAULTS.white) out[axis === 'x' ? x - region.x : y - region.y] += 1;
    }
  }
  const total = axis === 'x' ? region.h : region.w;
  return out.map((count) => (total ? count / total : 1));
}

function contentBands(ratios, options) {
  const gutterMin = Math.max(1, Math.round(ratios.length * options.minGutter));
  const bands = [];
  let start = -1;
  for (let i = 0; i <= ratios.length; i++) {
    const white = i < ratios.length && ratios[i] >= options.gutterRatio;
    if (!white && start < 0) start = i;
    if ((white || i === ratios.length) && start >= 0) {
      const end = i;
      if (end - start > 0) bands.push([start, end]);
      start = -1;
    }
  }
  // 去掉太薄的边缘带；保留有内容的带。
  return bands.filter(([a, b]) => b - a >= gutterMin);
}

function splitRegion(gray, width, height, region, options, depth) {
  if (depth >= options.maxDepth) return [region];
  if (region.w < width * options.minPanel || region.h < height * options.minPanel) return [region];

  const cols = profile(gray, width, height, region, 'x');
  const colBands = contentBands(cols, options);
  if (colBands.length > 1) {
    return colBands.flatMap(([a, b]) => splitRegion(gray, width, height, {
      x: region.x + a, y: region.y, w: b - a, h: region.h,
    }, options, depth + 1));
  }
  if (colBands.length === 1) {
    region = { x: region.x + colBands[0][0], y: region.y, w: colBands[0][1] - colBands[0][0], h: region.h };
  }

  const rows = profile(gray, width, height, region, 'y');
  const rowBands = contentBands(rows, options);
  if (rowBands.length > 1) {
    return rowBands.flatMap(([a, b]) => splitRegion(gray, width, height, {
      x: region.x, y: region.y + a, w: region.w, h: b - a,
    }, options, depth + 1));
  }
  if (rowBands.length === 1) {
    region = { x: region.x, y: region.y + rowBands[0][0], w: region.w, h: rowBands[0][1] - rowBands[0][0] };
  }

  return [region];
}

export function detectPanels(gray, width, height, options = {}) {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) throw new Error('宽高无效');
  if (!(gray instanceof Uint8Array) || gray.length !== w * h) throw new Error('灰度像素数量与宽高不符');
  const opts = {
    white: clamp(Number(options.white) || DEFAULTS.white, 1, 255),
    gutterRatio: clamp(Number(options.gutterRatio) || DEFAULTS.gutterRatio, 0.8, 1),
    minGutter: clamp(Number(options.minGutter) || DEFAULTS.minGutter, 0.005, 0.2),
    minPanel: clamp(Number(options.minPanel) || DEFAULTS.minPanel, 0.01, 0.5),
    maxDepth: clamp(Number(options.maxDepth) || DEFAULTS.maxDepth, 1, 8),
  };
  const cols = profile(gray, w, h, { x: 0, y: 0, w, h }, 'x');
  const rows = profile(gray, w, h, { x: 0, y: 0, w, h }, 'y');
  const colBands = contentBands(cols, opts);
  const rowBands = contentBands(rows, opts);
  if (!colBands.length || !rowBands.length) return [];
  const regions = splitRegion(gray, w, h, { x: 0, y: 0, w, h }, opts, 0);
  return regions
    .filter((r) => r.w > 0 && r.h > 0)
    .sort((a, b) => a.y - b.y || a.x - b.x);
}
