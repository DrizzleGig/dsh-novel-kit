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
        { method: 'getStyleBrief', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
        { method: 'getCanon', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
        { method: 'getPlan', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
        { method: 'getOperations', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
        { method: 'previewContext', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
        { method: 'resumeChapter', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
        { method: 'decide', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
        { method: 'reviseDecision', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
        { method: 'savePlan', parameters: [param('sessionId', sessionIdSchema), param('request', requestSchema)] },
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

    // 新右栏使用一套独立 class，避免继续在旧 inline 样式上打补丁。
    const UI_CSS = `
      .nk-panel { height: 100%; overflow-y: auto; padding: 18px 16px 24px; display: flex; flex-direction: column; gap: 14px; color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-bg-base) 93%, #eedfc9 7%); font-family: var(--dsw-font-family, "PingFang SC", "Microsoft YaHei", sans-serif); }
      .nk-head { display: flex; align-items: center; gap: 10px; }
      .nk-panel .grow { flex: 1; min-width: 0; }
      .nk-seal { width: 38px; height: 38px; flex: 0 0 auto; border: 1.5px solid #b5432d; border-radius: 7px; color: #b5432d; display: grid; place-items: center; font-family: "Songti SC", "Noto Serif SC", serif; font-size: 21px; font-weight: 700; background: color-mix(in srgb, #b5432d 6%, transparent); }
      .nk-title { font-family: "Songti SC", "Noto Serif SC", serif; font-size: 18px; font-weight: 700; line-height: 1.2; letter-spacing: -.01em; }
      .nk-book { color: var(--dsw-alias-label-tertiary); font-size: 11.5px; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .nk-actions { margin-left: auto; display: flex; gap: 5px; }
      .nk-btn { appearance: none; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); border-radius: 8px; padding: 5px 9px; font-size: 11.5px; line-height: 1.2; cursor: pointer; font-family: inherit; }
      .nk-btn:hover { border-color: var(--dsw-alias-label-tertiary); }
      .nk-btn.primary { background: #b5432d; border-color: #b5432d; color: #fff8ef; font-weight: 600; }
      .nk-btn.primary:hover { background: #96372a; border-color: #96372a; }
      .nk-select { width: 100%; height: 34px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); padding: 0 10px; font-size: 12px; font-family: inherit; }
      .nk-next { position: relative; overflow: hidden; border-radius: 15px; padding: 18px 16px 15px; background: var(--dsw-alias-label-primary); color: var(--dsw-alias-bg-base); box-shadow: 0 6px 22px rgba(0,0,0,.12); }
      .nk-next::after { content: "章"; position: absolute; right: -6px; bottom: -28px; font-family: "Songti SC", "Noto Serif SC", serif; font-size: 118px; line-height: 1; color: color-mix(in srgb, var(--dsw-alias-bg-base) 8%, transparent); pointer-events: none; }
      .nk-eyebrow { position: relative; z-index: 1; color: color-mix(in srgb, var(--dsw-alias-bg-base) 58%, transparent); font-size: 9.5px; letter-spacing: .16em; text-transform: uppercase; }
      .nk-next-title { position: relative; z-index: 1; margin: 6px 0 4px; font-family: "Songti SC", "Noto Serif SC", serif; font-size: 24px; line-height: 1.35; font-weight: 700; letter-spacing: -.02em; }
      .nk-next-copy { position: relative; z-index: 1; color: color-mix(in srgb, var(--dsw-alias-bg-base) 68%, transparent); font-size: 11.5px; line-height: 1.7; }
      .nk-next-meta { position: relative; z-index: 1; display: flex; gap: 6px; margin-top: 10px; }
      .nk-chip { display: inline-flex; align-items: center; height: 21px; padding: 0 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 999px; color: var(--dsw-alias-label-secondary); background: transparent; font-size: 10px; white-space: nowrap; }
      .nk-next .nk-chip { border-color: color-mix(in srgb, var(--dsw-alias-bg-base) 22%, transparent); color: color-mix(in srgb, var(--dsw-alias-bg-base) 76%, transparent); }
      .nk-next-btn { position: relative; z-index: 1; width: 100%; height: 37px; margin-top: 13px; border: 0; border-radius: 8px; background: #b5432d; color: #fff8ef; font-size: 12.5px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; font-family: inherit; }
      .nk-next-btn:hover { background: #96372a; }
      .nk-section { display: flex; flex-direction: column; gap: 5px; }
      .nk-section-head { display: flex; justify-content: space-between; align-items: baseline; }
      .nk-section-title { font-family: "Songti SC", "Noto Serif SC", serif; font-size: 13.5px; font-weight: 700; }
      .nk-meta { color: var(--dsw-alias-label-tertiary); font-size: 10px; }
      .nk-inbox { display: flex; flex-direction: column; }
      .nk-item { display: flex; gap: 8px; align-items: flex-start; padding: 8px 0; border-bottom: 1px dashed var(--dsw-alias-border-l1); font-size: 11.5px; line-height: 1.55; }
      .nk-item:last-child { border-bottom: 0; }
      .nk-kind { width: 36px; flex: 0 0 auto; color: #b5432d; font-weight: 700; font-size: 9.5px; padding-top: 1px; }
      .nk-kind.amber { color: #a87322; }
      .nk-kind.jade { color: #2f6a5a; }
      .nk-item-main { color: var(--dsw-alias-label-secondary); }
      .nk-item-main b { color: var(--dsw-alias-label-primary); font-weight: 600; }
      .nk-ebar { display: flex; gap: 2px; height: 7px; border-radius: 7px; overflow: hidden; background: var(--dsw-alias-border-l1); }
      .nk-ebar i { display: block; height: 100%; }
      .nk-elegend { display: flex; gap: 8px; flex-wrap: wrap; color: var(--dsw-alias-label-tertiary); font-size: 9.5px; }
      .nk-dot { display: inline-block; width: 5px; height: 5px; border-radius: 50%; margin-right: 3px; vertical-align: middle; }
      .nk-recent { display: flex; flex-direction: column; }
      .nk-recent-row { display: flex; gap: 8px; align-items: center; padding: 6px 0; border-bottom: 1px dashed var(--dsw-alias-border-l1); font-size: 11px; }
      .nk-recent-row:last-child { border-bottom: 0; }
      .nk-recent-no { width: 36px; flex: 0 0 auto; color: var(--dsw-alias-label-tertiary); font-family: "Songti SC", "Noto Serif SC", serif; }
      .nk-recent-title { flex: 1; min-width: 0; color: var(--dsw-alias-label-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .nk-recent-state { color: var(--dsw-alias-label-tertiary); font-size: 9.5px; }
      .nk-foot { margin-top: auto; display: flex; gap: 7px; padding-top: 10px; border-top: 1px solid var(--dsw-alias-border-l1); }
      .nk-foot .nk-btn { flex: 1; }
      .nk-empty { border: 1px solid var(--dsw-alias-border-l1); border-radius: 11px; background: var(--dsw-alias-bg-layer-1); padding: 12px; display: flex; flex-direction: column; gap: 8px; }
      .nk-empty input { border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); padding: 7px 9px; font-size: 12px; font-family: inherit; }
    `


    // ── v0.3 视觉层 ────────────────────────────────────────────────────────
    // 旧 UI_CSS 是兼容底子（类名还在用），这一层把设计 token、字阶、间距、卡片、
    // 工作台布局整套重写，覆盖在上面。所有颜色从宿主 alias token 派生，
    // 用 color-mix 让同一份样式在暗色/亮色主题下都成立。
    const NK_SKIN = `
      .nk-panel, .nk-wb {
        --nk-line: color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent);
        --nk-line-soft: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent);
        --nk-surface: color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent);
        --nk-surface-2: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
        --nk-paper: color-mix(in srgb, var(--dsw-alias-bg-base) 93%, #eedfc9 7%);
        --nk-accent: color-mix(in srgb, #b5432d 84%, var(--dsw-alias-label-primary));
        --nk-accent-soft: color-mix(in srgb, #b5432d 13%, transparent);
        --nk-accent-line: color-mix(in srgb, #b5432d 34%, transparent);
        --nk-ink: var(--dsw-alias-label-primary);
        --nk-ink-2: color-mix(in srgb, var(--dsw-alias-label-primary) 66%, transparent);
        --nk-ink-3: color-mix(in srgb, var(--dsw-alias-label-primary) 44%, transparent);
        --nk-r-sm: 8px; --nk-r: 11px; --nk-r-lg: 15px;
        --nk-serif: "Songti SC", "Noto Serif SC", "Source Han Serif SC", serif;
        --nk-mono: var(--dsw-font-mono, "Cascadia Mono", Consolas, monospace);
      }

      /* ── 右栏：一个滚动的躯干 + 固定头尾 ── */
      .nk-panel { gap: 0; padding: 0; background: var(--nk-paper); }
      .nk-panel > * { flex: 0 0 auto; }
      .nk-head { position: sticky; top: 0; z-index: 3; padding: 14px 16px 12px; gap: 11px;
        background: color-mix(in srgb, var(--nk-paper) 88%, transparent); backdrop-filter: blur(8px);
        border-bottom: 1px solid var(--nk-line-soft); }
      .nk-seal { width: 34px; height: 34px; border-radius: 9px; border-width: 1.5px;
        border-color: var(--nk-accent-line); color: var(--nk-accent); font-size: 19px;
        background: var(--nk-accent-soft); }
      .nk-title { font-size: 16.5px; letter-spacing: .01em; }
      .nk-book { font-size: 11.5px; color: var(--nk-ink-3); margin-top: 2px; }
      .nk-actions { gap: 6px; }
      .nk-btn { height: 26px; padding: 0 10px; font-size: 11.5px; border-radius: var(--nk-r-sm);
        border-color: var(--nk-line); background: transparent; color: var(--nk-ink-2); transition: background .15s, border-color .15s, color .15s; }
      .nk-btn:hover { background: var(--nk-surface); border-color: var(--nk-line); color: var(--nk-ink); }
      .nk-btn.primary { background: var(--nk-accent); border-color: var(--nk-accent); color: #fff8ef; }
      .nk-btn.primary:hover { filter: brightness(1.06); }

      /* 作品切换：做成一行轻量胶囊，不再占一整块 */
      .nk-panel > .nk-select { width: auto; margin: 10px 16px 0; height: 30px; font-size: 12px;
        background: var(--nk-surface); border-color: var(--nk-line-soft); border-radius: var(--nk-r-sm); }

      .nk-panel > section, .nk-panel > div:not(.nk-head):not(.nk-foot) { margin-left: 16px; margin-right: 16px; }

      /* ── 下一笔卡：抬高一层 + 朱砂竖线，不做整块反色 ── */
      .nk-next { margin-top: 14px; padding: 15px 15px 14px; border-radius: var(--nk-r-lg);
        background: var(--nk-surface); border: 1px solid var(--nk-line-soft); box-shadow: 0 1px 0 color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent);
        overflow: hidden; }
      .nk-next::before { content: ""; position: absolute; left: 0; top: 14px; bottom: 14px; width: 2px;
        border-radius: 2px; background: var(--nk-accent); opacity: .85; }
      .nk-next::after { display: none; }
      .nk-eyebrow { color: var(--nk-accent); font-size: 9.5px; letter-spacing: .16em; }
      .nk-next-title { font-size: 23px; line-height: 1.3; margin: 7px 0 5px; color: var(--nk-ink); }
      .nk-next-copy { color: var(--nk-ink-2); font-size: 12px; line-height: 1.65; }
      .nk-next-meta { margin-top: 11px; gap: 6px; flex-wrap: wrap; }
      .nk-chip { height: 20px; font-size: 10px; padding: 0 7px; border-color: var(--nk-line-soft);
        color: var(--nk-ink-3); background: var(--nk-surface); }
      .nk-next .nk-chip { color: var(--nk-ink-2); border-color: var(--nk-accent-line); background: var(--nk-accent-soft); }
      .nk-next-btn { height: 34px; margin-top: 13px; border-radius: var(--nk-r-sm); background: var(--nk-accent);
        color: #fff8ef; font-size: 12.5px; letter-spacing: .01em; }
      .nk-next-btn:disabled { background: var(--nk-surface-2); color: var(--nk-ink-3); }

      /* ── 分区：卡片化，标题不再是一行 10px 灰字 ── */
      .nk-section { margin-top: 18px; }
      .nk-section-head { align-items: center; margin-bottom: 8px; }
      .nk-section-title { font-family: var(--dsw-font-family, sans-serif); font-size: 11px; font-weight: 600;
        letter-spacing: .14em; color: var(--nk-ink-3); text-transform: uppercase; }
      .nk-meta { font-size: 11px; color: var(--nk-ink-3); font-variant-numeric: tabular-nums; }
      .nk-inbox { background: var(--nk-surface); border: 1px solid var(--nk-line-soft); border-radius: var(--nk-r); overflow: hidden; }
      .nk-item { padding: 9px 11px; font-size: 12px; line-height: 1.55; border-bottom: 1px solid var(--nk-line-soft); }
      .nk-item:last-child { border-bottom: 0; }
      .nk-kind { width: 30px; font-size: 9.5px; letter-spacing: .06em; color: var(--nk-accent); }
      .nk-kind.amber { color: var(--dsw-alias-state-warning-primary, #a87322); }
      .nk-kind.jade { color: var(--dsw-alias-state-success-primary, #2f6a5a); }
      .nk-item-main { color: var(--nk-ink-2); }

      /* ── 四段依据：条形 + 2×2 图例 ── */
      .nk-ebar { height: 6px; gap: 0; border-radius: 6px; background: var(--nk-surface-2); }
      .nk-ebar i { border-radius: 0; }
      .nk-elegend { margin-top: 9px; display: grid; grid-template-columns: 1fr 1fr; gap: 5px 12px; font-size: 11px; }
      .nk-elegend > * { display: flex; align-items: baseline; gap: 5px; color: var(--nk-ink-2); font-variant-numeric: tabular-nums; }
      .nk-dot { width: 6px; height: 6px; margin-right: 0; }

      /* ── 最近章节 ── */
      .nk-recent { background: var(--nk-surface); border: 1px solid var(--nk-line-soft); border-radius: var(--nk-r); overflow: hidden; }
      .nk-recent-row { padding: 8px 11px; font-size: 12px; border-bottom: 1px solid var(--nk-line-soft); }
      .nk-recent-row:last-child { border-bottom: 0; }
      .nk-recent-row:hover { background: var(--nk-surface-2); }
      .nk-recent-no { width: 30px; color: var(--nk-ink-3); font-variant-numeric: tabular-nums; }
      .nk-recent-title { color: var(--nk-ink); }
      .nk-recent-state { color: var(--nk-ink-3); font-size: 10px; }

      /* ── 空态 / 底部固定主行动 ── */
      .nk-panel .nk-book-pick { max-width: 210px; height: 22px; font-size: 11.5px; color: var(--nk-ink-3);
        border: 1px solid transparent; background: transparent; padding: 0 4px; border-radius: 6px; font-family: inherit; cursor: pointer; }
      .nk-panel .nk-book-pick:hover { border-color: var(--nk-line-soft); background: var(--nk-surface); }

      .nk-empty { margin-top: 14px; padding: 14px; border-radius: var(--nk-r); border: 1px dashed var(--nk-line);
        background: transparent; align-items: stretch; gap: 9px; }
      .nk-foot { position: sticky; bottom: 0; margin-top: auto; padding: 12px 16px;
        background: color-mix(in srgb, var(--nk-paper) 92%, transparent); backdrop-filter: blur(8px);
        border-top: 1px solid var(--nk-line-soft); gap: 8px; }
      .nk-foot .nk-btn { height: 34px; font-size: 12.5px; }
      .nk-foot .nk-btn.primary { flex: 1.4; }
      .nk-panel ::-webkit-scrollbar { width: 8px; }
      .nk-panel ::-webkit-scrollbar-thumb { background: var(--nk-line); border-radius: 8px; }

      /* ── 工作台 ── */
      .nk-wb { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--nk-paper); color: var(--nk-ink); font-family: var(--dsw-font-family, sans-serif); }
      .nk-wb-head { display: flex; align-items: center; gap: 12px; padding: 14px 22px 12px; border-bottom: 1px solid var(--nk-line-soft); flex: 0 0 auto; }
      .nk-wb-eyebrow { font-size: 9.5px; letter-spacing: .18em; color: var(--nk-ink-3); text-transform: uppercase; }
      .nk-wb-title { font-family: var(--nk-serif); font-size: 21px; font-weight: 700; letter-spacing: -.01em; line-height: 1.25; }
      .nk-wb-status { display: inline-flex; align-items: center; gap: 6px; height: 22px; padding: 0 9px; border-radius: 999px;
        border: 1px solid var(--nk-line-soft); background: var(--nk-surface); font-size: 10.5px; color: var(--nk-ink-2); }
      .nk-wb-status b { font-weight: 600; color: var(--nk-ink); }
      .nk-wb-head-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; }
      .nk-wb-tabs { display: flex; gap: 4px; padding: 9px 22px; border-bottom: 1px solid var(--nk-line-soft); overflow-x: auto; flex: 0 0 auto; }
      .nk-tab { appearance: none; border: 1px solid transparent; background: transparent; color: var(--nk-ink-3);
        height: 26px; padding: 0 11px; border-radius: 999px; font-size: 12px; font-family: inherit; cursor: pointer; white-space: nowrap;
        transition: background .15s, color .15s, border-color .15s; }
      .nk-tab:hover { background: var(--nk-surface); color: var(--nk-ink-2); }
      .nk-tab.active { background: var(--nk-surface-2); border-color: var(--nk-line-soft); color: var(--nk-ink); font-weight: 600; }
      .nk-tab-dot { display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: var(--nk-accent); margin-left: 5px; vertical-align: 1px; }
      .nk-wb-body { flex: 1; min-height: 0; overflow-y: auto; padding: 20px 22px 40px; }
      .nk-wb-grid { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 18px; align-items: start; max-width: 1280px; }
      .nk-wb-grid.single { grid-template-columns: minmax(0, 1fr); max-width: 900px; }
      .nk-wb-col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
      @media (max-width: 1080px) { .nk-wb-grid { grid-template-columns: minmax(0, 1fr); } .nk-wb-aside { display: none; } }

      .nk-card { background: var(--nk-surface); border: 1px solid var(--nk-line-soft); border-radius: var(--nk-r-lg); padding: 15px 16px; }
      .nk-card.flush { padding: 0; overflow: hidden; }
      .nk-card.hero { background: linear-gradient(180deg, var(--nk-accent-soft), transparent 70%), var(--nk-surface); border-color: var(--nk-accent-line); }
      .nk-card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
      .nk-card-title { font-size: 11px; font-weight: 600; letter-spacing: .13em; text-transform: uppercase; color: var(--nk-ink-3); }
      .nk-card-head .nk-meta { margin-left: auto; }
      .nk-h1 { font-family: var(--nk-serif); font-size: 26px; font-weight: 700; line-height: 1.3; letter-spacing: -.015em; }
      .nk-h2 { font-family: var(--nk-serif); font-size: 17px; font-weight: 700; line-height: 1.4; }
      .nk-h3 { font-size: 13px; font-weight: 600; }
      .nk-body { font-size: 12.5px; line-height: 1.7; color: var(--nk-ink-2); }
      .nk-tiny { font-size: 11px; line-height: 1.6; color: var(--nk-ink-3); }
      .nk-num { font-variant-numeric: tabular-nums; }

      .nk-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
      .nk-stat { border: 1px solid var(--nk-line-soft); border-radius: var(--nk-r); padding: 10px 12px; background: var(--nk-surface); }
      .nk-stat-label { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: var(--nk-ink-3); }
      .nk-stat-value { margin-top: 4px; font-size: 17px; font-weight: 600; font-variant-numeric: tabular-nums; }
      .nk-stat-value.accent { color: var(--nk-accent); }
      .nk-stat-value.warn { color: var(--dsw-alias-state-warning-primary, #a87322); }

      .nk-steps { display: flex; gap: 8px; }
      .nk-step { flex: 1; min-width: 0; border: 1px solid var(--nk-line-soft); border-radius: var(--nk-r); padding: 9px 10px; background: var(--nk-surface); }
      .nk-step.done { border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary, #2f6a5a) 46%, transparent); background: color-mix(in srgb, var(--dsw-alias-state-success-primary, #2f6a5a) 8%, transparent); }
      .nk-step.current { border-color: var(--nk-accent-line); background: var(--nk-accent-soft); }
      .nk-step-no { font-size: 9.5px; letter-spacing: .12em; color: var(--nk-ink-3); }
      .nk-step-label { font-size: 12px; font-weight: 600; margin-top: 3px; }
      .nk-step-state { font-size: 10px; margin-top: 3px; color: var(--nk-ink-3); }

      .nk-kv { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--nk-line-soft); font-size: 12px; }
      .nk-kv:last-child { border-bottom: 0; }
      .nk-kv-key { color: var(--nk-ink-3); }
      .nk-kv-val { color: var(--nk-ink); font-variant-numeric: tabular-nums; text-align: right; }

      .nk-empty-state { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 16px 12px 14px; text-align: center; color: var(--nk-ink-3); }
      .nk-empty-state .nk-glyph { font-family: var(--nk-serif); font-size: 30px; line-height: 1; color: var(--nk-accent); opacity: .5; }
      .nk-skeleton { border-radius: var(--nk-r); background: linear-gradient(90deg, var(--nk-surface), var(--nk-surface-2), var(--nk-surface));
        background-size: 200% 100%; animation: nk-shimmer 1.4s ease-in-out infinite; height: 56px; }
      @keyframes nk-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
      @media (prefers-reduced-motion: reduce) { .nk-skeleton { animation: none; } }
      /* ── 0.4.0：唯一入口 = 左竖栏 + 主区 ── */
      .nk-wb { flex-direction: row; align-items: stretch; }
      .nk-rail { width: 172px; flex: 0 0 172px; display: flex; flex-direction: column; gap: 2px; padding: 16px 10px 14px;
        border-right: 1px solid var(--nk-line-soft); background: color-mix(in srgb, var(--nk-paper) 70%, transparent); }
      .nk-rail-brand { display: flex; align-items: center; gap: 8px; padding: 0 6px 14px; }
      .nk-rail-seal { width: 26px; height: 26px; border-radius: 7px; display: grid; place-items: center; font-family: var(--nk-serif);
        font-size: 15px; font-weight: 700; color: var(--nk-accent); border: 1.5px solid var(--nk-accent-line); background: var(--nk-accent-soft); }
      .nk-rail-name { font-size: 12.5px; font-weight: 600; letter-spacing: .02em; }
      .nk-rail-item { appearance: none; border: 1px solid transparent; background: transparent; color: var(--nk-ink-2); font-family: inherit;
        display: flex; align-items: center; gap: 9px; height: 34px; padding: 0 10px; border-radius: 9px; font-size: 13px; cursor: pointer;
        text-align: left; transition: background .14s, color .14s, border-color .14s; }
      .nk-rail-item:hover { background: var(--nk-surface); color: var(--nk-ink); }
      .nk-rail-item.active { background: var(--nk-surface-2); border-color: var(--nk-line-soft); color: var(--nk-ink); font-weight: 600; }
      .nk-rail-glyph { width: 18px; text-align: center; font-family: var(--nk-serif); font-size: 14px; color: var(--nk-ink-3); }
      .nk-rail-item.active .nk-rail-glyph { color: var(--nk-accent); }
      .nk-rail-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--nk-accent); margin-left: auto; }
      .nk-rail-foot { margin-top: auto; padding: 10px 6px 0; border-top: 1px solid var(--nk-line-soft); display: flex; flex-direction: column; gap: 6px; }
      .nk-rail-hint { font-size: 10.5px; line-height: 1.5; color: var(--nk-ink-3); }
      .nk-wb-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
      .nk-page-head { display: flex; align-items: flex-end; gap: 12px; margin-bottom: 16px; }
      .nk-page-head .nk-h2 { margin: 0; }
      .nk-page-sub { font-size: 12px; color: var(--nk-ink-3); margin-top: 3px; }
      .nk-page-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; }
      .nk-split { display: grid; grid-template-columns: minmax(0, 320px) minmax(0, 1fr); gap: 16px; align-items: start; }
      .nk-split-list { display: flex; flex-direction: column; gap: 8px; }
      @media (max-width: 1180px) { .nk-split { grid-template-columns: minmax(0, 1fr); } }
      .nk-import-row { display: flex; gap: 8px; align-items: center; }
      .nk-input { flex: 1; min-width: 0; height: 32px; border: 1px solid var(--nk-line); border-radius: var(--nk-r-sm);
        background: var(--nk-surface); color: var(--nk-ink); padding: 0 10px; font-size: 12px; font-family: inherit; }
      .nk-input::placeholder { color: var(--nk-ink-3); }
      .nk-file-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: var(--nk-r-sm);
        border: 1px solid var(--nk-line-soft); background: var(--nk-surface); font-size: 12px; }
      .nk-file-row:hover { border-color: var(--nk-line); }
      .nk-file-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .nk-file-meta { color: var(--nk-ink-3); font-size: 10.5px; font-variant-numeric: tabular-nums; }
      .nk-band { display: grid; grid-template-columns: 84px 1fr 76px; gap: 8px; align-items: center; font-size: 11.5px; padding: 4px 0; }
      .nk-band-track { position: relative; height: 5px; border-radius: 5px; background: var(--nk-surface-2); overflow: hidden; }
      .nk-band-fill { position: absolute; height: 100%; border-radius: 5px; background: color-mix(in srgb, var(--nk-accent) 70%, transparent); }
      .nk-band-val { text-align: right; color: var(--nk-ink-3); font-variant-numeric: tabular-nums; }
      .nk-tag { display: inline-flex; align-items: center; height: 20px; padding: 0 7px; border-radius: 5px; font-size: 10.5px;
        color: var(--nk-ink-2); background: var(--nk-surface-2); border: 1px solid var(--nk-line-soft); }
      .nk-wb :focus-visible, .nk-panel :focus-visible { outline: 2px solid var(--nk-accent-line); outline-offset: 1px; border-radius: var(--nk-r-sm); }

      /* ── 页面区块：提案 / 选项 / 记忆卡 / 台账行 ── */
      .nk-proposal { padding: 12px 0; border-bottom: 1px solid var(--nk-line-soft); }
      .nk-proposal:last-child { border-bottom: 0; }
      .nk-proposal-title { font-size: 13.5px; font-weight: 600; line-height: 1.5; }
      .nk-option { margin-top: 8px; padding: 9px 10px; border: 1px solid var(--nk-line-soft); border-radius: var(--nk-r-sm); background: var(--nk-surface); }
      .nk-option-label { font-size: 12.5px; font-weight: 600; }
      .nk-option-foot { display: flex; align-items: center; gap: 8px; margin-top: 7px; }
      .nk-rowbtn { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; appearance: none; background: transparent;
        border: 0; border-bottom: 1px solid var(--nk-line-soft); color: var(--nk-ink); padding: 9px 12px; font-family: inherit; font-size: 12.5px; cursor: pointer; }
      .nk-rowbtn:last-child { border-bottom: 0; }
      .nk-rowbtn:hover { background: var(--nk-surface-2); }
      .nk-rowbtn.active { background: var(--nk-accent-soft); }
      .nk-rowbtn-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .nk-badge { display: inline-flex; align-items: center; height: 18px; padding: 0 6px; border-radius: 4px; font-size: 10px;
        background: var(--nk-surface-2); color: var(--nk-ink-3); border: 1px solid var(--nk-line-soft); }
      .nk-badge.accent { background: var(--nk-accent-soft); color: var(--nk-accent); border-color: var(--nk-accent-line); }
      .nk-badge.warn { color: var(--dsw-alias-state-warning-primary, #a87322); }
      .nk-quote { margin-top: 8px; padding: 9px 11px; border-left: 2px solid var(--nk-accent-line); background: var(--nk-surface);
        border-radius: 0 var(--nk-r-sm) var(--nk-r-sm) 0; font-family: var(--nk-serif); font-size: 12.5px; line-height: 1.75; color: var(--nk-ink-2); }
      .nk-chipline { display: flex; flex-wrap: wrap; gap: 6px; }
      .nk-detail { display: flex; flex-direction: column; gap: 10px; }
    `

    function unwrap(rpc) {
      if (rpc && rpc.ok === false) {
        const reason = rpc.error ? (rpc.error.message || rpc.error.code) : '未知错误'
        throw new Error('面板读取失败：' + String(reason || ''))
      }
      return rpc && typeof rpc === 'object' && 'value' in rpc ? rpc.value : rpc
    }

    // 会话状态用中文：面板里混着 writing/committing 这种英文状态，读起来像调试信息。
    const STATE_LABELS = {
      idle: '待开始', planning: '计划中', writing: '写作中', awaiting_author: '等拍板',
      checking: '检查中', committing: '提交中', completed: '已落账', blocked: '阻塞', ready: '就绪',
    }

    function stateLabel(state) {
      if (!state) return '—'
      return STATE_LABELS[state] || String(state)
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
      if (session.state === 'blocked' || session.state === 'committing') {
        return { kind: 'resume', chapter, title: session.state === 'blocked' ? '先恢复被阻塞的会话' : '上一笔提交还没走完', detail: '先核对事务状态，再继续；不要重复收尾。' }
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

    // ── 小说工作台（conversation.view）：书桌/章节/故事/资料四入口 ──────────────
    function Workbench(props) {
      // initialSection 只给快照验收/深链用：正常打开永远从书桌起。
      const { sessionId, remote, embedded = false, onClose = null, initialSection = 'desk' } = props
      const [state, setState] = React.useState({ phase: 'loading', data: null, diag: null, error: null })
      const [book, setBook] = React.useState('')
      const [draftState, setDraftState] = React.useState({ text: '', version: 0, hash: null, chars: 0, loaded: false, dirty: false })
      const [saveState, setSaveState] = React.useState({ phase: 'idle', message: '' })
      const [startPhase, setStartPhase] = React.useState('idle')
      const [section, setSection] = React.useState(initialSection)
      const [storyData, setStoryData] = React.useState(null)
      const [materialData, setMaterialData] = React.useState(null)
      const [fadeData, setFadeData] = React.useState(null)
      const [beatTab, setBeatTab] = React.useState('map')
      const [beatQuery, setBeatQuery] = React.useState('')
      const [beatEditing, setBeatEditing] = React.useState(null)
      const [beatOption, setBeatOption] = React.useState('')
      const [beatNote, setBeatNote] = React.useState('')
      const [beatMessage, setBeatMessage] = React.useState('')
      const [workOrder, setWorkOrder] = React.useState('')
      const [memoryOpen, setMemoryOpen] = React.useState(null)
      const [openDecisionId, setOpenDecisionId] = React.useState(null)
      const [styleOpen, setStyleOpen] = React.useState(null)
      const [styleBrief, setStyleBrief] = React.useState(null)
      const [canonBusy, setCanonBusy] = React.useState(false)
      const [canonMessage, setCanonMessage] = React.useState('')
      const [memoryQuery, setMemoryQuery] = React.useState('')
      const [memoryHits, setMemoryHits] = React.useState(null)
      const [planData, setPlanData] = React.useState(null)
      const [planEditing, setPlanEditing] = React.useState(false)
      const [planDraft, setPlanDraft] = React.useState(null)
      const [planBusy, setPlanBusy] = React.useState(false)
      const [planMessage, setPlanMessage] = React.useState('')
      const [operationsData, setOperationsData] = React.useState(null)
      const [previewData, setPreviewData] = React.useState(null)
      // 有未保存正文时，「返回任务卡」第一次点只给提醒，第二次才真走。
      const [exitArm, setExitArm] = React.useState(false)
      // 导入动线：选目录 → 列文件 → 学文笔 / 建 canon。右栏删掉后，这是唯一的导入入口。
      const [importDir, setImportDir] = React.useState('')
      const [importFiles, setImportFiles] = React.useState(null)
      const [importBusy, setImportBusy] = React.useState(false)
      const [importMessage, setImportMessage] = React.useState('')
      const [workSettings, setWorkSettings] = React.useState(null)
      const [newBookName, setNewBookName] = React.useState('')
      const [workBusy, setWorkBusy] = React.useState(false)
      const [workMessage, setWorkMessage] = React.useState('')

      const requestRef = React.useRef(0)
      const editVersionRef = React.useRef(0)
      const bookRef = React.useRef(null)
      const load = React.useCallback(async function (nextBook) {
        if (!remote) {
          setState({ phase: 'error', data: null, error: '工作台读接口未就绪：请更新并重载 DSH。' })
          return
        }
        // 切书必须先把编辑器里的稿清掉：否则 A 书的正文会留在 B 书的编辑器里，
        // 保存时按 B 书的版本号写，轻则串稿，重则把别人的章节覆盖掉。
        const switching = Boolean(nextBook) && nextBook !== bookRef.current
        if (switching) {
          editVersionRef.current = 0
          bookRef.current = nextBook
          setDraftState({ text: '', version: 0, hash: null, chars: 0, loaded: false, dirty: false })
          setSaveState({ phase: 'idle', message: '' })
          setExitArm(false)
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

      // 自动选书：快照没指定书时，用工作区里发现的第一本书再取一次。
      // 没有这一步，快照的 book/session 全是 null，七个页面会永远停在「加载…」。
      React.useEffect(function () {
        if (book) return
        const found = (state.data && state.data.workspace && Array.isArray(state.data.workspace.beat) && state.data.workspace.beat.length)
          ? state.data.workspace.beat[0]
          : null
        if (!found) return
        bookRef.current = found
        setBook(found)
        load(found)
      }, [book, state.data, load])

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

      React.useEffect(function () {
        setStoryData(null)
        setFadeData(null)
        setMaterialData(null)
        setBeatEditing(null)
        setBeatMessage('')
        setWorkOrder('')
        setMemoryOpen(null)
        setStyleOpen(null)
        setStyleBrief(null)
        setCanonMessage('')
        setMemoryQuery('')
        setMemoryHits(null)
        setPlanData(null)
        setPlanEditing(false)
        setPlanDraft(null)
        setPlanMessage('')
        setOperationsData(null)
        setPreviewData(null)
      }, [data && data.book])

      React.useEffect(function () {
        if (!remote || !data || !data.book) return undefined
        let cancelled = false
        const current = data && data.session ? data.session : null
        const chapter = current ? current.chapter : 1
        Promise.resolve(remote.getPlan(sessionId, { book: data.book, chapter })).then(unwrap).then(function (plan) {
          if (!cancelled) setPlanData(plan)
        }).catch(function () { if (!cancelled) setPlanData(null) })
        return function () { cancelled = true }
      }, [remote, sessionId, data && data.book, data && data.session && data.session.chapter])

      React.useEffect(function () {
        if (section !== 'data' || !remote) return undefined
        let cancelled = false
        Promise.resolve(remote.getOperations(sessionId, { limit: 20 })).then(unwrap).then(function (ops) {
          if (!cancelled) setOperationsData(ops)
        }).catch(function () { if (!cancelled) setOperationsData(null) })
        return function () { cancelled = true }
      }, [section, remote, sessionId])

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
          if (!stillDirty) setExitArm(false)
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
          : nextAction.kind === 'resume'
            ? { label: '恢复本章', action: function () { if (remote && session) Promise.resolve(remote.resumeChapter(sessionId, { chapterSessionId: session.id })).then(unwrap).then(function (result) { if (result && result.ok) load() }) }, disabled: false }
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

      const reloadBeat = React.useCallback(async function () {
        if (!remote || !data || !data.book) return
        const decisions = await Promise.resolve(remote.getDecisions(sessionId, { book: data.book, chapter: session ? session.chapter : null })).then(unwrap).catch(() => null)
        if (decisions) setStoryData((prev) => ({ ...(prev || {}), decisions }))
      }, [remote, sessionId, data, session])

      const confirmStyleNow = React.useCallback(async function (profile) {
        if (!remote || !profile) return
        try {
          const result = await Promise.resolve(remote.confirmStyle(sessionId, {
            profileId: profile.id, expectedRevision: profile.revision ?? null,
          })).then(unwrap)
          if (!result || result.ok === false) { setBeatMessage(result?.message || result?.code || '确认文风失败'); return }
          setBeatMessage('文风档案已确认：' + (profile.name || profile.id))
          setMaterialData(null)
          await load()
        } catch (error) {
          setBeatMessage(String(error?.message ?? error))
        }
      }, [remote, sessionId, load])

      const confirmCanonNow = React.useCallback(async function (canon) {
        if (!remote || !data || !data.book || !canon) return
        setCanonBusy(true)
        setCanonMessage('正在确认 canon…')
        try {
          const result = await Promise.resolve(remote.confirmCanon(sessionId, {
            book: data.book,
            sourceId: canon.sourceId || '',
            expectedRevision: canon.contractRevision ?? canon.revision ?? null,
          })).then(unwrap)
          if (!result || result.ok === false) { setCanonMessage(result?.message || result?.code || '确认失败'); return }
          setCanonMessage('canon 已确认。')
          const next = await Promise.resolve(remote.getCanon(sessionId, { book: data.book })).then(unwrap).catch(() => null)
          if (next) setMaterialData((prev) => ({ ...(prev || {}), canon: next }))
        } catch (error) {
          setCanonMessage(String(error?.message ?? error))
        } finally {
          setCanonBusy(false)
        }
      }, [remote, sessionId, data])

      const startPlanEdit = React.useCallback(function () {
        const plan = planData || { intent: '', pov: '', time: '', place: '', scenes: [], revision: 0 }
        setPlanDraft({
          intent: plan.intent || '', pov: plan.pov || '', time: plan.time || '', place: plan.place || '',
          scenes: (plan.scenes || []).map((scene) => ({ ...scene })),
        })
        setPlanEditing(true)
        setPlanMessage('')
      }, [planData])

      const updatePlanField = React.useCallback(function (key, value) {
        setPlanDraft((prev) => ({ ...(prev || { intent: '', pov: '', time: '', place: '', scenes: [] }), [key]: value }))
      }, [])

      const updateScene = React.useCallback(function (index, key, value) {
        setPlanDraft((prev) => {
          const base = prev || { intent: '', pov: '', time: '', place: '', scenes: [] }
          const scenes = base.scenes.map((scene, i) => i === index ? { ...scene, [key]: value } : scene)
          return { ...base, scenes }
        })
      }, [])

      const addScene = React.useCallback(function () {
        setPlanDraft((prev) => {
          const base = prev || { intent: '', pov: '', time: '', place: '', scenes: [] }
          return { ...base, scenes: [...base.scenes, { title: '场景 ' + (base.scenes.length + 1), goal: '', conflict: '', turn: '', exit: '', cast: [], targetChars: 0 }] }
        })
      }, [])

      const removeScene = React.useCallback(function (index) {
        setPlanDraft((prev) => {
          if (!prev) return prev
          return { ...prev, scenes: prev.scenes.filter((_, i) => i !== index) }
        })
      }, [])

      const savePlanNow = React.useCallback(async function () {
        if (!remote || !data || !data.book || !planDraft) return
        const chapter = session ? session.chapter : 1
        setPlanBusy(true)
        setPlanMessage('正在保存场景计划…')
        try {
          const result = await Promise.resolve(remote.savePlan(sessionId, {
            book: data.book, chapter, intent: planDraft.intent, pov: planDraft.pov,
            time: planDraft.time, place: planDraft.place, scenes: planDraft.scenes,
            expectedRevision: planData ? planData.revision : 0,
          })).then(unwrap)
          if (!result || result.ok === false) { setPlanMessage(result?.message || result?.code || '保存失败'); return }
          setPlanData(result.plan)
          setPlanEditing(false)
          setPlanDraft(null)
          setPlanMessage('场景计划已保存。')
        } catch (error) {
          setPlanMessage(String(error?.message ?? error))
        } finally {
          setPlanBusy(false)
        }
      }, [remote, sessionId, data, session, planDraft, planData])

      const loadStyleBrief = React.useCallback(async function (profile) {
        if (!remote || !profile) return
        try {
          const result = await Promise.resolve(remote.getStyleBrief(sessionId, { profileId: profile.id })).then(unwrap)
          setStyleBrief(result)
        } catch (error) {
          setBeatMessage(String(error?.message ?? error))
        }
      }, [remote, sessionId])

      const previewContextNow = React.useCallback(async function () {        if (!remote || !data || !data.book) return
        try {
          const preview = await Promise.resolve(remote.previewContext(sessionId, {
            book: data.book,
            chapter: session ? session.chapter : 1,
          })).then(unwrap)
          setPreviewData(preview)
        } catch (error) {
          setBeatMessage(String(error?.message ?? error))
        }
      }, [remote, sessionId, data, session])

      const searchMemoryNow = React.useCallback(async function () {        if (!remote || !data || !data.book) return
        const query = memoryQuery.trim()
        if (!query) { setMemoryHits(null); return }
        try {
          const hits = await Promise.resolve(remote.searchMemory(sessionId, { book: data.book, query, limit: 30 })).then(unwrap)
          setMemoryHits(hits && Array.isArray(hits.hits) ? hits.hits : [])
        } catch (error) {
          setBeatMessage(String(error?.message ?? error))
        }
      }, [remote, sessionId, data, memoryQuery])

      const actOnMemory = React.useCallback(async function (card, action) {        if (!remote || !data || !data.book || !card) return
        try {
          const result = await Promise.resolve(remote.memoryAction(sessionId, { book: data.book, cardId: card.id, action })).then(unwrap)
          if (!result || result.ok === false) { setBeatMessage(result?.message || result?.code || '记忆操作失败'); return }
          const memory = await Promise.resolve(remote.getMemory(sessionId, { book: data.book, limit: 80, currentChapter: session ? session.chapter : null })).then(unwrap).catch(() => null)
          if (memory) setFadeData(memory)
        } catch (error) {
          setBeatMessage(String(error?.message ?? error))
        }
      }, [remote, sessionId, data, session])

      const decideFromBeat = React.useCallback(async function (proposal, action, option) {
        if (!remote || !proposal || !session) return
        setBeatMessage(action === 'reject' ? '正在拒绝…' : '正在记录选择…')
        try {
          const result = await Promise.resolve(remote.decide(sessionId, {
            chapterSessionId: session.id, proposalId: proposal.id, action,
            option: option || '',
          })).then(unwrap)
          if (!result || result.ok === false) { setBeatMessage(result?.message || result?.code || '拍板失败'); return }
          setBeatMessage(action === 'reject' ? '已拒绝该提案。' : '已拍板：' + (option || ''))
          await reloadBeat()
        } catch (error) {
          setBeatMessage(String(error?.message ?? error))
        }
      }, [remote, sessionId, session, reloadBeat])

      const submitRevise = React.useCallback(async function (decision) {
        if (!remote || !data || !data.book || !decision) return
        const option = beatOption.trim()
        if (!option) { setBeatMessage('先写新方向'); return }
        setBeatMessage('正在生成重写工单…')
        try {
          const result = await Promise.resolve(remote.reviseDecision(sessionId, {
            book: data.book, decisionId: decision.id, option, note: beatNote.trim(),
          })).then(unwrap)
          if (!result || result.ok === false) { setBeatMessage(result?.message || result?.code || '改选失败'); return }
          setWorkOrder(result.workOrder || '')
          setBeatMessage('已追加改选记录；旧线保留。')
          setBeatEditing(null)
          setBeatOption('')
          setBeatNote('')
          await reloadBeat()
        } catch (error) {
          setBeatMessage(String(error?.message ?? error))
        }
      }, [remote, sessionId, data, beatOption, beatNote, reloadBeat])

      const sectionLabel = { desk: '书桌', chapter: '正文', beat: '故事', fade: '记忆', voice: '风格', fanfic: '同人', data: '资料' }
      // 页签上的小红点：有事要处理时才亮，不堆计数文字。
      const sectionDot = {
        beat: pendingIds.length + conflictTotal > 0,
        fanfic: !!(data && data.canon && data.settings && data.settings.mode === 'fanfic' && !data.canon.ready),
        data: !!(data && data.operations && Array.isArray(data.operations.items) && data.operations.items.some((item) => item.status === 'failed')),
      }
      const sectionButton = (key) => h('button', {
        key,
        type: 'button',
        className: 'nk-tab' + (section === key ? ' active' : ''),
        onClick: function () { setSection(key) },
      }, sectionLabel[key], sectionDot[key] ? h('span', { className: 'nk-tab-dot' }) : null)

      const browseImport = React.useCallback(async function (dir) {
        const target = String(dir || importDir || (data && data.root) || '').trim()
        if (!remote || typeof remote.listSourceFiles !== 'function') { setImportMessage('宿主没有导入接口，先重载 DSH。'); return }
        if (!target) { setImportMessage('先填一个目录，例如 D:\\我的小说'); return }
        try {
          const result = await Promise.resolve(remote.listSourceFiles(sessionId, { dir: target })).then(unwrap)
          setImportDir(target)
          setImportFiles(result && Array.isArray(result.files) ? result.files : [])
          setImportMessage(result && result.ok === false ? (result.reason || '目录不可读') : '')
        } catch (error) {
          setImportFiles([])
          setImportMessage(String(error?.message ?? error))
        }
      }, [remote, sessionId, importDir, data])

      const runImport = React.useCallback(async function (kind, file) {
        const method = kind === 'style' ? 'importStyle' : 'importCanon'
        if (!remote || typeof remote[method] !== 'function') { setImportMessage('宿主没有 ' + method + ' 接口'); return }
        if (!file || !file.path) return
        setImportBusy(true)
        setImportMessage(kind === 'style' ? '正在读这本作品、归纳文风…' : '正在切章、导入原著…')
        try {
          const result = await Promise.resolve(remote[method](sessionId, {
            book: data && data.book ? data.book : undefined,
            file: file.path,
            title: String(file.name || '').replace(/\.[^.]+$/, ''),
          })).then(unwrap)
          const done = result && (result.message || result.code || result.status)
          setImportMessage(done ? String(result.message || result.code || result.status) : '已导入：' + file.name)
          setMaterialData(null)
          await load()
        } catch (error) {
          setImportMessage(String(error?.message ?? error))
        } finally {
          setImportBusy(false)
        }
      }, [remote, sessionId, data, load])

      /** 导入面板：风格工作室与同人共用，只有目标命令不同。 */
      function importPanel(kind) {
        const isStyle = kind === 'style'
        const noBook = !(data && data.book)
        return h('section', { className: 'nk-card' },
          h('div', { className: 'nk-card-head' },
            h('div', { className: 'nk-card-title' }, isStyle ? '导入作品 · 学文笔' : '导入原著 · 建 canon'),
            h('span', { className: 'nk-meta' }, 'UTF-8 的 .txt / .md，≤ 64 MB')),
          h('div', { className: 'nk-import-row' },
            h('input', {
              className: 'nk-input',
              value: importDir,
              placeholder: '放书的目录，例如 D:\\我的小说',
              onChange: function (event) { setImportDir(event.target.value) },
              onKeyDown: function (event) { if (event.key === 'Enter') browseImport(event.target.value) },
            }),
            h('button', { type: 'button', className: 'nk-btn', disabled: importBusy, onClick: function () { browseImport() } }, '浏览')),
          importMessage ? h('div', { className: 'nk-tiny', style: { marginTop: 7 } }, importMessage) : null,
          noBook ? h('div', { className: 'nk-tiny', style: { marginTop: 7, color: c.warning } }, '先建一本自己的作品，导入会绑定到它。') : null,
          importFiles && importFiles.length
            ? h('div', { style: { marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 } },
                importFiles.slice(0, 12).map(function (file) {
                  return h('div', { key: file.path, className: 'nk-file-row' },
                    h('span', { className: 'nk-file-name' }, file.name),
                    h('span', { className: 'nk-file-meta' }, Math.max(1, Math.round((file.bytes || 0) / 1024)) + ' KB'),
                    h('button', {
                      type: 'button', className: 'nk-btn primary', disabled: importBusy || noBook,
                      onClick: function () { runImport(kind, file) },
                    }, importBusy ? '…' : (isStyle ? '学这本' : '导入')))
                }))
            : importFiles
              ? h('div', { className: 'nk-tiny', style: { marginTop: 9 } }, '这个目录里没有 .txt / .md。')
              : null)
      }

      const loadWorkSettings = React.useCallback(async function () {
        if (!remote || typeof remote.getSettings !== 'function') return
        try {
          const value = await Promise.resolve(remote.getSettings(sessionId, { book: data && data.book ? data.book : null })).then(unwrap)
          setWorkSettings(value)
        } catch (error) {
          setWorkMessage(String(error?.message ?? error))
        }
      }, [remote, sessionId, data])

      React.useEffect(function () {
        if (section === 'data' && !workSettings) loadWorkSettings()
      }, [section, workSettings, loadWorkSettings])

      const toggleMaster = React.useCallback(async function () {
        if (!remote || typeof remote.setMaster !== 'function') { setWorkMessage('宿主没有总开关接口'); return }
        setWorkBusy(true)
        try {
          const next = !(workSettings && workSettings.master)
          await Promise.resolve(remote.setMaster(sessionId, { master: next })).then(unwrap)
          setWorkMessage(next ? '小说能力已开启。' : '小说能力已关闭：工具不再注册，面板写入会被拒绝。')
          await loadWorkSettings()
          await load()
        } catch (error) {
          setWorkMessage(String(error?.message ?? error))
        } finally {
          setWorkBusy(false)
        }
      }, [remote, sessionId, workSettings, loadWorkSettings, load])

      const chooseMode = React.useCallback(async function (mode) {
        if (!remote || typeof remote.setMode !== 'function') { setWorkMessage('宿主没有模式接口'); return }
        const target = data && data.book ? data.book : ''
        if (!target) { setWorkMessage('先选一本作品再切换模式。'); return }
        setWorkBusy(true)
        try {
          await Promise.resolve(remote.setMode(sessionId, { book: target, mode })).then(unwrap)
          setWorkMessage('「' + target + '」已切到' + (mode === 'fanfic' ? '同人' : '原创') + '模式。')
          await loadWorkSettings()
          await load()
        } catch (error) {
          setWorkMessage(String(error?.message ?? error))
        } finally {
          setWorkBusy(false)
        }
      }, [remote, sessionId, data, loadWorkSettings, load])

      const createBookNow = React.useCallback(async function () {
        if (!remote || typeof remote.createBook !== 'function') { setWorkMessage('宿主没有建书接口'); return }
        const name = newBookName.trim()
        if (!name) return
        setWorkBusy(true)
        try {
          await Promise.resolve(remote.createBook(sessionId, { book: name })).then(unwrap)
          setWorkMessage('已新建作品「' + name + '」，账本与项目设置已就位。')
          setNewBookName('')
          setBook(name)
          await load(name)
          await loadWorkSettings()
        } catch (error) {
          setWorkMessage(String(error?.message ?? error))
        } finally {
          setWorkBusy(false)
        }
      }, [remote, sessionId, newBookName, load, loadWorkSettings])

      /** 工作区设置：右栏删掉后，总开关/模式/新建作品必须在这里。 */
      function workSettingsCard() {
        const master = !!(workSettings && workSettings.master)
        const projectMode = (workSettings && workSettings.project && workSettings.project.mode) || 'original'
        return h('section', { className: 'nk-card' },
          h('div', { className: 'nk-card-head' },
            h('div', { className: 'nk-card-title' }, '工作区设置'),
            h('span', { className: 'nk-meta' }, workSettings ? 'profile 级总开关' : '读取中…')),
          h('div', { className: 'nk-kv' },
            h('span', { className: 'nk-kv-key' }, '小说能力总开关'),
            h('button', {
              type: 'button', className: 'nk-btn' + (master ? ' primary' : ''), disabled: workBusy,
              onClick: toggleMaster,
            }, master ? '已开启 · 点此关闭' : '已关闭 · 点此开启')),
          h('div', { className: 'nk-kv' },
            h('span', { className: 'nk-kv-key' }, '本项目模式'),
            h('div', { style: { display: 'flex', gap: 6 } },
              ['original', 'fanfic'].map(function (mode) {
                return h('button', {
                  key: mode, type: 'button', className: 'nk-btn' + (projectMode === mode ? ' primary' : ''), disabled: workBusy,
                  onClick: function () { chooseMode(mode) },
                }, mode === 'original' ? '原创' : '同人')
              }))),
          h('div', { className: 'nk-import-row', style: { marginTop: 10 } },
            h('input', {
              className: 'nk-input', value: newBookName, placeholder: '新建作品名，例如：长夜行',
              onChange: function (event) { setNewBookName(event.target.value) },
              onKeyDown: function (event) { if (event.key === 'Enter') createBookNow() },
            }),
            h('button', { type: 'button', className: 'nk-btn', disabled: workBusy || !newBookName.trim(), onClick: createBookNow }, '新建作品')),
          h('div', { className: 'nk-tiny', style: { marginTop: 9 } }, '旧五件账本：先运行 /novel legacy 接管，再卸载 beat / fade / voice / fanfic / conductor。'),
          workMessage ? h('div', { className: 'nk-tiny', style: { marginTop: 6, color: c.sub } }, workMessage) : null)
      }

      /** 每个页面自己的标题条：标题 + 一句说明 + 页内动作。 */
      function pageHead(title, sub, actions) {        return h('div', { className: 'nk-page-head' },
          h('div', null,
            h('div', { className: 'nk-h2' }, title),
            sub ? h('div', { className: 'nk-page-sub' }, sub) : null),
          actions ? h('div', { className: 'nk-page-actions' }, actions) : null)
      }

      function sceneComposer() {
        const plan = planData
        const scenes = plan && Array.isArray(plan.scenes) ? plan.scenes : []
        const draft = planDraft
        return h('section', { className: 'nk-card' },
          h('div', { className: 'nk-card-head' },
            h('div', { className: 'nk-card-title' }, '本章场景'),
            h('span', { className: 'nk-meta', style: { marginLeft: 0 } }, plan && plan.available ? 'rev ' + plan.revision : '未建立'),
            h('div', { style: { marginLeft: 'auto', display: 'flex', gap: 6 } },
              planEditing
                ? h('div', { style: { display: 'flex', gap: 5 } },
                    h('button', { className: 'nk-btn primary', disabled: planBusy, onClick: savePlanNow }, planBusy ? '保存中…' : '保存计划'),
                    h('button', { className: 'nk-btn', disabled: planBusy, onClick: function () { setPlanEditing(false); setPlanDraft(null) } }, '取消'))
                : h('button', { className: 'nk-btn', onClick: startPlanEdit }, scenes.length ? '编辑场景' : '新建场景计划'))),
          planMessage ? h('div', { style: { fontSize: 11, color: planMessage.includes('失败') || planMessage.includes('错误') ? c.error : c.sub, marginTop: 5 } }, planMessage) : null,
          planEditing && draft
            ? h('div', { style: { marginTop: 9 } },
                h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 } },
                  h('input', { value: draft.intent, placeholder: '本章意图', onChange: function (event) { updatePlanField('intent', event.target.value) }, style: { gridColumn: '1 / -1', border: '1px solid ' + c.border, borderRadius: 7, background: c.base, color: c.text, padding: '6px 8px', fontSize: 11.5, fontFamily: 'inherit' } }),
                  h('input', { value: draft.pov, placeholder: '视角', onChange: function (event) { updatePlanField('pov', event.target.value) }, style: { border: '1px solid ' + c.border, borderRadius: 7, background: c.base, color: c.text, padding: '6px 8px', fontSize: 11.5, fontFamily: 'inherit' } }),
                  h('input', { value: draft.place, placeholder: '地点', onChange: function (event) { updatePlanField('place', event.target.value) }, style: { border: '1px solid ' + c.border, borderRadius: 7, background: c.base, color: c.text, padding: '6px 8px', fontSize: 11.5, fontFamily: 'inherit' } })),
                draft.scenes.map(function (scene, index) {
                  return h('div', { key: index, style: { marginTop: 8, padding: 9, border: '1px solid ' + c.border, borderRadius: 9 } },
                    h('div', { style: { display: 'flex', gap: 6 } },
                      h('input', { value: scene.title || '', placeholder: '场景名', onChange: function (event) { updateScene(index, 'title', event.target.value) }, style: { flex: 1, border: '1px solid ' + c.border, borderRadius: 7, background: c.base, color: c.text, padding: '6px 8px', fontSize: 11.5, fontFamily: 'inherit' } }),
                      h('button', { className: 'nk-btn', onClick: function () { removeScene(index) } }, '删除')),
                    h('input', { value: scene.goal || '', placeholder: '本场目标', onChange: function (event) { updateScene(index, 'goal', event.target.value) }, style: { width: '100%', boxSizing: 'border-box', marginTop: 5, border: '1px solid ' + c.border, borderRadius: 7, background: c.base, color: c.text, padding: '6px 8px', fontSize: 11.5, fontFamily: 'inherit' } }),
                    h('input', { value: scene.turn || '', placeholder: '转折（可选）', onChange: function (event) { updateScene(index, 'turn', event.target.value) }, style: { width: '100%', boxSizing: 'border-box', marginTop: 5, border: '1px solid ' + c.border, borderRadius: 7, background: c.base, color: c.text, padding: '6px 8px', fontSize: 11.5, fontFamily: 'inherit' } }))
                }),
                h('button', { className: 'nk-btn', style: { marginTop: 6 }, onClick: addScene }, '+ 添加场景'))
            : scenes.length === 0
              ? h('div', { className: 'nk-tiny', style: { marginTop: 7 } }, '还没有场景计划。先写 2–4 场：目标 / 冲突 / 转折 / 出口。')
              : h('div', { style: { marginTop: 8 } },
                  scenes.map(function (scene, index) {
                    return h('div', { key: scene.id || index, style: { display: 'flex', gap: 8, padding: '5px 0', borderBottom: index < scenes.length - 1 ? '1px dashed ' + c.border : 'none' } },
                      h('span', { style: { ...faint, width: 20, flexShrink: 0, fontFamily: '"Songti SC", serif' } }, String(index + 1).padStart(2, '0')),
                      h('span', { style: { fontSize: 11.5, color: c.sub } }, scene.title + (scene.goal ? ' · ' + scene.goal : '')))
                  }),
                  plan && plan.brief && plan.brief.available ? h('div', { style: { ...faint, marginTop: 7, fontSize: 10.5 } }, '写前 brief：' + plan.brief.chars + ' 字 · rev ' + (plan.brief.revision ?? plan.revision)) : null))
      }

      function deskView() {
        const chapters = (data && data.history && Array.isArray(data.history.chapters)) ? data.history.chapters : []
        const contexts = (data && data.contexts) || []
        const ledgers = (data && data.ledgers) || {}
        const operations = (data && data.operations && Array.isArray(data.operations.items)) ? data.operations.items : []
        const canonPending = !!(data && data.canon && data.settings && data.settings.mode === 'fanfic' && !data.canon.ready)
        const failedOps = operations.filter((item) => item.status === 'failed')
        const inboxCount = pendingIds.length + conflictTotal + (canonPending ? 1 : 0) + failedOps.length

        const stat = (label, value, tone) => h('div', { className: 'nk-stat' },
          h('div', { className: 'nk-stat-label' }, label),
          h('div', { className: 'nk-stat-value' + (tone ? ' ' + tone : '') }, value))

        const inbox = inboxCount === 0
          ? h('div', { className: 'nk-tiny', style: { padding: '2px 0 2px' } }, '没有待拍板、冲突或失败操作。')
          : h('div', null,
              pendingIds.slice(0, 6).map((id) => h('div', { key: id, className: 'nk-kv' },
                h('span', { className: 'nk-kv-key' }, '拍板 · ' + id),
                h('span', { className: 'nk-kv-val', style: { color: c.warning } }, '待作者确认'))),
              canonPending
                ? h('div', { className: 'nk-kv' },
                    h('span', { className: 'nk-kv-key' }, 'canon · 同人原著待确认'),
                    h('span', { className: 'nk-kv-val', style: { color: c.warning } }, data.canon.contractStatus || 'pending'))
                : null,
              failedOps.slice(0, 3).map((operation) => h('div', { key: operation.operationId, className: 'nk-kv' },
                h('span', { className: 'nk-kv-key' }, '失败 · ' + (operation.command || operation.operationId)),
                h('span', { className: 'nk-kv-val', style: { color: c.error } }, operation.error?.message || '操作失败'))),
              (data && data.conflicts && data.conflicts.items ? data.conflicts.items : []).slice(0, 4).map((item, index) => h('div', { key: 'c' + index, className: 'nk-kv' },
                h('span', { className: 'nk-kv-key' }, '冲突 · ' + (item.entity || '?') + ' · ' + (item.key || '?')),
                h('span', { className: 'nk-kv-val' }, '只报告，不裁决'))))

        return h('div', { className: 'nk-wb-body' },
          pageHead('书桌', '当前作品、下一笔与本章待办。'),
          h('div', { className: 'nk-wb-grid' },
            h('div', { className: 'nk-wb-col' },
              h('section', { className: 'nk-card hero' },
                h('div', { className: 'nk-card-head' },
                  h('div', { className: 'nk-card-title', style: { color: 'var(--nk-accent)' } }, 'NEXT · 下一笔'),
                  h('span', { className: 'nk-meta' }, session ? '第 ' + session.chapter + ' 章 · ' + stateLabel(session.state) : '还没有章节会话')),
                h('div', { className: 'nk-h1' }, nextAction.title),
                h('div', { className: 'nk-body', style: { marginTop: 6 } }, nextAction.detail),
                h('div', { style: { display: 'flex', gap: 8, marginTop: 15, alignItems: 'center', flexWrap: 'wrap' } },
                  h('button', {
                    type: 'button', className: 'nk-btn primary',
                    style: { height: 34, padding: '0 16px', fontSize: 12.5, fontWeight: 600 },
                    disabled: deskPrimary.disabled || !deskPrimary.action,
                    onClick: deskPrimary.action || undefined,
                  }, deskPrimary.label),
                  h('button', { type: 'button', className: 'nk-btn', style: { height: 34, padding: '0 14px', fontSize: 12.5 }, onClick: function () { load() } }, '刷新'),
                  saveState.message
                    ? h('span', { className: 'nk-tiny', style: { color: saveState.phase === 'error' ? c.error : c.sub } }, saveState.message)
                    : null)),

              h('div', { className: 'nk-stats' },
                stat('当前章', session ? '第 ' + session.chapter + ' 章' : '—'),
                stat('状态', session ? stateLabel(session.state) : '—', session && session.state === 'completed' ? 'accent' : ''),
                stat('字数', session && session.draft ? String(session.draft.chars ?? '—') : '—'),
                stat('待处理', String(pendingIds.length + conflictTotal), pendingIds.length + conflictTotal > 0 ? 'warn' : '')),

              h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' },
                  h('div', { className: 'nk-card-title' }, '章节流程'),
                  h('span', { className: 'nk-meta' }, '计划 → 正文 → 检查 → 收尾')),
                h('div', { className: 'nk-steps' }, flowSteps.map((step, index) => h('div', { key: step.id, className: 'nk-step' + (step.done ? ' done' : '') },
                  h('div', { className: 'nk-step-no' }, 'STEP ' + (index + 1)),
                  h('div', { className: 'nk-step-label' }, step.label),
                  h('div', { className: 'nk-step-state' }, step.done ? '已完成' : '待做'))))),

              sceneComposer(),

              h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' },
                  h('div', { className: 'nk-card-title' }, '收件箱'),
                  h('span', { className: 'nk-meta' }, inboxCount ? inboxCount + ' 条待处理' : '干净')),
                inbox),

              h('section', { className: 'nk-card flush' },
                h('div', { className: 'nk-card-head', style: { padding: '14px 16px 0' } },
                  h('div', { className: 'nk-card-title' }, '最近章节'),
                  h('span', { className: 'nk-meta' }, chapters.length ? '共 ' + chapters.length + ' 章' : '还没有章节')),
                chapters.length === 0
                  ? h('div', { className: 'nk-empty-state' }, h('div', { className: 'nk-tiny' }, '写完第一章并收尾后会出现在这里。'))
                  : h('div', { className: 'nk-recent' }, chapters.slice(0, 8).map((item, index) => h('div', { key: index, className: 'nk-recent-row' },
                      h('span', { className: 'nk-recent-no' }, 'CH.' + String(item.chapter || index + 1).padStart(2, '0')),
                      h('span', { className: 'nk-recent-title' }, '第 ' + item.chapter + ' 章'),
                      h('span', { className: 'nk-recent-state' }, stateLabel(item.state) + (item.chars ? ' · ' + item.chars + ' 字' : ''))))))),

            h('div', { className: 'nk-wb-col nk-wb-aside' },
              h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' }, h('div', { className: 'nk-card-title' }, '写作依据')),
                contexts.length === 0
                  ? h('div', { className: 'nk-tiny' }, '还没有装配依据。开章后这里显示四段字数与 revision。')
                  : contexts.map((segment) => h('div', { key: segment.component, className: 'nk-kv' },
                      h('span', { className: 'nk-kv-key' }, segment.component),
                      h('span', { className: 'nk-kv-val' }, segment.available
                        ? (segment.chars || 0) + '/' + (segment.budgetChars ?? '?') + ' · rev ' + (segment.revision ?? '-')
                        : '未接入')))),
              h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' }, h('div', { className: 'nk-card-title' }, '五本账')),
                Object.entries(ledgers).map(function ([name, entry]) {
                  return h('div', { key: name, className: 'nk-kv' },
                    h('span', { className: 'nk-kv-key' }, name),
                    h('span', { className: 'nk-kv-val' }, entry ? 'rev ' + (entry.revision ?? '-') : '无'))
                })),
              session && session.verification
                ? h('section', { className: 'nk-card' },
                    h('div', { className: 'nk-card-head' }, h('div', { className: 'nk-card-title' }, '本章检查')),
                    h('div', { className: 'nk-kv' },
                      h('span', { className: 'nk-kv-key' }, 'blocker'),
                      h('span', { className: 'nk-kv-val', style: { color: session.verification.blockers ? c.error : c.sub } }, String(session.verification.blockers))),
                    h('div', { className: 'nk-kv' },
                      h('span', { className: 'nk-kv-key' }, 'warning'),
                      h('span', { className: 'nk-kv-val', style: { color: session.verification.warnings ? c.warning : c.sub } }, String(session.verification.warnings))))
                : null))
        )
      }

      function fmtNum(value) {
        const number = Number(value)
        if (!Number.isFinite(number)) return String(value ?? '—')
        return number.toLocaleString('zh-CN')
      }

      function pageStat(label, value, tone) {
        return h('div', { className: 'nk-stat' },
          h('div', { className: 'nk-stat-label' }, label),
          h('div', { className: 'nk-stat-value' + (tone ? ' ' + tone : '') }, typeof value === 'number' ? fmtNum(value) : String(value)))
      }

      function inlineEmpty(text) {
        return h('div', { className: 'nk-tiny', style: { padding: '12px 2px' } }, text)
      }

      // ── 决策页：待拍板 / 已拍板 / 详情与改选 / 意图与文风倾向 ─────────────
      function decisionsPage() {
        const view = storyData && storyData.decisions ? storyData.decisions : null
        const committed = view && Array.isArray(view.committed) ? view.committed : []
        const pending = view && Array.isArray(view.proposals) ? view.proposals : []
        const selected = committed.filter(function (item) { return item.id === openDecisionId })[0] || null
        const beatRev = data && data.ledgers && data.ledgers.beat ? data.ledgers.beat.revision : '—'

        const proposalView = function (item) {
          return h('div', { key: item.id, className: 'nk-proposal' },
            h('div', { className: 'nk-proposal-title' }, item.title || '未命名提案'),
            (item.options || []).map(function (option) {
              return h('div', { key: option.label, className: 'nk-option' },
                h('div', { className: 'nk-option-label' }, option.label),
                option.impact ? h('div', { className: 'nk-tiny', style: { marginTop: 3 } }, option.impact) : null,
                option.styleWhy ? h('div', { className: 'nk-tiny', style: { marginTop: 2 } }, '文风：' + option.styleWhy) : null,
                h('div', { className: 'nk-option-foot' },
                  option.styleFit !== null && option.styleFit !== undefined
                    ? h('span', { className: 'nk-badge accent' }, '贴合 ' + option.styleFit)
                    : null,
                  h('button', {
                    type: 'button', className: 'nk-btn primary', style: { marginLeft: 'auto' },
                    onClick: function () { decideFromBeat(item, 'adopt', option.label) },
                  }, '选它')))
            }),
            h('button', {
              type: 'button', className: 'nk-btn', style: { marginTop: 8 },
              onClick: function () { decideFromBeat(item, 'reject') },
            }, '整条拒绝'))
        }

        const committedRow = function (item) {
          const active = item.id === openDecisionId
          return h('button', {
            key: item.id, type: 'button',
            className: 'nk-rowbtn' + (active ? ' active' : ''),
            onClick: function () { setOpenDecisionId(active ? null : item.id) },
          },
          h('span', { className: 'nk-badge' }, 'CH.' + String(item.chapter).padStart(2, '0')),
          h('span', { className: 'nk-rowbtn-title' }, item.title || item.change || '未命名决策'),
          item.workOrder ? h('span', { className: 'nk-badge warn' }, '有工单') : null,
          h('span', { className: 'nk-meta' }, item.option || ''))
        }

        const detail = selected
          ? h('section', { className: 'nk-card' },
              h('div', { className: 'nk-card-head' },
                h('div', { className: 'nk-card-title' }, '决策详情'),
                h('span', { className: 'nk-meta' }, 'CH.' + String(selected.chapter).padStart(2, '0'))),
              h('div', { className: 'nk-h3' }, selected.title || '未命名决策'),
              selected.change ? h('div', { className: 'nk-quote' }, selected.change) : null,
              h('div', { className: 'nk-kv' },
                h('span', { className: 'nk-kv-key' }, '已选'),
                h('span', { className: 'nk-kv-val' }, selected.option || '—')),
              selected.supersedes
                ? h('div', { className: 'nk-kv' },
                    h('span', { className: 'nk-kv-key' }, '改选自'),
                    h('span', { className: 'nk-kv-val' }, selected.supersedes))
                : null,
              selected.createdAt
                ? h('div', { className: 'nk-kv' },
                    h('span', { className: 'nk-kv-key' }, '拍板时间'),
                    h('span', { className: 'nk-kv-val' }, String(selected.createdAt).slice(0, 16).replace('T', ' ')))
                : null,
              h('div', { className: 'nk-tiny', style: { margin: '6px 0 4px' } }, '改选：写一个新方向，旧决策保留，另生成重写工单'),
              h('input', {
                className: 'nk-input', value: beatOption, placeholder: '新方向，例如：改成正面场景',
                onChange: function (event) { setBeatOption(event.target.value) },
              }),
              h('input', {
                className: 'nk-input', style: { marginTop: 6 }, value: beatNote, placeholder: '备注（可选）',
                onChange: function (event) { setBeatNote(event.target.value) },
              }),
              h('button', {
                type: 'button', className: 'nk-btn', style: { marginTop: 8 },
                onClick: function () { submitRevise(selected) },
              }, '生成重写工单'),
              workOrder ? h('div', { className: 'nk-tiny', style: { marginTop: 8, wordBreak: 'break-all' } }, '工单：' + workOrder) : null)
          : h('section', { className: 'nk-card' },
              h('div', { className: 'nk-card-head' }, h('div', { className: 'nk-card-title' }, '决策详情')),
              h('div', { className: 'nk-empty-state' },
                h('div', { className: 'nk-glyph' }, '判'),
                h('div', { className: 'nk-tiny' }, '点左边一条已拍板的决策，看它的选项、影响与改选。')))

        return h('div', { className: 'nk-wb-body' },
          pageHead('决策', '本章拍过什么、还欠什么；提案必须你点头才算数。',
            h('button', { type: 'button', className: 'nk-btn', onClick: function () { reloadBeat() } }, '刷新')),
          h('div', { className: 'nk-stats' },
            pageStat('本章已拍板', committed.length),
            pageStat('待你拍板', pending.length, pending.length ? 'warn' : ''),
            pageStat('未回收线索', view ? view.openObligations : '—'),
            pageStat('beat 版本', beatRev)),
          beatMessage ? h('div', { className: 'nk-tiny', style: { margin: '10px 0' } }, beatMessage) : null,
          h('div', { className: 'nk-split' },
            h('div', { className: 'nk-split-list' },
              h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' },
                  h('div', { className: 'nk-card-title' }, '待你拍板'),
                  h('span', { className: 'nk-meta' }, pending.length + ' 条')),
                pending.length ? pending.map(proposalView)
                  : inlineEmpty('没有待拍板的提案。模型提出选项后会出现在这里，采纳或拒绝由你决定。')),
              h('section', { className: 'nk-card flush' },
                h('div', { className: 'nk-card-head', style: { padding: '14px 14px 0' } },
                  h('div', { className: 'nk-card-title' }, '本章已拍板'),
                  h('span', { className: 'nk-meta' }, committed.length + ' 条')),
                committed.length ? committed.map(committedRow) : inlineEmpty('本章还没有拍过板。'))),
            h('div', { className: 'nk-wb-col nk-wb-aside' },
              detail,
              h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' }, h('div', { className: 'nk-card-title' }, '本章意图')),
                h('div', { className: 'nk-body' }, (view && view.intent) || '还没有写本章意图；可以在书桌的「本章场景」里填。')),
              h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' }, h('div', { className: 'nk-card-title' }, '文风倾向')),
                h('div', { className: 'nk-body' }, (view && view.styleHint) || '还没有文风提示；导入风格档案后这里会给出倾向。')))))
      }

      // ── 记忆页：卡库 / 检索 / 人物 / 线索 / 卡片详情 ───────────────────────
      function memoryPage() {
        const view = fadeData || null
        const cards = view && Array.isArray(view.cards) ? view.cards : []
        const entities = view && Array.isArray(view.entities) ? view.entities : []
        const threads = view && Array.isArray(view.threads) ? view.threads : []
        const opened = cards.filter(function (item) { return item.id === memoryOpen })[0] || null
        const pinned = cards.filter(function (item) { return item.pinned }).length
        const hits = Array.isArray(memoryHits) ? memoryHits : null

        const cardRow = function (item) {
          const active = item.id === memoryOpen
          return h('button', {
            key: item.id, type: 'button',
            className: 'nk-rowbtn' + (active ? ' active' : ''),
            onClick: function () { setMemoryOpen(active ? null : item.id) },
          },
          h('span', { className: 'nk-badge' + (item.layer === 'L0' ? ' accent' : '') }, item.layer || 'L2'),
          h('span', { className: 'nk-rowbtn-title' }, item.gist || '（无摘要）'),
          item.pinned ? h('span', { className: 'nk-badge warn' }, '钉住') : null,
          h('span', { className: 'nk-meta' }, 'CH.' + String(item.chapter).padStart(2, '0') + ' · ' + (item.emotion || '—')))
        }

        const detail = opened
          ? h('section', { className: 'nk-card' },
              h('div', { className: 'nk-card-head' },
                h('div', { className: 'nk-card-title' }, '卡片详情'),
                h('span', { className: 'nk-meta' }, 'CH.' + String(opened.chapter).padStart(2, '0') + ' · ' + (opened.domain || ''))),
              h('div', { className: 'nk-h3' }, opened.gist || '（无摘要）'),
              opened.quote ? h('div', { className: 'nk-quote' }, opened.quote) : null,
              opened.cause ? h('div', { className: 'nk-kv' }, h('span', { className: 'nk-kv-key' }, '因'), h('span', { className: 'nk-kv-val' }, opened.cause)) : null,
              opened.effect ? h('div', { className: 'nk-kv' }, h('span', { className: 'nk-kv-key' }, '果'), h('span', { className: 'nk-kv-val' }, opened.effect)) : null,
              opened.fidelity !== null && opened.fidelity !== undefined
                ? h('div', { className: 'nk-kv' },
                    h('span', { className: 'nk-kv-key' }, '记住程度'),
                    h('span', { className: 'nk-kv-val' }, Math.round(Number(opened.fidelity) * 100) + '% · 可及性 ' + Math.round(Number(opened.accessibility ?? 0) * 100) + '%'))
                : null,
              (opened.entityIds || []).length
                ? h('div', { className: 'nk-chipline', style: { marginTop: 8 } },
                    opened.entityIds.map(function (name) { return h('span', { key: name, className: 'nk-tag' }, name) }))
                : null,
              h('div', { className: 'nk-option-foot', style: { marginTop: 10 } },
                h('button', { type: 'button', className: 'nk-btn', onClick: function () { actOnMemory(opened, opened.pinned ? 'unpin' : 'pin') } }, opened.pinned ? '取消钉住' : '钉住'),
                h('button', { type: 'button', className: 'nk-btn', onClick: function () { actOnMemory(opened, opened.status === 'forgotten' ? 'restore' : 'forget') } }, opened.status === 'forgotten' ? '恢复' : '遗忘')))
          : h('section', { className: 'nk-card' },
              h('div', { className: 'nk-card-head' }, h('div', { className: 'nk-card-title' }, '卡片详情')),
              h('div', { className: 'nk-empty-state' },
                h('div', { className: 'nk-glyph' }, '忆'),
                h('div', { className: 'nk-tiny' }, '点左边一张卡，看原文引文、因果与能记多久。')))

        return h('div', { className: 'nk-wb-body' },
          pageHead('记忆', '近章重点记、旧事逐步淡；收尾时沉淀的卡片在这里，可以钉住或让它褪色。'),
          h('div', { className: 'nk-stats' },
            pageStat('卡片', view ? view.total : '—'),
            pageStat('已钉住', pinned),
            pageStat('未回收线索', threads.length, threads.length ? 'warn' : ''),
            pageStat('记忆漂移', view && view.drift ? '有' : '无', view && view.drift ? 'warn' : '')),
          h('div', { className: 'nk-import-row', style: { margin: '12px 0' } },
            h('input', {
              className: 'nk-input', value: memoryQuery, placeholder: '按人物 / 物品 / 秘密搜记忆',
              onChange: function (event) { setMemoryQuery(event.target.value) },
              onKeyDown: function (event) { if (event.key === 'Enter') searchMemoryNow() },
            }),
            h('button', { type: 'button', className: 'nk-btn', onClick: function () { searchMemoryNow() } }, '搜记忆')),
          hits
            ? h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' },
                  h('div', { className: 'nk-card-title' }, '检索命中'),
                  h('span', { className: 'nk-meta' }, hits.length + ' 条')),
                hits.length === 0
                  ? inlineEmpty('没有命中。换个词，或清空检索看全部卡片。')
                  : hits.slice(0, 12).map(function (item) {
                      return h('div', { key: item.id, className: 'nk-kv' },
                        h('span', { className: 'nk-kv-key' }, 'CH.' + String(item.chapter).padStart(2, '0') + ' · ' + (item.layer || 'L2')),
                        h('span', { className: 'nk-kv-val', style: { maxWidth: '60%' } }, item.gist || ''))
                    }))
            : null,
          h('div', { className: 'nk-split', style: { marginTop: hits ? 14 : 0 } },
            h('div', { className: 'nk-split-list' },
              h('section', { className: 'nk-card flush' },
                h('div', { className: 'nk-card-head', style: { padding: '14px 14px 0' } },
                  h('div', { className: 'nk-card-title' }, '记忆卡'),
                  h('span', { className: 'nk-meta' }, cards.length + ' 张')),
                cards.length ? cards.slice(0, 40).map(cardRow)
                  : inlineEmpty('这本书还没有记忆卡。每章收尾时会沉淀；先在「正文」页把第一章写完并收尾。'))),
            h('div', { className: 'nk-wb-col nk-wb-aside' },
              detail,
              h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' }, h('div', { className: 'nk-card-title' }, '人物')),
                entities.length
                  ? h('div', { className: 'nk-chipline' }, entities.slice(0, 16).map(function (item) {
                      return h('span', { key: item.name, className: 'nk-tag' }, item.name + ' · ' + item.mentions)
                    }))
                  : inlineEmpty('还没有人物出现。')),
              h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' }, h('div', { className: 'nk-card-title' }, '未回收线索')),
                threads.length
                  ? threads.slice(0, 8).map(function (item) {
                      return h('div', { key: item.id, className: 'nk-kv' },
                        h('span', { className: 'nk-kv-key' }, 'CH.' + String(item.chapter).padStart(2, '0')),
                        h('span', { className: 'nk-kv-val' }, item.text || item.type || ''))
                    })
                  : inlineEmpty('没有挂着的线索。')))))
      }

      // ── 风格工作室：导入 / 档案（区间+规则+避免词）/ 简报 / 书库 ────────────
      function stylePage() {
        const style = materialData && materialData.style ? materialData.style : {}
        const profiles = Array.isArray(style.kitProfiles) ? style.kitProfiles : []
        const works = Array.isArray(style.works) ? style.works : []
        const confirmed = profiles.filter(function (item) { return item.status === 'confirmed' }).length

        const bandRows = function (profile) {
          const bands = profile.bands && typeof profile.bands === 'object' ? profile.bands : {}
          const keys = Object.keys(bands).slice(0, 6)
          if (!keys.length) return inlineEmpty('还没有量出区间；确认档案后会重算。')
          return h('div', null, keys.map(function (key) {
            const spec = bands[key]
            const band = Array.isArray(spec) ? spec : spec && Array.isArray(spec.band) ? spec.band : null
            if (!band) return null
            const lo = Number(band[0])
            const hi = Number(band[1])
            const left = Math.max(0, Math.min(100, lo))
            const width = Math.max(2, Math.min(100 - left, hi - lo))
            return h('div', { key, className: 'nk-band' },
              h('span', null, key),
              h('div', { className: 'nk-band-track' }, h('div', { className: 'nk-band-fill', style: { left: left + '%', width: width + '%' } })),
              h('span', { className: 'nk-band-val' }, lo + '–' + hi))
          }))
        }

        const profileCard = function (profile) {
          const open = styleOpen === profile.id
          const ruleTexts = Array.isArray(profile.ruleTexts) ? profile.ruleTexts : []
          const avoid = Array.isArray(profile.avoid) ? profile.avoid : []
          return h('section', { key: profile.id, className: 'nk-card' },
            h('div', { className: 'nk-card-head' },
              h('div', { className: 'nk-card-title' }, profile.name || profile.id),
              h('span', { className: 'nk-badge' + (profile.status === 'confirmed' ? ' accent' : ' warn') }, profile.status === 'confirmed' ? '已确认' : '待确认'),
              h('span', { className: 'nk-meta' }, 'v' + (profile.version ?? '?')), 
              h('button', {
                type: 'button', className: 'nk-btn', style: { marginLeft: 'auto' },
                onClick: function () { setStyleOpen(open ? null : profile.id) },
              }, open ? '收起' : '展开')),
            h('div', { className: 'nk-tiny', style: { marginBottom: 6 } }, (profile.rules ?? ruleTexts.length) + ' 条规则 · ' + avoid.length + ' 个避免词'),
            bandRows(profile),
            open
              ? h('div', { style: { marginTop: 10 } },
                  ruleTexts.length
                    ? h('div', null, ruleTexts.slice(0, 8).map(function (text, index) {
                        return h('div', { key: index, className: 'nk-tiny', style: { lineHeight: 1.7 } }, '· ' + text)
                      }))
                    : inlineEmpty('规则还没编译；先确认档案。'),
                  avoid.length
                    ? h('div', { className: 'nk-chipline', style: { marginTop: 8 } },
                        avoid.slice(0, 16).map(function (word) { return h('span', { key: word, className: 'nk-tag' }, word) }))
                    : null,
                  styleBrief && styleBrief.profileId === profile.id && styleBrief.brief && styleBrief.brief.available
                    ? h('div', { className: 'nk-quote', style: { marginTop: 10, whiteSpace: 'pre-wrap' } }, styleBrief.brief.markdown)
                    : null)
              : null,
            h('div', { className: 'nk-option-foot', style: { marginTop: 10 } },
              profile.status !== 'confirmed'
                ? h('button', { type: 'button', className: 'nk-btn primary', onClick: function () { confirmStyleNow(profile) } }, '确认这份档案')
                : null,
              h('button', { type: 'button', className: 'nk-btn', onClick: function () { loadStyleBrief(profile) } }, '生成写前简报')))
        }

        return h('div', { className: 'nk-wb-body' },
          pageHead('风格工作室', '导入一本你喜欢的作品，看它的句长、对话比例、用词与禁忌；确认后才参与写作。'),
          importPanel('style'),
          h('div', { className: 'nk-stats', style: { marginTop: 14 } },
            pageStat('档案', profiles.length),
            pageStat('已确认', confirmed, confirmed ? '' : 'warn'),
            pageStat('书库作品', works.length),
            pageStat('书库字数', works.reduce(function (sum, item) { return sum + Number(item.chars || 0) }, 0))),
          h('div', { className: 'nk-wb-col', style: { marginTop: 14 } },
            profiles.length
              ? profiles.map(profileCard)
              : h('section', { className: 'nk-card' },
                  h('div', { className: 'nk-empty-state' },
                    h('div', { className: 'nk-glyph' }, '风'),
                    h('div', { className: 'nk-tiny' }, '还没有文风档案。在上面填一个装着 txt 的目录，选一本你喜欢的作品。')),
                  h('div', { className: 'nk-chipline', style: { justifyContent: 'center', marginTop: 8 } },
                    ['句长区间', '段长区间', '对话比例', '用词密度', '常用句式', '避免词'].map(function (item) {
                      return h('span', { key: item, className: 'nk-tag' }, item)
                    }))),
            works.length
              ? h('section', { className: 'nk-card flush' },
                  h('div', { className: 'nk-card-head', style: { padding: '14px 14px 0' } },
                    h('div', { className: 'nk-card-title' }, '旧 voice 书库'),
                    h('span', { className: 'nk-meta' }, works.length + ' 部')),
                  works.map(function (work) {
                    return h('div', { key: work.workId, className: 'nk-kv', style: { padding: '9px 14px' } },
                      h('span', { className: 'nk-kv-key' }, work.title || work.workId),
                      h('span', { className: 'nk-kv-val' }, work.chapters + ' 章 · ' + work.chars + ' 字'))
                  }))
              : null))
      }

      // ── 同人页：canon 状态 / 事实与证据 / 人物 / 规则 / 禁忌 / 本章检查 ─────
      function canonPage() {
        const canon = materialData && materialData.canon ? materialData.canon : {}
        if (!canon.available) {
          return h('div', { className: 'nk-wb-body' },
            pageHead('同人', '导入原著，抽成事实、人物、规则与称呼；每条都要有原文证据。'),
            importPanel('canon'),
            h('section', { className: 'nk-card', style: { marginTop: 14 } },
              h('div', { className: 'nk-card-head' }, h('div', { className: 'nk-card-title' }, '建 canon 的四步')),
              h('div', { className: 'nk-steps' }, [
                ['STEP 1', '导入原著', '选一个装着 txt 的目录'],
                ['STEP 2', '抽候选', '模型用 novel_canon 读原文'],
                ['STEP 3', '逐条审阅', '每条都要有原文证据'],
                ['STEP 4', '生效', '确认后才进写作依据'],
              ].map(function (item) {
                return h('div', { key: item[0], className: 'nk-step' },
                  h('div', { className: 'nk-step-no' }, item[0]),
                  h('div', { className: 'nk-step-label' }, item[1]),
                  h('div', { className: 'nk-step-state' }, item[2]))
              }))),
            h('section', { className: 'nk-card', style: { marginTop: 12 } },
              h('div', { className: 'nk-empty-state' },
                h('div', { className: 'nk-glyph' }, '原'),
                h('div', { className: 'nk-tiny' }, '还没有绑定原著。导入后模型用 novel_canon 抽候选，你逐条确认才算生效。'))))
        }
        const facts = Array.isArray(canon.facts) ? canon.facts : []
        const characters = Array.isArray(canon.characters) ? canon.characters : []
        const worldRules = Array.isArray(canon.worldRules) ? canon.worldRules : []
        const forbidden = Array.isArray(canon.forbidden) ? canon.forbidden : []
        const findings = session && session.verification && Array.isArray(session.verification.findings) ? session.verification.findings : []

        return h('div', { className: 'nk-wb-body' },
          pageHead('同人', '原著事实与禁忌决定这一本能不能写；有冲突先回原文核对。',
            h('button', { type: 'button', className: 'nk-btn' + (canon.canonReady ? '' : ' primary'), onClick: function () { confirmCanonNow(canon) }, }, canon.canonReady ? '重新确认 canon' : '确认这份 canon')),
          importPanel('canon'),
          h('div', { className: 'nk-stats', style: { marginTop: 14 } },
            pageStat('事实', facts.length),
            pageStat('人物', characters.length),
            pageStat('世界规则', worldRules.length),
            pageStat('canon 状态', canon.canonReady ? '已确认' : (canon.contractStatus || '待抽取'), canon.canonReady ? '' : 'warn')),
          canonMessage ? h('div', { className: 'nk-tiny', style: { margin: '10px 0' } }, canonMessage) : null,
          h('div', { className: 'nk-wb-grid' },
            h('div', { className: 'nk-wb-col' },
              h('section', { className: 'nk-card flush' },
                h('div', { className: 'nk-card-head', style: { padding: '14px 14px 0' } },
                  h('div', { className: 'nk-card-title' }, '原著事实'),
                  h('span', { className: 'nk-meta' }, facts.length + ' 条')),
                facts.length
                  ? facts.slice(0, 20).map(function (fact, index) {
                      return h('div', { key: index, className: 'nk-rowbtn', style: { cursor: 'default', flexDirection: 'column', alignItems: 'stretch', gap: 4 } },
                        h('div', { style: { display: 'flex', gap: 8, alignItems: 'baseline' } },
                          h('span', { className: 'nk-badge' }, fact.chapter ? 'CH.' + String(fact.chapter).padStart(2, '0') : '原著'),
                          h('span', { className: 'nk-rowbtn-title', style: { whiteSpace: 'normal' } }, (fact.subject || '') + ' · ' + (fact.key || '') + '：' + (fact.value || ''))),
                        fact.quote ? h('div', { className: 'nk-quote', style: { margin: '2px 0 0' } }, fact.quote) : null)
                    })
                  : inlineEmpty('还没有事实。')),
              h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' }, h('div', { className: 'nk-card-title' }, '世界规则与禁忌')),
                worldRules.length
                  ? worldRules.slice(0, 10).map(function (rule, index) {
                      return h('div', { key: index, className: 'nk-tiny', style: { lineHeight: 1.8 } }, '· ' + rule)
                    })
                  : inlineEmpty('还没有世界规则。'),
                forbidden.length
                  ? h('div', { className: 'nk-chipline', style: { marginTop: 8 } },
                      forbidden.slice(0, 16).map(function (word) { return h('span', { key: word, className: 'nk-tag' }, word) }))
                  : null)),
            h('div', { className: 'nk-wb-col nk-wb-aside' },
              h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' }, h('div', { className: 'nk-card-title' }, '人物与称呼')),
                characters.length
                  ? characters.slice(0, 20).map(function (person, index) {
                      return h('div', { key: index, className: 'nk-kv' },
                        h('span', { className: 'nk-kv-key' }, person.name || '?'),
                        h('span', { className: 'nk-kv-val' }, (person.aliases || []).join(' / ') || person.role || ''))
                    })
                  : inlineEmpty('还没有人物。')),
              h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' }, h('div', { className: 'nk-card-title' }, '本章检查')),
                findings.length
                  ? findings.slice(0, 8).map(function (item, index) {
                      return h('div', { key: index, className: 'nk-kv' },
                        h('span', { className: 'nk-kv-key' }, item.severity || 'info'),
                        h('span', { className: 'nk-kv-val' }, item.message || ''))
                    })
                  : inlineEmpty('本章还没有检查结果；写完正文再收尾会跑一遍。')))))
      }

      function flowView() {
        const steps = [
          { id: 'preflight', label: '计划 / 提案', done: !!(session && session.plan) },
          { id: 'write', label: '正文草稿', done: !!(session && session.draft) },
          { id: 'verify', label: '检查', done: !!(session && session.verification) },
          { id: 'close', label: '收尾事务', done: !!(session && session.state === 'completed') },
        ]
        return h('div', { className: 'nk-wb-body' },
          pageHead('编排', '计划 → 正文 → 检查 → 收尾的 runbook 与运行记录。'),
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
        return h('div', { className: 'nk-wb-body' },
          pageHead('资料与设置', '来源库、本章依据、操作日志，以及总开关与模式。'),
          workSettingsCard(),
          h('div', { style: { maxWidth: 760 } },
            h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5 } },
              h('div', { style: faint }, '本章依据'),
              h('button', { className: 'nk-btn', style: { marginLeft: 'auto' }, onClick: previewContextNow }, previewData ? '重新预览' : '预览依据'),
              previewData && previewData.available ? h('span', { style: { ...faint, fontSize: 10 } }, previewData.chars + ' 字 · ' + previewData.mode) : null),
            ((previewData && previewData.segments) || (data && data.contexts) || []).map((segment) => h('div', { key: segment.component, style: { ...row, borderBottom: '1px dashed ' + c.border, padding: '6px 0' } },
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
            h('div', { style: { ...faint, margin: '14px 0 4px' } }, '最近操作'),
            (function () {
              const ops = operationsData || (data && data.operations) || { items: [] }
              const items = Array.isArray(ops.items) ? ops.items : []
              return items.length === 0
                ? h('div', { style: faint }, '还没有操作记录。')
                : items.slice(0, 10).map((operation) => h('div', { key: operation.operationId, style: { ...row, borderBottom: '1px dashed ' + c.border, padding: '4px 0' } },
                    h('span', { style: small }, (operation.command || operation.operationId) + ' · ' + (operation.targetRef?.book || '')),
                    h('span', { style: { fontSize: 10.5, color: operation.status === 'failed' ? c.error : operation.status === 'completed' ? c.success : c.warning } }, operation.status + (operation.attempts > 1 ? ' ×' + operation.attempts : ''))))
            })(),
          ))
      }

      const RAIL = [
        ['desk', '书桌', '案'],
        ['chapter', '正文', '卷'],
        ['beat', '决策', '判'],
        ['fade', '记忆', '忆'],
        ['voice', '风格', '风'],
        ['fanfic', '同人', '同'],
        ['data', '资料', '籍'],
      ]

      const pageView = section === 'chapter' ? h('div', { style: { display: 'flex', gap: 0, flex: 1, minHeight: 0 } },
          h('div', { style: { width: 200, flexShrink: 0, borderRight: '1px solid ' + c.border, padding: '14px 10px', overflowY: 'auto' } },
            h('div', { className: 'nk-card-title', style: { padding: '0 4px 8px' } }, '章节'),
            ((data && data.history && Array.isArray(data.history.chapters)) ? data.history.chapters : []).length
              ? ((data && data.history && Array.isArray(data.history.chapters)) ? data.history.chapters : []).map(function (item) {
                  const active = session && Number(item.chapter) === Number(session.chapter)
                  return h('button', {
                    key: item.chapter, type: 'button',
                    className: 'nk-rowbtn' + (active ? ' active' : ''),
                    style: { borderRadius: 8, borderBottom: 0, padding: '8px 10px' },
                    onClick: function () { startChapterFromDesk(data && data.book, Number(item.chapter)) },
                  },
                  h('span', { className: 'nk-rowbtn-title' }, '第 ' + item.chapter + ' 章'),
                  h('span', { className: 'nk-meta' }, item.chars ? item.chars + ' 字' : ''))
                })
              : h('div', { className: 'nk-tiny', style: { padding: '4px' } }, '还没有章节。'),
            h('button', {
              type: 'button', className: 'nk-btn', style: { width: '100%', marginTop: 8 },
              onClick: function () { setSection('desk') },
            }, '回书桌开新章')),
          h('div', { style: { flex: 1, minWidth: 0, padding: '10px 14px', display: 'flex', flexDirection: 'column', minHeight: 0 } },
            pageHead('正文', '这一章的完整草稿；保存后先前的检查结果作废，检查通过再收尾。'),
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
        )
        : section === 'desk' ? deskView()
        : section === 'beat' ? decisionsPage()
        : section === 'fade' ? memoryPage()
        : section === 'voice' ? stylePage()
        : section === 'fanfic' ? canonPage()
        : dataView()

      // 唯一入口：左竖栏切页，主区只放当前页。没有页签条，也没有第二个面板。
      return h('div', { className: 'nk-wb' },
        h('nav', { className: 'nk-rail' },
          h('div', { className: 'nk-rail-brand' },
            h('div', { className: 'nk-rail-seal' }, '说'),
            h('div', { className: 'nk-rail-name' }, '小说工作台')),
          RAIL.map(function (item) {
            const key = item[0]
            return h('button', {
              key,
              type: 'button',
              className: 'nk-rail-item' + (section === key ? ' active' : ''),
              onClick: function () { setSection(key) },
            }, h('span', { className: 'nk-rail-glyph' }, item[2]), item[1], sectionDot[key] ? h('span', { className: 'nk-rail-dot' }) : null)
          }),
          h('div', { className: 'nk-rail-foot' },
            h('div', { className: 'nk-rail-hint' }, (book || (data && data.book)) ? (book || (data && data.book)) : '还没有选择作品'),
            h('button', { type: 'button', className: 'nk-btn', onClick: function () { setSection('data') } }, '工作区设置'))),
        h('div', { className: 'nk-wb-main' },
          h('div', { className: 'nk-wb-head' },
            h('div', { style: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 } },
              h('div', { className: 'nk-wb-eyebrow' }, 'NOVEL WORKBENCH'),
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 } },
                h('div', { className: 'nk-wb-title' }, (data && data.book) || '小说工作台'),
                data && data.session
                  ? h('span', { className: 'nk-wb-status' }, h('b', null, '第 ' + data.session.chapter + ' 章'), h('span', null, '·'), h('span', null, stateLabel(data.session.state)))
                  : h('span', { className: 'nk-wb-status' }, '无活动会话'))),
            h('div', { className: 'nk-wb-head-actions' },
              books.length
                ? h('select', {
                    className: 'nk-select',
                    value: book || (data && data.book) || '',
                    onChange: function (event) { setBook(event.target.value); load(event.target.value) },
                    style: { width: 'auto', height: 30, margin: 0, fontSize: 12, padding: '0 8px' },
                  }, books.map((name) => h('option', { key: name, value: name }, name)))
                : null,
              h('button', { type: 'button', className: 'nk-btn', onClick: function () { load() } }, state.phase === 'refreshing' ? '…' : '刷新'))),
          state.error ? h('div', { style: { color: c.error, padding: '8px 22px', fontSize: 12 } }, state.error) : null,
          !state.data && state.phase === 'loading'
            ? h('div', { className: 'nk-wb-body' },
                h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 } },
                  h('div', { className: 'nk-skeleton', style: { height: 84 } }),
                  h('div', { className: 'nk-skeleton', style: { height: 120 } }),
                  h('div', { className: 'nk-skeleton', style: { height: 200 } })))
            : !(data && (data.book || books.length))
              ? h('div', { className: 'nk-wb-body' },
                  h('div', { className: 'nk-empty-state', style: { paddingTop: 64 } },
                    h('div', { className: 'nk-glyph' }, '说'),
                    h('div', { className: 'nk-h2', style: { marginTop: 8 } }, '还没有作品'),
                    h('div', { className: 'nk-tiny' }, '先建一本自己的作品，或者导入一本你喜欢的书学文笔。'),
                    h('button', {
                      type: 'button', className: 'nk-btn primary', style: { marginTop: 12, height: 32, padding: '0 14px' },
                      onClick: function () { setSection('data') },
                    }, '去新建作品')))
              : pageView))
    }

    return {
      inject: ['slots', 'remote'],
      async apply(ctx) {
        try {
          if (typeof document !== 'undefined' && !document.getElementById('dsh-novel-kit-ui-css')) {
            const tag = document.createElement('style')
            tag.id = 'dsh-novel-kit-ui-css'
            tag.textContent = UI_CSS + '\n' + NK_SKIN
            document.head.appendChild(tag)
            ctx.effect(() => () => { try { tag.remove() } catch { /* ignore */ } })
          }
        } catch { /* 宿主不提供 DOM 时忽略 */ }
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

        // 唯一入口：会话级主视图「小说工作台」。右栏页签与头部按钮已移除，
        // 一个插件只留一个界面，能力全部收进工作台的左竖栏。
        ctx.effect(() => ctx.slots.inject('conversation.view', () => ctx.slots.register({
          name: 'conversation.view',
          id: 'novel-kit.chapter',
          label: '小说工作台',
          order: 20,
          inject: (sessionId) => ({ sessionId, remote: panelRemote }),
        }, Workbench)))
      },
    }
  },
})


