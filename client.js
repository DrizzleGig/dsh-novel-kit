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
      const [state, setState] = React.useState({ phase: 'loading', data: null, error: null })
      const [book, setBook] = React.useState('')

      const load = React.useCallback(async function (nextBook) {
        if (!remote) {
          setState({ phase: 'error', data: null, error: '面板读接口未就绪：请更新并重载 DSH。' })
          return
        }
        setState((prev) => ({ phase: prev.data ? 'refreshing' : 'loading', data: prev.data, error: null }))
        try {
          const data = await Promise.resolve(remote.getSnapshot(sessionId, { book: nextBook || book || null })).then(unwrap)
          setState({ phase: 'ready', data, error: null })
        } catch (error) {
          setState({ phase: 'error', data: null, error: String(error?.message ?? error) })
        }
      }, [remote, sessionId, book])

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

    function OpenButton(props) {
      return h('button', {
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
