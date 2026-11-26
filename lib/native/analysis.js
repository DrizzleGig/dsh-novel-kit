// kit 全书只读分析：把决策/记忆/媒体/人物卡/runbook 的当前状态汇成一页。
// 纯函数，不写文件；不跨书聚合，不输出作品总分。
import { decisionGate } from './decisions.js'

function countBy(items, key) {
  const out = {}
  for (const item of Array.isArray(items) ? items : []) {
    const value = String(item?.[key] ?? 'unknown')
    out[value] = (out[value] ?? 0) + 1
  }
  return out
}

export function analyzeBook({ bookId = null, decisions = null, memory = null, media = null, personas = null, runs = [] } = {}) {
  const decisionsList = Array.isArray(decisions?.decisions) ? decisions.decisions : []
  const requests = Array.isArray(decisions?.requests) ? decisions.requests : []
  const answers = Array.isArray(decisions?.answers) ? decisions.answers : []
  const cards = Array.isArray(memory?.cards) ? memory.cards : []
  const stubs = Array.isArray(memory?.archive?.stubs) ? memory.archive.stubs : []
  const evidence = Array.isArray(media?.evidence) ? media.evidence : []
  const personaList = Array.isArray(personas?.personas) ? personas.personas : []
  const runList = Array.isArray(runs) ? runs : []
  const gate = decisions ? decisionGate(decisions) : { ok: true, errors: 0, warnings: 0, issues: [] }

  return {
    ok: true,
    bookId,
    decisions: {
      total: decisionsList.length,
      committed: decisionsList.filter((item) => item?.status === 'committed').length,
      requests: requests.length,
      unanswered: requests.filter((item) => item?.status !== 'answered').length,
      answers: answers.length,
      gateOk: gate.ok === true,
      gateErrors: gate.errors ?? 0,
      gateWarnings: gate.warnings ?? 0,
    },
    memory: {
      cards: cards.length,
      pinned: cards.filter((item) => item?.pinned === true || item?.lifecycle?.status === 'protected').length,
      archived: stubs.length,
      chapters: new Set(cards.map((item) => Number(item?.chapter) || 0)).size,
      revision: memory?.revision ?? 0,
    },
    media: {
      sources: Array.isArray(media?.sources) ? media.sources.length : 0,
      evidence: evidence.length,
      byStatus: countBy(evidence, 'status'),
      byKind: countBy(evidence, 'kind'),
      byClaim: countBy(evidence, 'claimType'),
    },
    personas: {
      total: personaList.length,
      proposed: personaList.filter((item) => item?.status === 'proposed').length,
      confirmed: personaList.filter((item) => item?.status === 'confirmed').length,
    },
    runs: {
      total: runList.length,
      running: runList.filter((item) => item?.status === 'running').length,
      completed: runList.filter((item) => item?.status === 'completed').length,
      failed: runList.filter((item) => item?.status === 'failed').length,
    },
    warnings: gate.issues ?? [],
  }
}
