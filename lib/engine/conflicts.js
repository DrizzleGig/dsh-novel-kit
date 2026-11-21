// 冲突扫描：beat 的 canon（作者拍过板的）vs fanfic 原著事实（别人写下的世界）。
//
// 只报告，不裁决：两边都给出章号/引文/决策 id，作者在拥有数据的插件里改。
// 匹配键 = 主体 + 谓词（beat: entity/key，fanfic: subjectName/predicate）。
import { readBeat, readFanficCanon } from '../repositories/ledger.js'
import { resolveBinding } from './binding.js'

const norm = (value) => String(value ?? '').trim()

/**
 * @param {object|null} beat decodeBeat 视图
 * @param {object|null} canon decodeFanficCanon 视图
 */
export function scanConflicts(beat, canon) {
  if (!beat || !canon) return { available: false, conflicts: [], total: 0, reason: '缺少 beat 或 fanfic 账本' }
  const book = new Map()
  for (const fact of canon.facts ?? []) {
    if ((fact.status ?? 'confirmed') !== 'confirmed') continue
    const key = norm(fact.subjectName) + '|' + norm(fact.predicate)
    if (!fact.subjectName || !fact.predicate) continue
    if (!book.has(key)) book.set(key, fact)
  }
  const conflicts = []
  for (const item of beat.canon ?? []) {
    const key = norm(item.entity) + '|' + norm(item.key)
    const fact = book.get(key)
    if (!fact) continue
    const beatValue = norm(item.value)
    const fanficValue = norm(fact.object)
    if (!beatValue || !fanficValue) continue
    if (beatValue === fanficValue) continue
    conflicts.push({
      entity: item.entity,
      key: item.key,
      beat: { value: beatValue, chapter: item.chapter ?? null, decisionId: item.decisionId ?? null },
      fanfic: { value: fanficValue, chapter: fact.chapter ?? null, quote: fact.quote ?? '', factId: fact.id ?? null },
    })
  }
  return { available: true, conflicts, total: conflicts.length }
}

/** 从工作区读两本账再扫描。 */
export async function collectConflicts({ root, book, project = null }) {
  const binding = await resolveBinding(root, book)
  const beatView = binding.beatBook ? await readBeat(root, binding.beatBook).catch(() => null) : null
  const projectName = project ?? binding.fanficProject
  const canon = projectName ? await readFanficCanon(root, projectName).catch(() => null) : null
  if (!beatView || !canon) return { available: false, conflicts: [], total: 0, reason: '缺少 beat 或 fanfic 账本' }
  return scanConflicts(beatView, canon)
}
