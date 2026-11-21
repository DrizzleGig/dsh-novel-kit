// 发布一条龙：自检 → 校验 npm 身份 → 发布 → 校 registry。
//
// 用法：
//   node scripts/publish.mjs             # 全流程（需要已 npm login）
//   node scripts/publish.mjs --skip-publish   # 只自检（CI/离线）
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const registry = 'https://registry.npmjs.org'
const skipPublish = process.argv.includes('--skip-publish')

const run = (label, args, { allowFail = false } = {}) => {
  process.stdout.write(`\n▶ ${label}\n`)
  try {
    const out = execFileSync('node', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    const tail = out.trim().split('\n').slice(-3).join('\n')
    if (tail) console.log(tail)
    return true
  } catch (error) {
    const combined = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim()
    console.error(combined.split('\n').slice(-6).join('\n'))
    if (!allowFail) process.exitCode = 1
    return false
  }
}

const localNpmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')

// 本机 npm 不在 PATH 里也能跑：优先用 node 自带的 npm-cli.js。
const npmCli = () => {
  const fromEnv = process.env.npm_execpath
  if (fromEnv && fromEnv.endsWith('.js') && existsSync(fromEnv)) return fromEnv
  if (existsSync(localNpmCli)) return localNpmCli
  throw new Error('找不到 npm-cli.js：请在 `npm run release` 里调用，或把 npm 放进 PATH')
}

const runNpm = (args) => {
  const candidates = []
  if (process.env.npm_execpath) candidates.push([process.execPath, [process.env.npm_execpath, ...args]])
  const localCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
  candidates.push([process.execPath, [localCli, ...args]])
  if (process.platform === 'win32') candidates.push([process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'npm', ...args]])
  else candidates.push(['npm', args])

  let last = { ok: false, out: '' }
  for (const [file, argv] of candidates) {
    try {
      const out = execFileSync(file, argv, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      return { ok: true, out: out.trim() }
    } catch (error) {
      last = { ok: false, out: `${error.stdout ?? ''}${error.stderr ?? ''}`.trim() }
      if (error.code !== 'ENOENT') return last
    }
  }
  return last
}

console.log(`dsh-novel-kit ${pkg.version} · 发布前自检`)

if (pkg.scripts?.check) {
  console.log('\n▶ npm run check')
  const check = runNpm(['run', 'check'])
  if (!check.ok) { console.error(check.out.split('\n').slice(-6).join('\n')); process.exitCode = 1 }
}

run('测试', ['--test'])
run('合成验收', [path.join('scripts', 'acceptance.mjs')])
run('真实验收（复制账本）', [path.join('scripts', 'acceptance-real.mjs')], { allowFail: true })

if (skipPublish) {
  console.log('\n（--skip-publish）自检结束，未发布。')
  process.exit(process.exitCode ?? 0)
}

console.log('\n▶ npm whoami')
const who = runNpm(['whoami', `--registry=${registry}`])
if (!who.ok) {
  console.error('\n✖ npm 未登录（whoami 失败）。先执行：')
  console.error('  npm login --registry=' + registry)
  console.error('  然后重跑：node scripts/publish.mjs')
  process.exit(1)
}
console.log(who.out)

// publish 用 inherit：账号若要求浏览器 2FA，npm 会把授权 URL 打到终端上等人确认，
// 被 pipe 住的话作者看不到链接。
console.log(`\n▶ npm publish ${pkg.version}`)
try {
  execFileSync(process.execPath, [npmCli(), 'publish', `--registry=${registry}`, '--access', 'public'], {
    cwd: root,
    stdio: 'inherit',
  })
} catch {
  console.error('\n✖ 发布失败：402/404/EOTP 多半是登录态或 2FA 过期，重新 npm login 后重试。')
  process.exit(1)
}

// 校验走 version 文档 + 时间戳：packument 与 tarball 都有 CDN 缓存，
// npm view 可能还读到旧缓存，直接问 registry 拿这个版本的元数据最可靠。
// 首发/安全扫描期间 registry 会先收下再处理（CLI 打印 “being processed”），
// 版本文档可能要两三分钟才出现，所以这里最多等 4 分钟。
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
const tags = runNpm(['view', pkg.name, 'dist-tags', `--registry=${registry}`, '--prefer-online'])
console.log('dist-tags:', tags.ok ? tags.out : '(查不到)')
if (seen !== pkg.version) {
  console.error(`\n✖ registry 上没有 ${want}（最后一次：${seen}）。发布可能未生效。`)
  process.exit(1)
}
console.log(`${want} ✓`)

console.log(`\n✓ 已发布 dsh-novel-kit@${pkg.version}`)
console.log('  下一步：GitHub Release（tag 已推），说明模板见 docs/RELEASE.md')
