// F2：共用 SourceDocument + style/canon 双用途导入骨架。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { writeJsonAtomic } from '../lib/storage/atomic-json.js'
import { ingestSource, listSources } from '../lib/engine/sources.js'
import { importStyle, compileStyleBrief, listStyleProfiles, annotateProposal, compileDecisionHint, confirmStyleProfile, readStyleProfileSummary } from '../lib/engine/profiles.js'
import { importCanon, readWorldContract, requireCanon, worldContractFile } from '../lib/engine/canon.js'
import { readProjectSettings } from '../lib/engine/settings.js'
import { executeAuthorCommand } from '../lib/engine/author.js'

const sample = [
  '第1章 雪夜出城',
  '陈凡推门进来。屋里没有别人。他看见桌上有一封信，信封上没有落款。',
  '',
  '第2章 城门',
  '两人一路无话。风从城门缝里灌进来，像有人在低声数数。',
  '',
  '第3章 令牌',
  '唐昊把令牌放在桌上。陈凡没有伸手。',
].join('\n')

function workspace() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-source-'))
  const file = path.join(root, '样本.txt')
  writeFileSync(file, sample, 'utf8')
  return { root, file }
}

test('SourceDocument：完整 SHA-256、原文/分章、重复导入幂等', async () => {
  const { root, file } = workspace()
  const first = await ingestSource({ root, file, title: '样本' })
  assert.equal(first.ok, true)
  assert.equal(first.sourceId.length, 64)
  assert.match(first.sourceId, /^[a-f0-9]{64}$/u)
  assert.equal(first.chapterCount, 3)
  assert.equal(first.idempotent, false)

  const again = await ingestSource({ root, file })
  assert.equal(again.idempotent, true)
  assert.equal(again.sourceId, first.sourceId)

  const listed = await listSources(root)
  assert.equal(listed.total, 1)
  assert.equal(listed.sources[0].sourceId, first.sourceId)
})

test('并发导入不同内容：临时目录不串，内容哈希对得上原文', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'kit-source-race-'))
  const a = path.join(root, 'a.txt')
  const b = path.join(root, 'b.txt')
  writeFileSync(a, '第1章 甲\n甲甲甲。', 'utf8')
  writeFileSync(b, '第1章 乙\n乙乙乙。', 'utf8')
  const [ra, rb] = await Promise.all([
    ingestSource({ root, file: a, title: '甲' }),
    ingestSource({ root, file: b, title: '乙' }),
  ])
  assert.notEqual(ra.sourceId, rb.sourceId)
  const rawA = readFileSync(path.join(root, '.dsh-novel-kit', 'sources', ra.sourceId, 'raw.txt'), 'utf8')
  const rawB = readFileSync(path.join(root, '.dsh-novel-kit', 'sources', rb.sourceId, 'raw.txt'), 'utf8')
  assert.match(rawA, /甲甲甲/)
  assert.match(rawB, /乙乙乙/)
  assert.equal((await listSources(root)).total, 2)
})

test('门 A：importStyle 生成 provisional 档案并绑定到项目', async () => {
  const { root, file } = workspace()
  const result = await importStyle({ root, book: '长夜行', file, title: '样本' })
  assert.equal(result.ok, true)
  assert.equal(result.kind, 'style')
  assert.match(result.profileId, /^sty_[a-f0-9]{16}$/u)
  assert.equal(result.profile.status, 'provisional')
  assert.ok(result.profile.bands.sentenceMean.band[1] > 0)
  assert.equal(result.profile.sourceRef.sourceId, result.sourceId)

  const settings = await readProjectSettings(root, '长夜行')
  assert.deepEqual(settings.activeStyleProfileIds, [result.profileId])
  assert.equal(settings.mode, 'original', '学文笔不改项目模式')

  const profiles = await listStyleProfiles(root)
  assert.equal(profiles.total, 1)

  const brief = compileStyleBrief(result.profile, { maxChars: 600 })
  assert.equal(brief.available, true)
  assert.ok(brief.chars <= 600)
  assert.match(brief.markdown, /文风档案/)
  assert.match(brief.markdown, /句长/)
})

test('门 B：原创模式先拒绝；确认后绑定 canon，契约未抽取时不可用', async () => {
  const { root, file } = workspace()
  const blocked = await importCanon({ root, book: '长夜行', file, title: '原著' })
  assert.equal(blocked.ok, false)
  assert.equal(blocked.code, 'mode-required')
  assert.equal(blocked.staged, true)
  const before = await readProjectSettings(root, '长夜行')
  assert.equal(before.mode, 'original')
  assert.equal(before.activeCanonSourceId, null, '未确认不激活 canon')

  const confirmed = await importCanon({ root, book: '长夜行', file, title: '原著', confirmMode: true })
  assert.equal(confirmed.ok, true)
  assert.equal(confirmed.kind, 'canon')
  assert.equal(confirmed.canonReady, false)
  const after = await readProjectSettings(root, '长夜行')
  assert.equal(after.mode, 'fanfic')
  assert.equal(after.activeCanonSourceId, confirmed.sourceId)

  const pending = await requireCanon({ root, book: '长夜行', settings: after })
  assert.equal(pending.ok, false)
  assert.equal(pending.code, 'canon-not-ready')

  // 模拟抽取/确认后的契约
  const contract = await readWorldContract(root, '长夜行', confirmed.sourceId)
  contract.status = 'confirmed'
  contract.facts = [{ id: 'f1', entity: '陈凡', key: '身份', value: '多出来的人' }]
  contract.characters = [{ name: '陈凡' }, { name: '唐昊' }]
  await writeJsonAtomic(worldContractFile(root, '长夜行', confirmed.sourceId), contract, { ensureDir: true })
  const ready = await requireCanon({ root, book: '长夜行', settings: after })
  assert.equal(ready.ok, true)
  assert.equal(ready.sourceId, confirmed.sourceId)
})

test('文风档案：provisional → 作者确认 confirmed，带 revision 校验', async () => {
  const { root, file } = workspace()
  const imported = await importStyle({ root, book: '书', file })
  assert.equal(imported.profile.status, 'provisional')
  const before = await readStyleProfileSummary(root, imported.profileId)
  const stale = await executeAuthorCommand({
    root, operationId: 'op-style-stale', command: 'style.confirm',
    targetRef: { profileId: imported.profileId }, payload: { expectedRevision: 999 }, actor: { kind: 'author', trusted: true },
  })
  assert.equal(stale.ok, false)
  assert.equal(stale.code, 'style-conflict')
  const ok = await executeAuthorCommand({
    root, operationId: 'op-style-confirm', command: 'style.confirm',
    targetRef: { profileId: imported.profileId }, payload: { expectedRevision: before.revision }, actor: { kind: 'author', trusted: true },
  })
  assert.equal(ok.ok, true)
  assert.equal(ok.profile.status, 'confirmed')
  const after = await readStyleProfileSummary(root, imported.profileId)
  assert.equal(after.status, 'confirmed')
  assert.equal(after.revision, before.revision + 1)
})

test('同一作品双导入：一份原文，两个绑定', async () => {
  const { root, file } = workspace()
  const style = await importStyle({ root, book: '长夜行', file, title: '样本' })
  const canon = await importCanon({ root, book: '长夜行', file, title: '样本', confirmMode: true })
  assert.equal(style.sourceId, canon.sourceId, '同源同 hash')
  const listed = await listSources(root)
  assert.equal(listed.total, 1, '只存一份原文')

  const settings = await readProjectSettings(root, '长夜行')
  assert.deepEqual(settings.activeStyleProfileIds, [style.profileId])
  assert.equal(settings.activeCanonSourceId, canon.sourceId)
  assert.equal(settings.mode, 'fanfic')
})

test('文风决策：慢揭示/克制会标注候选，但不替作者选择', async () => {
  const { root, file } = workspace()
  const result = await importStyle({ root, book: '长夜行', file, title: '样本' })
  const profile = {
    ...result.profile,
    decisionPolicy: { restraint: 'high', revealPace: 'slow' },
    identity: { ...result.profile.identity, avoid: ['手机'] },
  }
  const hint = compileDecisionHint([profile])
  assert.match(hint, /克制=high/)
  assert.match(hint, /揭示=slow/)
  assert.match(hint, /不能压过 canon/)

  const proposal = annotateProposal({
    id: 'p1', title: '要不要现在摊牌',
    options: [
      { label: '直接摊牌', impact: '公开秘密' },
      { label: '沉默，留白', impact: '旁敲侧击' },
      { label: '掏出手机', impact: '看时间' },
    ],
  }, [profile])
  assert.equal(proposal.options[0].styleFit, 'low')
  assert.match(proposal.options[0].styleWhy, /揭示太快/)
  assert.equal(proposal.options[1].styleFit, 'high')
  assert.match(proposal.options[1].styleWhy, /克制/)
  assert.equal(proposal.options[2].styleFit, 'low')
  assert.match(proposal.options[2].styleWhy, /避免词/)
})

test('重复导入不覆盖已审核产物', async () => {
  const { root, file } = workspace()
  const style = await importStyle({ root, book: '长夜行', file, title: '样本' })
  const profilePath = path.join(root, '.dsh-novel-kit', 'styles', `${style.profileId}.json`)
  const profile = JSON.parse(readFileSync(profilePath, 'utf8'))
  profile.status = 'confirmed'
  profile.decisionPolicy = { restraint: 'high', revealPace: 'slow' }
  profile.rules = [{ id: 'author-rule', text: '作者确认的规则' }]
  writeFileSync(profilePath, JSON.stringify(profile, null, 2))
  const again = await importStyle({ root, book: '长夜行', file, title: '样本' })
  assert.equal(again.reused, true)
  assert.equal(again.profile.status, 'confirmed')
  assert.equal(again.profile.decisionPolicy.restraint, 'high')
  assert.deepEqual(again.profile.rules.map((rule) => rule.id), ['author-rule'])

  const canon = await importCanon({ root, book: '长夜行', file, title: '样本', confirmMode: true })
  const contractPath = worldContractFile(root, '长夜行', canon.sourceId)
  const contract = JSON.parse(readFileSync(contractPath, 'utf8'))
  contract.status = 'confirmed'
  contract.facts = [{ id: 'f1', entity: '陈凡', key: '身份', value: '穿越者' }]
  writeFileSync(contractPath, JSON.stringify(contract, null, 2))
  const canonAgain = await importCanon({ root, book: '长夜行', file, title: '样本', confirmMode: true })
  assert.equal(canonAgain.reused, true)
  assert.equal(canonAgain.canonReady, true)
  const readBack = JSON.parse(readFileSync(contractPath, 'utf8'))
  assert.equal(readBack.status, 'confirmed')
  assert.equal(readBack.facts[0].value, '穿越者')
})

test('importCanon：项目名越界拒绝', async () => {
  const { root, file } = workspace()
  await assert.rejects(() => importCanon({ root, book: '..', file, confirmMode: true }), /不合法/)
})
