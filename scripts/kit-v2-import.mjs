// kit v2 开发用 CLI：只读预览 / 显式导入五件旧数据。
//
// 用法：
//   node scripts/kit-v2-import.mjs preview --root "D:\某工作区"
//   node scripts/kit-v2-import.mjs apply --root "D:\某工作区" --book "斗罗" [--voice "斗罗"] [--fanfic "douluo"] [--mode fanfic] [--replace]
//
// 只写 .dsh-novel-kit/ 与 正文/<bookId>/；五件源目录只读。
import path from 'node:path'
import { previewLegacy, importLegacyBook } from '../lib/native/import/legacy.js'
import { migrateKitBook } from '../lib/native/import/kit-legacy.js'
import { exportBook } from '../lib/native/backup.js'
import { resolveBook } from '../lib/native/store.js'
import { readDecisions } from '../lib/native/decisions.js'
import { readMemory } from '../lib/native/memory.js'
import { readMedia } from '../lib/native/media.js'
import { readPersonas } from '../lib/native/personas.js'
import { listRuns } from '../lib/native/runs.js'
import { buildStoryBible } from '../lib/native/bible.js'
import { writeFile } from 'node:fs/promises'

function parse(argv) {
  const [action = 'preview', ...rest] = argv
  const out = { action, replace: false }
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i]
    if (token === '--replace') { out.replace = true; continue }
    if (token.startsWith('--')) {
      const key = token.slice(2)
      const value = rest[i + 1]
      if (value === undefined || value.startsWith('--')) throw new Error(`参数 ${token} 缺少值`)
      out[key] = value
      i += 1
      continue
    }
    throw new Error(`不认识的参数：${token}`)
  }
  return out
}

async function main() {
  const args = parse(process.argv.slice(2))
  if (!args.root) throw new Error('必须给 --root <工作区绝对路径>')
  const root = path.resolve(args.root)
  if (!path.isAbsolute(root)) throw new Error('root 必须是绝对路径')

  if (args.action === 'preview') {
    const preview = await previewLegacy(root)
    console.log(JSON.stringify(preview, null, 2))
    return
  }
  if (args.action === 'apply') {
    if (!args.book) throw new Error('apply 必须给 --book <书名>')
    const result = await importLegacyBook({
      root,
      book: args.book,
      mode: args.mode === 'fanfic' ? 'fanfic' : 'original',
      replace: args.replace === true,
      sources: {
        voice: args.voice ?? null,
        fanfic: args.fanfic ?? null,
      },
    })
    console.log(JSON.stringify(result, null, 2))
    return
  }
  if (args.action === 'migrate') {
    if (!args.book) throw new Error('migrate 必须给 --book <书名>')
    const result = await migrateKitBook({ root, book: args.book, replace: args.replace === true })
    console.log(JSON.stringify(result, null, 2))
    return
  }
  if (args.action === 'backup') {
    if (!args.book || !args.out) throw new Error('backup 必须给 --book <书名> --out <绝对目录>')
    const record = await resolveBook(root, args.book)
    if (!record) throw new Error('没有这本原生书：' + args.book)
    const result = await exportBook({ root, bookId: record.bookId, outDir: path.resolve(args.out) })
    console.log(JSON.stringify({ ok: result.ok, bookId: result.bookId, dir: result.dir, files: result.files }, null, 2))
    return
  }
  if (args.action === 'bible') {
    if (!args.book || !args.out) throw new Error('bible 必须给 --book <书名> --out <绝对 Markdown 文件>')
    const record = await resolveBook(root, args.book)
    if (!record) throw new Error('没有这本原生书：' + args.book)
    const [decisions, memory, media, personas, runs] = await Promise.all([
      readDecisions(root, record.bookId),
      readMemory(root, record.bookId),
      readMedia(root, record.bookId),
      readPersonas(root, record.bookId),
      listRuns({ root, bookId: record.bookId, limit: 50 }).then((result) => result.runs),
    ])
    const bible = buildStoryBible({ book: args.book, decisions, memory, media, personas, runs })
    await writeFile(path.resolve(args.out), bible.markdown, 'utf8')
    console.log(JSON.stringify({ ok: true, bookId: record.bookId, out: path.resolve(args.out), chars: bible.chars }, null, 2))
    return
  }
  throw new Error(`未知动作：${args.action}（preview | apply | migrate | backup | bible）`)
}

main().catch((error) => {
  console.error('失败：' + String(error?.message ?? error))
  process.exitCode = 1
})
