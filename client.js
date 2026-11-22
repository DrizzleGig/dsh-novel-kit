// dsh-novel-kit 的 Web 半：右栏「小说」面板 + 会话头入口。
//
// 只做展示与导航：数据来自 novelKitPanel remote（Host 只读快照），不读文件、
// 不执行任何命令（commands.execute 会往会话日志写行，0.2.3 的教训）。
window.__ModuleLoader__.load({
  id: 'dsh-novel-kit',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const TAB_ID = 'novel-kit'
    const KIND = 'novel-kit'
    const LABEL = '小说'

    // —— panel remote 契约（与 lib/host/remote-contract.js 对齐）——
    const scalar = (validate) => ({
      parse(value) { validate(value); return value },
      safeParse(value) {
        try { validate(value); return { success: true, data: value } } catch (error) { return { success: false, error } }
      },
    })
    const codec = (typeSymbol, schema) => ({ mode: 'strict', typeSymbol, create: () => schema })
    const param = (name, schema) => ({ name, wire: name, source: 'json', codec: codec(name, schema) })
    const sessionIdSchema = scalar((v) => { if (typeof v !== 'string' || !v) throw new Error('sessionId must be a non-empty string') })
    const requestSchema = scalar((v) => { if (v !== undefined && v !== null && (typeof v !== 'object' || Array.isArray(v))) throw new Error('request must be a plain object') })
    const TYPERT_REMOTE = {
      package: 'dsh-novel-kit',
      descriptors: [
        { method: 'identity', parameters: [param('sessionId', sessionIdSchema)] },
        { method: 'getSnapshot', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
        { method: 'getDiagnostics', parameters: [param('sessionId', sessionIdSchema)] },
        { method: 'getDecisions', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
        { method: 'getMemory', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
        { method: 'getStyle', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
        { method: 'getCanon', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
        { method: 'decide', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
        { method: 'memoryAction', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
        { method: 'searchMemory', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
        { method: 'importSource', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
        { method: 'listSourceFiles', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
        { method: 'takeover', parameters: [param('sessionId', sessionIdSchema)] },
        { method: 'restore', parameters: [param('sessionId', sessionIdSchema)] },
        { method: 'getSettings', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
        { method: 'setMaster', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
        { method: 'setMode', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
        { method: 'importStyle', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
        { method: 'confirmStyle', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
        { method: 'importCanon', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
        { method: 'listSources', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
        { method: 'listStyleProfiles', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
        { method: 'createBook', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
        { method: 'startChapter', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
        { method: 'getDraft', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
        { method: 'saveDraft', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
        { method: 'updateCanon', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
        { method: 'confirmCanon', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
      ].map(({ method, parameters }) => ({
        id: 'dsh-novel-kit#novelKitPanel/' + method,
        namespace: 'novelKitPanel',
        service: 'novelKitPanel',
        method,
        invocation: { kind: 'direct' },
        parameters,
        result: codec('KitPanelPayload', scalar(() => {})),
      })),
    }

    const c = {
      text: 'var(--dsw-alias-label-primary)',
      sub: 'var(--dsw-alias-label-secondary)',
      faint: 'var(--dsw-alias-label-tertiary)',
      border: 'var(--dsw-alias-border-l1)',
      base: 'var(--dsw-alias-bg-base)',
      layer: 'var(--dsw-alias-bg-layer-1)',
      brand: 'var(--dsw-alias-brand-primary)',
      onBrand: 'var(--dsw-alias-label-primary-foreground, #fff)',
      hover: 'var(--dsw-alias-interactive-bg-hover)',
      error: 'var(--dsw-alias-state-error-primary)',
      warning: 'var(--dsw-alias-state-warning-primary, #c58a16)',
      success: 'var(--dsw-alias-state-success-primary)',
    }

    const row = { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, padding: '5px 0', borderBottom: '1px solid ' + c.border }
    const faint = { color: c.faint, fontSize: 11 }
    const small = { color: c.sub, fontSize: 12, lineHeight: 1.5 }

    function unwrap(rpc) {
      if (rpc && rpc.ok === false) {
        const reason = rpc.error ? (rpc.error.message || rpc.error.code) : '未知错误'
        throw new Error('面板读取失败：' + String(reason || ''))
      }
      return rpc && typeof rpc === 'object' && 'value' in rpc ? rpc.value : rpc
    }

    /** 右栏与工作台共用同一套「下一笔」判断，避免两边给出不同主行动。 */
    function deriveNextAction({ session = null, data = null, lastChapter = 0 } = {}) {
      const pending = session && Array.isArray(session.pendingDecisionIds) ? session.pendingDecisionIds.length : 0
      const chapter = session
        ? (session.state === 'completed' ? Number(session.chapter) + 1 : Number(session.chapter))
        : Number(lastChapter) + 1
      if (!session) {
        return { kind: 'start', chapter, title: '开始一章', detail: '点下方按钮装配四段依据；也可以先在聊天里计划。' }
      }
      if (pending > 0) {
        return { kind: 'decide', chapter, title: '先拍板 ' + pending + ' 个提案', detail: '作者确认后模型才能继续收尾；去「故事 → 拍板」处理。' }
      }
      if (session.verification && session.verification.blockers > 0) {
        return { kind: 'blockers', chapter, title: '先修 ' + session.verification.blockers + ' 个 blocker', detail: '收尾会被拦下；先看检查详情，再回正文修改。' }
      }
      if (session.state === 'completed') {
        return { kind: 'start', chapter, title: '本章已落账，开下一章', detail: '第 ' + session.chapter + ' 章已完成；下一章从新的计划开始。' }
      }
      if (session.draft) {
        return { kind: 'write', chapter, title: '继续写第 ' + session.chapter + ' 章', detail: (session.draft.chars || 0) + ' 字 · ' + session.state + '；保存后旧检查作废。' }
      }
      return { kind: 'write', chapter, title: '写第 ' + session.chapter + ' 章', detail: '依据已装配，打开工作台的章节页开始写。' }
    }

    function Panel(props) {
      const { sessionId, remote, layout } = props
      const [state, setState] = React.useState({ phase: 'loading', data: null, diag: null, error: null })
      const [book, setBook] = React.useState('')
      const [mode, setMode] = React.useState('task')
      const [pendingTakeover, setPendingTakeover] = React.useState(false)
      const [pendingCanon, setPendingCanon] = React.useState(false)
      const [details, setDetails] = React.useState(false)
      const [settingsOpen, setSettingsOpen] = React.useState(false)
      const [startPhase, setStartPhase] = React.useState('idle')
      const [newBook, setNewBook] = React.useState('')
      const [canonEdit, setCanonEdit] = React.useState(null)
      const [action, setAction] = React.useState({ phase: 'idle', message: '' })
      const [tab, setTab] = React.useState('overview')
      const [tabData, setTabData] = React.useState({})
      const [pendingDecision, setPendingDecision] = React.useState(null)
      const [query, setQuery] = React.useState('')
      const [importPath, setImportPath] = React.useState('')
      const [searchHits, setSearchHits] = React.useState(null)

      const openTab = React.useCallback(async function (name) {
        setTab(name)
        if (name === 'overview' || name === 'conflicts') return
        try {
          const activeBook = book || (state.data && state.data.book) || null
          const pending = name === 'decisions'
            ? remote.getDecisions(sessionId, { book: activeBook })
            : name === 'memory'
              ? remote.getMemory(sessionId, { book: activeBook, limit: 40, currentChapter: state.data && state.data.session ? state.data.session.chapter : null })
              : name === 'style'
                ? remote.getStyle(sessionId, { book: activeBook })
                : remote.getCanon(sessionId, { book: activeBook })
          const value = await Promise.resolve(pending).then(unwrap)
          setTabData((prev) => ({ ...prev, [name]: value }))
        } catch (error) {
          setTabData((prev) => ({ ...prev, [name]: { error: String(error?.message ?? error) } }))
        }
      }, [remote, sessionId, book, state.data])

      const runDecide = React.useCallback(async function (proposalId, option, action = 'adopt') {
        const chapterSessionId = state.data && state.data.session ? state.data.session.id : null
        if (!chapterSessionId) {
          setAction({ phase: 'error', message: '没有活动章节会话，无法写拍板账' })
          return
        }
        setPendingDecision(null)
        setAction({ phase: 'busy', message: '' })
        try {
          const result = await Promise.resolve(remote.decide(sessionId, { chapterSessionId, proposalId, action, option })).then(unwrap)
          setAction({
            phase: 'done',
            message: action === 'reject'
              ? (result.idempotent ? '这条已经处理过' : '已拒绝这个提案')
              : (result.written ? '已记录选择（设定生效以对应账本为准）' : (result.idempotent ? '这条已经拍过了' : '未写入')),
          })
          setTabData((prev) => { const next = { ...prev }; delete next.decisions; return next })
          await openTab('decisions')
        } catch (error) {
          setAction({ phase: 'error', message: String(error?.message ?? error) })
        }
      }, [remote, sessionId, state.data, openTab])

      const runSearch = React.useCallback(async function () {
        const term = query.trim()
        if (!term) { setSearchHits(null); return }
        const activeBook = book || (state.data && state.data.book) || null
        try {
          const result = await Promise.resolve(remote.searchMemory(sessionId, { book: activeBook, query: term, limit: 40 })).then(unwrap)
          setSearchHits(result)
        } catch (error) {
          setAction({ phase: 'error', message: String(error?.message ?? error) })
        }
      }, [remote, sessionId, book, state.data, query])

      const runMemory = React.useCallback(async function (cardId, memoryAction) {
        const activeBook = book || (state.data && state.data.book) || null
        if (!activeBook) { setAction({ phase: 'error', message: '没有书，无法改记忆' }); return }
        setAction({ phase: 'busy', message: '' })
        try {
          await Promise.resolve(remote.memoryAction(sessionId, { book: activeBook, cardId, action: memoryAction })).then(unwrap)
          setAction({ phase: 'done', message: memoryAction === 'pin' ? '已钉住' : memoryAction === 'forget' ? '已遗忘' : '已恢复' })
          setTabData((prev) => { const next = { ...prev }; delete next.memory; return next })
          await openTab('memory')
        } catch (error) {
          setAction({ phase: 'error', message: String(error?.message ?? error) })
        }
      }, [remote, sessionId, book, state.data, openTab])

      function renderTab() {
        if (tab === 'conflicts') {
          const conflictData = (state.data && state.data.conflicts) || { available: false, total: 0, items: [] }
          if (!conflictData.available) return h('div', { style: faint }, '缺少 beat 或同人账本，无法比对')
          if (!conflictData.total) return h('div', { style: faint }, '没有发现同键不同值的冲突')
          return h('div', null,
            h('div', { style: faint }, '冲突 ' + conflictData.total + ' 条（只报告，不裁决）'),
            conflictData.items.map((item, index) => h('div', { key: index, style: { padding: '4px 0', borderBottom: '1px solid ' + c.border } },
              h('div', { style: small }, item.entity + ' · ' + item.key),
              h('div', { style: { color: c.sub, fontSize: 11 } }, 'beat：' + item.beat.value + '（ch' + (item.beat.chapter ?? '-') + (item.beat.decisionId ? ' · ' + item.beat.decisionId : '') + '）'),
              h('div', { style: { color: c.faint, fontSize: 11 } }, '原著：' + item.fanfic.value + '（' + (item.fanfic.chapter ?? '-') + '）'),
            )))
        }        const value = tabData[tab]
        if (!value) return h('div', { style: faint }, '加载中…')
        if (value.error) return h('div', { style: { color: c.error, fontSize: 11.5 } }, value.error)
        if (tab === 'decisions') {
          if (!value.available) return h('div', { style: faint }, '没有 beat 账本与会话')
          return h('div', null,
            h('div', { style: faint }, '第 ' + value.chapter + ' 章 · 已拍板 ' + value.committed.length + ' · 待拍板 ' + value.pendingCount + ' · 未回收义务 ' + value.openObligations),
            value.intent ? h('div', { style: small }, '意图：' + value.intent) : null,
            value.proposals.length
              ? h('div', { style: { marginTop: 4 } },
                  value.styleHint ? h('div', { style: { ...faint, marginBottom: 3 } }, value.styleHint) : null,
                  h('div', { style: faint }, '待拍板'),
                  value.proposals.map((item) => h('div', { key: item.id, style: { padding: '4px 0', borderBottom: '1px solid ' + c.border } },
                    h('div', { style: small }, item.title || item.id),
                    item.options.length
                      ? h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 } },
                          item.options.map((option, index) => h('button', {
                            key: index,
                            type: 'button',
                            onClick: function () { setPendingDecision({ proposalId: item.id, option: option.label, action: 'adopt' }) },
                            style: {
                              appearance: 'none', border: '1px solid ' + (pendingDecision && pendingDecision.proposalId === item.id && pendingDecision.option === option.label ? c.brand : c.border),
                              background: 'transparent', color: c.sub, borderRadius: 6, padding: '1px 8px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                            },
                          }, option.label)))
                      : null,
                    item.options.map((option, index) => h('div', { key: 'i' + index, style: { color: c.faint, fontSize: 11 } },
                      '· ' + option.label + (option.impact ? '：' + option.impact : '') + (option.styleFit ? ' · 文风 ' + option.styleFit + (option.styleWhy ? '（' + option.styleWhy + '）' : '') : ''))),
                    h('button', {
                      type: 'button',
                      onClick: function () { setPendingDecision({ proposalId: item.id, option: '', action: 'reject' }) },
                      style: { appearance: 'none', border: 'none', background: 'transparent', color: c.faint, padding: 0, marginTop: 2, fontSize: 10.5, cursor: 'pointer', fontFamily: 'inherit' },
                    }, '拒绝这个提案'),
                    pendingDecision && pendingDecision.proposalId === item.id
                      ? h('div', { style: { display: 'flex', gap: 6, marginTop: 3, alignItems: 'center' } },
                          h('span', { style: { color: c.faint, fontSize: 11 } }, pendingDecision.action === 'reject' ? '确认拒绝这个提案？' : '确认记录「' + pendingDecision.option + '」？'),
                          h('button', {
                            type: 'button',
                            onClick: function () { runDecide(item.id, pendingDecision.option, pendingDecision.action) },
                            style: { appearance: 'none', border: '1px solid ' + c.brand, background: 'transparent', color: c.text, borderRadius: 6, padding: '1px 8px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' },
                          }, '确认'),
                          h('button', {
                            type: 'button',
                            onClick: function () { setPendingDecision(null) },
                            style: { appearance: 'none', border: '1px solid ' + c.border, background: 'transparent', color: c.sub, borderRadius: 6, padding: '1px 8px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' },
                          }, '取消'))
                      : null,
                  )))
              : null,
            value.committed.length
              ? h('div', { style: { marginTop: 4 } }, h('div', { style: faint }, '已拍板'),
                  value.committed.map((item) => h('div', { key: item.id, style: { padding: '3px 0', borderBottom: '1px solid ' + c.border } },
                    h('div', { style: small }, item.title || item.id),
                    h('div', { style: { color: c.faint, fontSize: 11 } }, item.change),
                  )))
              : null,
          )
        }
        if (tab === 'memory') {
          if (!value.available) return h('div', { style: faint }, '没有 fade 记忆账本')
          const rows = searchHits
            ? searchHits.hits.map((card) => h('div', { key: card.id, style: { padding: '4px 0', borderBottom: '1px solid ' + c.border } },
                h('div', { style: { display: 'flex', gap: 6, alignItems: 'baseline' } },
                  h('span', { style: faint }, 'ch' + card.chapter),
                  h('span', { style: { color: c.sub, fontSize: 10.5 } }, '命中 · 重要度 ' + card.salience),
                ),
                h('div', { style: small }, card.gist),
              ))
            : value.cards.map((card) => h('div', { key: card.id, style: { padding: '4px 0', borderBottom: '1px solid ' + c.border } },
                h('div', { style: { display: 'flex', gap: 6, alignItems: 'baseline' } },
                  h('span', { style: faint }, 'ch' + card.chapter),
                  h('span', { style: { color: c.sub, fontSize: 10.5 } }, card.layer + ' · 重要度 ' + card.salience + (typeof card.fidelity === 'number' ? ' · 准 ' + Math.round(card.fidelity * 100) + '%' : '')),
                ),
                h('div', { style: small }, card.gist),
                h('div', { style: { display: 'flex', gap: 6, marginTop: 2 } },
                  h('button', { type: 'button', onClick: function () { runMemory(card.id, 'pin') }, style: { appearance: 'none', border: '1px solid ' + c.border, background: 'transparent', color: c.sub, borderRadius: 6, padding: '0 6px', fontSize: 10.5, cursor: 'pointer', fontFamily: 'inherit' } }, '钉'),
                  h('button', { type: 'button', onClick: function () { runMemory(card.id, 'forget') }, style: { appearance: 'none', border: '1px solid ' + c.border, background: 'transparent', color: c.sub, borderRadius: 6, padding: '0 6px', fontSize: 10.5, cursor: 'pointer', fontFamily: 'inherit' } }, '忘'),
                  h('button', { type: 'button', onClick: function () { runMemory(card.id, 'restore') }, style: { appearance: 'none', border: '1px solid ' + c.border, background: 'transparent', color: c.sub, borderRadius: 6, padding: '0 6px', fontSize: 10.5, cursor: 'pointer', fontFamily: 'inherit' } }, '恢复'),
                ),
              ))
          return h('div', null,
            h('div', { style: { display: 'flex', gap: 6, marginBottom: 4 } },
              h('input', {
                value: query,
                placeholder: '搜记忆（gist / 实体 / 引文）',
                onChange: function (event) { setQuery(event.target.value) },
                style: { flex: 1, minWidth: 0, fontSize: 11.5, padding: '2px 6px', borderRadius: 6, border: '1px solid ' + c.border, background: c.base, color: c.text, fontFamily: 'inherit' },
              }),
              h('button', {
                type: 'button',
                onClick: function () { runSearch() },
                style: { appearance: 'none', border: '1px solid ' + c.border, background: 'transparent', color: c.sub, borderRadius: 6, padding: '1px 8px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' },
              }, '搜'),
            ),
            h('div', { style: faint }, searchHits ? `命中 ${searchHits.total} 条（“${searchHits.query}”）` : `${value.total} 张卡 · rev ${value.revision}${value.drift ? ' · drift' : ''}`),
            rows,
            value.threads && value.threads.length
              ? h('div', { style: { marginTop: 6 } }, h('div', { style: faint }, '未回收线索'),
                  value.threads.slice(0, 8).map((thread, index) => h('div', { key: index, style: { color: c.sub, fontSize: 11.5 } }, '· ' + String(thread.text).slice(0, 60))))
              : null,
            value.entities && value.entities.length
              ? h('div', { style: { marginTop: 6 } }, h('div', { style: faint }, '常出现人物'),
                  h('div', { style: { color: c.sub, fontSize: 11.5 } }, value.entities.slice(0, 12).map((entity) => entity.name + '×' + entity.mentions).join('、')))
              : null,
          )
        }
        if (tab === 'style') {
          if (!value.available) return h('div', { style: faint }, '没有 voice 书库')
          return h('div', null,
            value.profiles && value.profiles.length
              ? h('div', null,
                  h('div', { style: faint }, '档案'),
                  value.profiles.map((item) => h('div', { key: item.id, style: { padding: '4px 0', borderBottom: '1px solid ' + c.border } },
                    h('div', { style: small }, (item.name || item.id) + ' v' + (item.version || '?') + ' · ' + item.status),
                    h('div', { style: { color: c.faint, fontSize: 11 } },
                      Object.entries(item.bands || {}).map(([key, band]) => key + ' ' + band[0] + '–' + band[1]).join('；') || '（无 bands）'),
                    item.avoid && item.avoid.length ? h('div', { style: { color: c.faint, fontSize: 11 } }, '避免：' + item.avoid.join('、')) : null,
                  )))
              : null,
            value.kitProfiles && value.kitProfiles.length
              ? h('div', { style: { marginTop: 8 } },
                  h('div', { style: faint }, '导入的文风档案（kit）'),
                  value.kitProfiles.map((item) => h('div', { key: item.id, style: { padding: '4px 0', borderBottom: '1px solid ' + c.border } },
                    h('div', { style: small }, (item.name || item.id) + ' · ' + item.status),
                    h('div', { style: { color: c.faint, fontSize: 11 } },
                      Object.entries(item.bands || {}).map(([key, spec]) => {
                        const band = Array.isArray(spec) ? spec : spec && Array.isArray(spec.band) ? spec.band : null
                        return band ? key + ' ' + band[0] + '–' + band[1] : null
                      }).filter(Boolean).join('；') || '（无 bands）'),
                    item.status !== 'confirmed'
                      ? h('button', {
                          type: 'button',
                          onClick: function () { runConfirmStyle(item) },
                          style: { appearance: 'none', border: '1px solid ' + c.brand, background: 'transparent', color: c.text, borderRadius: 6, padding: '1px 8px', fontSize: 10.5, cursor: 'pointer', fontFamily: 'inherit', marginTop: 3 },
                        }, '确认文风')
                      : null)))
              : null,
            h('div', { style: { ...faint, marginTop: 6 } }, `${value.works.length} 部 · ${value.chapters} 章 · ${value.chars} 字`),
            value.works.map((work) => h('div', { key: work.workId, style: { padding: '4px 0', borderBottom: '1px solid ' + c.border } },
              h('div', { style: small }, work.title || work.workId),
              h('div', { style: faint }, `${work.chapters} 章 · ${work.chars} 字 · ${work.status || '未测量'}`),
            )))
        }
        if (!value.available) return h('div', { style: faint }, '没有同人项目')
        return h('div', null,
          h('div', { style: faint }, '同人原著请用上方「写同人」导入；这里展示已绑定的契约。'),
          h('div', { style: faint }, `${value.title || value.id} · 原著 ${value.sourceId || '-'} · rev ${value.revision}`),
          value.source === 'kit'
            ? h('div', { style: { marginTop: 3, color: value.canonReady ? c.success : c.error, fontSize: 11 } },
                'canon：' + (value.canonReady ? '已确认，可开写' : (value.contractStatus || '待抽取')))
            : null,
          value.source === 'kit'
            ? h('div', { style: { marginTop: 6 } },
                canonEdit && canonEdit.open
                  ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 5 } },
                      h('div', { style: faint }, '事实（每行：实体·键：值）'),
                      h('textarea', { value: canonEdit.facts, onChange: function (event) { setCanonEdit((prev) => ({ ...prev, facts: event.target.value })) }, style: { minHeight: 52, fontSize: 10.5, fontFamily: 'var(--dsw-font-mono, monospace)', padding: 6, borderRadius: 6, border: '1px solid ' + c.border, background: c.base, color: c.text } }),
                      h('div', { style: faint }, '人物（每行：名字：角色）'),
                      h('textarea', { value: canonEdit.characters, onChange: function (event) { setCanonEdit((prev) => ({ ...prev, characters: event.target.value })) }, style: { minHeight: 44, fontSize: 10.5, padding: 6, borderRadius: 6, border: '1px solid ' + c.border, background: c.base, color: c.text } }),
                      h('div', { style: faint }, '世界规则（每行一条）'),
                      h('textarea', { value: canonEdit.rules, onChange: function (event) { setCanonEdit((prev) => ({ ...prev, rules: event.target.value })) }, style: { minHeight: 44, fontSize: 10.5, padding: 6, borderRadius: 6, border: '1px solid ' + c.border, background: c.base, color: c.text } }),
                      h('div', { style: faint }, '禁忌（每行一条）'),
                      h('textarea', { value: canonEdit.forbidden, onChange: function (event) { setCanonEdit((prev) => ({ ...prev, forbidden: event.target.value })) }, style: { minHeight: 36, fontSize: 10.5, padding: 6, borderRadius: 6, border: '1px solid ' + c.border, background: c.base, color: c.text } }),
                      h('div', { style: { display: 'flex', gap: 6 } },
                        h('button', { type: 'button', onClick: function () { runSaveCanon(value) }, style: { appearance: 'none', border: '1px solid ' + c.brand, background: c.layer, color: c.text, borderRadius: 6, padding: '2px 8px', fontSize: 10.5, cursor: 'pointer', fontFamily: 'inherit' } }, '保存为待审阅'),
                        h('button', { type: 'button', onClick: function () { setCanonEdit(null) }, style: { appearance: 'none', border: '1px solid ' + c.border, background: 'transparent', color: c.sub, borderRadius: 6, padding: '2px 8px', fontSize: 10.5, cursor: 'pointer', fontFamily: 'inherit' } }, '取消')))
                  : h('button', {
                      type: 'button',
                      onClick: function () {
                        setCanonEdit({
                          open: true,
                          book: book || (state.data && state.data.book) || '',
                          sourceId: value.sourceId,
                          revision: value.contractRevision ?? 0,
                          facts: (value.facts || []).map((fact) => `${fact.entity ?? fact.subjectName ?? '?'}${fact.key ? '·' + fact.key : ''}：${fact.value ?? fact.object ?? ''}`).join('\n'),
                          characters: (value.characters || []).map((person) => `${person.name ?? ''}${person.role ? '：' + person.role : ''}`).join('\n'),
                          rules: (value.worldRules || []).map((rule) => (typeof rule === 'string' ? rule : rule?.text ?? '')).join('\n'),
                          forbidden: (value.forbidden || []).map((item) => String(item)).join('\n'),
                        })
                      },
                      style: { appearance: 'none', border: '1px solid ' + c.border, background: 'transparent', color: c.sub, borderRadius: 6, padding: '2px 8px', fontSize: 10.5, cursor: 'pointer', fontFamily: 'inherit' },
                    }, '编辑契约'))
            : null,
          value.facts && value.facts.length
            ? h('div', { style: { marginTop: 4 } }, h('div', { style: faint }, '事实'),
                value.facts.slice(0, 10).map((fact, index) => h('div', { key: index, style: small },
                  `${fact.entity ?? fact.subjectName ?? '?'}${fact.key ? '·' + fact.key : ''}：${fact.value ?? fact.object ?? ''}`)))
            : null,
          value.worldRules && value.worldRules.length
            ? h('div', { style: { marginTop: 4 } }, h('div', { style: faint }, '世界规则'),
                value.worldRules.slice(0, 10).map((rule, index) => h('div', { key: index, style: small }, '- ' + (typeof rule === 'string' ? rule : rule?.text ?? ''))))
            : null,
          value.forbidden.length
            ? h('div', { style: { marginTop: 4 } }, h('div', { style: faint }, '禁忌'), value.forbidden.map((text, index) => h('div', { key: index, style: small }, '- ' + text)))
            : null,
          value.addresses.length
            ? h('div', { style: { marginTop: 4 } }, h('div', { style: faint }, '称呼'),
                value.addresses.slice(0, 20).map((row, index) => h('div', { key: index, style: small }, `${row.from}→${row.to}：${row.form}（${row.fromChapter} 起）`)))
            : null,
          value.characters && value.characters.length
            ? h('div', { style: { marginTop: 4 } }, h('div', { style: faint }, '人物'),
                value.characters.slice(0, 12).map((person, index) => h('div', { key: index, style: small },
                  person.name + (person.role ? ' · ' + person.role : '') + (person.aliases && person.aliases.length ? '（' + person.aliases.join('/') + '）' : ''))))
            : null,
          value.secrets && value.secrets.length
            ? h('div', { style: { marginTop: 4 } }, h('div', { style: faint }, '秘密'),
                value.secrets.slice(0, 8).map((secret, index) => h('div', { key: index, style: { color: c.faint, fontSize: 11 } },
                  (secret.publicAtChapter ? secret.publicAtChapter + ' 起公开' : '未公开') + '：' + String(secret.what).slice(0, 40))))
            : null,
          value.source === 'kit' && !value.canonReady && ((value.facts && value.facts.length) || (value.worldRules && value.worldRules.length) || (value.characters && value.characters.length) || (value.secrets && value.secrets.length) || (value.addresses && value.addresses.length) || (value.forbidden && value.forbidden.length))
            ? h('button', {
                type: 'button',
                onClick: function () { runConfirmCanon(value) },
                style: { appearance: 'none', border: '1px solid ' + c.brand, background: 'transparent', color: c.text, borderRadius: 6, padding: '2px 8px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', marginTop: 6 },
              }, '确认 canon（之后可开写）')
            : null,
        )
      }

      const requestRef = React.useRef(0)
      const load = React.useCallback(async function (nextBook) {
        if (!remote) {
          setState({ phase: 'error', data: null, error: '面板读接口未就绪：请更新并重载 DSH。' })
          return
        }
        const requestId = requestRef.current + 1
        requestRef.current = requestId
        setState((prev) => ({ phase: prev.data ? 'refreshing' : 'loading', data: prev.data, error: null }))
        try {
          const data = await Promise.resolve(remote.getSnapshot(sessionId, { book: nextBook || book || null })).then(unwrap)
          const diag = await Promise.resolve(remote.getDiagnostics(sessionId)).then(unwrap).catch(() => null)
          if (requestRef.current !== requestId) return
          setSearchHits(null)
          setTabData({})
          setCanonEdit(null)
          setState({ phase: 'ready', data, diag, error: null })
        } catch (error) {
          if (requestRef.current !== requestId) return
          setState({ phase: 'error', data: null, error: String(error?.message ?? error) })
        }
      }, [remote, sessionId, book])

      const runTakeover = React.useCallback(async function (takeover) {
        if (!remote) return
        setAction({ phase: 'busy', message: '' })
        try {
          const result = await Promise.resolve(takeover ? remote.takeover(sessionId) : remote.restore(sessionId)).then(unwrap)
          const results = Array.isArray(result?.results) ? result.results : []
          const failed = results.filter((item) => !item.ok)
          if (result?.ok === false && results.length === 0) {
            setAction({ phase: 'error', message: result.message || result.code || '操作失败' })
            await load()
            return
          }
          setAction({
            phase: failed.length ? 'error' : 'done',
            message: failed.length
              ? '部分失败：' + failed.map((item) => item.name + '（' + (item.application ?? '?') + '）').join('、')
              : (takeover ? '已停用旧五件，由 kit 接管' : '已恢复旧五件'),
          })
          await load()
        } catch (error) {
          setAction({ phase: 'error', message: String(error?.message ?? error) })
        }
      }, [remote, sessionId, load])

      const runMaster = React.useCallback(async function () {
        if (!remote) return
        const next = !(state.data && state.data.master)
        setAction({ phase: 'busy', message: '' })
        try {
          await Promise.resolve(remote.setMaster(sessionId, { master: next })).then(unwrap)
          setAction({ phase: 'done', message: next ? '小说能力总开关已开；本会话仍要 /novel on。' : '小说能力总开关已关：所有会话的 novel_* 工具都会消失。' })
          await load()
        } catch (error) {
          setAction({ phase: 'error', message: String(error?.message ?? error) })
        }
      }, [remote, sessionId, state.data, load])

      const runMode = React.useCallback(async function (mode) {
        if (!remote) return
        const activeBook = book || (state.data && state.data.book) || null
        if (!activeBook) { setAction({ phase: 'error', message: '先选一本书，再切项目模式' }); return }
        setAction({ phase: 'busy', message: '' })
        try {
          const result = await Promise.resolve(remote.setMode(sessionId, { book: activeBook, mode })).then(unwrap)
          const next = result?.settings?.mode ?? mode
          setAction({ phase: 'done', message: next === 'fanfic' ? '已切到同人模式；还需要绑定同人原著才能开写。' : '已切回原创模式；同人数据保留但不再注入。' })
          await load()
        } catch (error) {
          setAction({ phase: 'error', message: String(error?.message ?? error) })
        }
      }, [remote, sessionId, book, state.data, load])

      const runImportKind = React.useCallback(async function (kind, confirmed = false) {
        if (!remote) return
        const target = importPath.trim()
        const activeBook = book || (state.data && state.data.book) || null
        if (!target) { setAction({ phase: 'error', message: '先填作品 txt 的绝对路径' }); return }
        if (!activeBook) { setAction({ phase: 'error', message: '先选一本书' }); return }
        if (kind === 'canon' && !confirmed) {
          setPendingCanon(true)
          return
        }
        setPendingCanon(false)
        setAction({ phase: 'busy', message: '' })
        try {
          const result = kind === 'style'
            ? await Promise.resolve(remote.importStyle(sessionId, { book: activeBook, file: target })).then(unwrap)
            : await Promise.resolve(remote.importCanon(sessionId, { book: activeBook, file: target, confirmMode: true })).then(unwrap)
          if (kind === 'style') {
            setAction({ phase: 'done', message: '已生成文风档案：' + (result.profileId ?? '') + '（provisional）' })
            setTabData((prev) => { const next = { ...prev }; delete next.style; return next })
            await openTab('style')
          } else {
            setAction({ phase: 'done', message: '原著已绑定；世界契约待抽取，同人开写会被拦住。' })
            setTabData((prev) => { const next = { ...prev }; delete next.canon; return next })
            await openTab('canon')
          }
        } catch (error) {
          setAction({ phase: 'error', message: String(error?.message ?? error) })
        }
      }, [remote, sessionId, book, state.data, importPath, openTab])

      const runSaveCanon = React.useCallback(async function (canonValue) {
        if (!remote || !canonValue || !canonValue.sourceId || !canonEdit) return
        const activeBook = canonEdit.book || book || (state.data && state.data.book) || null
        const targetSource = canonEdit.sourceId || canonValue.sourceId
        if (!activeBook || !targetSource) { setAction({ phase: 'error', message: '先选一本书' }); return }
        const lines = (text) => String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
        const facts = lines(canonEdit.facts).map((line) => {
          const [left, ...rest] = line.split(/[：:]/)
          const [entity, key] = left.split('·')
          return { entity: (entity || '').trim(), key: (key || '').trim(), value: rest.join('：').trim() }
        }).filter((item) => item.entity && item.value)
        const characters = lines(canonEdit.characters).map((line) => {
          const [name, ...rest] = line.split(/[：:]/)
          return { name: (name || '').trim(), role: rest.join('：').trim() }
        }).filter((item) => item.name)
        const worldRules = lines(canonEdit.rules)
        const forbidden = lines(canonEdit.forbidden)
        setAction({ phase: 'busy', message: '' })
        try {
          const result = await Promise.resolve(remote.updateCanon(sessionId, {
            book: activeBook,
            sourceId: targetSource,
            expectedRevision: canonEdit.revision ?? null,
            patch: { facts, characters, worldRules, forbidden },
          })).then(unwrap)
          if (!result || result.ok === false) {
            setAction({ phase: 'error', message: result?.message || result?.code || '保存 canon 失败' })
            return
          }
          setAction({ phase: 'done', message: 'canon 已保存为待审阅；确认后才可开写。' })
          setCanonEdit(null)
          setTabData((prev) => { const next = { ...prev }; delete next.canon; return next })
          await openTab('canon')
        } catch (error) {
          setAction({ phase: 'error', message: String(error?.message ?? error) })
        }
      }, [remote, sessionId, book, state.data, canonEdit, openTab])

      const runConfirmCanon = React.useCallback(async function (canonValue) {
        if (!remote || !canonValue || !canonValue.sourceId) return
        const activeBook = book || (state.data && state.data.book) || null
        if (!activeBook) { setAction({ phase: 'error', message: '先选一本书' }); return }
        setAction({ phase: 'busy', message: '' })
        try {
          const result = await Promise.resolve(remote.confirmCanon(sessionId, {
            book: activeBook, sourceId: canonValue.sourceId,
            expectedRevision: canonValue.contractRevision ?? null,
          })).then(unwrap)
          if (!result || result.ok === false) {
            setAction({ phase: 'error', message: result?.message || result?.code || '确认失败' })
            return
          }
          setAction({ phase: 'done', message: 'canon 已确认；同人章节现在可以开写。' })
          setTabData((prev) => { const next = { ...prev }; delete next.canon; return next })
          await openTab('canon')
        } catch (error) {
          setAction({ phase: 'error', message: String(error?.message ?? error) })
        }
      }, [remote, sessionId, book, state.data, openTab])

      const runConfirmStyle = React.useCallback(async function (profile) {        if (!remote || !profile || !profile.id) return
        setAction({ phase: 'busy', message: '' })
        try {
          const result = await Promise.resolve(remote.confirmStyle(sessionId, {
            profileId: profile.id, expectedRevision: profile.revision ?? null,
          })).then(unwrap)
          if (!result || result.ok === false) {
            setAction({ phase: 'error', message: result?.message || result?.code || '确认文风失败' })
            return
          }
          setAction({ phase: 'done', message: '文风档案已确认：' + (profile.name || profile.id || '') })
          setTabData((prev) => { const next = { ...prev }; delete next.style; return next })
          await openTab('style')
        } catch (error) {
          setAction({ phase: 'error', message: String(error?.message ?? error) })
        }
      }, [remote, sessionId, openTab])

      const runCreateBook = React.useCallback(async function () {
        const name = newBook.trim()
        if (!name || !remote || typeof remote.createBook !== 'function') {
          setAction({ phase: 'error', message: name ? '宿主还没加载建书接口；刷新或重启 DSH。' : '先输入作品名' })
          return
        }
        setAction({ phase: 'busy', message: '' })
        try {
          const result = await Promise.resolve(remote.createBook(sessionId, { book: name, mode: 'original' })).then(unwrap)
          if (!result || result.ok === false) {
            setAction({ phase: 'error', message: result?.message || result?.code || '建书失败' })
            return
          }
          setAction({ phase: 'done', message: '已创建《' + name + '》' })
          setNewBook('')
          setBook(name)
          await load(name)
        } catch (error) {
          setAction({ phase: 'error', message: String(error?.message ?? error) })
        }
      }, [remote, sessionId, newBook, load])

      const runStartChapter = React.useCallback(async function (bookName, chapterNo) {
        if (!remote || typeof remote.startChapter !== 'function') {
          setAction({ phase: 'error', message: '宿主还没加载开章接口；刷新或重启 DSH 后再试。' })
          return
        }
        if (!bookName || !chapterNo) { setAction({ phase: 'error', message: '先选一本书' }); return }
        setStartPhase('starting')
        setAction({ phase: 'busy', message: '' })
        try {
          const result = await Promise.resolve(remote.startChapter(sessionId, { book: bookName, chapter: chapterNo })).then(unwrap)
          if (!result || result.ok === false) {
            setAction({ phase: 'error', message: result?.message || result?.code || '开章失败' })
            setStartPhase('idle')
            return
          }
          setAction({ phase: 'done', message: '第 ' + chapterNo + ' 章已装配；可以打开工作台开始写。' })
          setStartPhase('idle')
          await load()
        } catch (error) {
          setAction({ phase: 'error', message: String(error?.message ?? error) })
          setStartPhase('idle')
        }
      }, [remote, sessionId, load])

      const openStudio = React.useCallback(function () {
        setMode('studio')
        try { layout?.openRightbar?.(false, true) } catch { /* 不是所有布局都支持全屏 */ }
      }, [layout])

      React.useEffect(function () { load() }, [load])

      const data = state.data
      const books = (data && data.workspace && data.workspace.beat) || []
      const panelSession = data && data.session ? data.session : null
      const panelPending = panelSession && Array.isArray(panelSession.pendingDecisionIds) ? panelSession.pendingDecisionIds.length : 0
      const panelLastChapter = data && data.history && Array.isArray(data.history.chapters) && data.history.chapters.length
        ? Math.max(...data.history.chapters.map((item) => Number(item.chapter) || 0))
        : 0
      const panelNext = deriveNextAction({ session: panelSession, lastChapter: panelLastChapter })
      const panelContexts = (data && data.contexts) || []
      const panelBook = book || (data && data.book) || books[0] || ''
      const nextChapter = panelNext.chapter
      const panelPrimary = !panelBook
        ? { label: '先选择一本书', action: null, disabled: true }        : panelNext.kind === 'decide'
          ? { label: '去拍板（' + panelPending + '）', action: function () { setSettingsOpen(true); setDetails(true); openTab('decisions') }, disabled: false }
          : panelNext.kind === 'start'
            ? { label: startPhase === 'starting' ? '正在装配…' : '开第 ' + nextChapter + ' 章', action: function () { runStartChapter(panelBook, nextChapter) }, disabled: startPhase === 'starting' }
            : panelNext.kind === 'blockers'
              ? { label: '查看检查详情', action: function () { setDetails(true); setSettingsOpen(true); openTab('overview') }, disabled: false }
              : { label: '查看本章详情', action: function () { setDetails(true); setSettingsOpen(true); openTab('overview') }, disabled: false }
      const panelInbox = []
      if (panelSession) {
        for (const id of (panelSession.pendingDecisionIds || [])) panelInbox.push({ kind: '拍板', text: String(id) })
      }
      if (data && data.conflicts && Array.isArray(data.conflicts.items)) {
        for (const item of data.conflicts.items) panelInbox.push({ kind: '冲突', text: (item.entity || '?') + ' · ' + (item.key || '?') })
      }
      if (data && data.canon && !data.canon.ready && data.settings && data.settings.mode === 'fanfic') {
        panelInbox.push({ kind: 'canon', text: '同人原著待确认（' + (data.canon.status || '?') + '）' })
      }

      if (mode === 'studio') {
        return h(Workbench, { sessionId, remote, embedded: true, onClose: function () { setMode('task') } })
      }

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 16px 28px', color: c.text, background: c.base, height: '100%', overflowY: 'auto', fontSize: 13 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
          h('div', { style: { width: 32, height: 32, flexShrink: 0, borderRadius: 10, background: c.brand, color: c.onBrand, display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 700, letterSpacing: '-.04em' } }, '小'),
          h('div', { style: { minWidth: 0, flex: 1 } },
            h('div', { style: { fontSize: 15, fontWeight: 700, letterSpacing: '-.01em' } }, '小说'),
            h('div', { style: { ...faint, marginTop: 1 } }, panelBook || '还没有选择作品')),
          h('div', { style: { display: 'flex', gap: 6 } },
            h('button', {
              type: 'button',
              onClick: openStudio,
              style: { appearance: 'none', border: 'none', background: c.brand, color: c.onBrand, borderRadius: 8, padding: '5px 9px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
            }, '工作台'),
            h('button', {
              type: 'button',
              title: '导入作品与项目设置',
              onClick: function () { setSettingsOpen(true) },
              style: { appearance: 'none', border: '1px solid ' + c.border, background: 'transparent', color: c.sub, borderRadius: 8, padding: '5px 9px', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' },
            }, '导入'),
            h('button', {
              type: 'button',
              title: '高级详情',
              onClick: function () { const next = !details; setDetails(next); if (next) setSettingsOpen(true) },
              style: { appearance: 'none', border: '1px solid ' + c.border, background: 'transparent', color: c.sub, borderRadius: 8, padding: '5px 9px', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' },
            }, details ? '收起' : '详情'),
            h('button', {
              type: 'button',
              onClick: function () { load() },
              style: { appearance: 'none', border: '1px solid ' + c.border, background: 'transparent', color: c.sub, borderRadius: 8, padding: '5px 9px', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' },
            }, state.phase === 'refreshing' ? '…' : '刷新')),
        ),
        books.length
          ? h('select', {
              value: panelBook,
              onChange: function (event) { setBook(event.target.value); load(event.target.value) },
              style: { width: '100%', boxSizing: 'border-box', appearance: 'none', border: '1px solid ' + c.border, background: c.layer, color: c.text, borderRadius: 10, padding: '9px 11px', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer' },
            }, books.map((name) => h('option', { key: name, value: name }, name)))
          : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, padding: 14, border: '1px solid ' + c.border, borderRadius: 12, background: c.layer } },
              h('div', { style: { ...faint, lineHeight: 1.6 } }, '这个工作区还没有书。先建一本，kit 会创建剧情账、记忆账与项目设置。'),
              h('div', { style: { display: 'flex', gap: 8 } },
                h('input', {
                  value: newBook,
                  placeholder: '作品名，例如：长夜行',
                  onChange: function (event) { setNewBook(event.target.value) },
                  onKeyDown: function (event) { if (event.key === 'Enter') runCreateBook() },
                  style: { flex: 1, minWidth: 0, border: '1px solid ' + c.border, borderRadius: 9, background: c.base, color: c.text, padding: '8px 10px', fontSize: 12.5, fontFamily: 'inherit' },
                }),
                h('button', {
                  type: 'button',
                  onClick: function () { runCreateBook() },
                  style: { appearance: 'none', border: 'none', background: c.brand, color: c.onBrand, borderRadius: 9, padding: '8px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
                }, '新建作品'))),

        state.error ? h('div', { style: { color: c.error, fontSize: 12 } }, state.error) : null,

        data ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
          settingsOpen ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10, padding: 12, border: '1px solid ' + c.border, borderRadius: 12, background: c.layer } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
            h('span', { style: small }, '总开关'),
              h('span', { style: { color: data.master ? c.success : c.faint, fontSize: 11.5 } }, data.master ? '开' : '关'),
              h('button', {
                type: 'button',
                onClick: function () { runMaster() },
                style: { marginLeft: 'auto', appearance: 'none', border: '1px solid ' + (data.master ? c.border : c.brand), background: 'transparent', color: data.master ? c.sub : c.text, borderRadius: 6, padding: '2px 8px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' },
              }, data.master ? '关闭' : '启用')),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
              h('span', { style: small }, '项目模式'),
              ['original', 'fanfic'].map(function (mode) {
                const active = ((data.settings && data.settings.mode) || 'original') === mode
                return h('button', {
                  key: mode,
                  type: 'button',
                  onClick: function () { runMode(mode) },
                  style: {
                    appearance: 'none', border: '1px solid ' + (active ? c.brand : c.border), background: active ? c.layer : 'transparent',
                    color: active ? c.text : c.sub, borderRadius: 999, padding: '2px 8px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                  },
                }, mode === 'fanfic' ? '同人' : '原创')
              }),
              !(data.settings && data.settings.activeCanonSourceId)
                ? h('span', { style: { ...faint, marginLeft: 'auto', fontSize: 10 } }, (data.settings && data.settings.mode) === 'fanfic' ? '待绑定原著' : '')
                : null),
          h('div', { style: { border: '1px solid ' + c.border, borderRadius: 8, padding: '7px 9px', display: 'flex', flexDirection: 'column', gap: 6 } },
            h('div', { style: faint }, '导入作品：两个入口'),
            h('input', {
              value: importPath,
              placeholder: '作品 txt 的绝对路径（UTF-8）',
              onChange: function (event) { setImportPath(event.target.value) },
              style: { width: '100%', boxSizing: 'border-box', fontSize: 11, padding: '3px 6px', borderRadius: 6, border: '1px solid ' + c.border, background: c.base, color: c.text, fontFamily: 'inherit' },
            }),
            pendingCanon
              ? h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } },
                  h('span', { style: { color: c.faint, fontSize: 10.5 } }, '这会切到同人模式并绑定世界观；确认？'),
                  h('button', { type: 'button', onClick: function () { runImportKind('canon', true) }, style: { appearance: 'none', border: '1px solid ' + c.brand, background: 'transparent', color: c.text, borderRadius: 6, padding: '1px 8px', fontSize: 10.5, cursor: 'pointer', fontFamily: 'inherit' } }, '确认导入'),
                  h('button', { type: 'button', onClick: function () { setPendingCanon(false) }, style: { appearance: 'none', border: '1px solid ' + c.border, background: 'transparent', color: c.sub, borderRadius: 6, padding: '1px 8px', fontSize: 10.5, cursor: 'pointer', fontFamily: 'inherit' } }, '取消'))
              : h('div', { style: { display: 'flex', gap: 6 } },
                  h('button', { type: 'button', onClick: function () { runImportKind('style') }, style: { appearance: 'none', border: '1px solid ' + c.border, background: 'transparent', color: c.sub, borderRadius: 6, padding: '2px 8px', fontSize: 10.5, cursor: 'pointer', fontFamily: 'inherit' } }, '学文笔'),
                  h('button', { type: 'button', onClick: function () { runImportKind('canon') }, style: { appearance: 'none', border: '1px solid ' + c.border, background: 'transparent', color: c.sub, borderRadius: 6, padding: '2px 8px', fontSize: 10.5, cursor: 'pointer', fontFamily: 'inherit' } }, '写同人'))),
          ) : null,
          h('div', { style: { padding: '18px 16px 16px', border: '1px solid ' + c.border, borderRadius: 16, background: c.layer, boxShadow: '0 2px 14px rgba(0,0,0,.05)' } },
            h('div', { style: { ...faint, fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase' } }, 'NEXT · 下一笔'),
            h('div', { style: { fontSize: 22, fontWeight: 700, lineHeight: 1.35, margin: '7px 0 4px', letterSpacing: '-.02em' } }, panelNext.title),
            h('div', { style: { color: c.sub, fontSize: 12.5, lineHeight: 1.65 } }, panelNext.detail),
            h('button', {
              type: 'button',
              disabled: panelPrimary.disabled || !panelPrimary.action,
              onClick: panelPrimary.action || undefined,
              style: {
                width: '100%', marginTop: 14, appearance: 'none', border: 'none',
                background: panelPrimary.disabled ? c.border : c.brand, color: panelPrimary.disabled ? c.faint : c.onBrand,
                borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 600, cursor: panelPrimary.disabled ? 'default' : 'pointer', fontFamily: 'inherit',
              },
            }, panelPrimary.label),
            action.message ? h('div', { style: { marginTop: 8, fontSize: 11.5, lineHeight: 1.5, color: action.phase === 'error' ? c.error : c.sub } }, action.message) : null),
          panelContexts.length
            ? h('div', { style: { border: '1px solid ' + c.border, borderRadius: 12, padding: 12, background: c.base } },
                h('div', { style: { ...faint, fontSize: 11, display: 'flex', justifyContent: 'space-between', letterSpacing: '.04em' } }, '本章依据', '四段 · ' + panelContexts.filter((item) => item.available).length + '/4'),
                h('div', { style: { display: 'flex', gap: 2, height: 8, borderRadius: 8, overflow: 'hidden', marginTop: 8, background: c.border } },
                  panelContexts.map(function (segment, index) {
                    const colors = [c.brand, '#5b6ac4', '#2f7d6b', '#a96a22']
                    return h('i', { key: segment.component || index, style: { flexGrow: Math.max(1, segment.chars || 1), background: colors[index % colors.length], opacity: segment.available ? 1 : 0.25 } })
                  })),
                h('div', { style: { display: 'flex', gap: 8, marginTop: 7, flexWrap: 'wrap' } },
                  panelContexts.map(function (segment) {
                    return h('span', { key: segment.component, style: { ...faint, fontSize: 10.5 } },
                      segment.component + ' ' + (segment.chars ?? 0) + (segment.available ? '' : '·缺'))
                  })))
            : h('div', { style: { ...faint, fontSize: 12, padding: '2px 2px' } }, '还没有装配本章依据；开一章后显示四段预算。'),
          h('div', { style: { border: '1px solid ' + c.border, borderRadius: 12, padding: 12, background: c.base } },
            h('div', { style: { ...faint, fontSize: 11, display: 'flex', justifyContent: 'space-between', letterSpacing: '.04em' } }, '收件箱', String(panelInbox.length)),
            panelInbox.length === 0
              ? h('div', { style: { color: c.faint, fontSize: 12, marginTop: 6 } }, '没有待处理事项。')
              : panelInbox.slice(0, 4).map(function (item, index) {
                  return h('div', { key: index, style: { display: 'flex', gap: 8, alignItems: 'baseline', marginTop: 7, fontSize: 12, lineHeight: 1.45 } },
                    h('span', { style: { color: c.brand, fontSize: 10, fontWeight: 700, flexShrink: 0 } }, item.kind),
                    h('span', { style: { color: c.sub } }, item.text))
                })),
          h('div', { style: { border: '1px solid ' + c.border, borderRadius: 12, padding: 12, background: c.base } },
            h('div', { style: { ...faint, fontSize: 11, display: 'flex', justifyContent: 'space-between', letterSpacing: '.04em' } }, '最近章节', (data.history && data.history.total) || 0),
            (data.history && data.history.chapters ? data.history.chapters : []).slice(0, 3).map(function (item, index) {
              return h('div', { key: index, style: { display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 7, fontSize: 12, color: c.sub } },
                h('span', null, '第 ' + item.chapter + ' 章 · ' + (item.state || '?')),
                h('span', { style: { color: c.faint } }, item.chars ? item.chars + ' 字' : ''))
            })),
          h('button', {
            type: 'button',
            onClick: function () { setSettingsOpen(!settingsOpen) },
            style: { appearance: 'none', border: '1px solid ' + c.border, background: 'transparent', color: c.sub, borderRadius: 10, padding: '9px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },
          }, settingsOpen ? '收起设置与详情' : '设置与详情'),
          settingsOpen ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, padding: 12, border: '1px solid ' + c.border, borderRadius: 12, background: c.layer } },
          h('div', { style: row },
            h('span', { style: small }, '开关'),
            h('span', { style: { color: data.driving ? c.success : c.faint } }, data.driving ? '本会话：开' : '本会话：关（/novel on）'),
          ),
          state.diag && state.diag.managed
            ? h('div', { style: row },
                h('span', { style: small }, '旧五件'),
                h('span', { style: { color: state.diag.runningSiblings.length ? c.sub : c.faint } },
                  state.diag.runningSiblings.length
                    ? `${state.diag.runningSiblings.length} 个在跑（可停用，改由 kit 接管）`
                    : '未运行'),
              )
            : null,
          state.diag && state.diag.managed
            ? h('div', { style: { ...row, borderBottom: 'none' } },
                state.diag.takeoverNeeded
                  ? (pendingTakeover
                      ? h('span', { style: { display: 'flex', gap: 6 } },
                          h('button', {
                            type: 'button',
                            onClick: function () { setPendingTakeover(false); runTakeover(true) },
                            style: { appearance: 'none', border: '1px solid ' + c.error, background: 'transparent', color: c.error, borderRadius: 6, padding: '2px 8px', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' },
                          }, '确认停用'),
                          h('button', {
                            type: 'button',
                            onClick: function () { setPendingTakeover(false) },
                            style: { appearance: 'none', border: '1px solid ' + c.border, background: 'transparent', color: c.sub, borderRadius: 6, padding: '2px 8px', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' },
                          }, '取消'))
                      : h('button', {
                          type: 'button',
                          onClick: function () { setPendingTakeover(true) },
                          style: { appearance: 'none', border: '1px solid ' + c.border, background: 'transparent', color: c.sub, borderRadius: 6, padding: '2px 8px', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' },
                        }, '停用旧五件（由 kit 接管）'))
                  : ((state.diag.installedSiblings || []).length
                      ? h('button', {
                          type: 'button',
                          onClick: function () { runTakeover(false) },
                          style: { appearance: 'none', border: '1px solid ' + c.border, background: 'transparent', color: c.sub, borderRadius: 6, padding: '2px 8px', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' },
                        }, '恢复旧五件')
                      : null))
            : null,
          action.message
            ? h('div', { style: { fontSize: 11.5, color: action.phase === 'error' ? c.error : c.sub } }, action.message)
            : null,
          details
            ? h('div', null,
                h('div', { style: { display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' } },
                  [['overview', '总览'], ['decisions', '拍板'], ['memory', '记忆'], ['style', '文风'], ['canon', '设定'], ['conflicts', '冲突']].map(function ([key, label]) {
                    return h('button', {
                      key: key,
                      type: 'button',
                      onClick: function () { openTab(key) },
                      style: {
                        appearance: 'none',
                        border: '1px solid ' + (tab === key ? c.brand : c.border),
                        background: tab === key ? c.layer : 'transparent',
                        color: tab === key ? c.text : c.sub,
                        borderRadius: 999, padding: '2px 10px', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit',
                      },
                    }, label)
                  })),
                tab === 'overview' ? null : renderTab())
            : null,
          h('div', { style: row },
            h('span', { style: small }, '会话'),
            h('span', null, data.session ? `第 ${data.session.chapter} 章 · ${data.session.state}` : '无活动会话'),
          ),
          data.session && data.session.draft
            ? h('div', { style: row }, h('span', { style: small }, '草稿'), h('span', null, `v${data.session.draft.version} · ${String(data.session.draft.hash).slice(0, 10)}`))
            : null,
          data.contexts && data.contexts.length
            ? h('div', null,
                h('div', { style: { ...faint, margin: '8px 0 2px' } }, '四段上下文'),
                data.contexts.map(function (segment) {
                  return h('div', { key: segment.component, style: { ...row, borderBottom: 'none', padding: '2px 0' } },
                    h('span', { style: small }, segment.component),
                    h('span', { style: { color: segment.available ? c.sub : c.faint } },
                      segment.available ? `${segment.chars} / ${segment.budgetChars ?? '?'} 字 · rev ${segment.revision ?? '-'}` : '未接入'),
                  )
                }))
            : null,
          h('div', { style: { ...faint, margin: '8px 0 2px' } }, '账本'),
          (data.ledgers ? Object.entries(data.ledgers) : []).map(function ([name, value]) {
            return h('div', { key: name, style: { ...row, borderBottom: 'none', padding: '2px 0' } },
              h('span', { style: small }, name),
              h('span', { style: { color: value ? c.sub : c.faint } }, value ? `rev ${value.revision ?? '-'}` : '无'),
            )
          }),
          data.issues && data.issues.length
            ? h('div', { style: { color: c.error, fontSize: 11.5, marginTop: 6 } }, data.issues.map((issue) => issue.message).join('；'))
            : null,
          ) : null,
        ) : null,
      )
    }

    // ── 小说工作台（conversation.view）：书桌/章节/故事/资料四入口 ──────────────
    function Workbench(props) {
      const { sessionId, remote, embedded = false, onClose = null } = props
      const [state, setState] = React.useState({ phase: 'loading', data: null, diag: null, error: null })
      const [book, setBook] = React.useState('')
      const [draftState, setDraftState] = React.useState({ text: '', version: 0, hash: null, chars: 0, loaded: false, dirty: false })
      const [saveState, setSaveState] = React.useState({ phase: 'idle', message: '' })
      const [startPhase, setStartPhase] = React.useState('idle')
      const [section, setSection] = React.useState('desk')
      const [storyData, setStoryData] = React.useState(null)
      const [materialData, setMaterialData] = React.useState(null)
      const [fadeData, setFadeData] = React.useState(null)
      const [beatTab, setBeatTab] = React.useState('map')
      const [beatQuery, setBeatQuery] = React.useState('')

      const requestRef = React.useRef(0)
      const editVersionRef = React.useRef(0)
      const load = React.useCallback(async function (nextBook) {
        if (!remote) {
          setState({ phase: 'error', data: null, error: '工作台读接口未就绪：请更新并重载 DSH。' })
          return
        }
        const requestId = requestRef.current + 1
        requestRef.current = requestId
        setState((prev) => ({ phase: prev.data ? 'refreshing' : 'loading', data: prev.data, error: null }))
        try {
          const data = await Promise.resolve(remote.getSnapshot(sessionId, { book: nextBook || book || null })).then(unwrap)
          const diag = await Promise.resolve(remote.getDiagnostics(sessionId)).then(unwrap).catch(() => null)
          if (requestRef.current !== requestId) return
          setState({ phase: 'ready', data, diag, error: null })
        } catch (error) {
          if (requestRef.current !== requestId) return
          setState({ phase: 'error', data: null, error: String(error?.message ?? error) })
        }
      }, [remote, sessionId, book])

      React.useEffect(function () { load() }, [load])

      const loadDraft = React.useCallback(async function (session) {
        if (!remote || !session || !session.id || typeof remote.getDraft !== 'function') return
        try {
          const result = await Promise.resolve(remote.getDraft(sessionId, { chapterSessionId: session.id })).then(unwrap)
          if (result && result.draft) {
            editVersionRef.current = 0
            setDraftState({
              text: result.draft.text ?? '', version: result.draft.version ?? 0, hash: result.draft.hash ?? null,
              chars: result.draft.chars ?? 0, loaded: true, dirty: false,
            })
          } else {
            editVersionRef.current = 0
            setDraftState({ text: '', version: 0, hash: null, chars: 0, loaded: true, dirty: false })
          }
        } catch (error) {
          setSaveState({ phase: 'error', message: String(error?.message ?? error) })
        }
      }, [remote, sessionId])

      const data = state.data
      const sessionKey = data && data.session ? data.session.id : null
      React.useEffect(function () {
        if (sessionKey) loadDraft(data.session)
      }, [sessionKey, loadDraft])

      const saveDraft = React.useCallback(async function () {
        if (!remote || !data || !data.session || typeof remote.saveDraft !== 'function') return
        if (!draftState.dirty) { setSaveState({ phase: 'idle', message: '没有未保存的修改' }); return }
        const submittedSeq = editVersionRef.current
        setSaveState({ phase: 'saving', message: '' })
        try {
          const result = await Promise.resolve(remote.saveDraft(sessionId, {
            chapterSessionId: data.session.id,
            text: draftState.text,
            expectedVersion: draftState.version,
            expectedDraftHash: draftState.hash,
          })).then(unwrap)
          if (!result || result.ok === false) {
            const message = result?.message || result?.code || '保存失败'
            setSaveState({ phase: 'error', message: result && result.code === 'draft-conflict' ? '远端草稿已更新；本地未保存，先复制或点「重新载入」。' : message })
            return
          }
          const stillDirty = editVersionRef.current !== submittedSeq
          setDraftState((prev) => ({
            ...prev,
            version: result.draft?.version ?? prev.version,
            hash: result.draft?.hash ?? prev.hash,
            chars: result.draft?.chars ?? prev.chars,
            dirty: stillDirty,
            loaded: true,
          }))
          setSaveState({ phase: 'saved', message: stillDirty ? '已保存提交版本；之后的新输入还没保存。' : '已保存 v' + (result.draft?.version ?? '?') })
          await load()
        } catch (error) {
          setSaveState({ phase: 'error', message: String(error?.message ?? error) })
        }
      }, [remote, sessionId, data, draftState, loadDraft, load])

      const startChapterFromDesk = React.useCallback(async function (bookName, chapterNo) {
        if (!remote || typeof remote.startChapter !== 'function' || !bookName || !chapterNo) {
          setSaveState({ phase: 'error', message: '宿主还没加载开章接口；刷新或重启 DSH 后再试。' })
          return
        }
        setStartPhase('starting')
        setSaveState({ phase: 'idle', message: '' })
        try {
          const result = await Promise.resolve(remote.startChapter(sessionId, { book: bookName, chapter: chapterNo })).then(unwrap)
          if (!result || result.ok === false) {
            setSaveState({ phase: 'error', message: result?.message || result?.code || '开章失败' })
            setStartPhase('idle')
            return
          }
          setSaveState({ phase: 'saved', message: '第 ' + chapterNo + ' 章已装配。' })
          setStartPhase('idle')
          await load()
        } catch (error) {
          setSaveState({ phase: 'error', message: String(error?.message ?? error) })
          setStartPhase('idle')
        }
      }, [remote, sessionId, load])

      React.useEffect(function () {
        if (section !== 'beat' || !remote || !data || !data.book) return undefined
        let alive = true
        const chapter = data.session && data.session.chapter ? data.session.chapter : null
        Promise.all([
          Promise.resolve(remote.getDecisions(sessionId, { book: data.book, chapter })).then(unwrap).catch(() => null),
          Promise.resolve(remote.getMemory(sessionId, { book: data.book, chapter })).then(unwrap).catch(() => null),
        ]).then(function ([decisions, memory]) {
          if (alive) setStoryData({ decisions, memory })
        })
        return function () { alive = false }
      }, [section, remote, sessionId, data])

      React.useEffect(function () {
        if (section !== 'fade' || !remote || !data || !data.book) return undefined
        let alive = true
        Promise.resolve(remote.getMemory(sessionId, { book: data.book, limit: 80, currentChapter: data.session ? data.session.chapter : null }))
          .then(unwrap)
          .then(function (memory) { if (alive) setFadeData(memory) })
          .catch(function () { if (alive) setFadeData(null) })
        return function () { alive = false }
      }, [section, remote, sessionId, data])

      React.useEffect(function () {
        if (!['data', 'voice', 'fanfic'].includes(section) || !remote || !data || !data.book) return undefined
        let alive = true
        Promise.all([
          Promise.resolve(remote.getStyle(sessionId, { book: data.book })).then(unwrap).catch(() => null),
          Promise.resolve(remote.getCanon(sessionId, { book: data.book })).then(unwrap).catch(() => null),
        ]).then(function ([style, canon]) {
          if (alive) setMaterialData({ style, canon })
        })
        return function () { alive = false }
      }, [section, remote, sessionId, data])

      const books = (data && data.workspace && data.workspace.beat) || []
      const draft = data && data.session && data.session.draft
      const session = data && data.session ? data.session : null
      const pendingIds = session && Array.isArray(session.pendingDecisionIds) ? session.pendingDecisionIds : []
      const conflictTotal = data && data.conflicts ? (data.conflicts.total || 0) : 0
      const workbenchLastChapter = data && data.history && Array.isArray(data.history.chapters) && data.history.chapters.length
        ? Math.max(...data.history.chapters.map((item) => Number(item.chapter) || 0))
        : 0
      const nextAction = deriveNextAction({ session, lastChapter: workbenchLastChapter })
      const workbenchNextChapter = nextAction.chapter
      const deskPrimary = !data || !data.book
        ? { label: '先选择一本书', action: null, disabled: true }
        : nextAction.kind === 'decide'
          ? { label: '去故事里拍板', action: function () { setSection('beat') }, disabled: false }
          : nextAction.kind === 'start'
            ? { label: startPhase === 'starting' ? '正在装配…' : '开第 ' + workbenchNextChapter + ' 章', action: function () { startChapterFromDesk(data.book, workbenchNextChapter) }, disabled: startPhase === 'starting' }
            : nextAction.kind === 'blockers'
              ? { label: '去章节修 blocker', action: function () { setSection('chapter') }, disabled: false }
              : { label: '去章节继续写', action: function () { setSection('chapter') }, disabled: false }
      const flowSteps = [
        { id: 'preflight', label: '计划 / 提案', done: !!(session && session.plan) },
        { id: 'write', label: '正文草稿', done: !!(session && session.draft) },
        { id: 'verify', label: '检查', done: !!(session && session.verification) },
        { id: 'close', label: '事务收尾', done: !!(session && session.state === 'completed') },
      ]

      const sectionLabel = { desk: '书桌', chapter: '正文', beat: '故事', fade: '记忆', voice: '风格', fanfic: '同人', data: '资料' }
      const sectionButton = (key) => h('button', {
        key,
        type: 'button',
        onClick: function () { setSection(key) },
        style: {
          appearance: 'none', border: '1px solid ' + (section === key ? c.brand : c.border),
          background: section === key ? c.layer : 'transparent', color: section === key ? c.text : c.sub,
          borderRadius: 999, padding: '3px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
        },
      }, sectionLabel[key])

      function deskView() {
        const stat = (label, value, color) => h('div', { style: { border: '1px solid ' + c.border, borderRadius: 10, padding: '8px 10px', minWidth: 0 } },
          h('div', { style: { ...faint, fontSize: 10 } }, label),
          h('div', { style: { fontSize: 16, color: color || c.text, marginTop: 2 } }, value))
        return h('div', { style: { padding: '18px 20px 28px', overflowY: 'auto' } },
          h('div', { style: { maxWidth: 760 } },
            h('div', { style: { padding: '18px 18px 16px', border: '1px solid ' + c.border, borderRadius: 16, background: c.layer, boxShadow: '0 2px 14px rgba(0,0,0,.05)' } },
              h('div', { style: { ...faint, fontSize: 10.5, letterSpacing: '.12em' } }, 'NEXT · 下一笔'),
              h('div', { style: { fontSize: 24, fontWeight: 700, margin: '7px 0 4px', letterSpacing: '-.02em' } }, nextAction.title),
              h('div', { style: { color: c.sub, fontSize: 13, lineHeight: 1.7 } }, nextAction.detail),
              h('div', { style: { display: 'flex', gap: 8, marginTop: 14 } },
                h('button', { type: 'button', disabled: deskPrimary.disabled || !deskPrimary.action, onClick: deskPrimary.action || undefined, style: { appearance: 'none', border: 'none', background: deskPrimary.disabled ? c.border : c.brand, color: deskPrimary.disabled ? c.faint : c.onBrand, borderRadius: 9, padding: '9px 14px', fontSize: 12.5, fontWeight: 600, cursor: deskPrimary.disabled ? 'default' : 'pointer', fontFamily: 'inherit' } }, deskPrimary.label),
                h('button', { type: 'button', onClick: function () { load() }, style: { appearance: 'none', border: '1px solid ' + c.border, background: 'transparent', color: c.sub, borderRadius: 9, padding: '9px 14px', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' } }, '刷新'))),
            saveState.message ? h('div', { style: { marginTop: 8, color: saveState.phase === 'error' ? c.error : c.sub, fontSize: 11.5 } }, saveState.message) : null,
            h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginTop: 14 } },
              stat('当前章', session ? '第 ' + session.chapter + ' 章' : '—'),
              stat('状态', session ? session.state : '—', session && session.state === 'completed' ? c.success : c.text),
              stat('字数', session && session.draft ? (session.draft.chars ?? '?') : '—'),
              stat('待处理', String(pendingIds.length + conflictTotal), pendingIds.length + conflictTotal > 0 ? c.error : c.text)),
            h('div', { style: { marginTop: 14, padding: 12, border: '1px solid ' + c.border, borderRadius: 12, background: c.base } },
              h('div', { style: { ...faint, fontSize: 11, letterSpacing: '.04em', marginBottom: 8 } }, '章节流程'),
              h('div', { style: { display: 'flex', gap: 6 } },
                flowSteps.map((step, index) => h('div', { key: step.id, style: { flex: 1, padding: '8px 6px', borderRadius: 8, border: '1px solid ' + (step.done ? c.success : c.border), background: c.layer, textAlign: 'center' } },
                  h('div', { style: { fontSize: 9.5, color: c.faint } }, 'STEP ' + (index + 1)),
                  h('div', { style: { fontSize: 11, fontWeight: 600, marginTop: 2 } }, step.label),
                  h('div', { style: { fontSize: 9.5, color: step.done ? c.success : c.faint, marginTop: 2 } }, step.done ? '完成' : '待做'))))),
            h('div', { style: { ...faint, margin: '16px 0 5px' } }, '收件箱'),
            pendingIds.length === 0 && conflictTotal === 0
              ? h('div', { style: faint }, '没有待处理事项。')
              : h('div', null,
                  pendingIds.slice(0, 6).map((id) => h('div', { key: id, style: { ...row, borderBottom: '1px dashed ' + c.border, padding: '5px 0' } },
                    h('span', { style: small }, '拍板 · ' + id),
                    h('span', { style: { color: c.faint, fontSize: 11 } }, '待作者确认'))),
                  (data.conflicts && data.conflicts.items ? data.conflicts.items : []).slice(0, 4).map((item, index) => h('div', { key: 'c' + index, style: { ...row, borderBottom: '1px dashed ' + c.border, padding: '5px 0' } },
                    h('span', { style: small }, '冲突 · ' + (item.entity || '?') + ' · ' + (item.key || '?')),
                    h('span', { style: { color: c.faint, fontSize: 11 } }, '只报告，不裁决')))),
            h('div', { style: { ...faint, margin: '16px 0 5px' } }, '最近章节'),
            (data && data.history && data.history.chapters ? data.history.chapters : []).slice(0, 8).map((item, index) => h('div', { key: index, style: { ...row, borderBottom: '1px dashed ' + c.border, padding: '5px 0' } },
              h('span', { style: small }, '第 ' + item.chapter + ' 章'),
              h('span', { style: { color: c.faint, fontSize: 11 } }, (item.state || '?') + (item.chars ? ' · ' + item.chars + ' 字' : '')))),
          ))
      }

      function beatView() {
        if (!storyData) return h('div', { style: { padding: 18 } }, h('span', { style: faint }, '加载故事数据…'))
        const decisions = storyData.decisions || {}
        const memory = storyData.memory || {}
        const committed = decisions.committed || []
        const proposals = decisions.proposals || []
        const chapters = data && data.history && data.history.chapters ? data.history.chapters : []
        const query = beatQuery.trim().toLowerCase()
        const match = (text) => !query || String(text || '').toLowerCase().includes(query)
        const filteredCommitted = committed.filter((item) => match(item.title) || match(item.change))
        const filteredProposals = proposals.filter((item) => match(item.title) || (item.options || []).some((option) => match(option.label)))
        const tab = (key, label, count) => h('button', {
          key,
          type: 'button',
          onClick: function () { setBeatTab(key) },
          style: { appearance: 'none', border: '1px solid ' + (beatTab === key ? c.brand : c.border), background: beatTab === key ? c.layer : 'transparent', color: beatTab === key ? c.text : c.sub, borderRadius: 999, padding: '3px 10px', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' },
        }, label + (count !== undefined ? ' ' + count : ''))
        const map = h('div', null,
          h('input', {
            value: beatQuery,
            placeholder: '搜决策、选项、变更…',
            onChange: function (event) { setBeatQuery(event.target.value) },
            style: { width: '100%', boxSizing: 'border-box', border: '1px solid ' + c.border, borderRadius: 9, background: c.layer, color: c.text, padding: '8px 10px', fontSize: 12, fontFamily: 'inherit', marginBottom: 10 },
          }),
          decisions.styleHint ? h('div', { style: { ...faint, marginBottom: 8 } }, decisions.styleHint) : null,
          h('div', { style: { ...faint, marginBottom: 5 } }, '已拍板'),
          filteredCommitted.length === 0 ? h('div', { style: faint }, query ? '没有匹配的决策。' : '还没有已拍板决策。') : filteredCommitted.map((item) => h('div', { key: item.id, style: { padding: '10px 12px', border: '1px solid ' + c.border, borderRadius: 10, background: c.layer, marginBottom: 6 } },
            h('div', { style: { display: 'flex', gap: 6, alignItems: 'baseline' } },
              h('span', { style: { fontSize: 10, color: c.brand, fontWeight: 700 } }, 'CH ' + (item.chapter ?? '?')),
              h('span', { style: { fontSize: 13, fontWeight: 600 } }, item.title),
              h('span', { style: { marginLeft: 'auto', ...faint, fontSize: 10 } }, item.option || '')),
            h('div', { style: { color: c.sub, fontSize: 12, marginTop: 3, lineHeight: 1.55 } }, item.change))),
          h('div', { style: { ...faint, margin: '14px 0 5px' } }, '待拍板'),
          filteredProposals.length === 0 ? h('div', { style: faint }, '没有待拍板提案。') : filteredProposals.map((item) => h('div', { key: item.id, style: { padding: '10px 12px', border: '1px solid ' + c.warning, borderRadius: 10, background: c.layer, marginBottom: 6 } },
            h('div', { style: { fontSize: 13, fontWeight: 600 } }, item.title),
            (item.options || []).map((option, index) => h('div', { key: index, style: { color: c.sub, fontSize: 12, marginTop: 3 } },
              '· ' + option.label + (option.styleFit ? ' · 文风 ' + option.styleFit : '') + (option.styleWhy ? ' — ' + option.styleWhy : ''))))))
        const timeline = h('div', null,
          committed.length === 0 && chapters.length === 0 ? h('div', { style: faint }, '还没有时间线事件。') : h('div', null,
            committed.slice(0, 30).map((item) => h('div', { key: 'd' + item.id, style: { display: 'flex', gap: 10, padding: '7px 0', borderBottom: '1px dashed ' + c.border } },
              h('span', { style: { ...faint, width: 72, flexShrink: 0 } }, '第 ' + (item.chapter ?? '?') + ' 章'),
              h('span', { style: { color: c.brand, fontSize: 10, width: 42, flexShrink: 0 } }, '拍板'),
              h('span', { style: { fontSize: 12, color: c.sub } }, item.title + (item.change ? '：' + item.change : '')))),
            chapters.slice(0, 20).map((item) => h('div', { key: 'h' + item.chapter, style: { display: 'flex', gap: 10, padding: '7px 0', borderBottom: '1px dashed ' + c.border } },
              h('span', { style: { ...faint, width: 72, flexShrink: 0 } }, '第 ' + item.chapter + ' 章'),
              h('span', { style: { color: c.success, fontSize: 10, width: 42, flexShrink: 0 } }, '完稿'),
              h('span', { style: { fontSize: 12, color: c.sub } }, (item.state || '?') + (item.chars ? ' · ' + item.chars + ' 字' : ''))))))
        const health = h('div', null,
          h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 } },
            h('div', { style: { border: '1px solid ' + c.border, borderRadius: 10, padding: 10 } }, h('div', { style: { ...faint, fontSize: 10 } }, '待拍板'), h('div', { style: { fontSize: 20, fontWeight: 700, color: proposals.length ? c.warning : c.text } }, String(proposals.length))),
            h('div', { style: { border: '1px solid ' + c.border, borderRadius: 10, padding: 10 } }, h('div', { style: { ...faint, fontSize: 10 } }, '未回收线索'), h('div', { style: { fontSize: 20, fontWeight: 700 } }, String((memory.threads || []).length))),
            h('div', { style: { border: '1px solid ' + c.border, borderRadius: 10, padding: 10 } }, h('div', { style: { ...faint, fontSize: 10 } }, '冲突'), h('div', { style: { fontSize: 20, fontWeight: 700, color: conflictTotal ? c.error : c.text } }, String(conflictTotal)))),
          h('div', { style: { ...faint, margin: '12px 0 5px' } }, '本章检查'),
          session && session.verification ? h('div', { style: { color: session.verification.blockers ? c.error : c.success, fontSize: 12 } }, 'blocker ' + session.verification.blockers + ' · warning ' + session.verification.warnings) : h('div', { style: faint }, '还没有检查记录。'),
          h('div', { style: { ...faint, margin: '12px 0 5px' } }, '未回收线索'),
          (memory.threads || []).length === 0 ? h('div', { style: faint }, '没有未回收线索。') : (memory.threads || []).slice(0, 12).map((thread) => h('div', { key: thread.id, style: { ...row, borderBottom: '1px dashed ' + c.border } },
            h('span', { style: small }, thread.text), h('span', { style: { ...faint, fontSize: 10 } }, '第 ' + thread.chapter + ' 章'))))
        return h('div', { style: { padding: '18px 20px 28px', overflowY: 'auto' } },
          h('div', { style: { maxWidth: 820 } },
            h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8 } },
              h('div', { style: { fontSize: 20, fontWeight: 700 } }, '故事 / 拍板'),
              h('span', { style: faint }, 'beat rev ' + (data && data.ledgers && data.ledgers.beat ? data.ledgers.beat.revision : '-'))),
            h('div', { style: { display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' } },
              tab('map', '地图', committed.length + proposals.length), tab('timeline', '时间线', committed.length), tab('health', '体检')),
            h('div', { style: { marginTop: 12 } }, beatTab === 'map' ? map : beatTab === 'timeline' ? timeline : health)))
      }

      function fadeView() {
        if (!fadeData) return h('div', { style: { padding: 18 } }, h('span', { style: faint }, '加载记忆…'))
        const cards = fadeData.cards || []
        const threads = fadeData.threads || []
        const entities = fadeData.entities || []
        const stat = (label, value) => h('div', { style: { border: '1px solid ' + c.border, borderRadius: 12, padding: '10px 12px', background: c.layer } },
          h('div', { style: { ...faint, fontSize: 10.5 } }, label),
          h('div', { style: { fontSize: 18, fontWeight: 700, marginTop: 2 } }, String(value)))
        return h('div', { style: { padding: '18px 20px 28px', overflowY: 'auto' } },
          h('div', { style: { maxWidth: 780 } },
            h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8 } },
              h('div', { style: { fontSize: 20, fontWeight: 700 } }, '长篇记忆'),
              h('span', { style: faint }, 'rev ' + (fadeData.revision ?? '-') + (fadeData.drift ? ' · drift' : ''))),
            h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginTop: 12 } },
              stat('卡片', fadeData.total || cards.length), stat('未回收线索', threads.length), stat('人物', entities.length), stat('已褪', cards.filter((card) => card.status === 'forgotten').length)),
            h('div', { style: { ...faint, margin: '16px 0 6px' } }, '记忆卡'),
            cards.length === 0 ? h('div', { style: faint }, '还没有记忆卡；收尾一章后生成。') : cards.slice(0, 24).map((card) => h('div', { key: card.id, style: { padding: '10px 12px', border: '1px solid ' + c.border, borderRadius: 10, marginBottom: 6, background: c.layer } },
              h('div', { style: { display: 'flex', gap: 8, alignItems: 'baseline' } },
                h('span', { style: { fontSize: 10, color: c.brand, fontWeight: 700 } }, card.layer || 'L2'),
                h('span', { style: { fontSize: 10 } }, '第 ' + card.chapter + ' 章'),
                h('span', { style: { marginLeft: 'auto', ...faint, fontSize: 10 } }, card.status || 'active')),
              h('div', { style: { fontSize: 12.5, marginTop: 4, lineHeight: 1.6 } }, card.gist || '（无摘要）'),
              card.emotion ? h('div', { style: { ...faint, marginTop: 2 } }, card.emotion) : null)),
            h('div', { style: { ...faint, margin: '14px 0 6px' } }, '未回收线索'),
            threads.length === 0 ? h('div', { style: faint }, '没有未回收线索。') : threads.slice(0, 12).map((thread) => h('div', { key: thread.id, style: { ...row, borderBottom: '1px dashed ' + c.border } },
              h('span', { style: small }, thread.text), h('span', { style: { ...faint, fontSize: 10 } }, '第 ' + thread.chapter + ' 章'))),
            h('div', { style: { ...faint, margin: '14px 0 6px' } }, '常出现人物'),
            entities.length === 0 ? h('div', { style: faint }, '还没有人物统计。') : h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
              entities.slice(0, 20).map((entity) => h('span', { key: entity.name, style: { border: '1px solid ' + c.border, borderRadius: 999, padding: '3px 8px', fontSize: 11 } }, entity.name + ' ×' + entity.mentions)))))
      }

      function voiceView() {
        if (!materialData) return h('div', { style: { padding: 18 } }, h('span', { style: faint }, '加载文风…'))
        const style = materialData.style || {}
        const profiles = style.kitProfiles || []
        return h('div', { style: { padding: '18px 20px 28px', overflowY: 'auto' } },
          h('div', { style: { maxWidth: 780 } },
            h('div', { style: { fontSize: 20, fontWeight: 700 } }, '风格工作室'),
            h('div', { style: { ...faint, marginTop: 2 } }, '先确认档案，再用于写作简报与决策提示。'),
            h('div', { style: { ...faint, margin: '16px 0 6px' } }, '文风档案'),
            profiles.length === 0 ? h('div', { style: faint }, '还没有文风档案；在右栏「设置与详情 → 学文笔」导入。') : profiles.map((profile) => h('div', { key: profile.id, style: { padding: 14, border: '1px solid ' + c.border, borderRadius: 12, background: c.layer, marginBottom: 8 } },
              h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8 } },
                h('div', { style: { fontSize: 15, fontWeight: 700 } }, profile.name || profile.id),
                h('span', { style: { fontSize: 10, color: profile.status === 'confirmed' ? c.success : c.warning } }, profile.status === 'confirmed' ? '已确认' : '待确认'),
                h('span', { style: { marginLeft: 'auto', ...faint, fontSize: 10 } }, 'v' + (profile.version ?? '?') + ' · rev ' + (profile.revision ?? 0))),
              h('div', { style: { ...faint, marginTop: 6 } }, (profile.rules || []).length + ' 条规则 · ' + (profile.avoid || []).length + ' 个避免词'),
              h('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 } },
                Object.entries(profile.bands || {}).slice(0, 6).map(([key, spec]) => {
                  const band = Array.isArray(spec) ? spec : spec && Array.isArray(spec.band) ? spec.band : null
                  return band ? h('span', { key, style: { border: '1px solid ' + c.border, borderRadius: 999, padding: '2px 7px', fontSize: 10 } }, key + ' ' + band[0] + '–' + band[1]) : null
                })))),
            h('div', { style: { ...faint, margin: '14px 0 6px' } }, '旧 voice 书库'),
            (style.works || []).length ? (style.works || []).map((work) => h('div', { key: work.workId, style: { ...row, borderBottom: '1px dashed ' + c.border } },
              h('span', { style: small }, work.title || work.workId), h('span', { style: { ...faint, fontSize: 10 } }, work.chapters + ' 章 · ' + work.chars + ' 字'))) : h('div', { style: faint }, '没有旧 voice 书库；kit 的档案在下方/上方。')))
      }

      function fanficView() {
        if (!materialData) return h('div', { style: { padding: 18 } }, h('span', { style: faint }, '加载同人资料…'))
        const canon = materialData.canon || {}
        if (!canon.available) return h('div', { style: { padding: 18 } }, h('span', { style: faint }, '没有绑定同人 canon；在右栏「设置与详情 → 写同人」导入。'))
        const section = (title, items, render) => h('div', { style: { marginTop: 14 } },
          h('div', { style: { ...faint, marginBottom: 5 } }, title + ' · ' + items.length),
          items.length ? items.slice(0, 20).map(render) : h('div', { style: faint }, '暂无'))
        return h('div', { style: { padding: '18px 20px 28px', overflowY: 'auto' } },
          h('div', { style: { maxWidth: 780 } },
            h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8 } },
              h('div', { style: { fontSize: 20, fontWeight: 700 } }, canon.title || '同人原著'),
              h('span', { style: { fontSize: 10, color: canon.canonReady ? c.success : c.warning } }, canon.canonReady ? 'canon 已确认' : (canon.contractStatus || '待抽取'))),
            h('div', { style: { ...faint, marginTop: 2 } }, '原著 ' + (canon.sourceId || '-') + ' · rev ' + (canon.revision ?? '-')),
            section('事实', canon.facts || [], (fact, index) => h('div', { key: index, style: { ...row, borderBottom: '1px dashed ' + c.border } },
              h('span', { style: small }, String(fact.entity ?? fact.subjectName ?? '?') + (fact.key ? '·' + fact.key : '') + '：' + String(fact.value ?? fact.object ?? '')))),
            section('人物', canon.characters || [], (person, index) => h('div', { key: index, style: { ...row, borderBottom: '1px dashed ' + c.border } },
              h('span', { style: small }, person.name || '?'), h('span', { style: { ...faint, fontSize: 10 } }, person.role || ''))),
            section('世界规则', canon.worldRules || [], (rule, index) => h('div', { key: index, style: small }, '- ' + (typeof rule === 'string' ? rule : rule?.text ?? ''))),
            section('禁忌', canon.forbidden || [], (item, index) => h('div', { key: index, style: small }, '- ' + String(typeof item === 'string' ? item : item?.text ?? ''))),
            section('称呼', canon.addresses || [], (row, index) => h('div', { key: index, style: small }, (row.from || '?') + '→' + (row.to || '?') + '：' + (row.form || '')))))
      }

      function flowView() {
        const steps = [
          { id: 'preflight', label: '计划 / 提案', done: !!(session && session.plan) },
          { id: 'write', label: '正文草稿', done: !!(session && session.draft) },
          { id: 'verify', label: '检查', done: !!(session && session.verification) },
          { id: 'close', label: '收尾事务', done: !!(session && session.state === 'completed') },
        ]
        return h('div', { style: { padding: '18px 20px 28px', overflowY: 'auto' } },
          h('div', { style: { maxWidth: 780 } },
            h('div', { style: { fontSize: 20, fontWeight: 700 } }, '编排 / 运行记录'),
            h('div', { style: { ...faint, marginTop: 2 } }, 'kit 的 runbook：计划 → 正文 → 检查 → 事务收尾；失败时从这里恢复。'),
            h('div', { style: { display: 'flex', gap: 6, marginTop: 14 } },
              steps.map((step, index) => h('div', { key: step.id, style: { flex: 1, padding: '10px 8px', borderRadius: 10, border: '1px solid ' + (step.done ? c.success : c.border), background: c.layer, textAlign: 'center' } },
                h('div', { style: { fontSize: 10, color: c.faint } }, 'STEP ' + (index + 1)),
                h('div', { style: { fontSize: 11.5, fontWeight: 600, marginTop: 2 } }, step.label),
                h('div', { style: { fontSize: 10, color: step.done ? c.success : c.faint, marginTop: 2 } }, step.done ? '完成' : '待做')))),
            h('div', { style: { ...faint, margin: '16px 0 6px' } }, '会话'),
            h('div', { style: { ...row, borderBottom: '1px dashed ' + c.border } }, h('span', { style: small }, '章节'), h('span', null, session ? '第 ' + session.chapter + ' 章' : '—')),
            h('div', { style: { ...row, borderBottom: '1px dashed ' + c.border } }, h('span', { style: small }, '状态'), h('span', null, session ? session.state : '—')),
            h('div', { style: { ...row, borderBottom: '1px dashed ' + c.border } }, h('span', { style: small }, '事务'), h('span', { style: { fontSize: 11 } }, (session && (session.transactionId || session.receiptIds?.join(', '))) || '—')),
            h('div', { style: { ...row, borderBottom: '1px dashed ' + c.border } }, h('span', { style: small }, 'blocker / warning'), h('span', null, session && session.verification ? session.verification.blockers + ' / ' + session.verification.warnings : '—')),
            h('div', { style: { ...faint, margin: '14px 0 6px' } }, '能力矩阵'),
            [['beat', '剧情/拍板'], ['fade', '长篇记忆'], ['voice', '文风'], ['fanfic', '同人']].map(([key, label]) => h('div', { key, style: { ...row, borderBottom: '1px dashed ' + c.border } },
              h('span', { style: small }, label), h('span', { style: { fontSize: 10, color: c.faint } }, (data && data.ledgers && data.ledgers[key]) ? '有数据' : '未接入')))))
      }

      function dataView() {
        if (!materialData) return h('div', { style: { padding: 18 } }, h('span', { style: faint }, '加载资料…'))
        const style = materialData.style || {}
        const canon = materialData.canon || {}
        return h('div', { style: { padding: '14px 18px', overflowY: 'auto' } },
          h('div', { style: { maxWidth: 760 } },
            h('div', { style: { ...faint, marginBottom: 5 } }, '本章依据'),
            (data && data.contexts ? data.contexts : []).map((segment) => h('div', { key: segment.component, style: { ...row, borderBottom: '1px dashed ' + c.border, padding: '6px 0' } },
              h('span', { style: small }, segment.component),
              h('span', { style: { color: segment.available ? c.sub : c.faint, fontSize: 11.5 } },
                segment.available ? `${segment.chars}/${segment.budgetChars ?? '?'} · rev ${segment.revision ?? '-'}` : '未接入'))),
            h('div', { style: { ...faint, margin: '14px 0 4px' } }, '文风档案'),
            (style.kitProfiles || []).length
              ? (style.kitProfiles || []).map((profile) => h('div', { key: profile.id, style: { ...row, borderBottom: '1px dashed ' + c.border, padding: '5px 0' } },
                  h('span', { style: small }, (profile.name || profile.id) + ' · ' + profile.status),
                  h('span', { style: { color: c.faint, fontSize: 11 } }, (profile.rules || []).length + ' 条规则')))
              : h('div', { style: faint }, '还没有导入文风档案。'),
            h('div', { style: { ...faint, margin: '14px 0 4px' } }, '同人 canon'),
            canon.available
              ? h('div', { style: { ...faint } }, (canon.title || canon.id || '?') + ' · ' + (canon.canonReady ? '已确认' : (canon.contractStatus || '待抽取')))
              : h('div', { style: faint }, '没有绑定同人 canon。'),
          ))
      }

      return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', background: c.base, color: c.text, fontSize: 13 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px 10px', borderBottom: '1px solid ' + c.border } },
          h('div', { style: { minWidth: 0 } },
            h('div', { style: { ...faint, fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase' } }, 'NOVEL WORKBENCH'),
            h('div', { style: { fontSize: 17, fontWeight: 700, marginTop: 2, letterSpacing: '-.02em' } }, (data && data.book) || '小说工作台')),
          h('span', { style: { color: data && data.session ? c.sub : c.faint, border: '1px solid ' + c.border, borderRadius: 999, padding: '3px 9px', fontSize: 11 } },
            data && data.session ? '第 ' + data.session.chapter + ' 章 · ' + data.session.state : '无活动会话'),
          h('span', { style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 } },
            books.length
              ? h('select', {
                  value: book || (data && data.book) || '',
                  onChange: function (event) { setBook(event.target.value); load(event.target.value) },
                  style: { fontSize: 12, padding: '5px 8px', borderRadius: 8, border: '1px solid ' + c.border, background: c.layer, color: c.text, fontFamily: 'inherit' },
                }, books.map((name) => h('option', { key: name, value: name }, name)))
              : null,
            h('button', {
              type: 'button',
              onClick: function () { load() },
              style: { appearance: 'none', border: '1px solid ' + c.border, background: 'transparent', color: c.sub, borderRadius: 8, padding: '5px 9px', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' },
            }, state.phase === 'refreshing' ? '…' : '刷新'),
            embedded && onClose
              ? h('button', { type: 'button', onClick: onClose, style: { appearance: 'none', border: '1px solid ' + c.border, background: 'transparent', color: c.sub, borderRadius: 8, padding: '5px 9px', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' } }, '返回任务卡')
              : null),
        ),
        state.error ? h('div', { style: { color: c.error, padding: '8px 18px' } }, state.error) : null,
        h('div', { style: { display: 'flex', gap: 6, padding: '8px 18px', borderBottom: '1px solid ' + c.border, background: c.layer } },
          ['desk', 'chapter', 'beat', 'fade', 'voice', 'fanfic', 'data'].map(sectionButton)),
        section === 'chapter' ? h('div', { style: { display: 'flex', gap: 0, flex: 1, minHeight: 0 } },
          h('div', { style: { flex: 1, minWidth: 0, padding: '10px 14px', display: 'flex', flexDirection: 'column', minHeight: 0 } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 } },
              h('span', { style: faint }, draft ? `正文 v${draft.version} · ${draftState.loaded ? draftState.chars : (draft.chars ?? '?')} 字` : '还没有正文草稿'),
              h('span', { style: { color: draftState.dirty ? c.error : c.faint, fontSize: 11 } }, draftState.dirty ? '未保存' : (draftState.loaded ? '已保存' : '')),
              h('span', { style: { marginLeft: 'auto', color: saveState.phase === 'error' ? c.error : c.sub, fontSize: 11 } }, saveState.message),
              h('button', {
                type: 'button',
                onClick: function () { if (session) loadDraft(session) },
                style: { appearance: 'none', border: '1px solid ' + c.border, background: 'transparent', color: c.sub, borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: session ? 'pointer' : 'default', fontFamily: 'inherit' },
              }, '重新载入'),
              h('button', {
                type: 'button',
                disabled: !draftState.dirty || !session || saveState.phase === 'saving',
                onClick: function () { saveDraft() },
                style: {
                  appearance: 'none', border: '1px solid ' + (draftState.dirty && session ? c.brand : c.border),
                  background: draftState.dirty && session ? c.layer : 'transparent', color: draftState.dirty && session ? c.text : c.faint,
                  borderRadius: 6, padding: '3px 10px', fontSize: 11.5, cursor: draftState.dirty && session ? 'pointer' : 'default', fontFamily: 'inherit',
                },
              }, saveState.phase === 'saving' ? '保存中…' : '保存草稿（Ctrl S）')),
            typeof remote.getDraft === 'function'
              ? h('textarea', {
                  value: draftState.loaded ? draftState.text : (draft && draft.text ? draft.text : ''),
                  placeholder: '在这里写本章正文；保存后旧检查作废。',
                  spellCheck: false,
                  onChange: function (event) { editVersionRef.current += 1; setDraftState((prev) => ({ ...prev, text: event.target.value, dirty: true, loaded: true })) },
                  onKeyDown: function (event) {
                    if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === 's') {
                      event.preventDefault()
                      saveDraft()
                    }
                  },
                  style: {
                    flex: 1, width: '100%', minHeight: 220, resize: 'none', boxSizing: 'border-box',
                    border: '1px solid ' + c.border, borderRadius: 8, background: c.base, color: c.text,
                    fontFamily: 'inherit', fontSize: 13, lineHeight: 1.8, padding: 10,
                  },
                })
              : h('pre', {
                  style: {
                    margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13, lineHeight: 1.8,
                    color: draft ? c.text : c.faint, fontFamily: 'inherit',
                  },
                }, draft && draft.text ? draft.text : '（当前 DSH/插件版本没有完整草稿读写；升级后工作台可编辑。）'),
          ),
          h('div', { style: { width: 260, flexShrink: 0, borderLeft: '1px solid ' + c.border, padding: '10px 12px', overflowY: 'auto' } },
            h('div', { style: { ...faint, marginBottom: 4 } }, '写作依据'),
            (data && data.contexts ? data.contexts : []).map(function (segment) {
              return h('div', { key: segment.component, style: { ...row, borderBottom: 'none', padding: '3px 0' } },
                h('span', { style: small }, segment.component),
                h('span', { style: { color: segment.available ? c.sub : c.faint, fontSize: 11.5 } },
                  segment.available ? `${segment.chars}/${segment.budgetChars ?? '?'} · rev ${segment.revision ?? '-'}` : '未接入'),
              )
            }),
            h('div', { style: { ...faint, margin: '10px 0 4px' } }, '账本'),
            (data && data.ledgers ? Object.entries(data.ledgers) : []).map(function ([name, value]) {
              return h('div', { key: name, style: { ...row, borderBottom: 'none', padding: '2px 0' } },
                h('span', { style: small }, name),
                h('span', { style: { color: value ? c.sub : c.faint, fontSize: 11.5 } }, value ? `rev ${value.revision ?? '-'}` : '无'),
              )
            }),
            data && data.history && data.history.chapters && data.history.chapters.length
              ? h('div', { style: { marginTop: 8 } },
                  h('div', { style: faint }, '最近章节'),
                  data.history.chapters.slice(0, 6).map(function (item, index) {
                    return h('div', { key: index, style: { ...row, borderBottom: 'none', padding: '2px 0' } },
                      h('span', { style: small }, '第 ' + item.chapter + ' 章'),
                      h('span', { style: { color: c.faint, fontSize: 11 } }, (item.state || '?') + (item.chars ? ' · ' + item.chars + ' 字' : '')),
                    )
                  }))
              : null,
            data && data.session && data.session.chapterFile
              ? h('div', { style: { marginTop: 8 } },
                  h('div', { style: faint }, '正文文件'),
                  h('div', { style: { color: c.sub, fontSize: 11, wordBreak: 'break-all' } }, data.session.chapterFile))
              : null,
            data && data.session && data.session.verification
              ? h('div', { style: { marginTop: 8 } },
                  h('div', { style: faint }, '本章检查'),
                  h('div', { style: { color: data.session.verification.blockers ? c.error : c.sub, fontSize: 11.5 } },
                    'blocker ' + data.session.verification.blockers + ' · warning ' + data.session.verification.warnings),
                  data.session.verification.metrics
                    ? h('div', { style: { color: c.faint, fontSize: 11 } },
                        '句长 ' + data.session.verification.metrics.sentenceMean + ' / CV ' + data.session.verification.metrics.sentenceCv + ' / 对话 ' + data.session.verification.metrics.dialogueRatio)
                    : null)
              : null,
          ),
        ) : section === 'desk' ? deskView() : section === 'beat' ? beatView() : section === 'fade' ? fadeView() : section === 'voice' ? voiceView() : section === 'fanfic' ? fanficView() : dataView(),
      )
    }

    function OpenButton(props) {      return h('button', {
        type: 'button',
        title: '小说：章节引擎 / 四段上下文 / 账本状态',
        onClick: props.open,
        style: {
          appearance: 'none', border: '1px solid var(--dsw-alias-border-l1)', background: 'transparent',
          color: 'var(--dsw-alias-label-secondary)', borderRadius: 6, padding: '2px 8px', fontSize: 12,
          lineHeight: '18px', cursor: 'pointer', fontFamily: 'inherit',
        },
      }, LABEL)
    }

    return {
      inject: ['slots', 'sidebarRight', 'sidebarRightTabs', 'remote'],
      async apply(ctx) {
        let panelRemote = null
        try {
          const dispose = await ctx.remote.$mount(TYPERT_REMOTE)
          if (typeof dispose === 'function') {
            ctx.effect(() => () => { try { dispose() } catch { /* 已卸载 */ } })
          }
          panelRemote = ctx.get('remote.novelKitPanel') ?? null
          if (!panelRemote) console.error('[novel-kit] remote.novelKitPanel 未注册')
        } catch (error) {
          console.error('[novel-kit] panel remote mount 失败', error)
        }

        ctx.effect(() => ctx.sidebarRightTabs.register({
          id: TAB_ID,
          kind: KIND,
          title: () => LABEL,
          icon: 'book',
          guide: [{
            title: () => '小说',
            description: () => '章节引擎、四段上下文与五本账的只读总览。',
          }],
        }))

        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: TAB_ID,
          inject: (sessionId) => ({ sessionId, remote: panelRemote, layout: ctx.get('layout') }),
        }, Panel)))

        // 小说工作台：会话级主视图（conversation.view），四入口 + 可编辑正文 + 依据/账本。
        ctx.effect(() => ctx.slots.inject('conversation.view', () => ctx.slots.register({
          name: 'conversation.view',
          id: 'novel-kit.chapter',
          label: '小说工作台',
          order: 20,
          inject: (sessionId) => ({ sessionId, remote: panelRemote }),
        }, Workbench)))

        ctx.effect(() => ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
          name: 'conversation.session.header.utilities',
          id: 'novel-kit-open',
          order: 35,
          inject: (sessionId) => ({
            open: () => ctx.sidebarRight.openTab(KIND),
            sessionId,
          }),
        }, OpenButton)))
      },
    }
  },
})


