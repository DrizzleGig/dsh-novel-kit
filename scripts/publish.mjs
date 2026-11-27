// 发布一条龙：自检（失败即拒发）→ 校验 npm 身份 → 发布 → 校 registry。
//
// 用法：
//   node scripts/publish.mjs               # 只跑自检，不发布（默认）
//   node scripts/publish.mjs --publish     # 自检全绿才发布
//   node scripts/publish.mjs --allow-dirty # 允许带未提交改动发（不建议）
//
// 自检项（任一失败就停）：
//   1. 版本一致：package.json / CHANGELOG 首行 / README
//   2. 构建产物一致：样式 + remote 契约 + ui-kit 三块
//   3. 单元与集成测试
//   4. 合成验收 + 加载链验收（专门锁「重启后整包消失」）
//   5. 真实验收（复制账本；缺账本时跳过而不算失败）
//   6. 工作区干净（git status 为空）
//   7. 打包清单包含发布必需文件
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const registry = 'https://registry.npmjs.org'
const flags = new Set(process.argv.slice(2))
const publishMode = flags.has('--publish')
const allowDirty = flags.has('--allow-dirty')

const REQUIRED_PACK = ['index.js', 'client.js', 'locale/zh-CN.json', 'locale/en.json', 'cordis.patch.yml', 'README.md', 'LICENSE']

const failures = []
const fail = (message) => { failures.push(message); console.error('  ✖ ' + message) }
const ok = (message) => console.log('  ✓ ' + message)

function section(label) {
  console.log('\n▶ ' + label)
}

function node(args, { allowFail = false, quiet = false } = {}) {
  try {
    const out = execFileSync(process.execPath, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    if (!quiet) {
      const tail = out.trim().split('\n').slice(-3).join('\n')
      if (tail) console.log(tail)
    }
    return { ok: true, out }
  } catch (error) {
    const combined = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim()
    console.error(combined.split('\n').slice(-6).join('\n'))
    if (!allowFail) process.exitCode = 1
    return { ok: false, out: combined }
  }
}

const localNpmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')

function npm(args, { allowFail = false } = {}) {
  const candidates = []
  if (process.env.npm_execpath) candidates.push([process.execPath, [process.env.npm_execpath, ...args]])
  candidates.push([process.execPath, [localNpmCli, ...args]])
  if (process.platform === 'win32') candidates.push([process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'npm', ...args]])
  else candidates.push(['npm', args])

  let last = { ok: false, out: '' }
  for (const [file, argv] of candidates) {
    try {
      const out = execFileSync(file, argv, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      return { ok: true, out: out.trim() }
    } catch (error) {
      last = { ok: false, out: `${error.stdout ?? ''}${error.stderr ?? ''}`.trim() }
      if (error.code !== 'ENOENT') break
    }
  }
  if (!allowFail) { console.error(last.out.split('\n').slice(-6).join('\n')); process.exitCode = 1 }
  return last
}

console.log(`dsh-novel-kit ${pkg.version} · 发布自检${publishMode ? '（将发布）' : '（只自检）'}`)

// ── 1. 版本一致 ───────────────────────────────────────────────────────────────
section('版本一致')
const changelog = readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')
const changelogVersion = (changelog.match(/^##\s+(\d+\.\d+\.\d+)/mu) ?? [])[1] ?? null
if (changelogVersion === pkg.version) ok('CHANGELOG 首条 = ' + pkg.version)
else fail(`CHANGELOG 首条是 ${changelogVersion ?? '(没有)'}，package.json 是 ${pkg.version}`)

const readme = readFileSync(path.join(root, 'README.md'), 'utf8')
if (readme.includes('`' + pkg.version + '`')) ok('README 标注 ' + pkg.version)
else fail('README 里没有 `' + pkg.version + '`：版本号与文档不一致')

// ── 2. 构建产物一致 ───────────────────────────────────────────────────────────
section('构建产物一致（样式 / remote 契约 / ui-kit）')
const build = node([path.join('scripts', 'build-client.mjs'), '--check'])
if (build.ok) ok('产物与源文件一致')
else fail('client.js 与源文件不一致：先跑 npm run build:client')

const fullCheck = npm(['run', 'check'])
if (fullCheck.ok) ok('npm run check 通过')
else fail('npm run check 失败')

// ── 3. 测试 ───────────────────────────────────────────────────────────────────
section('单元与集成测试')
const tests = node(['--require', './test/legacy-env.cjs', '--test'], { quiet: true })
const passLine = (tests.out.match(/ℹ pass (\d+)/u) ?? [])[1]
const failCount = (tests.out.match(/ℹ fail (\d+)/u) ?? [])[1]
if (tests.ok && failCount === '0') ok(`测试 ${passLine ?? '?'} 条全过`)
else fail(`测试未全过（fail ${failCount ?? '?'}）`)

// ── 4. 验收 ───────────────────────────────────────────────────────────────────
section('合成验收')
if (node([path.join('scripts', 'acceptance-native.mjs')], { quiet: true }).ok) ok('acceptance 通过')
else fail('合成验收失败')

section('加载链验收')
if (node([path.join('scripts', 'acceptance-load.mjs')], { quiet: true }).ok) ok('acceptance:load 通过')
else fail('加载链验收失败（「重启后整包消失」这类事故由它守着）')

section('真实验收（复制账本，不动原书）')
const real = node([path.join('scripts', 'acceptance-real.mjs')], { allowFail: true, quiet: true })
if (real.ok) ok('acceptance:real 通过')
else if (/没有可用账本|账本不存在|环境不满足|ENOENT|skipped|skip/iu.test(String(real.out ?? ''))) {
  console.log('  ⚠ 跳过真实验收（没有可用账本或环境不满足）；不阻塞发布，但发布说明里要写清楚')
} else {
  fail('真实验收失败（不是环境缺失，不能降格为跳过）')
}

// ── 5. 工作区干净 ─────────────────────────────────────────────────────────────
section('工作区状态')
try {
  const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()
  if (!dirty) ok('没有未提交改动')
  else if (allowDirty) console.log('  ⚠ 有未提交改动（--allow-dirty）\n' + dirty.split('\n').slice(0, 5).join('\n'))
  else fail('有未提交改动：先提交再发布\n' + dirty.split('\n').slice(0, 5).join('\n'))
  const tag = execFileSync('git', ['tag', '--list', 'v' + pkg.version], { cwd: root, encoding: 'utf8' }).trim()
  if (tag) console.log('  ⚠ 已存在 tag ' + tag + '：同名版本重复发布会失败')
} catch {
  console.log('  ⚠ 不是 git 仓库或没有 git，跳过工作区检查')
}

// ── 6. 打包清单 ───────────────────────────────────────────────────────────────
section('打包清单')
const pack = npm(['pack', '--dry-run', '--json'], { allowFail: true })
if (!pack.ok) {
  fail('npm pack 不可用或失败')
} else {
  let files = []
  try {
    const parsed = JSON.parse(pack.out.slice(pack.out.indexOf('[')))
    files = (parsed[0]?.files ?? []).map((item) => String(item.path).replace(/\\/gu, '/'))
  } catch {
    fail('解析 npm pack 输出失败')
  }
  if (files.length) {
    const missing = REQUIRED_PACK.filter((needle) => !files.includes(needle))
    if (missing.length === 0) ok(`打包 ${files.length} 个文件，必需文件齐全`)
    else fail('打包缺少：' + missing.join(', '))
  } else {
    fail('npm pack 没有返回文件清单')
  }
}

// ── 汇总 ──────────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\n✖ 自检未通过（${failures.length} 项），拒绝发布：`)
  for (const item of failures) console.error('  · ' + item.split('\n')[0])
  process.exit(1)
}

console.log('\n✓ 自检全部通过')
if (!publishMode) {
  console.log('  这是自检模式：加 --publish 才会真正发布。')
  console.log('  发布前请确认：真实 DSH 里重载并点过一遍工作台。')
  process.exit(0)
}

// ── 7. 发布 ───────────────────────────────────────────────────────────────────
console.log('\n▶ npm whoami')
const who = npm(['whoami', `--registry=${registry}`])
if (!who.ok) {
  console.error('\n✖ npm 未登录。先执行：npm login --registry=' + registry)
  process.exit(1)
}
console.log(who.out)

// publish 用 inherit：账号若要求浏览器 2FA，npm 会把授权 URL 打到终端上等人确认。
console.log(`\n▶ npm publish ${pkg.version}`)
try {
  execFileSync(process.execPath, [localNpmCli, 'publish', `--registry=${registry}`, '--access', 'public'], {
    cwd: root,
    stdio: 'inherit',
  })
} catch {
  console.error('\n✖ 发布失败：402/404/EOTP 多半是登录态或 2FA 过期，重新 npm login 后重试。')
  process.exit(1)
}

// 校验走 version 文档：packument 与 tarball 都有 CDN 缓存，直接问 registry 最可靠。
console.log('\n▶ 校验 registry')
const want = `${pkg.name}@${pkg.version}`
let seen = null
for (let attempt = 1; attempt <= 40; attempt += 1) {
  try {
    const res = await fetch(`${registry}/${pkg.name}/${pkg.version}?t=${Date.now()}`, {
      headers: { 'cache-control': 'no-cache' },
    })
    if (res.ok) {
      const doc = await res.json()
      if (doc.version === pkg.version) { seen = doc.version; break }
      seen = `文档版本 ${doc.version}`
    } else {
      seen = `HTTP ${res.status}`
    }
  } catch (error) {
    seen = `fetch 失败：${error?.message ?? error}`
  }
  if (attempt % 5 === 0) console.log(`  还在等 registry（${attempt * 6}s）：${seen}`)
  if (attempt < 40) await new Promise((resolve) => setTimeout(resolve, 6000))
}
const tags = npm(['view', pkg.name, 'dist-tags', `--registry=${registry}`, '--prefer-online'], { allowFail: true })
console.log('dist-tags:', tags.ok ? tags.out : '(查不到)')
if (seen !== pkg.version) {
  console.error(`\n✖ registry 上没有 ${want}（最后一次：${seen}）。发布可能未生效。`)
  process.exit(1)
}
console.log(`${want} ✓`)
console.log(`\n✓ 已发布 dsh-novel-kit@${pkg.version}`)
console.log('  下一步：打 tag v' + pkg.version + ' 并推 GitHub Release，说明模板见 docs/RELEASE.md')
