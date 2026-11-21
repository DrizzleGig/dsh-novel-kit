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
      const [action, setAction] = React.useState({ phase: 'idle', message: '' })
      const [tab, setTab] = React.useState('overview')
      const [tabData, setTabData] = React.useState({})
      const [pendingDecision, setPendingDecision] = React.useState(null)
      const [query, setQuery] = React.useState('')
      const [importPath, setImportPath] = React.useState('')
      const [searchHits, setSearchHits] = React.useState(null)

      const openTab = React.useCallback(async function (name) {
        setTab(name)
        if (name === 'overview') return
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

      const runDecide = React.useCallback(async function (proposalId, option) {
        const chapterSessionId = state.data && state.data.session ? state.data.session.id : null
        if (!chapterSessionId) {
          setAction({ phase: 'error', message: '没有活动章节会话，无法写拍板账' })
          return
        }
        setPendingDecision(null)
        setAction({ phase: 'busy', message: '' })
        try {
          const result = await Promise.resolve(remote.decide(sessionId, { chapterSessionId, proposalId, action: 'adopt', option })).then(unwrap)
          setAction({ phase: 'done', message: result.written ? '已写进拍板账' : (result.idempotent ? '这条已经拍过了' : '未写入') })
          setTabData((prev) => { const next = { ...prev }; delete next.decisions; return next })
          await openTab('decisions')
        } catch (error) {
          setAction({ phase: 'error', message: String(error?.message ?? error) })
        }
      }, [remote, sessionId, state.data, openTab])

      const runImport = React.useCallback(async function () {
        const target = importPath.trim()
        const activeBook = book || (state.data && state.data.book) || null
        const project = (state.data && state.data.workspace && state.data.workspace.fanfic && state.data.workspace.fanfic[0]) || activeBook
        if (!target) { setAction({ phase: 'error', message: '先填原著 txt 的绝对路径' }); return }
        if (!project) { setAction({ phase: 'error', message: '没有同人项目' }); return }
        setAction({ phase: 'busy', message: '' })
        try {
          const result = await Promise.resolve(remote.importSource(sessionId, { project, file: target })).then(unwrap)
          setAction({ phase: 'done', message: result.idempotent ? '这本书已经导入过（' + result.sourceId + '）' : '已导入 ' + result.chapters + ' 章（' + result.sourceId + '）' })
          setTabData((prev) => { const next = { ...prev }; delete next.canon; return next })
          await openTab('canon')
        } catch (error) {
          setAction({ phase: 'error', message: String(error?.message ?? error) })
        }
      }, [remote, sessionId, book, state.data, importPath, openTab])

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

      function renderTab() {        const value = tabData[tab]
        if (!value) return h('div', { style: faint }, '加载中…')
        if (value.error) return h('div', { style: { color: c.error, fontSize: 11.5 } }, value.error)
        if (tab === 'decisions') {
          if (!value.available) return h('div', { style: faint }, '没有 beat 账本与会话')
          return h('div', null,
            h('div', { style: faint }, '第 ' + value.chapter + ' 章 · 已拍板 ' + value.committed.length + ' · 待拍板 ' + value.pendingCount + ' · 未回收义务 ' + value.openObligations),
            value.intent ? h('div', { style: small }, '意图：' + value.intent) : null,
            value.proposals.length
              ? h('div', { style: { marginTop: 4 } }, h('div', { style: faint }, '待拍板'),
                  value.proposals.map((item) => h('div', { key: item.id, style: { padding: '4px 0', borderBottom: '1px solid ' + c.border } },
                    h('div', { style: small }, item.title || item.id),
                    item.options.length
                      ? h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 } },
                          item.options.map((option, index) => h('button', {
                            key: index,
                            type: 'button',
                            onClick: function () { setPendingDecision({ proposalId: item.id, option: option.label }) },
                            style: {
                              appearance: 'none', border: '1px solid ' + (pendingDecision && pendingDecision.proposalId === item.id && pendingDecision.option === option.label ? c.brand : c.border),
                              background: 'transparent', color: c.sub, borderRadius: 6, padding: '1px 8px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                            },
                          }, option.label)))
                      : null,
                    item.options.map((option, index) => h('div', { key: 'i' + index, style: { color: c.faint, fontSize: 11 } }, '· ' + option.label + (option.impact ? '：' + option.impact : ''))),
                    pendingDecision && pendingDecision.proposalId === item.id
                      ? h('div', { style: { display: 'flex', gap: 6, marginTop: 3, alignItems: 'center' } },
                          h('span', { style: { color: c.faint, fontSize: 11 } }, '确认把「' + pendingDecision.option + '」写进拍板账？'),
                          h('button', {
                            type: 'button',
                            onClick: function () { runDecide(item.id, pendingDecision.option) },
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
            h('div', { style: { ...faint, marginTop: 6 } }, `${value.works.length} 部 · ${value.chapters} 章 · ${value.chars} 字`),
            value.works.map((work) => h('div', { key: work.workId, style: { padding: '4px 0', borderBottom: '1px solid ' + c.border } },
              h('div', { style: small }, work.title || work.workId),
              h('div', { style: faint }, `${work.chapters} 章 · ${work.chars} 字 · ${work.status || '未测量'}`),
            )))
        }
        if (!value.available) return h('div', { style: faint }, '没有同人项目')
        return h('div', null,
          h('div', { style: { display: 'flex', gap: 6, marginBottom: 4 } },
            h('input', {
              value: importPath,
              placeholder: '原著 txt 的绝对路径（UTF-8）',
              onChange: function (event) { setImportPath(event.target.value) },
              style: { flex: 1, minWidth: 0, fontSize: 11, padding: '2px 6px', borderRadius: 6, border: '1px solid ' + c.border, background: c.base, color: c.text, fontFamily: 'inherit' },
            }),
            h('button', {
              type: 'button',
              onClick: function () { runImport() },
              style: { appearance: 'none', border: '1px solid ' + c.border, background: 'transparent', color: c.sub, borderRadius: 6, padding: '1px 8px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' },
            }, '导入'),
          ),
          h('div', { style: faint }, `${value.title || value.id} · 原著 ${value.sourceId || '-'} · rev ${value.revision}`),
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
        )
      }

      const load = React.useCallback(async function (nextBook) {
        if (!remote) {
          setState({ phase: 'error', data: null, error: '面板读接口未就绪：请更新并重载 DSH。' })
          return
        }
        setState((prev) => ({ phase: prev.data ? 'refreshing' : 'loading', data: prev.data, error: null }))
        try {
          const data = await Promise.resolve(remote.getSnapshot(sessionId, { book: nextBook || book || null })).then(unwrap)
          const diag = await Promise.resolve(remote.getDiagnostics(sessionId)).then(unwrap).catch(() => null)
          setState({ phase: 'ready', data, diag, error: null })
        } catch (error) {
          setState({ phase: 'error', data: null, error: String(error?.message ?? error) })
        }
      }, [remote, sessionId, book])

      const runTakeover = React.useCallback(async function (takeover) {
        if (!remote) return
        setAction({ phase: 'busy', message: '' })
        try {
          const result = await Promise.resolve(takeover ? remote.takeover(sessionId) : remote.restore(sessionId)).then(unwrap)
          const failed = (result?.results ?? []).filter((item) => !item.ok)
          setAction({
            phase: 'done',
            message: failed.length
              ? '部分失败：' + failed.map((item) => item.name + '（' + (item.application ?? '?') + '）').join('、')
              : (takeover ? '已停用旧五件，由 kit 接管' : '已恢复旧五件'),
          })
          await load()
        } catch (error) {
          setAction({ phase: 'error', message: String(error?.message ?? error) })
        }
      }, [remote, sessionId, load])

      React.useEffect(function () { load() }, [load])

      const data = state.data
      const books = (data && data.workspace && data.workspace.beat) || []

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
            [['overview', '总览'], ['decisions', '拍板'], ['memory', '记忆'], ['style', '文风'], ['canon', '设定']].map(function ([key, label]) {
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

    // ── 章节工作台（conversation.view）：左正文、右依据与账本 ──────────────
    function Workbench(props) {
      const { sessionId, remote } = props
      const [state, setState] = React.useState({ phase: 'loading', data: null, diag: null, error: null })
      const [book, setBook] = React.useState('')
      const [pendingTakeover, setPendingTakeover] = React.useState(false)
      const [action, setAction] = React.useState({ phase: 'idle', message: '' })

      const runTakeover = React.useCallback(async function (takeover) {
        if (!remote) return
        setAction({ phase: 'busy', message: '' })
        try {
          const result = await Promise.resolve(takeover ? remote.takeover(sessionId) : remote.restore(sessionId)).then(unwrap)
          const failed = (result?.results ?? []).filter((item) => !item.ok)
          setAction({
            phase: 'done',
            message: failed.length ? '部分失败：' + failed.map((item) => item.name + '（' + (item.application ?? '?') + '）').join('、') : (takeover ? '已停用旧五件，由 kit 接管' : '已恢复旧五件'),
          })
          await load()
        } catch (error) {
          setAction({ phase: 'error', message: String(error?.message ?? error) })
        }
      }, [remote, sessionId, load])

      const load = React.useCallback(async function (nextBook) {
        if (!remote) {
          setState({ phase: 'error', data: null, error: '工作台读接口未就绪：请更新并重载 DSH。' })
          return
        }
        setState((prev) => ({ phase: prev.data ? 'refreshing' : 'loading', data: prev.data, error: null }))
        try {
          const data = await Promise.resolve(remote.getSnapshot(sessionId, { book: nextBook || book || null })).then(unwrap)
          const diag = await Promise.resolve(remote.getDiagnostics(sessionId)).then(unwrap).catch(() => null)
          setState({ phase: 'ready', data, diag, error: null })
        } catch (error) {
          setState({ phase: 'error', data: null, error: String(error?.message ?? error) })
        }
      }, [remote, sessionId, book])

      React.useEffect(function () { load() }, [load])

      const data = state.data
      const books = (data && data.workspace && data.workspace.beat) || []
      const draft = data && data.session && data.session.draft

      return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', background: c.base, color: c.text, fontSize: 13 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderBottom: '1px solid ' + c.border } },
          h('span', { style: { fontWeight: 600 } }, '章节工作台'),
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
        h('div', { style: { display: 'flex', gap: 0, flex: 1, minHeight: 0 } },
          h('div', { style: { flex: 1, minWidth: 0, padding: '10px 14px', overflowY: 'auto' } },
            h('div', { style: { ...faint, marginBottom: 6 } }, draft ? `正文 v${draft.version} · ${draft.chars ?? '?'} 字` : '还没有正文草稿'),
            h('pre', {
              style: {
                margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13, lineHeight: 1.8,
                color: draft ? c.text : c.faint, fontFamily: 'inherit',
              },
            }, draft && draft.text ? draft.text : '（用 novel_chapter_write 保存正文后，这里显示草稿；工作台只读，编辑回聊天或原插件。）'),
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
        ),
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

        // 章节工作台：会话级主视图（conversation.view），只读正文 + 写作依据 + 账本。
        ctx.effect(() => ctx.slots.inject('conversation.view', () => ctx.slots.register({
          name: 'conversation.view',
          id: 'novel-kit.chapter',
          label: '章节工作台',
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
