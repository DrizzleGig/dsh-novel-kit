// 发布一条龙：自检 → 校验 npm 身份 → 发布 → 校 registry。
//
// 用法：
//   node scripts/publish.mjs             # 全流程（需要已 npm login）
//   node scripts/publish.mjs --skip-publish   # 只自检（CI/离线）
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
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

console.log(`\n▶ npm publish ${pkg.version}`)
const publish = runNpm(['publish', `--registry=${registry}`, '--access', 'public'])
if (!publish.ok) {
  console.error(publish.out.split('\n').slice(-8).join('\n'))
  console.error('\n✖ 发布失败：402/404/EOTP 多半是登录态或 2FA 过期，重新 npm login 后重试。')
  process.exit(1)
}
console.log(publish.out.split('\n').slice(-3).join('\n'))

console.log('\n▶ 校验 registry')
const version = runNpm(['view', 'dsh-novel-kit', 'version', `--registry=${registry}`])
const tags = runNpm(['view', 'dsh-novel-kit', 'dist-tags', `--registry=${registry}`])
console.log('version:', version.ok ? version.out : '(查不到)')
console.log('dist-tags:', tags.ok ? tags.out : '(查不到)')
if (!version.ok || version.out !== pkg.version) {
  console.error(`\n✖ registry 上的版本不是 ${pkg.version}，发布可能未生效。`)
  process.exit(1)
}

console.log(`\n✓ 已发布 dsh-novel-kit@${pkg.version}`)
console.log('  下一步：GitHub Release（tag 已推），说明模板见 docs/RELEASE.md')
