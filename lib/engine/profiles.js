// 文风档案：从导入作品里提炼「怎么写」的可复用档案。
//
// 0.2.0 第一版只做确定性统计（句长/段长/对话比/抽象词/解释词）与少量可解释规则；
// 规则/锚句/decisionPolicy 的高级归纳留给下一轮，档案先标 provisional，作者确认后才 confirmed。
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { readJsonSnapshot, writeJsonAtomic } from '../storage/atomic-json.js'
import { textMetrics } from './metrics.js'
import { KIT_DIR, bindStyleProfile } from './settings.js'
import { ingestSource, readSourceText } from './sources.js'
import { sha256Hex } from './source-text.js'
import { assertSafeName } from '../workspace.js'

export const STYLE_SCHEMA_VERSION = 1

const styleLocks = new Map()
async function withStyleLock(key, task) {
  const previous = styleLocks.get(key) ?? Promise.resolve()
  const run = previous.then(task, task)
  const tail = run.catch(() => {})
  styleLocks.set(key, tail)
  try {
    return await run
  } finally {
    if (styleLocks.get(key) === tail) styleLocks.delete(key)
  }
}

/** 作者确认文风档案：从 provisional 变成 confirmed；重复确认幂等。 */
export async function confirmStyleProfile({ root, profileId, expectedRevision = null }) {
  const file = styleProfileFile(root, profileId)
  return withStyleLock(String(profileId), async () => {
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
export async function readStyleProfileSummary(root, profileId) {
  const snap = await readJsonSnapshot(styleProfileFile(root, profileId))
  const profile = snap.json
  return {
    id: profile.id, name: profile.name, status: profile.status, revision: profile.revision ?? 0,
    rules: (profile.rules ?? []).length, avoid: profile.identity?.avoid ?? [], decisionPolicy: profile.decisionPolicy ?? {},
  }
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
        avoid: profile.identity?.avoid ?? [], decisionPolicy: profile.decisionPolicy ?? {},
        createdAt: profile.createdAt,
      })
    } catch {
      // 损坏档案跳过
    }
  }
  return { ok: true, total: profiles.length, profiles }
}

/** 编译 ≤ maxChars 的文风简报；没有审核过的锚句就不注入原文。 */
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
  const rules = (profile.rules ?? []).map((rule) => String(rule?.text ?? '')).filter(Boolean)
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
  const rules = list.flatMap((profile) => (profile.rules ?? []).map((rule) => String(rule?.text ?? '')).filter(Boolean))
  const policy = list.map((profile) => profile.decisionPolicy ?? {}).find((item) => Object.keys(item).length > 0) ?? {}
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
