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
        { method: 'importCanon', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
        { method: 'listSources', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
        { method: 'listStyleProfiles', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
        { method: 'getDraft', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
        { method: 'saveDraft', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
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
      error: 'var(--dsw-alias-state-error-primary)',
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

    function Panel(props) {
      const { sessionId, remote } = props
      const [state, setState] = React.useState({ phase: 'loading', data: null, diag: null, error: null })
      const [book, setBook] = React.useState('')
      const [pendingTakeover, setPendingTakeover] = React.useState(false)
      const [pendingCanon, setPendingCanon] = React.useState(false)
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
                      }).filter(Boolean).join('；') || '（无 bands）'))))
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

      const runConfirmCanon = React.useCallback(async function (canonValue) {
        if (!remote || !canonValue || !canonValue.sourceId) return
        const activeBook = book || (state.data && state.data.book) || null
        if (!activeBook) { setAction({ phase: 'error', message: '先选一本书' }); return }
        setAction({ phase: 'busy', message: '' })
        try {
          const result = await Promise.resolve(remote.confirmCanon(sessionId, { book: activeBook, sourceId: canonValue.sourceId })).then(unwrap)
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

      React.useEffect(function () { load() }, [load])

      const data = state.data
      const books = (data && data.workspace && data.workspace.beat) || []
      const panelSession = data && data.session ? data.session : null
      const panelPending = panelSession && Array.isArray(panelSession.pendingDecisionIds) ? panelSession.pendingDecisionIds.length : 0
      const panelNext = !panelSession
        ? { title: '还没有活动章节', detail: '先选书，或在聊天里开一章。' }
        : panelPending > 0
          ? { title: '先拍板 ' + panelPending + ' 个提案', detail: '作者确认后模型才能继续收尾。' }
          : panelSession.state === 'completed'
            ? { title: '本章已落账', detail: '开下一章，或查看最近章节。' }
            : panelSession.draft
              ? { title: '继续写第 ' + panelSession.chapter + ' 章', detail: (panelSession.draft.chars || 0) + ' 字 · ' + panelSession.state }
              : { title: '写第 ' + panelSession.chapter + ' 章', detail: '依据已装配，打开工作台开始写。' }

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 12px', color: c.text, background: c.base, height: '100%', overflowY: 'auto', fontSize: 12.5 } },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } },
          h('div', { style: { fontWeight: 600, fontSize: 13.5 } }, LABEL),
          h('button', {
            type: 'button',
            onClick: function () { load() },
            style: { appearance: 'none', border: '1px solid ' + c.border, background: 'transparent', color: c.sub, borderRadius: 6, padding: '2px 8px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' },
          }, state.phase === 'refreshing' ? '刷新中…' : '刷新'),
        ),
        books.length
          ? h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
              books.map(function (name) {
                const active = (book || (data && data.book)) === name
                return h('button', {
                  key: name, type: 'button',
                  onClick: function () { setBook(name); load(name) },
                  style: {
                    appearance: 'none', border: '1px solid ' + (active ? c.brand : c.border),
                    background: active ? c.layer : 'transparent', color: active ? c.text : c.sub,
                    borderRadius: 999, padding: '3px 10px', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit',
                  },
                }, name)
              }))
          : h('div', { style: faint }, '这个工作区还没有 beat 账本；先在聊天里 /novel on 后用 novel_plan 建书。'),

        state.error ? h('div', { style: { color: c.error, fontSize: 12 } }, state.error) : null,

        data ? h('div', null,
          h('div', { style: { border: '1px solid ' + c.border, borderRadius: 8, padding: '7px 9px', display: 'flex', flexDirection: 'column', gap: 7 } },
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
          ),
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
          h('div', { style: { border: '1px solid ' + c.border, borderRadius: 8, padding: '7px 9px', background: c.layer } },
            h('div', { style: { ...faint, fontSize: 10, letterSpacing: '.08em' } }, 'NEXT · 下一笔'),
            h('div', { style: { fontSize: 14, fontWeight: 600, margin: '2px 0' } }, panelNext.title),
            h('div', { style: { ...faint, fontSize: 10.5, lineHeight: 1.5 } }, panelNext.detail)),
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
          tab === 'overview' ? null : renderTab(),
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
      )
    }

    // ── 小说工作台（conversation.view）：书桌/章节/故事/资料四入口 ──────────────
    function Workbench(props) {
      const { sessionId, remote } = props
      const [state, setState] = React.useState({ phase: 'loading', data: null, diag: null, error: null })
      const [book, setBook] = React.useState('')
      const [draftState, setDraftState] = React.useState({ text: '', version: 0, hash: null, chars: 0, loaded: false, dirty: false })
      const [saveState, setSaveState] = React.useState({ phase: 'idle', message: '' })
      const [section, setSection] = React.useState('desk')
      const [storyData, setStoryData] = React.useState(null)
      const [materialData, setMaterialData] = React.useState(null)

      const requestRef = React.useRef(0)
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
            setDraftState({
              text: result.draft.text ?? '', version: result.draft.version ?? 0, hash: result.draft.hash ?? null,
              chars: result.draft.chars ?? 0, loaded: true, dirty: false,
            })
          } else {
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
            setSaveState({ phase: 'error', message })
            if (result && result.code === 'draft-conflict') await loadDraft(data.session)
            return
          }
          setDraftState((prev) => ({
            ...prev,
            version: result.draft?.version ?? prev.version,
            hash: result.draft?.hash ?? prev.hash,
            chars: result.draft?.chars ?? prev.chars,
            dirty: false,
            loaded: true,
          }))
          setSaveState({ phase: 'saved', message: '已保存 v' + (result.draft?.version ?? '?') })
          await load()
        } catch (error) {
          setSaveState({ phase: 'error', message: String(error?.message ?? error) })
        }
      }, [remote, sessionId, data, draftState, loadDraft, load])

      React.useEffect(function () {
        if (section !== 'story' || !remote || !data || !data.book) return undefined
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
        if (section !== 'data' || !remote || !data || !data.book) return undefined
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
      const nextAction = (function () {
        if (!session) return { title: '还没有活动章节', detail: '用 novel_plan / chapter_start 开一章；或先选一本书。' }
        if (pendingIds.length > 0) return { title: '先拍板 ' + pendingIds.length + ' 个提案', detail: '作者在拍板/收件箱确认后，模型才能继续收尾。' }
        if (session.verification && session.verification.blockers > 0) return { title: '先修 ' + session.verification.blockers + ' 个 blocker', detail: '收尾会被拦下；逐条定位正文再改。' }
        if (session.state === 'completed') return { title: '本章已落账，开下一章', detail: '第 ' + session.chapter + ' 章已完成；先计划再开写。' }
        if (session.draft) return { title: '继续写第 ' + session.chapter + ' 章', detail: (draft.chars || 0) + ' 字 · ' + session.state + '；保存后旧检查作废。' }
        return { title: '写第一段正文', detail: '第 ' + session.chapter + ' 章已装配，工作台可以开始写。' }
      })()

      const sectionLabel = { desk: '书桌', chapter: '章节', story: '故事', data: '资料' }
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
        return h('div', { style: { padding: '14px 18px', overflowY: 'auto' } },
          h('div', { style: { maxWidth: 760 } },
            h('div', { style: { ...faint, fontSize: 10.5, letterSpacing: '.08em' } }, 'NEXT · 下一笔'),
            h('div', { style: { fontSize: 22, fontWeight: 600, margin: '5px 0 3px' } }, nextAction.title),
            h('div', { style: { color: c.sub, fontSize: 12.5, lineHeight: 1.7 } }, nextAction.detail),
            h('div', { style: { display: 'flex', gap: 8, marginTop: 12 } },
              h('button', { type: 'button', onClick: function () { setSection('chapter') }, style: { appearance: 'none', border: '1px solid ' + c.brand, background: c.layer, color: c.text, borderRadius: 7, padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' } }, '去章节'),
              h('button', { type: 'button', onClick: function () { load() }, style: { appearance: 'none', border: '1px solid ' + c.border, background: 'transparent', color: c.sub, borderRadius: 7, padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' } }, '刷新')),
            h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginTop: 16 } },
              stat('当前章', session ? '第 ' + session.chapter + ' 章' : '—'),
              stat('状态', session ? session.state : '—', session && session.state === 'completed' ? c.success : c.text),
              stat('字数', session && session.draft ? (session.draft.chars ?? '?') : '—'),
              stat('待处理', String(pendingIds.length + conflictTotal), pendingIds.length + conflictTotal > 0 ? c.error : c.text)),
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

      function storyView() {
        if (!storyData) return h('div', { style: { padding: 18 } }, h('span', { style: faint }, '加载故事数据…'))
        const decisions = storyData.decisions || {}
        const memory = storyData.memory || {}
        return h('div', { style: { padding: '14px 18px', overflowY: 'auto' } },
          h('div', { style: { maxWidth: 760 } },
            decisions.styleHint ? h('div', { style: { ...faint, marginBottom: 8 } }, decisions.styleHint) : null,
            h('div', { style: { ...faint, marginBottom: 4 } }, '本章拍板'),
            (decisions.committed || []).length === 0
              ? h('div', { style: faint }, '本章还没有已拍板决策。')
              : (decisions.committed || []).map((item) => h('div', { key: item.id, style: { ...row, borderBottom: '1px dashed ' + c.border, padding: '6px 0' } },
                  h('span', { style: small }, item.title),
                  h('span', { style: { color: c.faint, fontSize: 11 } }, item.change))),
            h('div', { style: { ...faint, margin: '14px 0 4px' } }, '待拍板'),
            (decisions.proposals || []).length === 0
              ? h('div', { style: faint }, '没有待拍板提案。')
              : (decisions.proposals || []).map((item) => h('div', { key: item.id, style: { padding: '6px 0', borderBottom: '1px dashed ' + c.border } },
                  h('div', { style: small }, item.title),
                  (item.options || []).map((option, index) => h('div', { key: index, style: { color: c.faint, fontSize: 11 } },
                    '· ' + option.label + (option.styleFit ? ' · 文风 ' + option.styleFit : ''))))),
            h('div', { style: { ...faint, margin: '14px 0 4px' } }, '未回收线索'),
            (memory.threads || []).length === 0
              ? h('div', { style: faint }, '没有未回收线索。')
              : (memory.threads || []).slice(0, 10).map((thread) => h('div', { key: thread.id, style: { ...row, borderBottom: '1px dashed ' + c.border, padding: '5px 0' } },
                  h('span', { style: small }, thread.text),
                  h('span', { style: { color: c.faint, fontSize: 11 } }, '第 ' + thread.chapter + ' 章'))),
            h('div', { style: { ...faint, margin: '14px 0 4px' } }, '章节历史'),
            (data && data.history && data.history.chapters ? data.history.chapters : []).slice(0, 12).map((item, index) => h('div', { key: index, style: { ...row, borderBottom: '1px dashed ' + c.border, padding: '5px 0' } },
              h('span', { style: small }, '第 ' + item.chapter + ' 章'),
              h('span', { style: { color: c.faint, fontSize: 11 } }, (item.state || '?') + (item.chars ? ' · ' + item.chars + ' 字' : '')))),
          ))
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
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderBottom: '1px solid ' + c.border } },
          h('span', { style: { fontWeight: 600 } }, '小说工作台'),
          books.length
            ? h('select', {
                value: book || (data && data.book) || '',
                onChange: function (event) { setBook(event.target.value); load(event.target.value) },
                style: { fontSize: 12, padding: '2px 6px', borderRadius: 6, border: '1px solid ' + c.border, background: c.base, color: c.text },
              }, books.map((name) => h('option', { key: name, value: name }, name)))
            : null,
          h('span', { style: faint }, data && data.session ? `第 ${data.session.chapter} 章 · ${data.session.state}` : '无活动会话'),
          h('span', { style: { marginLeft: 'auto' } },
            h('button', {
              type: 'button',
              onClick: function () { load() },
              style: { appearance: 'none', border: '1px solid ' + c.border, background: 'transparent', color: c.sub, borderRadius: 6, padding: '2px 8px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' },
            }, state.phase === 'refreshing' ? '刷新中…' : '刷新')),
        ),
        state.error ? h('div', { style: { color: c.error, padding: '8px 14px' } }, state.error) : null,
        h('div', { style: { display: 'flex', gap: 4, padding: '6px 14px', borderBottom: '1px solid ' + c.border } },
          ['desk', 'chapter', 'story', 'data'].map(sectionButton)),
        section === 'chapter' ? h('div', { style: { display: 'flex', gap: 0, flex: 1, minHeight: 0 } },
          h('div', { style: { flex: 1, minWidth: 0, padding: '10px 14px', display: 'flex', flexDirection: 'column', minHeight: 0 } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 } },
              h('span', { style: faint }, draft ? `正文 v${draft.version} · ${draftState.loaded ? draftState.chars : (draft.chars ?? '?')} 字` : '还没有正文草稿'),
              h('span', { style: { color: draftState.dirty ? c.error : c.faint, fontSize: 11 } }, draftState.dirty ? '未保存' : (draftState.loaded ? '已保存' : '')),
              h('span', { style: { marginLeft: 'auto', color: saveState.phase === 'error' ? c.error : c.sub, fontSize: 11 } }, saveState.message),
              h('button', {
                type: 'button',
                disabled: !draftState.dirty || saveState.phase === 'saving',
                onClick: function () { saveDraft() },
                style: {
                  appearance: 'none', border: '1px solid ' + (draftState.dirty ? c.brand : c.border),
                  background: draftState.dirty ? c.layer : 'transparent', color: draftState.dirty ? c.text : c.faint,
                  borderRadius: 6, padding: '3px 10px', fontSize: 11.5, cursor: draftState.dirty ? 'pointer' : 'default', fontFamily: 'inherit',
                },
              }, saveState.phase === 'saving' ? '保存中…' : '保存草稿（Ctrl S）')),
            typeof remote.getDraft === 'function'
              ? h('textarea', {
                  value: draftState.loaded ? draftState.text : (draft && draft.text ? draft.text : ''),
                  placeholder: '在这里写本章正文；保存后旧检查作废。',
                  spellCheck: false,
                  onChange: function (event) { setDraftState((prev) => ({ ...prev, text: event.target.value, dirty: true, loaded: true })) },
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
        ) : section === 'desk' ? deskView() : section === 'story' ? storyView() : dataView(),
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
          inject: (sessionId) => ({ sessionId, remote: panelRemote }),
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


