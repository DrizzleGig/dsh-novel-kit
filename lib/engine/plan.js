// 本章场景计划：kit 自有业务事实，放在 .dsh-novel-kit/plans/<book>/<chapter>.json。
// 场景是创作计划；beat 的 segment 是正文范围与版本证据，两者不混。
import path from 'node:path'
import { KIT_DIR } from './settings.js'
import { assertSafeName } from '../workspace.js'
import { readJsonSnapshot, writeJsonAtomic } from '../storage/atomic-json.js'

export const PLAN_SCHEMA_VERSION = 1
const MAX_SCENES = 24
const STATUSES = new Set(['planned', 'writing', 'done'])

export function plansRoot(root) {
  return path.join(root, KIT_DIR, 'plans')
}

export function planFile(root, book, chapter) {
  assertSafeName(book, 'book')
  const number = Number(chapter)
  if (!Number.isInteger(number) || number < 1) throw new Error('chapter 必须是正整数')
  return path.join(plansRoot(root), book, `${number}.json`)
}

const text = (value, max = 2000) => String(value ?? '').trim().slice(0, max)

function normalizeScene(scene, index) {
  const id = text(scene?.id, 120) || `scene-${index + 1}`
  return {
    id,
    order: Number.isFinite(Number(scene?.order)) ? Number(scene.order) : index + 1,
    title: text(scene?.title, 160) || `场景 ${index + 1}`,
    goal: text(scene?.goal, 800),
    conflict: text(scene?.conflict, 800),
    turn: text(scene?.turn, 800),
    exit: text(scene?.exit, 800),
    cast: Array.isArray(scene?.cast) ? scene.cast.map((item) => text(item, 80)).filter(Boolean).slice(0, 20) : [],
    evidenceRefs: Array.isArray(scene?.evidenceRefs) ? scene.evidenceRefs.map((item) => text(item, 160)).filter(Boolean).slice(0, 20) : [],
    targetChars: Number.isFinite(Number(scene?.targetChars)) ? Math.max(0, Number(scene.targetChars)) : 0,
    status: STATUSES.has(scene?.status) ? scene.status : 'planned',
  }
}

export async function readChapterPlan({ root, book, chapter }) {
  const file = planFile(root, book, chapter)
  try {
    const snap = await readJsonSnapshot(file)
    const raw = snap.json && typeof snap.json === 'object' ? snap.json : {}
    return {
      available: true,
      book,
      chapter: Number(chapter),
      revision: Number.isFinite(Number(raw.revision)) ? Number(raw.revision) : 0,
      intent: text(raw.intent, 1200),
      pov: text(raw.pov, 80),
      time: text(raw.time, 120),
      place: text(raw.place, 160),
      scenes: Array.isArray(raw.scenes) ? raw.scenes.slice(0, MAX_SCENES).map(normalizeScene) : [],
      updatedAt: raw.updatedAt ?? null,
      hash: snap.hash,
    }
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { available: false, book, chapter: Number(chapter), revision: 0, intent: '', pov: '', time: '', place: '', scenes: [], updatedAt: null, hash: null }
    }
    throw error
  }
}

export async function saveChapterPlan({ root, book, chapter, intent = '', pov = '', time = '', place = '', scenes = [], expectedRevision = null }) {
  const current = await readChapterPlan({ root, book, chapter })
  if (expectedRevision !== null && Number(expectedRevision) !== current.revision) {
    return { ok: false, code: 'plan-conflict', message: '场景计划已被修改，请刷新后再保存。', currentRevision: current.revision }
  }
  if (!Array.isArray(scenes)) return { ok: false, code: 'invalid-scenes', message: 'scenes 必须是数组。' }
  const next = {
    schemaVersion: PLAN_SCHEMA_VERSION,
    book,
    chapter: Number(chapter),
    revision: current.revision + 1,
    intent: text(intent, 1200),
    pov: text(pov, 80),
    time: text(time, 120),
    place: text(place, 160),
    scenes: scenes.slice(0, MAX_SCENES).map(normalizeScene),
    updatedAt: new Date().toISOString(),
  }
  const file = planFile(root, book, chapter)
  await writeJsonAtomic(file, next, { ensureDir: true })
  return { ok: true, plan: next }
}

/** 只读写前 brief：场景 + 目标，不写正文，不替代四段依据。 */
export function compilePlanBrief(plan, { maxChars = 1200 } = {}) {
  if (!plan || !Array.isArray(plan.scenes) || plan.scenes.length === 0) {
    return { available: false, markdown: '', chars: 0 }
  }
  const lines = [`### 本章场景（第 ${plan.chapter} 章，rev ${plan.revision}）`]
  if (plan.intent) lines.push(`意图：${plan.intent}`)
  if (plan.pov) lines.push(`视角：${plan.pov}`)
  if (plan.place) lines.push(`地点：${plan.place}`)
  for (const scene of plan.scenes) {
    lines.push(`- ${scene.title}${scene.targetChars ? `（目标 ${scene.targetChars} 字）` : ''}`)
    if (scene.goal) lines.push(`  目标：${scene.goal}`)
    if (scene.conflict) lines.push(`  冲突：${scene.conflict}`)
    if (scene.turn) lines.push(`  转折：${scene.turn}`)
    if (scene.exit) lines.push(`  出口：${scene.exit}`)
    if (scene.cast.length) lines.push(`  出场：${scene.cast.join('、')}`)
  }
  let markdown = lines.join('\n')
  if (markdown.length > maxChars) markdown = markdown.slice(0, Math.max(0, maxChars - 1)) + '…'
  return { available: true, markdown, chars: markdown.length, revision: plan.revision }
}
