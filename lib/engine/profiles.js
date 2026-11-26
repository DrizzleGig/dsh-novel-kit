// 文风档案：从导入作品里提炼「怎么写」的可复用档案。
//
// 0.2.0 第一版只做确定性统计（句长/段长/对话比/抽象词/解释词）与少量可解释规则；
// 规则/锚句/decisionPolicy 的高级归纳留给下一轮，档案先标 provisional，作者确认后才 confirmed。
import { readFile, readdir, mkdir, rename } from 'node:fs/promises'
import path from 'node:path'
import { readJsonSnapshot, writeJsonAtomic } from '../storage/atomic-json.js'
import { withLock } from '../storage/locks.js'
import { textMetrics } from './metrics.js'
import { KIT_DIR, bindStyleProfile, readProjectSettings, writeProjectSettingsUnlocked } from './settings.js'
import { ingestSource, readSourceText } from './sources.js'
import { sha256Hex } from './source-text.js'
import { assertSafeName } from '../workspace.js'

export const STYLE_SCHEMA_VERSION = 1

const styleLocks = new Map()
async function withStyleLock(root, key, task) {
  const previous = styleLocks.get(key) ?? Promise.resolve()
  const run = previous.then(task, task)
  const tail = run.catch(() => {})
  styleLocks.set(key, tail)
  try {
    return await withLock({ root, flowId: 'style-' + String(key) }, () => run)
  } finally {
    if (styleLocks.get(key) === tail) styleLocks.delete(key)
  }
}

/** 作者确认文风档案：从 provisional 变成 confirmed；重复确认幂等。 */
export async function confirmStyleProfile({ root, profileId, expectedRevision = null }) {
  const file = styleProfileFile(root, profileId)
  return withStyleLock(root, String(profileId), async () => {
    const snap = await readJsonSnapshot(file)
    const profile = snap.json
    if (profile.status === 'confirmed') return { ok: true, idempotent: true, profile }
    const currentRevision = Number.isInteger(profile.revision) ? profile.revision : 0
    if (expectedRevision !== null && expectedRevision !== undefined && Number(expectedRevision) !== currentRevision) {
      return { ok: false, code: 'style-conflict', message: '文风档案已被更新；刷新后再确认。', current: { revision: currentRevision } }
    }
    const next = {
      ...profile,
      status: 'confirmed',
      confirmedAt: new Date().toISOString(),
      revision: currentRevision + 1,
      updatedAt: new Date().toISOString(),
    }
    await writeJsonAtomic(file, next, { ensureDir: true })
    return { ok: true, profile: next, idempotent: false }
  })
}

/** 文风档案摘要（作者确认/面板用；容量小）。 */
export async function readStyleProfileSummary(root, profileId) {  const snap = await readJsonSnapshot(styleProfileFile(root, profileId))
  const profile = snap.json
  return {
    id: profile.id, name: profile.name, status: profile.status, revision: profile.revision ?? 0,
    rules: (profile.rules ?? []).length, avoid: profile.identity?.avoid ?? [], decisionPolicy: profile.decisionPolicy ?? {},
  }
}

function ratingSummary(profile) {
  const ratings = Array.isArray(profile?.ratings) ? profile.ratings : []
  const sum = ratings.reduce((total, item) => total + (Number(item?.stars) || 0), 0)
  const averageOf = (rows) => rows.length ? Math.round(rows.reduce((total, item) => total + (Number(item?.stars) || 0), 0) / rows.length * 10) / 10 : null
  return {
    count: ratings.length,
    average: ratings.length ? Math.round((sum / ratings.length) * 10) / 10 : null,
    authorAverage: averageOf(ratings.filter((item) => item?.by === 'author')),
    readerAverage: averageOf(ratings.filter((item) => item?.by === 'reader')),
  }
}

/**
 * 给一个已存在的文风档案追加作者/读者评分；不改文风规则本身。
 * 只返回本档案的条数/均值，不输出跨作品总分。
 */
export async function rateStyleProfile({ root, profileId, stars, note = '', by = 'author', expectedRevision = null } = {}) {
  const file = styleProfileFile(root, profileId)
  const score = Number(stars)
  if (!Number.isInteger(score) || score < 1 || score > 5) throw new Error('stars 必须是 1-5 的整数')
  if (!['author', 'reader'].includes(by)) throw new Error('by 只能是 author / reader')
  return withStyleLock(root, String(profileId), async () => {
    const snap = await readJsonSnapshot(file)
    const profile = snap.json
    const currentRevision = Number.isInteger(profile.revision) ? profile.revision : 0
    if (expectedRevision !== null && expectedRevision !== undefined && Number(expectedRevision) !== currentRevision) {
      return { ok: false, code: 'style-conflict', message: '文风档案已被更新；刷新后再评分。', current: { revision: currentRevision } }
    }
    const now = new Date().toISOString()
    const rating = {
      id: `rating-${now.replace(/[^0-9]/g, '').slice(-10)}-${Math.random().toString(36).slice(2, 6)}`,
      stars: score,
      note: String(note ?? ''),
      by,
      at: now,
    }
    const next = {
      ...profile,
      ratings: [...(Array.isArray(profile.ratings) ? profile.ratings : []), rating],
      revision: currentRevision + 1,
      updatedAt: now,
    }
    await writeJsonAtomic(file, next, { ensureDir: true })
    return { ok: true, rating, profile: next, summary: ratingSummary(next) }
  })
}

export async function readStyleRatingSummary(root, profileId) {
  const snap = await readJsonSnapshot(styleProfileFile(root, profileId))
  return ratingSummary(snap.json)
}

const BAND_KEYS = [
  ['sentenceMean', '句长'],
  ['sentenceCv', '句长波动'],
  ['paragraphMean', '段长'],
  ['dialogueRatio', '对话占比'],
  ['abstractPer1k', '抽象词/千字'],
  ['explanationPer1k', '解释词/千字'],
]

export function stylesRoot(root) {
  return path.join(root, KIT_DIR, 'styles')
}

export function styleProfileId(sourceId) {
  return `sty_${sha256Hex(String(sourceId) + ':style').slice(0, 16)}`
}

export function styleProfileFile(root, profileId) {
  const id = String(profileId ?? '')
  if (!/^sty_[a-f0-9]{16}$/u.test(id)) throw new Error('profileId 不合法')
  return path.join(stylesRoot(root), `${id}.json`)
}

const round = (value, digits = 2) => {
  const factor = 10 ** digits
  return Math.round(Number(value) * factor) / factor
}

function bandOf(value, spread = 0.2) {
  const n = Number(value) || 0
  return [round(Math.max(0, n * (1 - spread))), round(n * (1 + spread))]
}

/** 确定性规则：只写能从统计量直接说清的事，不做语义评价。 */
function rulesOf(metrics) {
  const rules = []
  if (metrics.sentenceMean >= 24) rules.push({ id: 'style-long-sentence', text: '句子偏长：允许长句与多分句，但一次只推进一个重点。' })
  else if (metrics.sentenceMean > 0 && metrics.sentenceMean <= 12) rules.push({ id: 'style-short-sentence', text: '句子偏短：多用短句、动作和停顿，少写长复句。' })
  if (metrics.dialogueRatio >= 0.35) rules.push({ id: 'style-dialogue-driven', text: '对话占比高：用对话推进，叙述少解释。' })
  else if (metrics.dialogueRatio > 0 && metrics.dialogueRatio <= 0.12) rules.push({ id: 'style-narration-driven', text: '对话占比低：以叙述/动作推进，对话要省着用。' })
  if (metrics.abstractPer1k >= 3) rules.push({ id: 'style-abstract', text: '抽象词密度偏高：保留氛围与内心，但不要连续堆叠。' })
  if (metrics.explanationPer1k >= 1.5) rules.push({ id: 'style-explanation', text: '解释词偏多：少用「因为/所以/意味着」把因果说透。' })
  return rules
}

/** 生成一个 provisional 档案；不做高阶语义归纳，不把世界事实混进来。 */
export function analyzeStyle(text, { sourceId, title = '', book = '' } = {}) {
  const metrics = textMetrics(text)
  const bands = {}
  for (const [key] of BAND_KEYS) bands[key] = { band: bandOf(metrics[key]), n: metrics.sentences || metrics.paragraphs || 0 }
  return {
    schemaVersion: STYLE_SCHEMA_VERSION,
    id: styleProfileId(sourceId),
    name: String(title || '未命名样本'),
    book: book || null,
    version: 1,
    status: 'provisional',
    sourceRef: { kind: 'style', sourceId: String(sourceId), sha256: String(sourceId) },
    identity: {
      summary: `从《${String(title || '样本')}》统计：句均 ${metrics.sentenceMean}，段均 ${metrics.paragraphMean}，对话占比 ${round(metrics.dialogueRatio * 100)}%。`,
      keywords: [],
      avoid: [],
    },
    bands,
    rules: rulesOf(metrics),
    anchors: [],
    anchorsApproved: false,
    decisionPolicy: {},
    metrics,
    createdAt: new Date().toISOString(),
    revision: 1,
  }
}

export async function readStyleProfile(root, profileId) {
  const snap = await readJsonSnapshot(styleProfileFile(root, profileId))
  return snap.json
}

export async function listStyleProfiles(root) {
  let entries = []
  try {
    entries = await readdir(stylesRoot(root), { withFileTypes: true })
  } catch {
    return { ok: true, total: 0, profiles: [] }
  }
  const profiles = []
  for (const entry of entries) {
    if (!entry.isFile() || !/^sty_[a-f0-9]{16}\.json$/u.test(entry.name)) continue
    try {
      const profile = await readStyleProfile(root, entry.name.replace(/\.json$/u, ''))
      profiles.push({
        id: profile.id, name: profile.name, status: profile.status, version: profile.version,
        revision: profile.revision ?? 0, sourceRef: profile.sourceRef, bands: profile.bands, rules: profile.rules?.length ?? 0,
        ruleTexts: (profile.rules ?? []).map((rule) => String(rule?.text ?? '')).filter(Boolean).slice(0, 20),
        rulesDetail: styleRules(profile).slice(0, 50),
        historyCount: styleHistory(profile).length,
        ratings: ratingSummary(profile),
        quality: styleQuality(profile),
        readerPreference: profile.readerPreference ?? null,
        ratingNotes: (Array.isArray(profile.ratings) ? profile.ratings : []).slice(-5).map((item) => ({
          stars: Number(item.stars) || 0,
          by: item.by ?? 'author',
          note: String(item.note ?? ''),
          at: item.at ?? null,
        })),
        avoid: profile.identity?.avoid ?? [], decisionPolicy: profile.decisionPolicy ?? {},
        createdAt: profile.createdAt,
      })
    } catch {
      // 损坏档案跳过
    }
  }
  return { ok: true, total: profiles.length, profiles }
}

const RULE_STATUS = new Set(['confirmed', 'candidate', 'rejected'])

/** 规则统一读法：旧档案没有 status/weight 时按 confirmed/1 处理。 */
export function styleRules(profile) {
  return (Array.isArray(profile?.rules) ? profile.rules : []).map((rule, index) => ({
    id: String(rule?.id ?? `rule-${index + 1}`),
    text: String(rule?.text ?? ''),
    status: RULE_STATUS.has(rule?.status) ? rule.status : 'confirmed',
    weight: Number.isFinite(Number(rule?.weight)) ? Number(rule.weight) : 1,
    evidence: Array.isArray(rule?.evidence) ? rule.evidence : [],
    counterExamples: Array.isArray(rule?.counterExamples) ? rule.counterExamples : [],
    updatedAt: rule?.updatedAt ?? null,
  }))
}

function styleHistory(profile) {
  return Array.isArray(profile?.history) ? profile.history.slice(-50) : []
}

/** 档案质量验收：只看可核对项，不给文采打分。 */
export function styleQuality(profile) {
  const rules = styleRules(profile)
  const confirmed = rules.filter((rule) => rule.status === 'confirmed')
  const candidate = rules.filter((rule) => rule.status === 'candidate')
  const withoutEvidence = confirmed.filter((rule) => !rule.evidence.length)
  const issues = []
  if (profile.status !== 'confirmed') issues.push('profile-unconfirmed')
  if (confirmed.length === 0) issues.push('no-confirmed-rules')
  if (candidate.length > 0) issues.push('candidate-rules')
  if (withoutEvidence.length > 0) issues.push('rules-without-evidence')
  if (!profile.sourceRef?.sourceId) issues.push('missing-source')
  const score = Math.max(0, 100 - issues.length * 15)
  return { ok: issues.length === 0, score, issues, confirmed: confirmed.length, candidate: candidate.length, evidence: rules.reduce((sum, rule) => sum + rule.evidence.length, 0), withoutEvidence: withoutEvidence.length }
}

function mergeStyleRules(profile, rules) {
  const originals = new Map((Array.isArray(profile?.rules) ? profile.rules : []).map((rule) => [String(rule?.id ?? ''), rule]))
  return rules.map((rule) => ({ ...(originals.get(String(rule.id)) ?? {}), ...rule }))
}

async function writeStyleMutation(root, profileId, profile, entry, expectedRevision = null) {
  return withLock({ root, flowId: 'style-write' }, async () => {
    const current = await readStyleProfile(root, profileId)
    if (expectedRevision !== null && Number(current.revision ?? 0) !== Number(expectedRevision)) {
      throw new Error(`style-revision-stale：档案已是 revision ${current.revision ?? 0}`)
    }
    if (Number(current.revision ?? 0) !== Number(profile.revision ?? 0)) {
      throw new Error(`style-revision-stale：档案已是 revision ${current.revision ?? 0}`)
    }
    profile.revision = (Number(current.revision) || 0) + 1
    profile.updatedAt = new Date().toISOString()
    profile.history = [...styleHistory(profile), { ...entry, revision: profile.revision, at: profile.updatedAt }].slice(-50)
    await writeJsonAtomic(styleProfileFile(root, profileId), profile, { ensureDir: true })
    return { ok: true, profileId, revision: profile.revision, rule: entry.rule ?? null, history: profile.history }
  })
}

/** 移除档案：先从本书解绑，再把 profile JSON 移到 styles/trash/；来源与评分文件不删。 */
export async function removeStyleProfile({ root, profileId, book = null } = {}) {
  return withLock({ root, flowId: 'style-remove' }, async () => {
    const profile = await readStyleProfile(root, profileId)
    if (book) {
      const current = await readProjectSettings(root, String(book))
      if (current.activeStyleProfileIds.includes(String(profileId))) {
        await writeProjectSettingsUnlocked(root, String(book), {
          activeStyleProfileIds: current.activeStyleProfileIds.filter((id) => id !== String(profileId)),
        })
      }
    }
    // 只移动没有其它书引用的全局档案；共享档案仅从本书解绑，避免误伤别的书。
    let shared = false
    const projects = path.join(root, KIT_DIR, 'projects')
    let books = []
    try {
      books = (await readdir(projects, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    } catch {
      books = []
    }
    for (const name of books) {
      if (name === book) continue
      try {
        const settings = JSON.parse(await readFile(path.join(projects, name, 'settings.json'), 'utf8'))
        if (Array.isArray(settings.activeStyleProfileIds) && settings.activeStyleProfileIds.includes(profileId)) {
          shared = true
          break
        }
      } catch {
        // 没有 settings 或损坏都不算引用
      }
    }
    if (shared) return { ok: true, profileId, shared: true, movedTo: null, rules: styleRules(profile).length }
    const trash = path.join(stylesRoot(root), 'trash')
    await mkdir(trash, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/gu, '-')
    const target = path.join(trash, `${profileId}-${stamp}.json`)
    await rename(styleProfileFile(root, profileId), target)
    return { ok: true, profileId, shared: false, movedTo: target, rules: styleRules(profile).length }
  })
}

/** 重测：从原来源重算统计/bands，保留作者规则、评分、历史。 */
export async function remeasureStyle({ root, profileId } = {}) {
  const profile = await readStyleProfile(root, profileId)
  const sourceId = String(profile.sourceRef?.sourceId ?? '')
  if (!/^[a-f0-9]{64}$/u.test(sourceId)) throw new Error('档案没有可重测的来源')
  const text = await readSourceText(root, sourceId)
  let meta = null
  try {
    meta = JSON.parse(await readFile(path.join(root, KIT_DIR, 'sources', sourceId, 'meta.json'), 'utf8'))
  } catch {
    meta = null
  }
  if (meta && typeof meta.sha256 === 'string' && meta.sha256 && sha256Hex(text) !== meta.sha256) {
    throw new Error('风格来源内容与摄入时的 sha256 不符，拒绝重测')
  }
  const fresh = analyzeStyle(text, { sourceId, title: profile.name, book: profile.book || '' })
  profile.metrics = fresh.metrics
  profile.bands = fresh.bands
  profile.identity = { ...(profile.identity || {}), summary: fresh.identity.summary, keywords: profile.identity?.keywords ?? [] }
  profile.sourceRef = { ...(profile.sourceRef || {}), sourceId, sha256: sourceId }
  return writeStyleMutation(root, profileId, profile, { action: 'remeasure', sourceId }, profile.revision)
}

/** 作者改一条规则的确认状态/权重；不改正文。 */
export async function updateStyleRule({ root, profileId, ruleId, status, weight, text, expectedRevision = null } = {}) {
  const profile = await readStyleProfile(root, profileId)
  if (expectedRevision !== null && Number(expectedRevision) !== Number(profile.revision ?? 0)) {
    throw new Error(`style-revision-stale：档案已是 revision ${profile.revision ?? 0}`)
  }
  const rules = styleRules(profile)
  const index = rules.findIndex((rule) => rule.id === ruleId)
  if (index < 0) throw new Error('没有这条规则：' + ruleId)
  if (status !== undefined && !RULE_STATUS.has(status)) throw new Error('status 只能是 confirmed/candidate/rejected')
  if (weight !== undefined && (!Number.isFinite(Number(weight)) || Number(weight) < 0 || Number(weight) > 5)) throw new Error('weight 必须在 0–5')
  if (text !== undefined && !String(text).trim()) throw new Error('text 不能为空')
  const next = rules[index]
  if (status !== undefined) next.status = status
  if (weight !== undefined) next.weight = Number(weight)
  if (text !== undefined) next.text = String(text).trim()
  next.updatedAt = new Date().toISOString()
  profile.rules = mergeStyleRules(profile, rules)
  return writeStyleMutation(root, profileId, profile, { action: 'rule-update', ruleId, rule: next }, profile.revision)
}

/** 作者写给「读者偏好」的备注；不是跨作品统计，也不改规则。 */
export async function setStyleReaderPreference({ root, profileId, text = '', expectedRevision = null } = {}) {
  const profile = await readStyleProfile(root, profileId)
  if (expectedRevision !== null && Number(expectedRevision) !== Number(profile.revision ?? 0)) {
    throw new Error(`style-revision-stale：档案已是 revision ${profile.revision ?? 0}`)
  }
  const clean = String(text ?? '').trim().slice(0, 2000)
  profile.readerPreference = { text: clean, updatedAt: new Date().toISOString() }
  return writeStyleMutation(root, profileId, profile, { action: 'reader-preference' }, profile.revision)
}

/** 学习候选：模型/作者新增一条待确认规则，不直接进简报。 */
export async function addStyleCandidate({ root, profileId, text, evidence = [], expectedRevision = null } = {}) {
  const profile = await readStyleProfile(root, profileId)
  if (expectedRevision !== null && Number(expectedRevision) !== Number(profile.revision ?? 0)) {
    throw new Error(`style-revision-stale：档案已是 revision ${profile.revision ?? 0}`)
  }
  const clean = String(text ?? '').trim()
  if (!clean) throw new Error('候选规则不能为空')
  const rules = styleRules(profile)
  const id = `cand-${sha256Hex(clean).slice(0, 10)}`
  if (rules.some((rule) => rule.id === id)) return { ok: true, idempotent: true, profileId, ruleId: id, revision: profile.revision }
  const rule = { id, text: clean, status: 'candidate', weight: 1, evidence: Array.isArray(evidence) ? evidence.slice(0, 20) : [], updatedAt: new Date().toISOString() }
  profile.rules = mergeStyleRules(profile, [...rules, rule])
  const written = await writeStyleMutation(root, profileId, profile, { action: 'candidate-add', ruleId: id, rule }, profile.revision)
  return { ...written, idempotent: false }
}

/** 档案历史（最近 50 条作者操作）。 */
export async function readStyleHistory({ root, profileId } = {}) {
  const profile = await readStyleProfile(root, profileId)
  return { ok: true, profileId, revision: profile.revision ?? 0, history: styleHistory(profile) }
}


export function compileStyleBrief(profile, { maxChars = 600 } = {}) {
  if (!profile || typeof profile !== 'object') return { available: false, markdown: '', chars: 0 }
  const lines = []
  lines.push(`### 文风档案（${profile.name || profile.id} v${profile.version ?? '?'}，${profile.status ?? 'provisional'}）`)
  if (profile.identity?.summary) lines.push(String(profile.identity.summary))
  const bands = []
  for (const [key, label] of BAND_KEYS) {
    const band = profile.bands?.[key]?.band
    if (Array.isArray(band) && band.length === 2) bands.push(`${label} ${band[0]}–${band[1]}`)
  }
  if (bands.length) lines.push(bands.join('；'))
  const rules = styleRules(profile)
    .filter((rule) => rule.status === 'confirmed')
    .sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id))
    .map((rule) => rule.text)
    .filter(Boolean)
  if (rules.length) lines.push('规则：' + rules.slice(0, 6).join('；'))
  if (profile.identity?.avoid?.length) lines.push('避免：' + profile.identity.avoid.slice(0, 12).join('、'))
  if (profile.anchorsApproved && profile.anchors?.length) {
    lines.push('锚句：' + profile.anchors.slice(0, 3).map((anchor) => String(anchor?.text ?? '')).filter(Boolean).join(' / '))
  }
  const dp = profile.decisionPolicy ?? {}
  const policy = []
  if (dp.restraint) policy.push(`克制=${dp.restraint}`)
  if (dp.revealPace) policy.push(`揭示=${dp.revealPace}`)
  if (dp.emotionalTemperature) policy.push(`温度=${dp.emotionalTemperature}`)
  if (dp.dialogueBias) policy.push(`对话/动作=${dp.dialogueBias}`)
  if (dp.endingTendency) policy.push(`收束=${dp.endingTendency}`)
  if (policy.length) lines.push('决策倾向：' + policy.join('；'))
  const text = lines.join('\n')
  const markdown = text.length <= maxChars ? text : `${text.slice(0, Math.max(0, maxChars - 1))}…`
  return { available: true, markdown, chars: markdown.length, truncated: markdown.length < text.length, profileId: profile.id, status: profile.status }
}

/**
 * 门 A：学文笔。摄入共用原文，生成 provisional StyleProfile 并绑定到项目。
 * @param {{root:string, book:string, file:string, title?:string}} input
 */
export async function importStyle({ root, book, file, title = '' }) {
  assertSafeName(book, 'book')
  const source = await ingestSource({ root, file, title })
  const profileId = styleProfileId(source.sourceId)
  let profile
  let reused = false
  try {
    profile = await readStyleProfile(root, profileId)
    reused = true
  } catch {
    const text = await readSourceText(root, source.sourceId)
    profile = analyzeStyle(text, { sourceId: source.sourceId, title: title || source.title, book })
    await writeJsonAtomic(styleProfileFile(root, profile.id), profile, { ensureDir: true })
  }
  const settings = await bindStyleProfile(root, book, profile.id)
  return {
    ok: true,
    kind: 'style',
    sourceId: source.sourceId,
    idempotent: source.idempotent === true || reused,
    reused,
    profileId: profile.id,
    profile,
    settings,
    message: reused
      ? '已有文风档案：保留作者确认/规则/decisionPolicy，不覆盖。'
      : '已生成 provisional 文风档案；作者确认/补规则前，它只会按统计 bands 约束文笔。',
  }
}

/** 给测试/诊断用：读原文再算一次，确认档案可重建。 */
export async function rebuildStyle(root, sourceId, { title = '', book = '' } = {}) {
  const text = await readFile(path.join(root, KIT_DIR, 'sources', sourceId, 'raw.txt'), 'utf8')
  return analyzeStyle(text, { sourceId, title, book })
}

/**
 * 决策提示：把已审核的规则/decisionPolicy 变成一段人话。
 * 没有规则就不猜；不输出百分比。
 */
export function compileDecisionHint(profiles = []) {
  const list = Array.isArray(profiles) ? profiles.filter(Boolean) : []
  const rules = list
    .flatMap((profile) => styleRules(profile))
    .filter((rule) => rule.status === 'confirmed')
    .sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id))
    .map((rule) => rule.text)
    .filter(Boolean)
  const policy = list
    .filter((profile) => (profile.status ?? 'confirmed') === 'confirmed')
    .map((profile) => profile.decisionPolicy ?? {})
    .find((item) => Object.keys(item).length > 0) ?? {}
  const parts = []
  if (policy.restraint) parts.push(`克制=${policy.restraint}`)
  if (policy.revealPace) parts.push(`揭示=${policy.revealPace}`)
  if (policy.emotionalTemperature) parts.push(`温度=${policy.emotionalTemperature}`)
  if (policy.dialogueBias) parts.push(`对话/动作=${policy.dialogueBias}`)
  if (policy.endingTendency) parts.push(`收束=${policy.endingTendency}`)
  if (rules.length) parts.push('规则：' + rules.slice(0, 4).join('；'))
  if (parts.length === 0) return ''
  return `文风决策提示（${parts.join('；')}）。只影响候选措辞与推荐，不能压过 canon/作者指令。`
}

const DIRECT = /(直接|说破|揭穿|公开|摊牌|全说出来)/u
const RESTRAINED = /(沉默|留白|半真|旁敲|暗示|不说|改口)/u

/**
 * 给提案选项做轻量、可解释的文风标注。
 * - 不覆盖模型已给的 styleFit；
 * - 只做规则/avoid/decisionPolicy 能说清的事；
 * - 不输出百分比，不替作者选择。
 */
export function annotateProposal(proposal, profiles = []) {
  if (!proposal || typeof proposal !== 'object') return proposal
  const list = Array.isArray(profiles) ? profiles.filter(Boolean) : []
  if (list.length === 0) return proposal
  const avoid = new Set(list.flatMap((profile) => profile.identity?.avoid ?? []).map((word) => String(word)))
  const taboo = new Set(list.flatMap((profile) => profile.decisionPolicy?.tabooMoves ?? []).map((word) => String(word)))
  const policy = list.map((profile) => profile.decisionPolicy ?? {}).find((item) => Object.keys(item).length > 0) ?? {}
  const options = (Array.isArray(proposal.options) ? proposal.options : []).map((option) => {
    if (option?.styleFit) return option
    const text = `${option?.label ?? ''} ${option?.impact ?? ''}`
    const avoidHit = [...avoid].find((word) => word && text.includes(word))
    const tabooHit = [...taboo].find((word) => word && text.includes(word))
    if (avoidHit || tabooHit) {
      return { ...option, styleFit: 'low', styleWhy: `命中${avoidHit ? '避免词' : '作者禁忌'}「${avoidHit || tabooHit}」` }
    }
    if (policy.revealPace === 'slow' && DIRECT.test(text)) {
      return { ...option, styleFit: 'low', styleWhy: '揭示太快，不符合档案的慢揭示倾向' }
    }
    if (policy.restraint === 'high' && RESTRAINED.test(text)) {
      return { ...option, styleFit: 'high', styleWhy: '更克制/留白，贴近档案的克制倾向' }
    }
    return option
  })
  return { ...proposal, options }
}
