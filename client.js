// dsh-novel-kit 的 Web 半：唯一入口「小说工作台」（conversation.view）。
//
// 0.4.0 起一个插件只有一个界面：左竖栏七页 + 主区。右栏面板与会话头按钮都已移除，
// 数据来自 novelKitPanel remote（Host 只读快照），不读文件、不执行命令。
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
    // 契约方法表由 scripts/build-client.mjs 从 lib/host/remote-contract.js 同源内联，
    // 不要再手抄第二份：两处不一致会让客户端 mount 出对不上的 descriptor。
    /* NK:REMOTE:BEGIN —— 由 scripts/build-client.mjs 维护 */
    const REMOTE_METHOD_SPECS = [
      ['identity', false],
      ['getSnapshot', true],
      ['getDiagnostics', false],
      ['getDecisions', true],
      ['getMemory', true],
      ['getStyle', true],
      ['getStyleBrief', true],
      ['getCanon', true],
      ['getPlan', true],
      ['getOperations', true],
      ['previewContext', true],
      ['resumeChapter', true],
      ['searchMemory', true],
      ['listSourceFiles', true],
      ['decide', true],
      ['reviseDecision', true],
      ['savePlan', true],
      ['memoryAction', true],
      ['getSettings', true],
      ['setMaster', true],
      ['setMode', true],
      ['importStyle', true],
      ['confirmStyle', true],
      ['unbindStyle', true],
      ['rateStyle', true],
      ['remeasureStyle', true],
      ['removeStyleProfile', true],
      ['saveStyleReader', true],
      ['updateStyleRule', true],
      ['addStyleCandidate', true],
      ['getStyleHistory', true],
      ['importCanon', true],
      ['listSources', true],
      ['listStyleProfiles', true],
      ['createBook', true],
      ['startChapter', true],
      ['getDraft', true],
      ['saveDraft', true],
      ['updateCanon', true],
      ['confirmCanon', true],
      ['getInbox', true],
      ['getSourceExcerpt', true],
      ['getCanonQueue', true],
      ['reviewCanonChange', true],
      ['applyCanonChanges', true],
      ['previewLegacy', false],
      ['importLegacy', true],
      ['migrateKitLegacy', true],
      ['getMedia', true],
      ['reviewMedia', true],
      ['listComicPages', true],
      ['getComicPage', true],
      ['ocrComicPages', true],
      ['hongguoSearch', true],
      ['hongguoSeries', true],
      ['hongguoEpisodes', true],
      ['hongguoDanmaku', true],
      ['getPersonas', true],
      ['confirmPersona', true],
      ['getRuns', true],
      ['createRun', true],
      ['updateRun', true],
      ['getAnalysis', true],
    ]
/* NK:REMOTE:END */

    const TYPERT_REMOTE = {
      package: 'dsh-novel-kit',
      descriptors: REMOTE_METHOD_SPECS.map(function (spec) {
        const method = spec[0]
        const withRequest = spec[1] === true
        return {
          id: 'dsh-novel-kit#novelKitPanel/' + method,
          namespace: 'novelKitPanel',
          service: 'novelKitPanel',
          method,
          invocation: { kind: 'direct' },
          parameters: withRequest
            ? [param('sessionId', sessionIdSchema), param('request', requestSchema)]
            : [param('sessionId', sessionIdSchema)],
          result: codec('KitPanelPayload', scalar(() => {})),
        }
      }),
    }

    // 纯展示工具：源码是 client-src/ui-kit.js，由构建脚本内联（NK:UIKIT 块）。
    /* NK:UIKIT:BEGIN —— 由 scripts/build-client.mjs 维护 */
    // 纯展示工具：不读账本、不调 remote、不改状态，只把数据变成元素。
    //
    // 这个文件既被测试直接 import，也会被 scripts/build-client.mjs 内联进 client.js
    // 的 NK:UIKIT 块（内联时去掉 export）。新增函数请保持「只依赖入参」。
    function createUiKit({ h, c } = {}) {
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

      function badge(text, tone) {
        return h('span', { className: 'nk-badge' + (tone ? ' ' + tone : '') }, text)
      }

      /** 一段「主文案 + 附注」的紧凑行；没有附注时只出主文案。 */
      function metaLine(text, hint) {
        return h('div', { className: 'nk-tiny', style: { lineHeight: 1.7 } },
          String(text ?? ''),
          hint ? h('span', { style: { marginLeft: 8, color: c.faint } }, String(hint)) : null)
      }

      return { fmtNum, pageStat, inlineEmpty, badge, metaLine }
    }
/* NK:UIKIT:END */
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

    // 纯展示工具实例：fmtNum / pageStat / inlineEmpty / badge / metaLine
    const ui = createUiKit({ h, c })
    const { fmtNum, pageStat, inlineEmpty } = ui
    const row = { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, padding: '5px 0', borderBottom: '1px solid ' + c.border }
    const faint = { color: c.faint, fontSize: 11 }
    const small = { color: c.sub, fontSize: 12, lineHeight: 1.5 }

    // 新右栏使用一套独立 class，避免继续在旧 inline 样式上打补丁。



    // ── v0.3 视觉层 ────────────────────────────────────────────────────────
    // 整套 token、字阶、间距、卡片与工作台布局都在这里；右栏时代那份兼容 CSS
    // 已在 0.4.0 删除，只把仍被使用的控件基础规则并了进来。
    // 所有颜色从宿主 alias token 用 color-mix 派生，同一份样式在暗色/亮色下都成立。
    // ── 样式 ────────────────────────────────────────────────────────────────
    // 源文件是 client-src/styles.css；这里的内容由 `npm run build:client` 内联，
    // 不要手改标记之间；改样式请改源文件再构建（check 会验证两者一致）。
    const NK_SKIN = `
/* NK:STYLE:BEGIN —— 由 scripts/build-client.mjs 维护 */
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
      .nk-btn, .nk-select, .nk-input, .nk-tab, .nk-rowbtn, .nk-rail-item { font-family: inherit; }
      .nk-btn { appearance: none; border: 1px solid var(--nk-line); cursor: pointer; line-height: 1.2;
        height: 26px; padding: 0 10px; font-size: 11.5px; border-radius: var(--nk-r-sm);
        border-color: var(--nk-line); background: transparent; color: var(--nk-ink-2); transition: background .15s, border-color .15s, color .15s; }
      .nk-btn:hover { background: var(--nk-surface); border-color: var(--nk-line); color: var(--nk-ink); }
      .nk-btn.primary { background: var(--nk-accent); border-color: var(--nk-accent); color: #fff8ef; }
      .nk-btn.primary:hover { filter: brightness(1.06); }

      .nk-select { width: 100%; height: 34px; border: 1px solid var(--nk-line); border-radius: var(--nk-r-sm);
        background: var(--nk-surface); color: var(--nk-ink); padding: 0 10px; font-size: 12px; cursor: pointer; }
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
      .nk-wb.nk-tone-sepia { --nk-paper: #f4ead8; }
      .nk-wb.nk-tone-dark {
        --nk-paper: #1e1d1b;
        --nk-ink: #eee8de;
        --nk-ink-2: #bdb6aa;
        --nk-ink-3: #8c857a;
        --nk-line: rgba(255, 255, 255, .18);
        --nk-line-soft: rgba(255, 255, 255, .1);
        --nk-surface: rgba(255, 255, 255, .06);
        --nk-surface-2: rgba(255, 255, 255, .1);
      }
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
      .nk-wb-body.nk-dark {
        background: #1e1d1b;
        --nk-ink: #eee8de;
        --nk-ink-2: #bdb6aa;
        --nk-ink-3: #8c857a;
        --nk-line: rgba(255, 255, 255, .18);
        --nk-line-soft: rgba(255, 255, 255, .1);
        --nk-surface: rgba(255, 255, 255, .06);
        --nk-surface-2: rgba(255, 255, 255, .1);
        --nk-paper: #1e1d1b;
      }
      .nk-wb-grid { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 18px; align-items: start; max-width: 1280px; }
      .nk-wb-grid.single { grid-template-columns: minmax(0, 1fr); max-width: 900px; }
      .nk-wb-col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
      @media (max-width: 1080px) { .nk-wb-grid { grid-template-columns: minmax(0, 1fr); } }


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
      .nk-warnbar { display: flex; align-items: center; gap: 12px; margin: 10px 22px 0; padding: 10px 12px; flex-wrap: wrap;
        border: 1px solid var(--nk-accent-line); background: var(--nk-accent-soft); border-radius: var(--nk-r);
        font-size: 12.5px; color: var(--nk-ink); }
      .nk-warnbar-text { flex: 1; min-width: 220px; line-height: 1.6; }
      .nk-warnbar-actions { display: flex; gap: 8px; }
      /* 窄屏：侧栏改为顶部横向，主区占满宽度（420/900 宽度不再被 172px 侧栏挤坏）。 */
      @media (max-width: 720px) {
        .nk-wb { flex-direction: column; }
        .nk-rail { width: 100%; flex: 0 0 auto; flex-direction: row; align-items: center; gap: 4px; padding: 8px 10px; overflow-x: auto; border-right: 0; border-bottom: 1px solid var(--nk-line-soft); }
        .nk-rail-brand { padding: 0 8px 0 2px; flex: 0 0 auto; }
        .nk-rail-name { display: none; }
        .nk-rail-item { width: auto; flex: 0 0 auto; height: 32px; padding: 0 10px; border-radius: 8px; }
        .nk-rail-glyph { width: 16px; font-size: 13px; }
        .nk-rail-foot { display: none; }
        .nk-wb-head { padding: 10px 14px; gap: 8px; flex-wrap: wrap; }
        .nk-wb-eyebrow { display: none; }
        .nk-wb-title { font-size: 16px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .nk-wb-head-actions { margin-left: auto; }
        .nk-wb-body { padding: 14px 14px 28px; }
        .nk-wb-grid { gap: 12px; }
        .nk-card { padding: 12px; }
      }
/* NK:STYLE:END */
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
    // ── 继承导入（资料页）：只读扫描五件/kit 0.5 数据，显式复制到 kit 原生 ──
    function LegacyImportCard(props) {
      const { remote, sessionId, book, onDone } = props
      const [state, setState] = React.useState({ busy: false, preview: null, result: null, message: '', voicePick: '', fanficPick: '' })
      if (!remote || !sessionId) return null
      const run = async function (fn) {
        setState(function (prev) { return { ...prev, busy: true, message: '' } })
        try {
          const value = await Promise.resolve(fn()).then(function (result) {
            if (result && result.ok === false && result.code) throw new Error(result.message || result.code)
            return result
          })
          setState(function (prev) {
            const next = { ...prev, busy: false, ...(value && value.items ? { preview: value, voicePick: '', fanficPick: '' } : {}), ...(value && value.ok ? { result: value } : {}), message: '' }
            return next
          })
          if (value && value.ok && onDone) onDone()
        } catch (error) {
          setState(function (prev) { return { ...prev, busy: false, message: String(error && error.message ? error.message : error) } })
        }
      }
      const scan = function () { return run(function () { return remote.previewLegacy(sessionId) }) }
      const importOne = function (item) {
        const found = state.preview && state.preview.found ? state.preview.found : {}
        const voice = state.voicePick || (Array.isArray(found.voice) && found.voice.length === 1 ? found.voice[0] : null)
        const fanfic = state.fanficPick || (Array.isArray(found.fanfic) && found.fanfic.length === 1 ? found.fanfic[0] : null)
        return run(function () { return remote.importLegacy(sessionId, { book: item.book, voice: voice, fanfic: fanfic }) })
      }
      const migrate = function (item) {
        return run(function () { return remote.migrateKitLegacy(sessionId, { book: item.book }) })
      }
      const items = state.preview && Array.isArray(state.preview.items) ? state.preview.items : []
      const found = state.preview && state.preview.found ? state.preview.found : {}
      const choices = function (label, list, pick, onPick) {
        return h('label', { className: 'nk-kv', style: { gap: 6 } },
          h('span', { className: 'nk-kv-key' }, label),
          h('select', {
            className: 'nk-input', value: pick || '', onChange: function (event) { onPick(event.target.value) },
          }, [h('option', { key: 'none', value: '' }, '不导入')].concat((Array.isArray(list) ? list : []).map(function (name) {
            return h('option', { key: name, value: name }, name)
          }))))
      }
      return h('section', { className: 'nk-card' },
        h('div', { className: 'nk-card-head' },
          h('div', { className: 'nk-card-title' }, '继承导入'),
          h('button', { type: 'button', className: 'nk-btn', disabled: state.busy, onClick: scan }, state.busy ? '扫描中…' : '扫描旧数据')),
        h('div', { className: 'nk-tiny', style: { marginBottom: 8 } },
          'kit 不再与五件共享账本。这里只读扫描旧数据，显式复制到 kit 原生；源文件不改，导入后五件可卸载。再次导入是显式新快照。'),
        (state.preview && ((found.voice && found.voice.length) || (found.fanfic && found.fanfic.length)))
          ? h('div', { style: { marginBottom: 8 } },
              (found.voice && found.voice.length) ? choices('voice 档案', found.voice, state.voicePick, function (value) { setState(function (prev) { return { ...prev, voicePick: value } }) }) : null,
              (found.fanfic && found.fanfic.length) ? choices('fanfic 项目', found.fanfic, state.fanficPick, function (value) { setState(function (prev) { return { ...prev, fanficPick: value } }) }) : null)
          : null,
        state.message ? h('div', { className: 'nk-tiny', style: { color: 'var(--dsw-alias-state-error-primary)' } }, state.message) : null,
        state.result
          ? h('div', { className: 'nk-tiny', style: { color: 'var(--dsw-alias-state-success-primary)' } },
              '已导入《' + (state.result.book || book || '') + '》：正文 ' + ((state.result.imported && state.result.imported.body) || 0) + ' 章，决策 ' + ((state.result.imported && state.result.imported.decisions) || 0) + '，记忆卡 ' + ((state.result.imported && state.result.imported.cards) || 0) + '。')
          : null,
        items.length === 0
          ? inlineEmpty(state.preview ? '没有发现可继承的旧数据。' : '点「扫描旧数据」查看工作区里的五件/kit 0.5 数据。')
          : items.slice(0, 12).map(function (item, index) {
              const isKit = item.origin === 'kit-legacy-or-mixed'
              return h('div', { key: 'legacy-' + index + '-' + item.book, className: 'nk-kv', style: { alignItems: 'flex-start', flexDirection: 'column', gap: 3 } },
                h('div', { style: { display: 'flex', width: '100%', gap: 6, alignItems: 'center' } },
                  h('span', { style: { fontSize: 12.5, fontWeight: 600 } }, item.book),
                  h('span', { className: 'nk-badge' }, isKit ? 'kit 旧版/混合' : '五件'),
                  h('button', {
                    type: 'button', className: 'nk-btn', style: { marginLeft: 'auto' }, disabled: state.busy,
                    onClick: function () { return isKit ? migrate(item) : importOne(item) },
                  }, isKit ? '迁移' : '导入')),
                h('div', { className: 'nk-tiny' },
                  'beat ' + (item.beat ? item.beat.decisions + ' 决策 / ' + item.beat.segments + ' 段' : '无') +
                  ' · fade ' + (item.fade ? item.fade.cards + ' 卡' : '无') +
                  ' · 正文 ' + (item.body || 0) + ' 章' + (item.hasFanfic ? ' · 含同人项目' : '')))
            }))
    }

    function Workbench(props) {
      // initialSection 只给快照验收/深链用：正常打开永远从书桌起。
      const { sessionId, remote, embedded = false, onClose = null, initialSection = 'desk' } = props
      const [state, setState] = React.useState({ phase: 'loading', data: null, diag: null, error: null })
      const [book, setBook] = React.useState('')
      const [draftState, setDraftState] = React.useState({ text: '', version: 0, hash: null, chars: 0, loaded: false, dirty: false })
      const [saveState, setSaveState] = React.useState({ phase: 'idle', message: '' })
      const [startPhase, setStartPhase] = React.useState('idle')
      const [section, setSection] = React.useState(initialSection)
      const [skinTone, setSkinTone] = React.useState(function () {
        try { return localStorage.getItem('dsh-novel-kit.tone') || 'paper' } catch { return 'paper' }
      })
      React.useEffect(function () {
        try { localStorage.setItem('dsh-novel-kit.tone', skinTone) } catch { /* ignore */ }
      }, [skinTone])
      const [storyData, setStoryData] = React.useState(null)
      const [materialData, setMaterialData] = React.useState(null)
      const [mediaData, setMediaData] = React.useState(null)
      const [personaData, setPersonaData] = React.useState(null)
      const [runsData, setRunsData] = React.useState(null)
      const [analysisData, setAnalysisData] = React.useState(null)
      const [fadeData, setFadeData] = React.useState(null)
      const [fadeTab, setFadeTab] = React.useState('overview')
      const [beatTab, setBeatTab] = React.useState('map')
      const [beatQuery, setBeatQuery] = React.useState('')
      const [beatFilter, setBeatFilter] = React.useState('all')
      const [beatPaper, setBeatPaper] = React.useState('default')
      const [chapterFindings, setChapterFindings] = React.useState(null)
      const [beatEditing, setBeatEditing] = React.useState(null)
      const [beatOption, setBeatOption] = React.useState('')
      const [beatNote, setBeatNote] = React.useState('')
      const [beatMessage, setBeatMessage] = React.useState('')
      const [workOrder, setWorkOrder] = React.useState('')
      const [memoryOpen, setMemoryOpen] = React.useState(null)
      const [memoryChapter, setMemoryChapter] = React.useState(null)
      const [memoryLayer, setMemoryLayer] = React.useState(null)
      const [openDecisionId, setOpenDecisionId] = React.useState(null)
      const [styleOpen, setStyleOpen] = React.useState(null)
      const [styleBrief, setStyleBrief] = React.useState(null)
      const [styleHistory, setStyleHistory] = React.useState(null)
      const [candidateText, setCandidateText] = React.useState('')
      const [readerDraft, setReaderDraft] = React.useState(null)
      const [ruleEditId, setRuleEditId] = React.useState(null)
      const [ruleEditText, setRuleEditText] = React.useState('')
      const [styleEvidence, setStyleEvidence] = React.useState(null)
      const [styleEvidencePage, setStyleEvidencePage] = React.useState(0)
      const [voiceTab, setVoiceTab] = React.useState('style')
      const [fanficTab, setFanficTab] = React.useState('canon')
      const [canonChip, setCanonChip] = React.useState('characters')
      const [mediaSourceFilter, setMediaSourceFilter] = React.useState(null)
      const [mediaEvidenceOpen, setMediaEvidenceOpen] = React.useState(null)
      const [comicReader, setComicReader] = React.useState(null)
      const [hongguoQuery, setHongguoQuery] = React.useState('')
      const [hongguoResults, setHongguoResults] = React.useState(null)
      const [hongguoSeriesData, setHongguoSeriesData] = React.useState(null)
      const [hongguoEpisodesData, setHongguoEpisodesData] = React.useState(null)
      const [hongguoDanmakuData, setHongguoDanmakuData] = React.useState(null)
      const [hongguoBusy, setHongguoBusy] = React.useState(false)
      const [selectedCanonCharacter, setSelectedCanonCharacter] = React.useState(null)
      const [conflictOpen, setConflictOpen] = React.useState(null)
      const [canonBusy, setCanonBusy] = React.useState(false)
      const [canonMessage, setCanonMessage] = React.useState('')
      // 称呼速查表的本地筛选（Codex：先在客户端筛，不新增接口）
      const [addressFilter, setAddressFilter] = React.useState('')
      // 证据回查：点「看原文」读回来的那一段
      const [excerpt, setExcerpt] = React.useState(null)
      // canon 审阅队列
      const [canonQueue, setCanonQueue] = React.useState(null)
      const [canonQueueBusy, setCanonQueueBusy] = React.useState(false)
      const [reviewChange, setReviewChange] = React.useState(null)
      const [memoryQuery, setMemoryQuery] = React.useState('')
      const [memoryHits, setMemoryHits] = React.useState(null)
      const [memoryExcerpt, setMemoryExcerpt] = React.useState(null)
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
      const [sourcesData, setSourcesData] = React.useState(null)
      const [inboxData, setInboxData] = React.useState(null)
      const [newBookName, setNewBookName] = React.useState('')
      const [workBusy, setWorkBusy] = React.useState(false)
      const [workMessage, setWorkMessage] = React.useState('')

      const requestRef = React.useRef(0)
      // 正文编辑器的 DOM 句柄：检查项定位要把选区挪到那一句。
      const draftRef = React.useRef(null)
      // 草稿归属：切书/换章后回来晚了的响应不能写进当前编辑器。
      const draftTargetRef = React.useRef({ book: null, sessionId: null })
      const saveInFlightRef = React.useRef(false)
      // 有未保存正文时切书：先在这里停下，等作者选保存还是丢弃。
      const [pendingBook, setPendingBook] = React.useState(null)
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
        const found = (state.data && state.data.workspace && (
          (Array.isArray(state.data.workspace.kitBooks) && state.data.workspace.kitBooks[0])
          || (Array.isArray(state.data.workspace.beat) && state.data.workspace.beat[0])
        )) || null
        if (!found) return
        bookRef.current = found
        setBook(found)
        load(found)
      }, [book, state.data, load])

      const loadDraft = React.useCallback(async function (session) {
        if (!remote || !session || !session.id || typeof remote.getDraft !== 'function') return
        const target = { book: (state.data && state.data.book) || bookRef.current || null, sessionId: session.id }
        draftTargetRef.current = target
        try {
          const result = await Promise.resolve(remote.getDraft(sessionId, { chapterSessionId: session.id })).then(unwrap)
          // 响应回来时目标已经变了（切书 / 换章 / 又发起了一次加载）：丢弃，不覆盖当前编辑器。
          if (draftTargetRef.current.book !== target.book || draftTargetRef.current.sessionId !== target.sessionId) return
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
      }, [remote, sessionId, state.data && state.data.book])

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
        if (typeof remote.listSources === 'function') {
          Promise.resolve(remote.listSources(sessionId, {})).then(unwrap).then(function (sources) {
            if (!cancelled) setSourcesData(sources)
          }).catch(function () { if (!cancelled) setSourcesData({ ok: false, sources: [] }) })
        }
        return function () { cancelled = true }
      }, [section, remote, sessionId])

      // 统一收件箱：Host 聚合，客户端不再自己拼「待办」。
      React.useEffect(function () {
        if (!remote || !data || !data.book || typeof remote.getInbox !== 'function') return undefined
        let cancelled = false
        Promise.resolve(remote.getInbox(sessionId, { book: data.book })).then(unwrap).then(function (inbox) {
          if (!cancelled) setInboxData(inbox)
        }).catch(function () { if (!cancelled) setInboxData(null) })
        return function () { cancelled = true }
      }, [remote, sessionId, data && data.book, data && data.session && data.session.revision, section])

      const saveDraft = React.useCallback(async function () {
        if (!remote || !data || !data.session || typeof remote.saveDraft !== 'function') return false
        // 按钮与 Ctrl+S 共用同一个互斥口：两次保存不能并行，否则版本号会互相踩。
        if (saveInFlightRef.current) return false
        if (!draftState.dirty) { setSaveState({ phase: 'idle', message: '没有未保存的修改' }); return false }
        saveInFlightRef.current = true
        const target = { book: data.book ?? null, sessionId: data.session.id }
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
            return false
          }
          // 保存期间切了书/章：结果照实告诉作者，但不要把回包写进当前编辑器。
          if (draftTargetRef.current.book !== target.book || draftTargetRef.current.sessionId !== target.sessionId) {
            setSaveState({ phase: 'saved', message: '已保存；但期间切换了作品/章节，界面保持不变。' })
            return true
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
          return true
        } catch (error) {
          setSaveState({ phase: 'error', message: String(error?.message ?? error) })
          return false
        } finally {
          saveInFlightRef.current = false
        }
      }, [remote, sessionId, data, draftState, loadDraft, load])

      /** 真的切书：先清编辑器与草稿归属，再取新书快照。 */
      const performBookSwitch = React.useCallback(function (nextBook) {
        if (!nextBook) return
        setPendingBook(null)
        editVersionRef.current = 0
        draftTargetRef.current = { book: nextBook, sessionId: null }
        setDraftState({ text: '', version: 0, hash: null, chars: 0, loaded: false, dirty: false })
        setSaveState({ phase: 'idle', message: '' })
        setExitArm(false)
        setBook(nextBook)
        load(nextBook)
      }, [load])

      /** 切书入口：有未保存正文时先停住，让作者选保存还是丢弃。 */
      const requestBookSwitch = React.useCallback(function (nextBook) {
        const currentBook = book || (data && data.book) || ''
        if (!nextBook || nextBook === currentBook) return
        if (draftState.dirty) { setPendingBook(nextBook); return }
        performBookSwitch(nextBook)
      }, [book, data, draftState.dirty, performBookSwitch])

      const saveAndSwitchBook = React.useCallback(async function () {
        const target = pendingBook
        if (!target) return
        const ok = await saveDraft()
        if (!ok) return
        performBookSwitch(target)
      }, [pendingBook, saveDraft, performBookSwitch])

      const discardAndSwitchBook = React.useCallback(function () {
        if (!pendingBook) return
        performBookSwitch(pendingBook)
      }, [pendingBook, performBookSwitch])

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
        Promise.resolve(remote.getMemory(sessionId, { book: data.book, limit: 240, currentChapter: data.session ? data.session.chapter : null }))
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

      React.useEffect(function () {
        if (section !== 'fanfic' || !remote || !data || !data.book || typeof remote.getMedia !== 'function') return undefined
        let alive = true
        Promise.resolve(remote.getMedia(sessionId, { book: data.book })).then(unwrap).then(function (media) {
          if (alive) setMediaData(media)
        }).catch(function () { if (alive) setMediaData(null) })
        return function () { alive = false }
      }, [section, remote, sessionId, data])

      React.useEffect(function () {
        if (section !== 'voice' || !remote || !data || !data.book || typeof remote.getPersonas !== 'function') return undefined
        let alive = true
        Promise.resolve(remote.getPersonas(sessionId, { book: data.book })).then(unwrap).then(function (personas) {
          if (alive) setPersonaData(personas)
        }).catch(function () { if (alive) setPersonaData(null) })
        return function () { alive = false }
      }, [section, remote, sessionId, data])

      React.useEffect(function () {
        if (section !== 'data' || !remote || !data || !data.book || typeof remote.getRuns !== 'function') return undefined
        let alive = true
        Promise.resolve(remote.getRuns(sessionId, { book: data.book })).then(unwrap).then(function (runs) {
          if (alive) setRunsData(runs)
        }).catch(function () { if (alive) setRunsData(null) })
        return function () { alive = false }
      }, [section, remote, sessionId, data])

      React.useEffect(function () {
        bookRef.current = state.data && state.data.book ? state.data.book : null
      }, [state.data && state.data.book])

      React.useEffect(function () {
        setMediaEvidenceOpen(null)
        setMediaData(null)
        setReviewChange(null)
        setConflictOpen(null)
        setSelectedCanonCharacter(null)
        setStyleEvidence(null)
        setStyleEvidencePage(0)
        setStyleOpen(null)
        setStyleHistory(null)
      }, [data && data.book])

      React.useEffect(function () {
        if (!['data', 'fanfic'].includes(section) || !remote || !data || !data.book || typeof remote.getAnalysis !== 'function') return undefined
        let alive = true
        Promise.resolve(remote.getAnalysis(sessionId, { book: data.book })).then(unwrap).then(function (analysis) {
          if (alive) setAnalysisData(analysis)
        }).catch(function () { if (alive) setAnalysisData(null) })
        return function () { alive = false }
      }, [section, remote, sessionId, data])

      const books = (data && data.workspace && ((data.workspace.kitBooks && data.workspace.kitBooks.length) ? data.workspace.kitBooks : data.workspace.beat)) || []
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

      const unbindStyleNow = React.useCallback(async function (profile) {
        if (!remote || typeof remote.unbindStyle !== 'function' || !data || !data.book || !profile) return
        try {
          const result = await Promise.resolve(remote.unbindStyle(sessionId, { book: data.book, profileId: profile.id })).then(unwrap)
          if (!result || result.ok === false) { setBeatMessage(result?.message || result?.code || '解绑失败'); return }
          setBeatMessage('已从本书解绑：' + (profile.name || profile.id) + '（档案文件保留）')
          setMaterialData(null)
          await load()
        } catch (error) {
          setBeatMessage(String(error?.message ?? error))
        }
      }, [remote, sessionId, data, load])

      const removeStyleNow = React.useCallback(async function (profile) {
        if (!remote || typeof remote.removeStyleProfile !== 'function' || !data || !data.book || !profile) return
        try {
          const result = await Promise.resolve(remote.removeStyleProfile(sessionId, { book: data.book, profileId: profile.id })).then(unwrap)
          if (!result || result.ok === false) { setBeatMessage(result?.message || result?.code || '移除失败'); return }
          setBeatMessage(result.shared ? '这份档案还被别的书引用，已只从本书解绑。' : '档案已移到 styles/trash：' + (profile.name || profile.id))
          setMaterialData(null)
          await load()
        } catch (error) {
          setBeatMessage(String(error?.message ?? error))
        }
      }, [remote, sessionId, data, load])

      const remeasureStyleNow = React.useCallback(async function (profile) {        if (!remote || typeof remote.remeasureStyle !== 'function' || !profile) return
        try {
          const result = await Promise.resolve(remote.remeasureStyle(sessionId, { profileId: profile.id })).then(unwrap)
          if (!result || result.ok === false) { setBeatMessage(result?.message || result?.code || '重测失败'); return }
          setBeatMessage('已重测：' + (profile.name || profile.id) + ' · revision ' + result.revision)
          setMaterialData(null)
          await load()
        } catch (error) {
          setBeatMessage(String(error?.message ?? error))
        }
      }, [remote, sessionId, load])

      const rateStyleNow = React.useCallback(async function (profile, stars) {        if (!remote || !profile) return
        try {
          const result = await Promise.resolve(remote.rateStyle(sessionId, {
            profileId: profile.id, stars, note: '',
          })).then(unwrap)
          if (!result || result.ok === false) { setBeatMessage(result?.message || result?.code || '评分失败'); return }
          setBeatMessage('已评分：' + (profile.name || profile.id) + ' · ' + stars + ' 分（' + result.summary.count + ' 条）')
          setMaterialData(null)
          await load()
        } catch (error) {
          setBeatMessage(String(error?.message ?? error))
        }
      }, [remote, sessionId, load])

      const reloadStyleData = React.useCallback(async function () {
        if (!remote || !data || !data.book) return
        const targetBook = data.book
        const style = await Promise.resolve(remote.getStyle(sessionId, { book: data.book })).then(unwrap).catch(() => null)
        if (bookRef.current !== targetBook) return
        if (style) setMaterialData(function (prev) { return { ...(prev || {}), style } })
      }, [remote, sessionId, data])

      const updateStyleRuleNow = React.useCallback(async function (profile, rule, patch) {
        if (!remote || typeof remote.updateStyleRule !== 'function' || !profile || !rule) return false
        try {
          const result = await Promise.resolve(remote.updateStyleRule(sessionId, {
            profileId: profile.id, ruleId: rule.id, ...patch, expectedRevision: profile.revision ?? null,
          })).then(unwrap)
          if (!result || result.ok === false) { setBeatMessage(result?.message || result?.code || '规则更新失败'); return false }
          setBeatMessage('规则已更新：' + (rule.text || rule.id).slice(0, 18) + ' · revision ' + result.revision)
          await reloadStyleData()
          return true
        } catch (error) {
          setBeatMessage(String(error?.message ?? error))
          return false
        }
      }, [remote, sessionId, reloadStyleData])

      const saveRuleTextNow = React.useCallback(async function (profile, rule) {
        const text = ruleEditText.trim()
        if (!text || !profile || !rule) return
        const saved = await updateStyleRuleNow(profile, rule, { text })
        if (!saved) return
        setRuleEditId(null)
        setRuleEditText('')
      }, [ruleEditText, updateStyleRuleNow])

      const showRuleEvidence = React.useCallback(function (rule) {
        if (!rule) return
        setStyleEvidence({ ruleId: rule.id, text: rule.text, evidence: Array.isArray(rule.evidence) ? rule.evidence : [], counterExamples: Array.isArray(rule.counterExamples) ? rule.counterExamples : [] })
        setStyleEvidencePage(0)
      }, [])

      const loadStyleHistoryNow = React.useCallback(async function (profile) {        if (!remote || typeof remote.getStyleHistory !== 'function' || !profile) return
        try {
          const result = await Promise.resolve(remote.getStyleHistory(sessionId, { profileId: profile.id })).then(unwrap)
          setStyleHistory(result)
        } catch (error) {
          setBeatMessage(String(error?.message ?? error))
        }
      }, [remote, sessionId])

      const saveReaderPreferenceNow = React.useCallback(async function (profile) {
        if (!remote || typeof remote.saveStyleReader !== 'function' || !profile) return
        const text = readerDraft && readerDraft.profileId === profile.id ? readerDraft.text : (profile.readerPreference?.text || '')
        try {
          const result = await Promise.resolve(remote.saveStyleReader(sessionId, { profileId: profile.id, text, expectedRevision: profile.revision ?? null })).then(unwrap)
          if (!result || result.ok === false) { setBeatMessage(result?.message || result?.code || '读者偏好保存失败'); return }
          setBeatMessage('读者偏好已保存：' + (profile.name || profile.id))
          await reloadStyleData()
        } catch (error) {
          setBeatMessage(String(error?.message ?? error))
        }
      }, [remote, sessionId, readerDraft, reloadStyleData])

      const addCandidateNow = React.useCallback(async function (profile) {
        if (!remote || typeof remote.addStyleCandidate !== 'function' || !profile) return
        const text = candidateText.trim()
        if (!text) return
        try {
          const result = await Promise.resolve(remote.addStyleCandidate(sessionId, { profileId: profile.id, text, expectedRevision: profile.revision ?? null })).then(unwrap)
          if (!result || result.ok === false) { setBeatMessage(result?.message || result?.code || '候选添加失败'); return }
          setCandidateText('')
          setBeatMessage(result.idempotent ? '这条候选已经存在。' : '已加入学习候选，确认后才进简报。')
          await reloadStyleData()
        } catch (error) {
          setBeatMessage(String(error?.message ?? error))
        }
      }, [remote, sessionId, candidateText, reloadStyleData])

      const openComicSource = React.useCallback(async function (source) {
        if (!remote || typeof remote.listComicPages !== 'function' || !source || !source.file) return
        try {
          const info = await Promise.resolve(remote.listComicPages(sessionId, { file: source.file })).then(unwrap)
          if (!info || info.ok === false || !Array.isArray(info.pages)) { setCanonMessage(info?.message || '漫画目录读不出来'); return }
          const page = await Promise.resolve(remote.getComicPage(sessionId, { file: source.file, index: 0 })).then(unwrap)
          setComicReader({ file: source.file, title: source.title || source.id, pages: info.pages, index: 0, image: page, text: '', busy: false })
        } catch (error) {
          setCanonMessage(String(error?.message ?? error))
        }
      }, [remote, sessionId])

      const loadComicPage = React.useCallback(async function (index) {
        if (!comicReader || !remote) return
        try {
          const page = await Promise.resolve(remote.getComicPage(sessionId, { file: comicReader.file, index })).then(unwrap)
          setComicReader({ ...comicReader, index, image: page, text: '' })
        } catch (error) {
          setCanonMessage(String(error?.message ?? error))
        }
      }, [comicReader, remote, sessionId])

      const ocrComicPageNow = React.useCallback(async function () {
        if (!comicReader || !remote || typeof remote.ocrComicPages !== 'function') return
        setComicReader({ ...comicReader, busy: true })
        try {
          const result = await Promise.resolve(remote.ocrComicPages(sessionId, { file: comicReader.file, indices: [comicReader.index] })).then(unwrap)
          const text = result && Array.isArray(result.pages) ? (result.pages[0]?.text || '') : ''
          setComicReader({ ...comicReader, busy: false, text: text || '（这一页没有识别到文字）' })
        } catch (error) {
          setCanonMessage(String(error?.message ?? error))
          setComicReader({ ...comicReader, busy: false })
        }
      }, [comicReader, remote, sessionId])

      const searchHongguoNow = React.useCallback(async function () {
        if (!remote || typeof remote.hongguoSearch !== 'function') return
        const query = hongguoQuery.trim()
        if (!query) return
        setHongguoBusy(true)
        try {
          const result = await Promise.resolve(remote.hongguoSearch(sessionId, { query })).then(unwrap)
          const items = Array.isArray(result) ? result : (result?.items || result?.results || result?.data || [])
          setHongguoResults(items)
          setHongguoSeriesData(null)
          setHongguoEpisodesData(null)
          setHongguoDanmakuData(null)
        } catch (error) {
          setCanonMessage(String(error?.message ?? error))
        } finally {
          setHongguoBusy(false)
        }
      }, [remote, sessionId, hongguoQuery])

      const openHongguoSeries = React.useCallback(async function (item) {
        if (!remote || typeof remote.hongguoSeries !== 'function') return
        const seriesId = item?.seriesId || item?.id || item?.series_id
        if (!seriesId) return
        setHongguoBusy(true)
        try {
          const series = await Promise.resolve(remote.hongguoSeries(sessionId, { seriesId })).then(unwrap)
          const episodes = await Promise.resolve(remote.hongguoEpisodes(sessionId, { seriesId })).then(unwrap)
          setHongguoSeriesData({ id: seriesId, item, series })
          setHongguoEpisodesData(Array.isArray(episodes) ? episodes : (episodes?.episodes || episodes?.items || []))
          setHongguoDanmakuData(null)
        } catch (error) {
          setCanonMessage(String(error?.message ?? error))
        } finally {
          setHongguoBusy(false)
        }
      }, [remote, sessionId])

      const openHongguoEpisode = React.useCallback(async function (episode) {
        if (!remote || typeof remote.hongguoDanmaku !== 'function' || !hongguoSeriesData) return
        const episodeId = episode?.episodeId || episode?.id || episode?.episode_id
        if (!episodeId) return
        setHongguoBusy(true)
        try {
          const result = await Promise.resolve(remote.hongguoDanmaku(sessionId, { seriesId: hongguoSeriesData.id, episodeId })).then(unwrap)
          setHongguoDanmakuData(Array.isArray(result) ? result : (result?.danmaku || result?.items || result?.data || []))
        } catch (error) {
          setCanonMessage(String(error?.message ?? error))
        } finally {
          setHongguoBusy(false)
        }
      }, [remote, sessionId, hongguoSeriesData])

      const reviewMediaNow = React.useCallback(async function (item, status) {        if (!remote || !data || !data.book || !item) return
        try {
          const result = await Promise.resolve(remote.reviewMedia(sessionId, {
            book: data.book, evidenceId: item.id, status, note: '',
          })).then(unwrap)
          if (!result || result.ok === false) { setCanonMessage(result?.message || result?.code || '媒体审阅失败'); return }
          setCanonMessage('媒体证据已' + (status === 'confirmed' ? '确认' : '拒绝') + '：' + (item.id || ''))
          const media = await Promise.resolve(remote.getMedia(sessionId, { book: data.book })).then(unwrap).catch(() => null)
          if (media) setMediaData(media)
        } catch (error) {
          setCanonMessage(String(error?.message ?? error))
        }
      }, [remote, sessionId, data])

      const confirmPersonaNow = React.useCallback(async function (persona) {
        if (!remote || !data || !data.book || !persona) return
        try {
          const result = await Promise.resolve(remote.confirmPersona(sessionId, {
            book: data.book, personaId: persona.id,
          })).then(unwrap)
          if (!result || result.ok === false) { setBeatMessage(result?.message || result?.code || '人物卡确认失败'); return }
          setBeatMessage('人物卡已确认：' + (persona.name || persona.id))
          const personas = await Promise.resolve(remote.getPersonas(sessionId, { book: data.book })).then(unwrap).catch(() => null)
          if (personas) setPersonaData(personas)
        } catch (error) {
          setBeatMessage(String(error?.message ?? error))
        }
      }, [remote, sessionId, data])

      const canonSourceId = (materialData && materialData.canon && materialData.canon.sourceId) ? materialData.canon.sourceId : ''

      const refreshRuns = React.useCallback(async function () {
        if (!remote || !data || !data.book || typeof remote.getRuns !== 'function') return
        const runs = await Promise.resolve(remote.getRuns(sessionId, { book: data.book })).then(unwrap).catch(() => null)
        if (runs) setRunsData(runs)
      }, [remote, sessionId, data])

      const createRunNow = React.useCallback(async function () {
        if (!remote || !data || !data.book) return
        try {
          const result = await Promise.resolve(remote.createRun(sessionId, { book: data.book, title: '第 ' + (session ? session.chapter : 1) + ' 章 run' })).then(unwrap)
          if (!result || result.ok === false) { setWorkMessage(result?.message || result?.code || '建 run 失败'); return }
          setWorkMessage('已建 run：' + result.run.runId)
          await refreshRuns()
        } catch (error) {
          setWorkMessage(String(error?.message ?? error))
        }
      }, [remote, sessionId, data, session, refreshRuns])

      const updateRunNow = React.useCallback(async function (run, status) {
        if (!remote || !data || !data.book || !run) return
        try {
          const result = await Promise.resolve(remote.updateRun(sessionId, {
            book: data.book, runId: run.runId, status, expectedRevision: run.revision ?? null,
          })).then(unwrap)
          if (!result || result.ok === false) { setWorkMessage(result?.message || result?.code || '更新 run 失败'); return }
          await refreshRuns()
        } catch (error) {
          setWorkMessage(String(error?.message ?? error))
        }
      }, [remote, sessionId, data, refreshRuns])

      const loadCanonQueue = React.useCallback(async function () {
        if (!remote || typeof remote.getCanonQueue !== 'function' || !data || !data.book) return
        const targetBook = data.book
        try {
          const queue = await Promise.resolve(remote.getCanonQueue(sessionId, { book: targetBook, sourceId: canonSourceId || undefined })).then(unwrap)
          if (bookRef.current !== targetBook) return
          setCanonQueue(queue)
        } catch (error) {
          if (bookRef.current !== targetBook) return
          setCanonQueue({ available: false, message: String(error?.message ?? error) })
        }
      }, [remote, sessionId, data && data.book, canonSourceId])

      React.useEffect(function () {
        if (section !== 'fanfic' || !data || !data.book) return
        loadCanonQueue()
      }, [section, data && data.book, canonSourceId])

      const reviewCanonChangeNow = React.useCallback(async function (changeId, action, changeHash) {
        if (!remote || typeof remote.reviewCanonChange !== 'function' || !data || !data.book) return
        setCanonQueueBusy(true)
        try {
          const result = await Promise.resolve(remote.reviewCanonChange(sessionId, {
            book: data.book, sourceId: canonSourceId, changeId, action,
            expectedChangeHash: changeHash || null,
            expectedRevision: canonQueue ? canonQueue.revision : null,
          })).then(unwrap)
          if (result && result.ok === false) { setCanonMessage(result.message || result.code || '审阅失败'); return }
          setCanonMessage(action === 'accepted' ? '已接受这条；点「应用」后才会生效。' : '已拒绝这条；它不会进入上下文。')
          await loadCanonQueue()
        } catch (error) {
          setCanonMessage(String(error?.message ?? error))
        } finally {
          setCanonQueueBusy(false)
        }
      }, [remote, sessionId, data, canonSourceId, canonQueue, loadCanonQueue])

      const applyCanonChangesNow = React.useCallback(async function () {
        if (!remote || typeof remote.applyCanonChanges !== 'function' || !data || !data.book) return
        const ids = canonQueue && Array.isArray(canonQueue.accepted) ? canonQueue.accepted.map((item) => item.changeId) : []
        if (!ids.length) return
        setCanonQueueBusy(true)
        try {
          const result = await Promise.resolve(remote.applyCanonChanges(sessionId, {
            book: data.book, sourceId: canonSourceId, changeIds: ids,
            expectedRevision: canonQueue ? canonQueue.revision : null,
          })).then(unwrap)
          if (result && result.ok === false) { setCanonMessage(result.message || result.code || '应用失败'); return }
          setCanonMessage('已应用 ' + ids.length + ' 条；生效版本 v' + (result.contractRevision ?? '?'))
          await loadCanonQueue()
          setMaterialData(null)
          await load()
        } catch (error) {
          setCanonMessage(String(error?.message ?? error))
        } finally {
          setCanonQueueBusy(false)
        }
      }, [remote, sessionId, data, canonSourceId, canonQueue, loadCanonQueue, load])

      /** 证据回查：按 canon 的 sourceId + 章号读回原文那一段。 */      const loadExcerpt = React.useCallback(async function (chapter) {
        const canon = materialData && materialData.canon ? materialData.canon : null
        const sourceId = canon && canon.sourceId ? canon.sourceId : ''
        if (!sourceId) { setCanonMessage('这份 canon 没记录 sourceId，读不到原文。'); return }
        if (!remote || typeof remote.getSourceExcerpt !== 'function') { setCanonMessage('宿主还没有原文回查接口，先重载 DSH。'); return }
        try {
          const result = await Promise.resolve(remote.getSourceExcerpt(sessionId, { sourceId, chapter, length: 900 })).then(unwrap)
          if (result && result.ok === false) { setCanonMessage(result.message || '读不到这一章'); return }
          setExcerpt({ chapter, text: result.text || '', layout: result.layout || '', truncated: result.truncated === true })
          setCanonMessage('')
        } catch (error) {
          setCanonMessage(String(error?.message ?? error))
        }
      }, [remote, sessionId, materialData])

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

      const loadMemoryExcerpt = React.useCallback(async function (card) {
        if (!remote || !data || !data.book || !card || typeof remote.getSourceExcerpt !== 'function') return
        const sourceId = card.sourceId
        const chapter = Number(card.sourceChapter ?? card.chapter)
        if (!/^[a-f0-9]{64}$/u.test(String(sourceId ?? '')) || !Number.isInteger(chapter) || chapter < 1) {
          setBeatMessage('这张卡没有可回查的原文 sourceId/章号。')
          return
        }
        try {
          const excerpt = await Promise.resolve(remote.getSourceExcerpt(sessionId, { book: data.book, sourceId, chapter, length: 1200 })).then(unwrap)
          if (!excerpt || excerpt.ok === false) { setBeatMessage(excerpt?.message || excerpt?.code || '原文读不到'); return }
          setMemoryExcerpt({ ...excerpt, cardId: card.id, quote: String(card.quote || '') })
          setFadeTab('provenance')
        } catch (error) {
          setBeatMessage(String(error?.message ?? error))
        }
      }, [remote, sessionId, data])

      const actOnMemory = React.useCallback(async function (card, action) {        if (!remote || !data || !data.book || !card) return
        try {
          const result = await Promise.resolve(remote.memoryAction(sessionId, { book: data.book, cardId: card.id, action })).then(unwrap)
          if (!result || result.ok === false) { setBeatMessage(result?.message || result?.code || '记忆操作失败'); return }
          const memory = await Promise.resolve(remote.getMemory(sessionId, { book: data.book, limit: 240, currentChapter: session ? session.chapter : null })).then(unwrap).catch(() => null)
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

      const browseImport = React.useCallback(async function (dir) {
        const target = String(dir || importDir || (data && data.root) || '').trim()
        if (!remote || typeof remote.listSourceFiles !== 'function') { setImportMessage('宿主没有导入接口，先重载 DSH。'); return }
        if (!target) { setImportMessage('先填一个目录，例如 D:\我的小说'); return }
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

      /** 工作区设置：右栏删掉后，总开关 / 模式 / 新建作品必须在这里。 */
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
          h('div', { className: 'nk-tiny', style: { marginTop: 9 } }, '旧五件账本：在下方「继承导入」扫描并显式导入；源文件不改，导入后五件可卸载。'),
          workMessage ? h('div', { className: 'nk-tiny', style: { marginTop: 6, color: c.sub } }, workMessage) : null)
      }

      /** 每个页面自己的标题条：标题 + 一句说明 + 页内动作。 */
      function pageHead(title, sub, actions) {
        return h('div', { className: 'nk-page-head' },
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
        const recentChapters = chapters.slice(-8)
        const maxChapterChars = recentChapters.reduce(function (max, item) { return Math.max(max, Number(item.chars) || 0) }, 1)
        const contexts = (data && data.contexts) || []
        const ledgers = (data && data.ledgers) || {}
        const operations = (data && data.operations && Array.isArray(data.operations.items)) ? data.operations.items : []
        const canonPending = !!(data && data.canon && data.settings && data.settings.mode === 'fanfic' && !data.canon.ready)
        const failedOps = operations.filter((item) => item.status === 'failed')

        const stat = (label, value, tone) => h('div', { className: 'nk-stat' },
          h('div', { className: 'nk-stat-label' }, label),
          h('div', { className: 'nk-stat-value' + (tone ? ' ' + tone : '') }, value))

        const inboxItems = (inboxData && Array.isArray(inboxData.items)) ? inboxData.items : []
        const inboxCount = inboxData && typeof inboxData.total === 'number'
          ? inboxData.total
          : pendingIds.length + conflictTotal + (canonPending ? 1 : 0) + failedOps.length
        const kindLabel = { decision: '拍板', canon: 'canon', conflict: '冲突', check: '检查', operation: '操作' }

        const inbox = inboxCount === 0
          ? h('div', { className: 'nk-tiny', style: { padding: '2px 0 2px' } }, '没有待拍板、冲突或失败操作。')
          : h('div', null, inboxItems.slice(0, 8).map(function (item) {
              const tone = item.severity === 'blocker' ? c.error : c.warning
              return h('button', {
                key: item.id,
                type: 'button',
                className: 'nk-rowbtn',
                style: { padding: '9px 0', borderBottom: '1px solid ' + c.border },
                onClick: function () { setSection(item.target && item.target.page ? item.target.page : 'desk') },
              },
              h('span', { className: 'nk-badge' + (item.severity === 'blocker' ? ' accent' : ' warn') }, kindLabel[item.kind] || item.kind),
              h('span', { className: 'nk-rowbtn-title', style: { whiteSpace: 'normal' } }, item.title || ''),
              item.blockScope === 'start' || item.blockScope === 'finish'
                ? h('span', { className: 'nk-badge', style: { color: tone } }, item.blockScope === 'start' ? '拦开章' : '拦收尾')
                : null)
            }))

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
                stat('待处理', String(inboxCount), inboxCount > 0 ? 'warn' : '')),

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
                : null,
              h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' },
                  h('div', { className: 'nk-card-title' }, '章节字数'),
                  h('span', { className: 'nk-meta' }, chapters.length ? '最近 ' + Math.min(8, chapters.length) + ' 章' : '还没有章节')),
                chapters.length === 0
                  ? h('div', { className: 'nk-tiny' }, '写完并收尾后，这里按章显示字数。')
                  : h('div', { style: { display: 'flex', alignItems: 'flex-end', gap: 5, height: 64, marginTop: 4 } }, recentChapters.map(function (item, index) {
                      const value = Number(item.chars) || 0
                      const height = Math.max(4, Math.round(value / maxChapterChars * 56))
                      return h('div', {
                        key: index,
                        title: '第 ' + item.chapter + ' 章 · ' + fmtNum(value) + ' 字',
                        style: { width: 18, flexShrink: 0, height: height, borderRadius: 3, background: value ? 'color-mix(in srgb, var(--nk-accent) 62%, transparent)' : 'var(--nk-line-soft)' },
                      })
                    })))))
        )
      }

      /** 把检查项定位到正文：选中那一段，并把光标移到句首。 */
      function locateFinding(finding) {
        const node = draftRef.current
        if (!node || typeof node.setSelectionRange !== 'function') return
        const at = Number(finding && finding.at)
        if (!Number.isFinite(at) || at < 0) return
        const length = Math.max(0, Number(finding.length) || 0)
        try {
          node.focus()
          node.setSelectionRange(at, at + length)
        } catch {
          // 只读态/旧宿主：不抛错，保持原样
        }
      }

      // ── 决策页：待拍板 / 已拍板 / 详情与改选 / 意图与文风倾向 ─────────────
      function decisionsPage() {
        const view = storyData && storyData.decisions ? storyData.decisions : null
        const committed = view && Array.isArray(view.committed) ? view.committed : []
        const pending = view && Array.isArray(view.proposals) ? view.proposals : []
        const selected = committed.filter(function (item) { return item.id === openDecisionId })[0] || null
        const beatRev = data && data.ledgers && data.ledgers.beat ? data.ledgers.beat.revision : '—'
        const beatTerm = beatQuery.trim().toLowerCase()
        const matchesBeat = function (item) {
          if (!beatTerm) return true
          return [item.title, item.change, item.option, item.kind, item.status].filter(Boolean).join(' ').toLowerCase().includes(beatTerm)
        }
        const shownCommitted = committed.filter(matchesBeat)
        const shownPending = pending.filter(matchesBeat)

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

        return h('div', { className: 'nk-wb-body' + (beatPaper === 'night' ? ' nk-dark' : ''), style: beatPaper === 'sepia' ? { background: '#f4ead8' } : undefined },
          pageHead('决策', '本章拍过什么、还欠什么；提案必须你点头才算数。',
            h('button', { type: 'button', className: 'nk-btn', onClick: function () { reloadBeat() } }, '刷新')),
          h('div', { className: 'nk-stats' },
            pageStat('本章已拍板', committed.length),
            pageStat('待你拍板', pending.length, pending.length ? 'warn' : ''),
            pageStat('未回收线索', view ? view.openObligations : '—'),
            pageStat('beat 版本', beatRev),
            pageStat('待答请求', view && view.loop ? view.loop.open : '—', view && view.loop && view.loop.open ? 'warn' : '')),
          view && view.gate && view.gate.ok === false
            ? h('div', { className: 'nk-warnbar' },
                h('span', { className: 'nk-warnbar-text' }, '决策闸门：有 ' + view.gate.errors + ' 条 committed 决策缺少作者回答凭据，收尾会被拦住。'),
                h('button', { type: 'button', className: 'nk-btn', onClick: function () { reloadBeat() } }, '刷新'))
            : null,
          beatMessage ? h('div', { className: 'nk-tiny', style: { margin: '10px 0' } }, beatMessage) : null,
          h('div', { className: 'nk-tabs', style: { marginBottom: 10 } },
            [['map', '决策地图'], ['timeline', '时间线'], ['health', '体检']].map(function (item) {
              return h('button', {
                key: item[0], type: 'button', className: 'nk-tab' + (beatTab === item[0] ? ' active' : ''),
                onClick: function () { setBeatTab(item[0]) },
              }, item[1])
            })),
          beatTab === 'timeline'
            ? h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' },
                  h('div', { className: 'nk-card-title' }, '时间线'),
                  h('span', { className: 'nk-meta' }, ((view && view.timeline) || []).length + ' 条')),
                ((view && view.timeline) || []).length
                  ? ((view && view.timeline) || []).map(function (item) {
                      return h('div', { key: item.id, className: 'nk-kv', style: { padding: '9px 0' } },
                        h('span', { className: 'nk-kv-key', style: { flexShrink: 0 } }, 'CH.' + String(item.chapter || 0).padStart(2, '0')),
                        h('span', { className: 'nk-kv-val' }, (item.title || '') + (item.option ? ' → ' + item.option : '')))
                    })
                  : inlineEmpty('还没有跨章决策。'))
            : null,
          beatTab === 'health'
            ? h('div', { className: 'nk-wb-col', style: { gap: 12 } },
                h('section', { className: 'nk-card' },
                  h('div', { className: 'nk-card-head' },
                    h('div', { className: 'nk-card-title' }, '决策闸门'),
                    h('span', { className: 'nk-badge' + (view && view.gate && view.gate.ok === false ? ' warn' : ' accent') }, view && view.gate && view.gate.ok === false ? '有缺口' : '正常')),
                  view && view.gate && view.gate.issues && view.gate.issues.length
                    ? view.gate.issues.map(function (issue, index) {
                        return h('div', { key: index, className: 'nk-tiny', style: { padding: '4px 0' } }, '· ' + (issue.code || 'issue') + '：' + (issue.message || ''))
                      })
                    : inlineEmpty('committed 决策都有作者回答凭据。')),
                h('section', { className: 'nk-card' },
                  h('div', { className: 'nk-card-head' },
                    h('div', { className: 'nk-card-title' }, '本章检查'),
                    h('span', { className: 'nk-meta' }, '收尾结果')),
                  session && session.verification && Array.isArray(session.verification.findings) && session.verification.findings.length
                    ? session.verification.findings.slice(0, 12).map(function (item, index) {
                        return h('div', { key: index, className: 'nk-kv' },
                          h('span', { className: 'nk-kv-key' }, item.severity || 'info'),
                          h('span', { className: 'nk-kv-val' }, item.message || ''))
                      })
                    : inlineEmpty('本章还没有检查结果。')),
                h('section', { className: 'nk-card' },
                  h('div', { className: 'nk-card-head' },
                    h('div', { className: 'nk-card-title' }, '按章体检'),
                    h('span', { className: 'nk-meta' }, ((data && data.history && data.history.chapters) || []).length + ' 章')),
                  (data && data.history && Array.isArray(data.history.chapters) && data.history.chapters.length)
                    ? data.history.chapters.slice(0, 12).map(function (item) {
                        const check = item.verification || {}
                        return h('button', {
                          key: item.chapter, type: 'button', className: 'nk-kv nk-rowbtn',
                          onClick: function () { setChapterFindings(item) },
                        },
                          h('span', { className: 'nk-kv-key' }, 'CH.' + String(item.chapter).padStart(2, '0')),
                          h('span', { className: 'nk-kv-val' }, (item.state || '') + ' · ' + (item.chars || 0) + ' 字 · blocker ' + (check.blockers || 0) + ' / warning ' + (check.warnings || 0)))
                      })
                    : inlineEmpty('还没有历史章节体检。'),
                  chapterFindings && chapterFindings.verification && Array.isArray(chapterFindings.verification.findings) && chapterFindings.verification.findings.length
                    ? h('div', { style: { marginTop: 6 } }, chapterFindings.verification.findings.slice(0, 12).map(function (item, index) {
                        return h('div', { key: index, className: 'nk-tiny' }, '· ' + (item.severity || 'info') + '：' + (item.message || ''))
                      }))
                    : null),
                h('section', { className: 'nk-card' },
                  h('div', { className: 'nk-card-head' }, h('div', { className: 'nk-card-title' }, '统计')),
                  h('div', { className: 'nk-kv' }, h('span', { className: 'nk-kv-key' }, 'committed'), h('span', { className: 'nk-kv-val' }, String(committed.length))),
                  h('div', { className: 'nk-kv' }, h('span', { className: 'nk-kv-key' }, 'pending'), h('span', { className: 'nk-kv-val' }, String(pending.length))),
                  h('div', { className: 'nk-kv' }, h('span', { className: 'nk-kv-key' }, '待答请求'), h('span', { className: 'nk-kv-val' }, String(view && view.loop ? view.loop.open : 0)))))
            : null,
          beatTab === 'map'
            ? h('div', { className: 'nk-import-row', style: { margin: '8px 0', flexWrap: 'wrap', gap: 8 } },
                h('input', {
                  className: 'nk-input', style: { minWidth: 180 }, value: beatQuery, placeholder: '搜索决策、选项、影响',
                  onChange: function (event) { setBeatQuery(event.target.value) },
                }),
                h('div', { className: 'nk-chipline', style: { flexShrink: 0, flexWrap: 'wrap', gap: 6 } },
                  [['all', '全部'], ['committed', '已拍板'], ['pending', '待拍板']].map(function (item) {
                    return h('button', {
                      key: item[0], type: 'button', className: 'nk-btn' + (beatFilter === item[0] ? ' primary' : ''),
                      onClick: function () { setBeatFilter(item[0]) },
                    }, item[1])
                  }),
                  [['default', '纸白'], ['sepia', '米黄'], ['night', '深色']].map(function (item) {
                    return h('button', {
                      key: item[0], type: 'button', className: 'nk-btn' + (beatPaper === item[0] ? ' primary' : ''),
                      onClick: function () { setBeatPaper(item[0]) },
                    }, item[1])
                  })))
            : null,
          h('div', { className: 'nk-split', style: beatTab === 'map' ? undefined : { display: 'none' } },
            h('div', { className: 'nk-split-list' },
              h('section', { className: 'nk-card', style: beatFilter === 'committed' ? { display: 'none' } : undefined },
                h('div', { className: 'nk-card-head' },
                  h('div', { className: 'nk-card-title' }, '待你拍板'),
                  h('span', { className: 'nk-meta' }, shownPending.length + ' 条')),
                shownPending.length ? shownPending.map(proposalView)
                  : inlineEmpty(beatTerm ? '没有匹配的待拍板提案。' : '没有待拍板的提案。模型提出选项后会出现在这里，采纳或拒绝由你决定。')),
              h('section', { className: 'nk-card flush', style: beatFilter === 'pending' ? { display: 'none' } : undefined },
                h('div', { className: 'nk-card-head', style: { padding: '14px 14px 0' } },
                  h('div', { className: 'nk-card-title' }, '本章已拍板'),
                  h('span', { className: 'nk-meta' }, shownCommitted.length + ' 条')),
                shownCommitted.length ? shownCommitted.map(committedRow) : inlineEmpty(beatTerm ? '没有匹配的已拍板决策。' : '本章还没有拍过板。'))),
            h('div', { className: 'nk-wb-col nk-wb-aside' },
              detail,
              h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' }, h('div', { className: 'nk-card-title' }, '本章意图')),
                h('div', { className: 'nk-body' }, (view && view.intent) || '还没有写本章意图；可以在书桌的「本章场景」里填。')),
              h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' }, h('div', { className: 'nk-card-title' }, '文风倾向')),
                h('div', { className: 'nk-body' }, (view && view.styleHint) || '还没有文风提示；导入风格档案后这里会给出倾向。')),
              h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' },
                  h('div', { className: 'nk-card-title' }, '未回收线索'),
                  h('span', { className: 'nk-meta' }, ((view && view.obligations) || []).length + ' 条')),
                ((view && view.obligations) || []).length
                  ? ((view && view.obligations) || []).slice(0, 10).map(function (item) {
                      return h('div', { key: item.id, className: 'nk-kv' },
                        h('span', { className: 'nk-kv-key' }, 'CH.' + String(item.chapter || 0).padStart(2, '0') + (item.dueChapter ? ' → 第 ' + item.dueChapter + ' 章' : '')),
                        h('span', { className: 'nk-kv-val' }, item.text || ''))
                    })
                  : inlineEmpty('没有挂着的线索。')),
              h('section', { className: 'nk-card flush' },
                h('div', { className: 'nk-card-head', style: { padding: '14px 14px 0' } },
                  h('div', { className: 'nk-card-title' }, '全书拍板'),
                  h('span', { className: 'nk-meta' }, (((view && view.timeline) || []).length) + ' 条')),
                ((view && view.timeline) || []).length
                  ? ((view && view.timeline) || []).slice(0, 8).map(function (item) {
                      return h('div', { key: item.id, className: 'nk-kv', style: { padding: '8px 14px' } },
                        h('span', { className: 'nk-kv-key', style: { flexShrink: 0 } }, 'CH.' + String(item.chapter || 0).padStart(2, '0')),
                        h('span', { className: 'nk-kv-val', style: { maxWidth: '62%' } }, item.title || item.option || ''))
                    })
                  : inlineEmpty('还没有跨章记录。')))))
      }

      // ── 记忆页：卡库 / 检索 / 人物 / 线索 / 卡片详情 ───────────────────────
      function memoryPage() {
        const view = fadeData || null
        const cards = view && Array.isArray(view.cards) ? view.cards : []
        const memoryChapters = [...new Set(cards.map(function (card) { return Number(card.chapter) }))].sort(function (a, b) { return a - b })
        const memoryLayers = [...new Set(cards.map(function (card) { return card.layer || 'L2' }))].sort()
        const visibleCards = cards
          .filter(function (card) { return memoryChapter === null || Number(card.chapter) === Number(memoryChapter) })
          .filter(function (card) { return memoryLayer === null || (card.layer || 'L2') === memoryLayer })
        const entities = view && Array.isArray(view.entities) ? view.entities : []
        const threads = view && Array.isArray(view.threads) ? view.threads : []
        const opened = cards.filter(function (item) { return item.id === memoryOpen })[0] || null
        const pinned = cards.filter(function (item) { return item.pinned }).length
        const sourceIndex = new Map()
        for (const card of cards) {
          if (!card.sourceId) continue
          if (!sourceIndex.has(card.sourceId)) sourceIndex.set(card.sourceId, new Set())
          sourceIndex.get(card.sourceId).add(card.sourceChapter || card.chapter)
        }
        const hits = Array.isArray(memoryHits) ? memoryHits : null
        const forgotten = cards.filter(function (card) { return card.status === 'forgotten' })
        const archived = (view && view.archive && Array.isArray(view.archive.items)) ? view.archive.items : []
        const chapterMap = new Map()
        for (const card of cards) chapterMap.set(card.chapter, (chapterMap.get(card.chapter) || 0) + 1)
        const chapterCounts = Array.from(chapterMap.entries()).sort(function (a, b) { return a[0] - b[0] }).map(function (entry) { return { chapter: entry[0], count: entry[1] } })
        const maxChapterCount = chapterCounts.reduce(function (max, item) { return Math.max(max, item.count) }, 1)
        const layerMap = new Map()
        for (const card of cards) layerMap.set(card.layer || 'L2', (layerMap.get(card.layer || 'L2') || 0) + 1)
        const layerMax = Array.from(layerMap.values()).reduce(function (max, value) { return Math.max(max, value) }, 1)
        const layerRows = Array.from(layerMap.entries()).sort().map(function (entry) {
          return h('div', { key: entry[0], className: 'nk-band' },
            h('span', null, entry[0]),
            h('div', { className: 'nk-band-track' }, h('div', { className: 'nk-band-fill', style: { left: 0, width: Math.max(4, Math.round(entry[1] / layerMax * 100)) + '%' } })),
            h('span', { className: 'nk-band-val' }, String(entry[1])))
        })

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
                h('button', { type: 'button', className: 'nk-btn', onClick: function () { actOnMemory(opened, opened.status === 'forgotten' ? 'restore' : 'forget') } }, opened.status === 'forgotten' ? '恢复' : '遗忘'),
                h('button', { type: 'button', className: 'nk-btn', onClick: function () { actOnMemory(opened, 'archive') } }, '归档')))
          : h('section', { className: 'nk-card' },
              h('div', { className: 'nk-card-head' }, h('div', { className: 'nk-card-title' }, '卡片详情')),
              h('div', { className: 'nk-empty-state' },
                h('div', { className: 'nk-glyph' }, '忆'),
                h('div', { className: 'nk-tiny' }, '点左边一张卡，看原文引文、因果与能记多久。')))

        return h('div', { className: 'nk-wb-body' },
          pageHead('记忆', '近章重点记、旧事逐步淡；收尾时沉淀的卡片在这里，可以钉住或让它褪色。'),
          h('div', { className: 'nk-tabs', style: { marginBottom: 10 } },
            [['overview', '总览'], ['memory', '记忆'], ['provenance', '溯源']].map(function (item) {
              return h('button', {
                key: item[0], type: 'button', className: 'nk-tab' + (fadeTab === item[0] ? ' active' : ''),
                onClick: function () { setFadeTab(item[0]) },
              }, item[1])
            })),
          fadeTab === 'overview'
            ? h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' },
                  h('div', { className: 'nk-card-title' }, '总览'),
                  h('span', { className: 'nk-meta' }, view ? 'rev ' + (view.revision ?? 0) : '未接入')),
                h('div', { className: 'nk-stats', style: { marginBottom: 10 } },
                  pageStat('卡片', cards.length),
                  pageStat('已钉住', pinned),
                  pageStat('已归档', view && view.archive ? view.archive.count : 0),
                  pageStat('未回收线索', threads.length, threads.length ? 'warn' : '')),
                view && view.health
                  ? h('div', { className: 'nk-kv' },
                      h('span', { className: 'nk-kv-key' }, '健康'),
                      h('span', { className: 'nk-kv-val' }, view.health.currentChapter ? '低保真 ' + view.health.lowFidelity + ' · 窗口外 ' + view.health.outOfWindow + ' · 钉卡 ' + view.health.pinned : '未计算（缺少当前章）'))
                  : null,
                view && Array.isArray(view.curve) && view.curve.length
                  ? h('div', { style: { marginTop: 8 } },
                      h('div', { className: 'nk-tiny', style: { marginBottom: 4 } }, '记忆曲线（保真度最低 5 张）'),
                      (view && Array.isArray(view.lowest) ? view.lowest : view.curve.slice().sort(function (a, b) { return a.fidelity - b.fidelity }).slice(0, 5)).map(function (item) {
                        return h('div', { key: item.id, className: 'nk-kv' },
                          h('span', { className: 'nk-kv-key' }, 'CH.' + String(item.chapter).padStart(2, '0') + ' · ' + item.salience),
                          h('span', { className: 'nk-kv-val' }, '保真 ' + item.fidelity + ' / 可达 ' + item.accessibility + (item.pinned ? ' · 钉' : '')))
                      }))
                  : null,
                cards.length
                  ? h('div', null,
                      h('div', { className: 'nk-tiny', style: { marginTop: 10, marginBottom: 4 } }, '最近卡片'),
                      cards.slice(-6).reverse().map(function (item) {
                        return h('div', { key: item.id, className: 'nk-kv' },
                          h('span', { className: 'nk-kv-key' }, 'CH.' + String(item.chapter).padStart(2, '0')),
                          h('span', { className: 'nk-kv-val' }, item.gist || ''))
                      }))
                  : inlineEmpty('还没有记忆卡；写完一章收尾后会开始沉淀。'))
            : null,
          fadeTab === 'provenance'
            ? h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' },
                  h('div', { className: 'nk-card-title' }, '溯源'),
                  h('span', { className: 'nk-meta' }, cards.length + ' 张卡的引文')),
                sourceIndex.size
                  ? h('div', { style: { marginBottom: 8 } }, Array.from(sourceIndex.entries()).map(function (entry) {
                      return h('div', { key: entry[0], className: 'nk-kv' },
                        h('span', { className: 'nk-kv-key' }, entry[0].slice(0, 12) + '…'),
                        h('span', { className: 'nk-kv-val' }, '章节 ' + Array.from(entry[1]).sort(function (a, b) { return a - b }).join(' / ')))
                    }))
                  : null,
                cards.length
                  ? cards.slice().sort(function (a, b) { return (a.chapter || 0) - (b.chapter || 0) }).slice(0, 30).map(function (item) {
                      return h('div', { key: item.id, className: 'nk-kv', style: { alignItems: 'flex-start', flexDirection: 'column', gap: 2 } },
                        h('div', { style: { display: 'flex', gap: 6, alignItems: 'baseline', width: '100%' } },
                          h('span', { className: 'nk-kv-key' }, 'CH.' + String(item.chapter).padStart(2, '0')),
                          h('span', { className: 'nk-meta', style: { marginLeft: 'auto' } }, item.layer || 'L2')),
                        h('div', { className: 'nk-tiny' }, item.gist || ''),
                        item.quote ? h('div', { className: 'nk-quote', style: { margin: '2px 0 0' } }, item.quote) : null,
                        item.sourceId ? h('button', { type: 'button', className: 'nk-btn', style: { marginTop: 4 }, onClick: function () { loadMemoryExcerpt(item) } }, '看原文') : null)
                    })
                  : inlineEmpty('没有可溯源的卡片。'),
                memoryExcerpt
                  ? h('div', { style: { marginTop: 8 } },
                      (function () {
                        const text = String(memoryExcerpt.text || '')
                        const quote = String(memoryExcerpt.quote || '')
                        const at = quote ? text.indexOf(quote) : -1
                        if (at < 0) return null
                        const start = Math.max(0, at - 80)
                        const end = Math.min(text.length, at + quote.length + 80)
                        return h('div', { className: 'nk-quote', style: { maxHeight: 140, overflowY: 'auto', whiteSpace: 'pre-wrap' } }, '切片：…' + text.slice(start, end) + '…')
                      })(),
                      h('div', { className: 'nk-quote', style: { maxHeight: 260, overflowY: 'auto', whiteSpace: 'pre-wrap', marginTop: 6 } }, memoryExcerpt.text || '（这一章读回来是空的）'))
                  : null)
            : null,
          h('div', { className: 'nk-stats', style: fadeTab === 'memory' ? undefined : { display: 'none' } },
            pageStat('卡片', view ? view.total : '—'),
            pageStat('已钉住', pinned),
            pageStat('未回收线索', threads.length, threads.length ? 'warn' : ''),
            pageStat('记忆漂移', view && view.drift ? '有' : '无', view && view.drift ? 'warn' : '')),
          h('div', { className: 'nk-import-row', style: fadeTab === 'memory' ? { margin: '12px 0' } : { display: 'none' } },
            h('input', {
              className: 'nk-input', value: memoryQuery, placeholder: '按人物 / 物品 / 秘密搜记忆',
              onChange: function (event) { setMemoryQuery(event.target.value) },
              onKeyDown: function (event) { if (event.key === 'Enter') searchMemoryNow() },
            }),
            h('select', {
              className: 'nk-input', style: { maxWidth: 130 }, value: memoryChapter === null ? '' : String(memoryChapter),
              onChange: function (event) { setMemoryChapter(event.target.value ? Number(event.target.value) : null) },
            }, [h('option', { key: 'all', value: '' }, '全部章节')].concat(memoryChapters.map(function (chapter) { return h('option', { key: chapter, value: String(chapter) }, 'CH.' + String(chapter).padStart(2, '0')) }))),
            h('select', {
              className: 'nk-input', style: { maxWidth: 110 }, value: memoryLayer === null ? '' : memoryLayer,
              onChange: function (event) { setMemoryLayer(event.target.value || null) },
            }, [h('option', { key: 'all', value: '' }, '全部层')].concat(memoryLayers.map(function (layer) { return h('option', { key: layer, value: layer }, layer) }))),
            h('button', { type: 'button', className: 'nk-btn', onClick: function () { searchMemoryNow() } }, '搜记忆')),
          hits && fadeTab === 'memory'
            ? h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' },
                  h('div', { className: 'nk-card-title' }, '检索命中'),
                  h('span', { className: 'nk-meta' }, hits.length + ' 条')),
                hits.length === 0
                  ? inlineEmpty('没有命中。换个词，或清空检索看全部卡片。')
                  : hits.slice(0, 12).map(function (item) {
                      return h('div', { key: item.id, className: 'nk-kv', style: { alignItems: 'center', gap: 6 } },
                        h('span', { className: 'nk-kv-key' }, 'CH.' + String(item.chapter).padStart(2, '0') + ' · ' + (item.layer || 'L2')),
                        h('span', { className: 'nk-kv-val', style: { maxWidth: '50%' } }, item.gist || ''),
                        item.sourceId ? h('button', { type: 'button', className: 'nk-btn', onClick: function () { loadMemoryExcerpt(item) } }, '看原文') : null)
                    }))
            : null,
          h('div', { className: 'nk-split', style: fadeTab === 'memory' ? { marginTop: hits ? 14 : 0 } : { display: 'none' } },
            h('div', { className: 'nk-split-list' },
              h('section', { className: 'nk-card flush' },
                h('div', { className: 'nk-card-head', style: { padding: '14px 14px 0' } },
                  h('div', { className: 'nk-card-title' }, '记忆卡'),
                  h('span', { className: 'nk-meta' }, visibleCards.length + ' 张')),
                visibleCards.length ? visibleCards.slice(0, 40).map(cardRow)
                  : inlineEmpty(memoryChapter === null ? '这本书还没有记忆卡。每章收尾时会沉淀；先在「正文」页把第一章写完并收尾。' : '这一章还没有记忆卡。'))),
            h('div', { className: 'nk-wb-col nk-wb-aside' },
              detail,
              h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' },
                  h('div', { className: 'nk-card-title' }, '可恢复的记忆'),
                  h('span', { className: 'nk-meta' }, forgotten.length ? forgotten.length + ' 张已遗忘' : '无')),
                forgotten.length
                  ? forgotten.slice(0, 4).map(function (item) {
                      return h('div', { key: item.id, className: 'nk-kv' },
                        h('span', { className: 'nk-kv-key', style: { flexShrink: 0 } }, 'CH.' + String(item.chapter).padStart(2, '0')),
                        h('span', { className: 'nk-kv-val', style: { maxWidth: '52%' } }, item.gist || ''),
                        h('button', {
                          type: 'button', className: 'nk-btn', style: { flexShrink: 0 },
                          onClick: function () { actOnMemory(item, 'restore') },
                        }, '恢复'))
                    })
                  : inlineEmpty('本次载入的记忆中没有已遗忘卡。'),
                h('div', { className: 'nk-tiny', style: { marginTop: 8 } }, '只统计本次载入范围，不代表全书遗忘率。')),
              h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' },
                  h('div', { className: 'nk-card-title' }, '已归档'),
                  h('span', { className: 'nk-meta' }, archived.length ? archived.length + ' 张' : '无')),
                archived.length
                  ? archived.slice(0, 5).map(function (item) {
                      return h('div', { key: item.cardId, className: 'nk-kv' },
                        h('span', { className: 'nk-kv-key', style: { flexShrink: 0 } }, 'CH.' + String(item.chapter || 0).padStart(2, '0')),
                        h('span', { className: 'nk-kv-val', style: { maxWidth: '52%' } }, item.gist || ''),
                        h('button', {
                          type: 'button', className: 'nk-btn', style: { flexShrink: 0 },
                          onClick: function () { actOnMemory({ id: item.cardId }, 'unarchive') },
                        }, '恢复'))
                    })
                  : inlineEmpty('没有归档卡；巩固或手动归档后会出现在这里。')),
              h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' },
                  h('div', { className: 'nk-card-title' }, '按章分布'),
                  h('span', { className: 'nk-meta' }, '卡数')),
                chapterCounts.length
                  ? chapterCounts.map(function (item) {
                      return h('div', { key: item.chapter, className: 'nk-band' },
                        h('span', null, 'CH.' + String(item.chapter).padStart(2, '0')),
                        h('div', { className: 'nk-band-track' }, h('div', { className: 'nk-band-fill', style: { left: 0, width: Math.max(4, Math.round(item.count / maxChapterCount * 100)) + '%' } })),
                        h('span', { className: 'nk-band-val' }, String(item.count)))
                    })
                  : inlineEmpty('还没有卡片分布。')),
              h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' },
                  h('div', { className: 'nk-card-title' }, '记忆分层'),
                  h('span', { className: 'nk-meta' }, 'L0 最硬')),
                layerRows.length
                  ? layerRows
                  : inlineEmpty('还没有卡片。')),
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
        const personas = personaData && Array.isArray(personaData.personas) ? personaData.personas : []
        const confirmedPersonas = personas.filter(function (item) { return item.status === 'confirmed' }).length
        const works = Array.isArray(style.works) ? style.works : []
        const confirmed = profiles.filter(function (item) { return item.status === 'confirmed' }).length
        const candidates = []
        for (const profile of profiles) {
          for (const rule of (Array.isArray(profile.rulesDetail) ? profile.rulesDetail : [])) {
            if (rule.status === 'candidate') candidates.push({ profile, rule })
          }
        }
        // 绑定 ≠ 确认 ≠ 本章采用：这里只回答「本书绑了哪几份档案」。
        const boundIds = (data && data.settings && Array.isArray(data.settings.activeStyleProfileIds)) ? data.settings.activeStyleProfileIds : []
        const candidateTarget = profiles.filter(function (item) { return boundIds.includes(item.id) })[0]
          || profiles.filter(function (item) { return item.id === styleOpen })[0]
          || profiles[0]
          || null
        const boundProfiles = boundIds.map(function (id) {
          const found = profiles.filter(function (profile) { return profile.id === id })[0]
          if (!found) return { id, name: String(id).slice(0, 10) + '…', status: '档案暂不可读', version: null }
          return { id, name: found.name || found.id, status: found.status === 'confirmed' ? '已确认' : '待确认', version: found.version }
        })

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
          const ruleDetails = Array.isArray(profile.rulesDetail) ? profile.rulesDetail : []
          const evidenceTotal = ruleDetails.reduce(function (sum, rule) { return sum + (Array.isArray(rule.evidence) ? rule.evidence.length : 0) }, 0)
          const confirmedRules = ruleDetails.filter(function (rule) { return rule.status === 'confirmed' }).length
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
            h('div', { className: 'nk-tiny', style: { marginBottom: 6 } }, (profile.rules ?? ruleTexts.length) + ' 条规则 · ' + avoid.length + ' 个避免词' + (profile.ratings && profile.ratings.count ? ' · 总评 ' + profile.ratings.average + '（' + profile.ratings.count + ' 次）' : '') + (profile.ratings && profile.ratings.readerAverage ? ' · 读者 ' + profile.ratings.readerAverage : '')),
            h('div', { className: 'nk-tiny', style: { marginBottom: 6 } }, '质量：确认规则 ' + confirmedRules + ' / ' + ruleDetails.length + ' · 证据 ' + evidenceTotal + ' 条'),
            profile.quality
              ? h('div', { className: 'nk-tiny', style: { marginBottom: 6 } },
                  profile.quality.ok ? '自动验收：通过' : '自动验收：' + profile.quality.issues.map(function (code) {
                    return ({ 'profile-unconfirmed': '档案未确认', 'no-confirmed-rules': '没有确认规则', 'candidate-rules': '有候选未确认', 'rules-without-evidence': '规则缺证据', 'missing-source': '缺来源' })[code] || code
                  }).join(' / '))
              : null,
            bandRows(profile),
            open
              ? h('div', { style: { marginTop: 10 } },
                  ruleDetails.length
                    ? h('div', null, ruleDetails.slice(0, 20).map(function (rule) {
                        return h('div', { key: rule.id, className: 'nk-kv', style: { alignItems: 'center', gap: 6, flexWrap: 'wrap' } },
                          ruleEditId === rule.id
                            ? h('div', { style: { display: 'flex', gap: 6, width: '100%' } },
                                h('input', { className: 'nk-input', value: ruleEditText, onChange: function (event) { setRuleEditText(event.target.value) } }),
                                h('button', { type: 'button', className: 'nk-btn primary', onClick: function () { saveRuleTextNow(profile, rule) } }, '保存'),
                                h('button', { type: 'button', className: 'nk-btn', onClick: function () { setRuleEditId(null) } }, '取消'))
                            : h('span', { className: 'nk-kv-key', style: { flex: 1, minWidth: 0 } }, rule.text),
                          ruleEditId === rule.id ? null : h('span', { className: 'nk-badge' + (rule.status === 'confirmed' ? ' accent' : rule.status === 'rejected' ? ' warn' : '') }, rule.status),
                          h('span', { className: 'nk-meta' }, '权重 ' + rule.weight),
                          rule.evidence.length ? h('button', { type: 'button', className: 'nk-btn', onClick: function () { showRuleEvidence(rule) } }, '证据 ' + rule.evidence.length) : null,
                          rule.counterExamples && rule.counterExamples.length ? h('button', { type: 'button', className: 'nk-btn', onClick: function () { showRuleEvidence(rule) } }, '反例 ' + rule.counterExamples.length) : null,
                          ruleEditId === rule.id ? null : h('button', { type: 'button', className: 'nk-btn', onClick: function () { setRuleEditId(rule.id); setRuleEditText(rule.text) } }, '改'),
                          h('button', { type: 'button', className: 'nk-btn', style: { minWidth: 26, padding: '0 5px' }, onClick: function () { updateStyleRuleNow(profile, rule, { weight: Math.max(0, Number(rule.weight) - 1) }) } }, '−'),
                          h('button', { type: 'button', className: 'nk-btn', style: { minWidth: 26, padding: '0 5px' }, onClick: function () { updateStyleRuleNow(profile, rule, { weight: Math.min(5, Number(rule.weight) + 1) }) } }, '+'),
                          rule.status !== 'confirmed' ? h('button', { type: 'button', className: 'nk-btn', onClick: function () { updateStyleRuleNow(profile, rule, { status: 'confirmed' }) } }, '确认') : null,
                          rule.status === 'confirmed' ? h('button', { type: 'button', className: 'nk-btn', onClick: function () { updateStyleRuleNow(profile, rule, { status: 'rejected' }) } }, '拒绝') : null)
                      }))
                    : inlineEmpty('规则还没编译；先确认档案。'),
                  h('button', { type: 'button', className: 'nk-btn', style: { marginTop: 8 }, onClick: function () { loadStyleHistoryNow(profile) } }, '档案历史'),
                  styleHistory && styleHistory.profileId === profile.id
                    ? h('div', { className: 'nk-tiny', style: { marginTop: 8 } },
                        (styleHistory.history || []).slice(-8).reverse().map(function (item, index) {
                          return h('div', { key: index }, '· ' + (item.action || 'update') + ' · rev ' + (item.revision ?? '?') + ' · ' + String(item.at || '').slice(0, 16))
                        }))
                    : null,
                  Array.isArray(profile.ratingNotes) && profile.ratingNotes.length
                    ? h('div', { className: 'nk-tiny', style: { marginTop: 8 } },
                        profile.ratingNotes.slice(-3).reverse().map(function (item, index) {
                          return h('div', { key: 'rating-' + index }, '· ' + item.stars + ' 星 · ' + item.by + (item.note ? ' · ' + item.note : ''))
                        }))
                    : null,
                  h('div', { className: 'nk-tiny', style: { marginTop: 10, marginBottom: 4 } }, '读者偏好备注'),
                  h('textarea', {
                    className: 'nk-input', rows: 2,
                    value: readerDraft && readerDraft.profileId === profile.id ? readerDraft.text : (profile.readerPreference?.text || ''),
                    onChange: function (event) { setReaderDraft({ profileId: profile.id, text: event.target.value }) },
                    placeholder: '读者喜欢什么/不喜欢什么；只作作者备注，不进规则简报',
                  }),
                  h('button', { type: 'button', className: 'nk-btn', style: { marginTop: 4 }, onClick: function () { saveReaderPreferenceNow(profile) } }, '保存读者偏好'),
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
              h('button', { type: 'button', className: 'nk-btn', onClick: function () { loadStyleBrief(profile) } }, '生成写前简报'),
              h('div', { className: 'nk-chipline', style: { marginLeft: 'auto' } },
                [1, 2, 3, 4, 5].map(function (stars) {
                  return h('button', {
                    key: 'rate-' + stars, type: 'button', className: 'nk-btn', title: '给这份文风档案打 ' + stars + ' 分',
                    style: { minWidth: 28, padding: '0 6px' },
                    onClick: function () { rateStyleNow(profile, stars) },
                  }, String(stars))
                }))))
        }

        return h('div', { className: 'nk-wb-body' },
          pageHead('风格工作室', '导入一本你喜欢的作品，看它的句长、对话比例、用词与禁忌；确认后才参与写作。'),
          h('div', { className: 'nk-tabs', style: { marginBottom: 10 } },
            [['shelf', '书架'], ['style', '档案'], ['learn', '学习']].map(function (item) {
              return h('button', {
                key: item[0], type: 'button', className: 'nk-tab' + (voiceTab === item[0] ? ' active' : ''),
                onClick: function () { setVoiceTab(item[0]) },
              }, item[1])
            })),
          importPanel('style'),
          styleEvidence
            ? h('section', { className: 'nk-card', style: { marginTop: 12 } },
                h('div', { className: 'nk-card-head' },
                  h('div', { className: 'nk-card-title' }, '规则证据'),
                  h('button', { type: 'button', className: 'nk-btn', style: { marginLeft: 'auto' }, onClick: function () { setStyleEvidence(null) } }, '收起')),
                h('div', { className: 'nk-tiny', style: { marginBottom: 6 } }, styleEvidence.text),
                styleEvidence.evidence.length
                  ? styleEvidence.evidence.slice(styleEvidencePage * 5, styleEvidencePage * 5 + 5).map(function (item, index) {
                      return h('div', { key: index, className: 'nk-quote', style: { margin: '4px 0' } }, (item.chapter ? 'CH.' + item.chapter + ' · ' : '') + (item.quote || item.text || ''))
                    })
                  : inlineEmpty('这条规则还没有证据引用。'),
                styleEvidence.evidence.length > 5
                  ? h('div', { className: 'nk-option-foot', style: { marginTop: 6 } },
                      h('button', { type: 'button', className: 'nk-btn', disabled: styleEvidencePage <= 0, onClick: function () { setStyleEvidencePage(Math.max(0, styleEvidencePage - 1)) } }, '上一页'),
                      h('span', { className: 'nk-meta' }, (styleEvidencePage + 1) + ' / ' + Math.ceil(styleEvidence.evidence.length / 5)),
                      h('button', { type: 'button', className: 'nk-btn', disabled: (styleEvidencePage + 1) * 5 >= styleEvidence.evidence.length, onClick: function () { setStyleEvidencePage(styleEvidencePage + 1) } }, '下一页'))
                  : null,
                styleEvidence.counterExamples && styleEvidence.counterExamples.length
                  ? h('div', { style: { marginTop: 8 } },
                      h('div', { className: 'nk-tiny', style: { marginBottom: 4 } }, '反例'),
                      styleEvidence.counterExamples.slice(0, 10).map(function (item, index) {
                        return h('div', { key: 'counter-' + index, className: 'nk-quote', style: { margin: '4px 0' } }, typeof item === 'string' ? item : (item.quote || item.text || ''))
                      }))
                  : null)
            : null,
          voiceTab === 'shelf'
            ? h('section', { className: 'nk-card', style: { marginTop: 14 } },
                h('div', { className: 'nk-card-head' },
                  h('div', { className: 'nk-card-title' }, '书架'),
                  h('span', { className: 'nk-meta' }, profiles.length + ' 份档案 · ' + works.length + ' 部旧书库作品')),
                profiles.length
                  ? profiles.map(function (profile) {
                      return h('div', { key: profile.id, className: 'nk-kv', style: { alignItems: 'center', gap: 6 } },
                        h('span', { className: 'nk-kv-key', style: { flex: 1, minWidth: 0 } }, profile.name || profile.id),
                        h('span', { className: 'nk-badge' + (profile.status === 'confirmed' ? ' accent' : ' warn') }, profile.status === 'confirmed' ? '已确认' : '待确认'),
                        profile.status !== 'confirmed'
                          ? h('button', { type: 'button', className: 'nk-btn', onClick: function () { confirmStyleNow(profile) } }, '确认')
                          : null,
                        boundIds.includes(profile.id)
                          ? h('button', { type: 'button', className: 'nk-btn', onClick: function () { unbindStyleNow(profile) } }, '解绑')
                          : null,
                        h('button', { type: 'button', className: 'nk-btn', onClick: function () { remeasureStyleNow(profile) } }, '重测'),
                        h('button', { type: 'button', className: 'nk-btn', onClick: function () { removeStyleNow(profile) } }, '移除'))
                    })
                  : inlineEmpty('书架还是空的；点上方导入，选一本装着 txt 的目录。'),
                works.length
                  ? h('div', { style: { marginTop: 8 } }, works.map(function (work) {
                      return h('div', { key: work.workId, className: 'nk-kv' },
                        h('span', { className: 'nk-kv-key' }, work.title || work.workId),
                        h('span', { className: 'nk-kv-val' }, work.chapters + ' 章 · ' + work.chars + ' 字'))
                    }))
                  : null)
            : null,
          voiceTab === 'learn'
            ? h('section', { className: 'nk-card', style: { marginTop: 14 } },
                h('div', { className: 'nk-card-head' },
                  h('div', { className: 'nk-card-title' }, '学习'),
                  h('span', { className: 'nk-meta' }, candidates.length + ' 条待确认')),
                candidates.length
                  ? candidates.map(function (item, index) {
                      return h('div', { key: item.rule.id, className: 'nk-kv', style: { alignItems: 'center', gap: 6 } },
                        h('span', { className: 'nk-kv-key', style: { flex: 1, minWidth: 0 } }, '[' + (item.profile.name || item.profile.id) + '] ' + item.rule.text),
                        h('button', { type: 'button', className: 'nk-btn', onClick: function () { updateStyleRuleNow(item.profile, item.rule, { status: 'confirmed' }) } }, '确认'),
                        h('button', { type: 'button', className: 'nk-btn', onClick: function () { updateStyleRuleNow(item.profile, item.rule, { status: 'rejected' }) } }, '拒绝'))
                    })
                  : inlineEmpty('当前没有待学习候选。可以在下面手动加一条，模型提取的候选也会先到这里。'),
                profiles.length
                  ? h('div', { className: 'nk-import-row', style: { marginTop: 10 } },
                      h('input', { className: 'nk-input', value: candidateText, placeholder: '新增候选规则，例如：对话里留停顿', onChange: function (event) { setCandidateText(event.target.value) } }),
                      h('button', { type: 'button', className: 'nk-btn primary', disabled: !candidateText.trim() || !candidateTarget, onClick: function () { if (candidateTarget) addCandidateNow(candidateTarget) } }, '加入候选' + (candidateTarget ? ' · ' + (candidateTarget.name || candidateTarget.id) : '')))
                  : null)
            : null,
          h('div', { className: 'nk-stats', style: voiceTab === 'learn' ? { display: 'none' } : { marginTop: 14 } },
            pageStat('档案', profiles.length),
            pageStat('已确认', confirmed, confirmed ? '' : 'warn'),
            pageStat('书库作品', works.length),
            pageStat('书库字数', works.reduce(function (sum, item) { return sum + Number(item.chars || 0) }, 0))),
          h('div', { className: 'nk-wb-grid', style: voiceTab === 'style' ? { marginTop: 14 } : { display: 'none' } },
            h('div', { className: 'nk-wb-col' },
              profiles.length
                ? profiles.map(profileCard)
                : h('section', { className: 'nk-card' },
                    h('div', { className: 'nk-empty-state' },
                      h('div', { className: 'nk-glyph' }, '风'),
                      h('div', { className: 'nk-tiny' }, '还没有文风档案。在上面填一个装着 txt 的目录，选一本你喜欢的作品。')),
                    h('div', { className: 'nk-chipline', style: { justifyContent: 'center', marginTop: 8 } },
                      ['句长区间', '段长区间', '对话比例', '用词密度', '常用句式', '避免词'].map(function (item) {
                        return h('span', { key: item, className: 'nk-tag' }, item)
                      })))),
            h('div', { className: 'nk-wb-col nk-wb-aside' },
              h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' },
                  h('div', { className: 'nk-card-title' }, '人物卡'),
                  h('span', { className: 'nk-meta' }, personas.length ? confirmedPersonas + ' / ' + personas.length + ' 已确认' : '未建')),
                personas.length
                  ? personas.slice(0, 8).map(function (persona) {
                      return h('div', { key: persona.id, className: 'nk-kv', style: { alignItems: 'center', gap: 6 } },
                        h('span', { className: 'nk-kv-key', style: { flex: 1, minWidth: 0 } }, persona.name || persona.id),
                        h('span', { className: 'nk-badge' + (persona.status === 'confirmed' ? ' accent' : ' warn') }, persona.status === 'confirmed' ? '已确认' : '待确认'),
                        persona.status !== 'confirmed'
                          ? h('button', { type: 'button', className: 'nk-btn', onClick: function () { confirmPersonaNow(persona) } }, '确认')
                          : null)
                    })
                  : inlineEmpty('还没有人物卡；人物卡由模型提案，作者确认后才进入写作简报。')),
              h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' },
                  h('div', { className: 'nk-card-title' }, '本书已绑定档案'),
                  h('span', { className: 'nk-meta' }, boundProfiles.length ? boundProfiles.length + ' 份' : '未绑定')),
                boundProfiles.length
                  ? boundProfiles.map(function (item) {
                      return h('div', { key: item.id, className: 'nk-kv' },
                        h('span', { className: 'nk-kv-key' }, item.name),
                        h('span', { className: 'nk-kv-val' }, item.status + (item.version ? ' · v' + item.version : '')))
                    })
                  : inlineEmpty('本书未绑定 kit 文风档案。'),
                h('div', { className: 'nk-tiny', style: { marginTop: 8 } }, '绑定 ≠ 已确认 ≠ 本章已采用；旧文风书库不在此列。')),
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
                : null)))
      }

      // ── 同人页：canon 状态 / 事实与证据 / 人物 / 规则 / 禁忌 / 本章检查 ─────
      function canonPage() {
        const canon = materialData && materialData.canon ? materialData.canon : {}
        const fanficTabs = [['canon', '原著'], ['comic', '漫画'], ['hongguo', '红果'], ['delta', '本作'], ['plot', '剧情'], ['write', '写作']]
        const fanficTabBar = h('div', { className: 'nk-tabs', style: { marginBottom: 10 } },
          fanficTabs.map(function (item) {
            return h('button', {
              key: item[0], type: 'button', className: 'nk-tab' + (fanficTab === item[0] ? ' active' : ''),
              onClick: function () { setFanficTab(item[0]) },
            }, item[1])
          }))
        const evidence = mediaData && Array.isArray(mediaData.evidence) ? mediaData.evidence : []
        const mediaSources = mediaData && Array.isArray(mediaData.sources) ? mediaData.sources : []
        if (fanficTab !== 'canon') {
          const analysis = analysisData || {}
          const history = data && data.history && Array.isArray(data.history.chapters) ? data.history.chapters : []
          const mediaList = evidence.filter(function (item) {
            if (mediaSourceFilter && item.sourceId !== mediaSourceFilter) return false
            if (fanficTab === 'comic') return String(item.kind || '').includes('page') || String(item.kind || '').includes('panel') || item.page
            if (fanficTab === 'hongguo') return item.timecode || String(item.kind || '').includes('episode')
            return true
          })
          let body
          if (fanficTab === 'comic' || fanficTab === 'hongguo') {
            body = h('section', { className: 'nk-card' },
              h('div', { className: 'nk-card-head' },
                h('div', { className: 'nk-card-title' }, fanficTab === 'comic' ? '漫画证据' : '红果/短剧证据'),
                h('span', { className: 'nk-meta' }, mediaList.length + ' 条')),
              fanficTab === 'hongguo'
                ? h('div', { style: { marginBottom: 10 } },
                    h('div', { className: 'nk-import-row' },
                      h('input', { className: 'nk-input', value: hongguoQuery, placeholder: '搜红果短剧，例如：剧名', onChange: function (event) { setHongguoQuery(event.target.value) }, onKeyDown: function (event) { if (event.key === 'Enter') searchHongguoNow() } }),
                      h('button', { type: 'button', className: 'nk-btn primary', disabled: hongguoBusy || !hongguoQuery.trim(), onClick: searchHongguoNow }, hongguoBusy ? '…' : '搜索')),
                    hongguoResults
                      ? h('div', { style: { marginTop: 8 } },
                          hongguoResults.length
                            ? hongguoResults.slice(0, 12).map(function (item, index) {
                                const title = item.title || item.name || item.seriesName || item.seriesId || item.id || ('结果 ' + (index + 1))
                                return h('button', { key: index, type: 'button', className: 'nk-kv nk-rowbtn', onClick: function () { openHongguoSeries(item) } },
                                  h('span', { className: 'nk-kv-key' }, title),
                                  h('span', { className: 'nk-kv-val' }, item.desc || item.author || item.seriesId || ''))
                              })
                            : inlineEmpty('没有搜到结果；检查剧名或网络。'))
                      : null,
                    hongguoSeriesData
                      ? h('div', { style: { marginTop: 8 } },
                          h('div', { className: 'nk-tiny' }, '剧集：' + (hongguoSeriesData.series?.title || hongguoSeriesData.series?.name || hongguoSeriesData.id)),
                          hongguoEpisodesData && hongguoEpisodesData.length
                            ? hongguoEpisodesData.slice(0, 20).map(function (episode, index) {
                                const title = episode.title || episode.name || ('第 ' + (index + 1) + ' 集')
                                return h('button', { key: index, type: 'button', className: 'nk-kv nk-rowbtn', onClick: function () { openHongguoEpisode(episode) } },
                                  h('span', { className: 'nk-kv-key' }, title),
                                  h('span', { className: 'nk-kv-val' }, episode.duration ? String(episode.duration) : '看弹幕'))
                              })
                            : inlineEmpty('没有读到剧集。'))
                      : null,
                    hongguoDanmakuData && hongguoDanmakuData.length
                      ? h('div', { className: 'nk-quote', style: { marginTop: 8, maxHeight: 180, overflowY: 'auto' } },
                          hongguoDanmakuData.slice(0, 40).map(function (item, index) {
                            return h('div', { key: index, className: 'nk-tiny' }, (item.time != null ? item.time + 's · ' : '') + (item.text || item.content || ''))
                          }))
                      : null)
                : null,
              mediaEvidenceOpen
                ? h('div', { style: { marginBottom: 8 } },
                    h('div', { className: 'nk-h3' }, '证据详情'),
                    h('div', { className: 'nk-kv' }, h('span', { className: 'nk-kv-key' }, '状态'), h('span', { className: 'nk-kv-val' }, mediaEvidenceOpen.status || 'unverified')),
                    h('div', { className: 'nk-kv' }, h('span', { className: 'nk-kv-key' }, '类型'), h('span', { className: 'nk-kv-val' }, mediaEvidenceOpen.kind || '证据')),
                    h('div', { className: 'nk-kv' }, h('span', { className: 'nk-kv-key' }, '位置'), h('span', { className: 'nk-kv-val' }, mediaEvidenceOpen.page ? 'p' + mediaEvidenceOpen.page : mediaEvidenceOpen.timecode || '—')),
                    mediaEvidenceOpen.quote ? h('div', { className: 'nk-quote', style: { marginTop: 6 } }, mediaEvidenceOpen.quote) : null,
                    h('div', { className: 'nk-option-foot', style: { marginTop: 6 } },
                      h('button', { type: 'button', className: 'nk-btn primary', onClick: function () { reviewMediaNow(mediaEvidenceOpen, 'confirmed') } }, '确认'),
                      h('button', { type: 'button', className: 'nk-btn', onClick: function () { reviewMediaNow(mediaEvidenceOpen, 'rejected') } }, '拒绝'),
                      h('button', { type: 'button', className: 'nk-btn', onClick: function () { setMediaEvidenceOpen(null) } }, '收起')))
                : null,
              comicReader
                ? h('div', { style: { marginBottom: 10 } },
                    h('div', { className: 'nk-card-head' },
                      h('div', { className: 'nk-card-title' }, '漫画阅读 · ' + comicReader.title),
                      h('button', { type: 'button', className: 'nk-btn', style: { marginLeft: 'auto' }, onClick: function () { setComicReader(null) } }, '收起')),
                    h('div', { className: 'nk-import-row' },
                      h('select', {
                        className: 'nk-input', style: { maxWidth: 160 }, value: String(comicReader.index),
                        onChange: function (event) { loadComicPage(Number(event.target.value)) },
                      }, comicReader.pages.map(function (page) { return h('option', { key: page.index, value: String(page.index) }, '第 ' + (page.index + 1) + ' 页') })),
                      h('button', { type: 'button', className: 'nk-btn', disabled: comicReader.busy, onClick: function () { ocrComicPageNow() } }, comicReader.busy ? 'OCR…' : 'OCR 本页')),
                    comicReader.image && comicReader.image.base64
                      ? h('img', { alt: '漫画页', src: 'data:' + comicReader.image.mime + ';base64,' + comicReader.image.base64, style: { maxWidth: '100%', maxHeight: 360, objectFit: 'contain', marginTop: 8, borderRadius: 8 } })
                      : null,
                    comicReader.text
                      ? h('div', { className: 'nk-quote', style: { marginTop: 8, whiteSpace: 'pre-wrap', maxHeight: 220, overflowY: 'auto' } }, comicReader.text)
                      : null)
                : null,
              mediaSources.length
                ? h('div', { style: { marginBottom: 8 } }, mediaSources.slice(0, 10).map(function (source) {
                    return h('div', { key: source.id, className: 'nk-kv' },
                      h('button', {
                        type: 'button', className: 'nk-btn' + (mediaSourceFilter === source.id ? ' primary' : ''),
                        onClick: function () { setMediaSourceFilter(mediaSourceFilter === source.id ? null : source.id) },
                      }, (source.type || '来源') + ' · ' + (source.title || source.id)),
                      h('span', { className: 'nk-kv-val' }, (source.claimType || 'unknown') + ' · ' + (source.visibility || 'unknown')),
                      source.file ? h('button', { type: 'button', className: 'nk-btn', onClick: function () { openComicSource(source) } }, '阅读') : null)
                  }).concat(mediaSourceFilter ? [h('button', { key: 'clear-source', type: 'button', className: 'nk-btn', style: { marginTop: 4 }, onClick: function () { setMediaSourceFilter(null) } }, '显示全部来源')] : []))
                : null,
              mediaList.length
                ? mediaList.map(function (item) {
                    return h('div', { key: item.id, className: 'nk-kv', style: { alignItems: 'center', gap: 6 } },
                      h('span', { className: 'nk-kv-key', style: { flex: 1, minWidth: 0 } }, (item.kind || '证据') + (item.page ? ' · p' + item.page : '') + (item.timecode ? ' · ' + item.timecode : '') + (item.quote ? ' · ' + String(item.quote).slice(0, 16) : '')),
                      h('span', { className: 'nk-badge' + (item.status === 'confirmed' ? ' accent' : item.status === 'rejected' ? ' warn' : '') }, item.status || 'unverified'),
                      h('button', { type: 'button', className: 'nk-btn', onClick: function () { setMediaEvidenceOpen(item) } }, '详情'),
                      item.status !== 'confirmed' ? h('button', { type: 'button', className: 'nk-btn', onClick: function () { reviewMediaNow(item, 'confirmed') } }, '确认') : null,
                      item.status !== 'rejected' ? h('button', { type: 'button', className: 'nk-btn', onClick: function () { reviewMediaNow(item, 'rejected') } }, '拒绝') : null)
                  })
                : inlineEmpty(fanficTab === 'comic' ? '还没有漫画证据；导入漫画源后在这里审阅页面/分格。' : '还没有红果/短剧证据；导入来源后在这里审阅集数/时间码。'))
          } else if (fanficTab === 'delta') {
            const pendingChanges = canonQueue && Array.isArray(canonQueue.pending) ? canonQueue.pending : []
            const acceptedChanges = canonQueue && Array.isArray(canonQueue.accepted) ? canonQueue.accepted : []
            const appliedChanges = canonQueue && Array.isArray(canonQueue.applied) ? canonQueue.applied : []
            const reviewFields = reviewChange && reviewChange.after && typeof reviewChange.after === 'object'
              ? Object.keys(reviewChange.after).slice(0, 12).map(function (key) {
                  const before = reviewChange.before && typeof reviewChange.before === 'object' ? reviewChange.before[key] : undefined
                  const after = reviewChange.after[key]
                  return { key, before, after, changed: JSON.stringify(before) !== JSON.stringify(after) }
                }).filter(function (item) { return item.changed })
              : []
            body = h('div', { className: 'nk-wb-col', style: { gap: 12 } },
              reviewChange
                ? h('section', { className: 'nk-card' },
                    h('div', { className: 'nk-card-head' },
                      h('div', { className: 'nk-card-title' }, '审阅详情'),
                      h('button', { type: 'button', className: 'nk-btn', style: { marginLeft: 'auto' }, onClick: function () { setReviewChange(null) } }, '收起')),
                    h('div', { className: 'nk-kv' }, h('span', { className: 'nk-kv-key' }, '类型'), h('span', { className: 'nk-kv-val' }, reviewChange.kind || '变更')),
                    h('div', { className: 'nk-kv' }, h('span', { className: 'nk-kv-key' }, '摘要'), h('span', { className: 'nk-kv-val' }, reviewChange.summary || reviewChange.title || reviewChange.changeId)),
                    h('div', { className: 'nk-kv' }, h('span', { className: 'nk-kv-key' }, 'changeId'), h('span', { className: 'nk-kv-val' }, String(reviewChange.changeId || '').slice(0, 20))),
                    reviewFields.length
                      ? h('div', { style: { marginTop: 6 } }, reviewFields.map(function (field) {
                          return h('div', { key: field.key, className: 'nk-tiny' },
                            field.key + '：' + String(JSON.stringify(field.before) ?? '').slice(0, 40) + ' → ' + String(JSON.stringify(field.after) ?? '').slice(0, 40))
                        }))
                      : null,
                    reviewChange.after || reviewChange.before || reviewChange.payload
                      ? h('pre', { className: 'nk-quote', style: { maxHeight: 220, overflow: 'auto', fontSize: 11 } }, JSON.stringify(reviewChange.after || reviewChange.before || reviewChange.payload, null, 2))
                      : null,
                    h('div', { className: 'nk-option-foot', style: { marginTop: 8 } },
                      h('button', { type: 'button', className: 'nk-btn primary', disabled: canonQueueBusy, onClick: function () { reviewCanonChangeNow(reviewChange.changeId, 'accepted', reviewChange.changeHash); setReviewChange(null) } }, '接受'),
                      h('button', { type: 'button', className: 'nk-btn', disabled: canonQueueBusy, onClick: function () { reviewCanonChangeNow(reviewChange.changeId, 'rejected', reviewChange.changeHash); setReviewChange(null) } }, '拒绝')))
                : null,
              h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' },
                  h('div', { className: 'nk-card-title' }, '审阅队列'),
                  h('span', { className: 'nk-meta' }, canonQueue && canonQueue.available ? '待审 ' + pendingChanges.length + ' · 待应用 ' + acceptedChanges.length : '未就绪')),
                !canonQueue || !canonQueue.available
                  ? inlineEmpty((canonQueue && canonQueue.message) || '读不到审阅队列。')
                  : h('div', null,
                      pendingChanges.length
                        ? pendingChanges.slice(0, 20).map(function (item) {
                            return h('div', { key: item.changeId, className: 'nk-kv', style: { alignItems: 'center', gap: 6 } },
                              h('span', { className: 'nk-kv-key', style: { flex: 1, minWidth: 0 } }, (item.kind || '变更') + ' · ' + (item.summary || item.title || item.changeId)),
                              h('button', { type: 'button', className: 'nk-btn', onClick: function () { setReviewChange(item) } }, '详情'),
                              h('button', { type: 'button', className: 'nk-btn', disabled: canonQueueBusy, onClick: function () { reviewCanonChangeNow(item.changeId, 'accepted', item.changeHash) } }, '接受'),
                              h('button', { type: 'button', className: 'nk-btn', disabled: canonQueueBusy, onClick: function () { reviewCanonChangeNow(item.changeId, 'rejected', item.changeHash) } }, '拒绝'))
                          })
                        : inlineEmpty('没有待审变更。'),
                      acceptedChanges.length
                        ? h('button', { type: 'button', className: 'nk-btn primary', style: { marginTop: 8 }, disabled: canonQueueBusy, onClick: function () { applyCanonChangesNow() } }, '应用已接受的 ' + acceptedChanges.length + ' 条')
                        : null)),
              h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' },
                  h('div', { className: 'nk-card-title' }, '已应用变更'),
                  h('span', { className: 'nk-meta' }, appliedChanges.length + ' 条')),
                appliedChanges.length
                  ? appliedChanges.slice(0, 20).map(function (item) {
                      return h('div', { key: item.changeId, className: 'nk-kv' },
                        h('span', { className: 'nk-kv-key' }, item.collection || '变更'),
                        h('span', { className: 'nk-kv-val' }, 'rev ' + (item.appliedRevision ?? '?')))
                    })
                  : inlineEmpty('还没有已应用变更。')),
              h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' }, h('div', { className: 'nk-card-title' }, '冲突审阅'), h('span', { className: 'nk-meta' }, (data && data.conflicts && data.conflicts.items ? data.conflicts.items.length : 0) + ' 条')),
                data && data.conflicts && Array.isArray(data.conflicts.items) && data.conflicts.items.length
                  ? data.conflicts.items.slice(0, 12).map(function (item, index) {
                      return h('div', { key: index, className: 'nk-kv' },
                        h('span', { className: 'nk-kv-key' }, item.kind || '冲突'),
                        h('span', { className: 'nk-kv-val' }, item.message || item.text || ''))
                    })
                  : inlineEmpty('当前没有冲突。')),
              h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' }, h('div', { className: 'nk-card-title' }, '媒体待确认'), h('span', { className: 'nk-meta' }, evidence.filter(function (item) { return item.status !== 'confirmed' && item.status !== 'rejected' }).length + ' 条')),
                evidence.filter(function (item) { return item.status !== 'confirmed' && item.status !== 'rejected' }).length
                  ? evidence.filter(function (item) { return item.status !== 'confirmed' && item.status !== 'rejected' }).slice(0, 12).map(function (item) {
                      return h('div', { key: item.id, className: 'nk-kv' },
                        h('span', { className: 'nk-kv-key' }, (item.quote || item.kind || item.id)),
                        h('button', { type: 'button', className: 'nk-btn', onClick: function () { reviewMediaNow(item, 'confirmed') } }, '确认'),
                        h('button', { type: 'button', className: 'nk-btn', onClick: function () { reviewMediaNow(item, 'rejected') } }, '拒绝'))
                    })
                  : inlineEmpty('媒体证据都已审。')),
              h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' }, h('div', { className: 'nk-card-title' }, '本作 delta'), h('span', { className: 'nk-meta' }, 'kit 原生')),
                h('div', { className: 'nk-kv' }, h('span', { className: 'nk-kv-key' }, '决策'), h('span', { className: 'nk-kv-val' }, (analysis.decisions ? analysis.decisions.total : 0) + ' 条')),
                h('div', { className: 'nk-kv' }, h('span', { className: 'nk-kv-key' }, '记忆卡'), h('span', { className: 'nk-kv-val' }, (analysis.memory ? analysis.memory.cards : 0) + ' 张')),
                h('div', { className: 'nk-kv' }, h('span', { className: 'nk-kv-key' }, '媒体证据'), h('span', { className: 'nk-kv-val' }, (analysis.media ? analysis.media.evidence : 0) + ' 条')),
                h('div', { className: 'nk-tiny', style: { marginTop: 8 } }, '本作审阅以 canon 队列为准；应用后才会进写作依据。')))
          } else if (fanficTab === 'plot') {
            body = h('section', { className: 'nk-card' },
              h('div', { className: 'nk-card-head' }, h('div', { className: 'nk-card-title' }, '剧情'), h('span', { className: 'nk-meta' }, history.length + ' 章')),
              history.length
                ? history.slice(0, 30).map(function (item) {
                    return h('div', { key: item.chapter, className: 'nk-kv' },
                      h('span', { className: 'nk-kv-key' }, 'CH.' + String(item.chapter).padStart(2, '0')),
                      h('span', { className: 'nk-kv-val' }, (item.state || '') + ' · ' + (item.chars || 0) + ' 字'))
                  })
                : inlineEmpty('还没有章节；开章收尾后会出现在这里。'))
          } else {
            body = h('section', { className: 'nk-card' },
              h('div', { className: 'nk-card-head' }, h('div', { className: 'nk-card-title' }, '写作')),
              h('div', { className: 'nk-note' }, session ? '当前会话：第 ' + session.chapter + ' 章 · ' + session.state : '还没有进行中的章节会话。'),
              h('button', { type: 'button', className: 'nk-btn primary', style: { marginTop: 10 }, onClick: function () { setSection('chapter') } }, '去正文页开写'))
          }
          return h('div', { className: 'nk-wb-body' },
            pageHead('同人', '原著、媒体、本作与剧情分开看；写作入口回到正文页。'),
            fanficTabBar,
            body)
        }
        if (!canon.available) {
          return h('div', { className: 'nk-wb-body' },
            pageHead('同人', '导入原著，抽成事实、人物、规则与称呼；每条都要有原文证据。'),
            fanficTabBar,
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
        const describeChange = function (change) {
          const pick = function (value) {
            if (!value) return null
            if (typeof value === 'string') return value
            return String(value.text || value.value || value.name || value.what || value.form || JSON.stringify(value)).slice(0, 40)
          }
          const before = pick(change.before)
          const after = pick(change.after)
          return (change.collection || '?') + ' · ' + (before === null ? '新增' : before) + ' → ' + (after === null ? '删除' : after)
        }
        const secrets = Array.isArray(canon.secrets) ? canon.secrets : []
        const mediaEvidence = mediaData && Array.isArray(mediaData.evidence) ? mediaData.evidence : []
        const addresses = Array.isArray(canon.addresses) ? canon.addresses : []
        const addressTerm = addressFilter.trim().toLowerCase()
        const shownAddresses = addressTerm
          ? addresses.filter(function (row) {
              return String(row.from || '').toLowerCase().includes(addressTerm) || String(row.to || '').toLowerCase().includes(addressTerm)
            })
          : addresses

        const canonChips = [['characters', '人物'], ['factions', '势力'], ['relations', '关系'], ['world', '世界'], ['conflicts', '冲突'], ['source', '原文']]
        const canonChipBar = h('div', { className: 'nk-chipline', style: { margin: '0 0 10px' } },
          canonChips.map(function (item) {
            return h('button', {
              key: item[0], type: 'button', className: 'nk-btn' + (canonChip === item[0] ? ' primary' : ''),
              onClick: function () { setCanonChip(item[0]) },
            }, item[1])
          }))
        const row = function (key, value) {
          return h('div', { key: key + ':' + String(value).slice(0, 20), className: 'nk-kv' },
            h('span', { className: 'nk-kv-key' }, key),
            h('span', { className: 'nk-kv-val' }, value))
        }
        const factionMap = new Map()
        for (const person of characters) {
          const key = person.faction || person.affiliation || person.role || '未分组'
          if (!factionMap.has(key)) factionMap.set(key, [])
          factionMap.get(key).push(person.name || '?')
        }
        const conflictRows = (data && data.conflicts && Array.isArray(data.conflicts.items)) ? data.conflicts.items : []
        const sourceRows = (data && data.history && Array.isArray(data.history.chapters)) ? data.history.chapters : []
        let chipBody
        if (canonChip === 'factions') {
          chipBody = factionMap.size
            ? Array.from(factionMap.entries()).map(function (entry) { return row(entry[0], entry[1].join(' / ')) })
            : [inlineEmpty('canon 没有势力字段；人物卡按身份/阵营分组后会显示在这里。')]
        } else if (canonChip === 'relations') {
          const relationships = Array.isArray(canon.relationships) ? canon.relationships : []
          chipBody = relationships.length
            ? relationships.slice(0, 30).map(function (item, index) { return row((item.from || item.a || '?') + ' → ' + (item.to || item.b || '?'), item.kind || item.text || '') })
            : [inlineEmpty('还没有关系边。')]
        } else if (canonChip === 'world') {
          chipBody = worldRules.length || forbidden.length
            ? worldRules.slice(0, 20).map(function (rule) { return row('规则', rule) }).concat(forbidden.slice(0, 10).map(function (word) { return row('禁忌', word) }))
            : [inlineEmpty('还没有世界规则/禁忌。')]
        } else if (canonChip === 'conflicts') {
          chipBody = conflictRows.length
            ? conflictRows.slice(0, 20).map(function (item) {
                return h('button', {
                  key: item.id || item.kind,
                  type: 'button', className: 'nk-kv nk-rowbtn',
                  onClick: function () { setConflictOpen(item) },
                },
                h('span', { className: 'nk-kv-key' }, item.kind || '冲突'),
                h('span', { className: 'nk-kv-val' }, item.message || item.text || ''))
              })
            : [inlineEmpty('当前没有检测到冲突。')]
          if (conflictOpen) {
            chipBody = chipBody.concat([h('div', { key: 'conflict-detail', className: 'nk-quote', style: { marginTop: 8, whiteSpace: 'pre-wrap' } },
              '冲突详情\n' + JSON.stringify(conflictOpen, null, 2))])
          }
        } else if (canonChip === 'source') {
          chipBody = sourceRows.length
            ? sourceRows.slice(0, 20).map(function (item) {
                return h('div', { key: item.chapter, className: 'nk-kv' },
                  h('span', { className: 'nk-kv-key' }, 'CH.' + String(item.chapter).padStart(2, '0')),
                  h('span', { className: 'nk-kv-val' }, (item.state || '') + ' · ' + (item.chars || 0) + ' 字'),
                  h('button', { type: 'button', className: 'nk-btn', onClick: function () { loadExcerpt(item.chapter) } }, '看原文'))
              })
            : [inlineEmpty('还没有章节记录；导入原著后才有原文可回查。')]
        } else {
          const chosen = characters.filter(function (person) { return person.name === selectedCanonCharacter })[0] || null
          const characterRows = characters.slice(0, 20).map(function (person) {
            return h('button', {
              key: person.name, type: 'button', className: 'nk-kv nk-rowbtn' + (selectedCanonCharacter === person.name ? ' active' : ''),
              onClick: function () { setSelectedCanonCharacter(selectedCanonCharacter === person.name ? null : person.name) },
            },
            h('span', { className: 'nk-kv-key' }, person.name || '?'),
            h('span', { className: 'nk-kv-val' }, (person.aliases || []).join(' / ') || person.role || ''))
          })
          const related = chosen
            ? (Array.isArray(canon.relationships) ? canon.relationships : []).filter(function (rel) { return rel.from === chosen.name || rel.to === chosen.name })
            : []
          const relatedSecrets = chosen
            ? secrets.filter(function (secret) {
                const who = [].concat(secret?.characters || [], secret?.knows || [], secret?.who || [], secret?.knownBy || []).map(String)
                return who.includes(chosen.name) || who.includes(chosen.name + '')
              })
            : []
          const relatedAddresses = chosen
            ? addresses.filter(function (address) { return address.from === chosen.name || address.to === chosen.name })
            : []
          const allCharacterNames = characters.map(function (person) { return String(person.name || '') }).filter(Boolean)
          const currentChapter = session && Number.isFinite(Number(session.chapter)) ? Number(session.chapter) : null
          const knowledgeMatrix = secrets.length
            ? h('div', { className: 'nk-card', style: { marginTop: 8, background: 'transparent', boxShadow: 'none', padding: 0 } },
                h('div', { className: 'nk-h3' }, '知情矩阵'),
                secrets.slice(0, 10).map(function (secret, index) {
                  const knownBy = (Array.isArray(secret.knownBy) ? secret.knownBy : []).map(String)
                  const publicAt = Number(secret.publicAtChapter)
                  const isPublic = Number.isFinite(publicAt) && publicAt > 0 && currentChapter !== null && currentChapter >= publicAt
                  const knownThis = isPublic ? allCharacterNames : knownBy
                  const unknownThis = allCharacterNames.filter(function (name) { return !knownThis.includes(name) })
                  return h('div', { key: 'matrix-' + index, className: 'nk-tiny', style: { lineHeight: 1.8 } },
                    '· ' + (secret.what || '') + (isPublic ? '（第 ' + publicAt + ' 章起公开）' : publicAt ? '（第 ' + publicAt + ' 章前未公开）' : '') + '：知 ' + (knownThis.join(' / ') || '无') + '；不知 ' + (unknownThis.slice(0, 8).join(' / ') || '无'))
                }))
            : null
          const characterDetail = chosen
            ? h('div', { className: 'nk-card', style: { marginTop: 8, background: 'transparent', boxShadow: 'none', padding: 0 } },                h('div', { className: 'nk-h3' }, chosen.name + (chosen.role ? ' · ' + chosen.role : '')),
                h('div', { className: 'nk-tiny' }, '别名：' + ((chosen.aliases || []).join(' / ') || '无')),
                related.length
                  ? h('div', { style: { marginTop: 6 } }, related.slice(0, 8).map(function (rel, index) {
                      return h('div', { key: index, className: 'nk-tiny' }, '关系：' + (rel.from || '?') + ' → ' + (rel.to || '?') + (rel.kind ? ' · ' + rel.kind : ''))
                    }))
                  : null,
                relatedSecrets.length
                  ? h('div', { style: { marginTop: 6 } }, relatedSecrets.slice(0, 8).map(function (secret, index) {
                      return h('div', { key: 'secret-' + index, className: 'nk-tiny' }, '秘密：' + (secret.what || secret.text || '') + (Array.isArray(secret.knownBy) && secret.knownBy.length ? ' · 知：' + secret.knownBy.slice(0, 8).join(' / ') : ''))
                    }))
                  : null,
                relatedAddresses.length
                  ? h('div', { style: { marginTop: 6 } }, relatedAddresses.slice(0, 8).map(function (address, index) {
                      return h('div', { key: 'address-' + index, className: 'nk-tiny' }, '称呼：' + (address.from || '?') + ' → ' + (address.to || '?') + ' · ' + (address.publicForm || address.form || ''))
                    }))
                  : null,
                Array.isArray(chosen.evidence) && chosen.evidence.length
                  ? h('div', { style: { marginTop: 6 } }, chosen.evidence.slice(0, 8).map(function (ev, index) {
                      return h('div', { key: index, className: 'nk-quote' }, (ev.chapter ? 'CH.' + ev.chapter + ' · ' : '') + (ev.quote || ev.text || ''))
                    }))
                  : inlineEmpty('这个人物没有带证据。'))
            : null
          chipBody = characterRows
            .concat(facts.slice(0, 10).map(function (fact) { return row(fact.entity || fact.subject || '事实', fact.key ? fact.key + '：' + fact.value : fact.value || '') }))
            .concat(addresses.slice(0, 10).map(function (address) { return row((address.from || '?') + ' → ' + (address.to || '?'), address.publicForm || address.form || '') }))
            .concat(secrets.slice(0, 8).map(function (secret) {
              const knownBy = Array.isArray(secret?.knownBy) ? secret.knownBy : []
              return row('秘密', (secret.what || '') + (knownBy.length ? ' · 知：' + knownBy.slice(0, 6).join(' / ') : ' · 知情未记录'))
            }))
            .concat(characterDetail ? [characterDetail] : [])
            .concat(knowledgeMatrix ? [knowledgeMatrix] : [])
          if (!characters.length && !facts.length && !secrets.length && !addresses.length) chipBody = [inlineEmpty('还没有人物与事实。')]
        }

        return h('div', { className: 'nk-wb-body' },
          pageHead('同人', '原著事实与禁忌决定这一本能不能写；先逐条审阅候选，应用后才会进写作依据。',
            h('span', { className: 'nk-meta' }, canon.canonReady ? '生效 canon 已确认' : '生效 canon 未确认')),
          importPanel('canon'),
          fanficTabBar,
          h('div', { className: 'nk-stats', style: { marginTop: 14 } },
            pageStat('事实', facts.length),
            pageStat('人物', characters.length),
            pageStat('世界规则', worldRules.length),
            pageStat('canon 状态', canon.canonReady ? '已确认' : (canon.contractStatus || '待抽取'), canon.canonReady ? '' : 'warn')),
          canonMessage ? h('div', { className: 'nk-tiny', style: { margin: '10px 0' } }, canonMessage) : null,
          canonChipBar,
          h('section', { className: 'nk-card', style: { marginBottom: 10 } },
            h('div', { className: 'nk-card-head' },
              h('div', { className: 'nk-card-title' }, canonChips.filter(function (item) { return item[0] === canonChip })[0][1]),
              h('span', { className: 'nk-meta' }, '原著 · ' + (canon.canonReady ? '已确认' : '待确认'))),
            chipBody),
          h('div', { className: 'nk-wb-grid', style: { display: 'none' } },
            h('div', { className: 'nk-wb-col' },
              h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' },
                  h('div', { className: 'nk-card-title' }, '待审阅队列'),
                  h('span', { className: 'nk-meta' }, canonQueue && canonQueue.available
                    ? '生效 v' + canonQueue.contractRevision + ' · 待审 ' + (canonQueue.pending || []).length + ' · 已接受待应用 ' + (canonQueue.accepted || []).length
                    : '未就绪')),
                !canonQueue || !canonQueue.available
                  ? inlineEmpty((canonQueue && canonQueue.message) || '读不到审阅队列。')
                  : h('div', null,
                      (canonQueue.pending || []).length === 0
                        ? inlineEmpty('没有待审的候选。模型提出版本变更后会先落到这里。')
                        : (canonQueue.pending || []).slice(0, 8).map(function (change) {
                            return h('div', { key: change.changeId, className: 'nk-kv', style: { alignItems: 'center', gap: 8 } },
                              h('span', { className: 'nk-kv-key', style: { flex: 1, minWidth: 0 } }, describeChange(change)),
                              h('button', {
                                type: 'button', className: 'nk-btn primary', disabled: canonQueueBusy,
                                onClick: function () { reviewCanonChangeNow(change.changeId, 'accepted', change.changeHash) },
                              }, '接受'),
                              h('button', {
                                type: 'button', className: 'nk-btn', disabled: canonQueueBusy,
                                onClick: function () { reviewCanonChangeNow(change.changeId, 'rejected', change.changeHash) },
                              }, '拒绝'))
                          }),
                      (canonQueue.accepted || []).length
                        ? h('div', { style: { marginTop: 10, paddingTop: 10, borderTop: '1px solid ' + c.border } },
                            h('div', { className: 'nk-tiny', style: { marginBottom: 6 } }, '已接受、等应用（应用后才会进上下文）'),
                            (canonQueue.accepted || []).map(function (change) {
                              return h('div', { key: change.changeId, className: 'nk-tiny', style: { lineHeight: 1.7 } }, '· ' + describeChange(change))
                            }),
                            h('button', {
                              type: 'button', className: 'nk-btn primary', style: { marginTop: 8 }, disabled: canonQueueBusy,
                              onClick: function () { applyCanonChangesNow() },
                            }, canonQueueBusy ? '应用中…' : '应用 ' + (canonQueue.accepted || []).length + ' 条已接受'))
                        : null,
                      (canonQueue.rejected || []).length
                        ? h('div', { className: 'nk-tiny', style: { marginTop: 8 } }, '已拒绝 ' + (canonQueue.rejected || []).length + ' 条（不会进入上下文）')
                        : null)),
              h('section', { className: 'nk-card flush' },
                h('div', { className: 'nk-card-head', style: { padding: '14px 14px 0' } },
                  h('div', { className: 'nk-card-title' }, '原著事实'),
                  h('span', { className: 'nk-meta' }, facts.length + ' 条')),
                facts.length
                  ? facts.slice(0, 20).map(function (fact, index) {
                      return h('div', { key: index, className: 'nk-rowbtn', style: { cursor: 'default', flexDirection: 'column', alignItems: 'stretch', gap: 4 } },
                        h('div', { style: { display: 'flex', gap: 8, alignItems: 'baseline' } },
                          h('span', { className: 'nk-badge' }, fact.chapter ? 'CH.' + String(fact.chapter).padStart(2, '0') : '原著'),
                          h('span', { className: 'nk-rowbtn-title', style: { whiteSpace: 'normal' } }, (fact.subject || '') + ' · ' + (fact.key || '') + '：' + (fact.value || '')),
                          fact.chapter
                            ? h('button', {
                                type: 'button', className: 'nk-btn', style: { flexShrink: 0 },
                                onClick: function () { loadExcerpt(fact.chapter) },
                              }, '看原文')
                            : null),
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
                h('div', { className: 'nk-card-head' }, h('div', { className: 'nk-card-title' }, '人物与别名')),
                characters.length
                  ? characters.slice(0, 20).map(function (person, index) {
                      return h('div', { key: index, className: 'nk-kv' },
                        h('span', { className: 'nk-kv-key' }, person.name || '?'),
                        h('span', { className: 'nk-kv-val' }, (person.aliases || []).join(' / ') || person.role || ''))
                    })
                  : inlineEmpty('还没有人物。')),
              h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' },
                  h('div', { className: 'nk-card-title' }, '对话称呼速查'),
                  h('span', { className: 'nk-meta' }, addresses.length ? addresses.length + ' 条' : '未记录')),
                addresses.length
                  ? h('input', {
                      className: 'nk-input', value: addressFilter, placeholder: '按人物名筛选',
                      style: { marginBottom: 8 },
                      onChange: function (event) { setAddressFilter(event.target.value) },
                    })
                  : null,
                addresses.length === 0
                  ? inlineEmpty('尚未记录人物之间的称呼。')
                  : shownAddresses.length === 0
                    ? inlineEmpty('没有匹配的称呼记录。')
                    : shownAddresses.slice(0, 10).map(function (row, index) {
                        return h('div', { key: index, className: 'nk-kv', style: { alignItems: 'flex-start', flexDirection: 'column', gap: 2 } },
                          h('div', { style: { display: 'flex', gap: 6, alignItems: 'baseline', width: '100%' } },
                            h('span', { style: { fontSize: 12.5, fontWeight: 600 } }, (row.from || '?') + ' → ' + (row.to || '?')),
                            row.fromChapter ? h('span', { className: 'nk-badge', style: { marginLeft: 'auto' } }, '起始章 ' + row.fromChapter) : null),
                          h('div', { className: 'nk-tiny' },
                            '公开「' + (row.publicForm || row.form || '—') + '」 · 私下「' + (row.privateForm || row.form || '—') + '」'))
                      })),
              h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' },
                  h('div', { className: 'nk-card-title' }, '秘密'),
                  h('span', { className: 'nk-meta' }, secrets.length + ' 条')),
                secrets.length
                  ? secrets.slice(0, 8).map(function (item, index) {
                      return h('div', { key: index, className: 'nk-kv' },
                        h('span', { className: 'nk-kv-key' }, item.publicAtChapter ? '第 ' + item.publicAtChapter + ' 章公开' : '未定公开'),
                        h('span', { className: 'nk-kv-val' }, item.what || ''))
                    })
                  : inlineEmpty('还没有秘密条目。')),
              h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' },
                  h('div', { className: 'nk-card-title' }, '媒体证据'),
                  h('span', { className: 'nk-meta' }, mediaEvidence.length ? mediaEvidence.length + ' 条' : '无')),
                mediaEvidence.length
                  ? mediaEvidence.slice(0, 8).map(function (item) {
                      return h('div', { key: item.id, className: 'nk-kv', style: { alignItems: 'center', gap: 6 } },
                        h('span', { className: 'nk-kv-key', style: { flex: 1, minWidth: 0 } },
                          (item.kind || '证据') + (item.claimType ? ' · ' + item.claimType : '') + (item.page ? ' · p' + item.page : '') + (item.quote ? ' · ' + String(item.quote).slice(0, 16) : '')),
                        h('span', { className: 'nk-badge' + (item.status === 'confirmed' ? ' accent' : item.status === 'rejected' ? ' warn' : '') }, item.status || 'unverified'),
                        item.status !== 'confirmed'
                          ? h('button', { type: 'button', className: 'nk-btn', onClick: function () { reviewMediaNow(item, 'confirmed') } }, '确认')
                          : null,
                        item.status !== 'rejected'
                          ? h('button', { type: 'button', className: 'nk-btn', onClick: function () { reviewMediaNow(item, 'rejected') } }, '拒绝')
                          : null)
                    })
                  : inlineEmpty('没有媒体证据；旧同人项目的 media.json 会在继承导入时进入这里。')),
              h('section', { className: 'nk-card' },
                h('div', { className: 'nk-card-head' }, h('div', { className: 'nk-card-title' }, '本章检查')),
                findings.length
                  ? findings.slice(0, 8).map(function (item, index) {
                      return h('div', { key: index, className: 'nk-kv' },
                        h('span', { className: 'nk-kv-key' }, item.severity || 'info'),
                        h('span', { className: 'nk-kv-val' }, item.message || ''))
                    })
                  : inlineEmpty('本章还没有检查结果；写完正文再收尾会跑一遍。')),
              excerpt
                ? h('section', { className: 'nk-card' },
                    h('div', { className: 'nk-card-head' },
                      h('div', { className: 'nk-card-title' }, '原文 · 第 ' + excerpt.chapter + ' 章'),
                      h('button', { type: 'button', className: 'nk-btn', style: { marginLeft: 'auto' }, onClick: function () { setExcerpt(null) } }, '收起')),
                    h('div', { className: 'nk-quote', style: { maxHeight: 260, overflowY: 'auto', whiteSpace: 'pre-wrap' } }, excerpt.text || '（这一章读回来是空的）'),
                    excerpt.truncated ? h('div', { className: 'nk-tiny', style: { marginTop: 6 } }, '只显示前 900 字。') : null)
                : null)))
      }

      function dataView() {
        if (!materialData) {
          return h('div', { className: 'nk-wb-body' },
            pageHead('资料与设置', '来源库、本章依据、操作日志，以及总开关与模式。'),
            h('div', { className: 'nk-skeleton', style: { height: 160 } }))
        }
        const style = materialData.style || {}
        const canon = materialData.canon || {}
        const sources = sourcesData && Array.isArray(sourcesData.sources) ? sourcesData.sources : []
        const operations = operationsData && Array.isArray(operationsData.items) ? operationsData.items : []
        const profiles = Array.isArray(style.kitProfiles) ? style.kitProfiles : []
        const contexts = (previewData && Array.isArray(previewData.segments)) ? previewData.segments : ((data && data.contexts) || [])
        const totalChars = contexts.reduce(function (sum, segment) { return sum + Math.max(0, segment.chars || 0) }, 0) || 1
        const palette = ['#b5432d', '#3f5f8a', '#2f6a5a', '#a87322']

        const block = function (title, meta, children) {
          return h('section', { className: 'nk-card' },
            h('div', { className: 'nk-card-head' },
              h('div', { className: 'nk-card-title' }, title),
              meta ? h('span', { className: 'nk-meta' }, meta) : null),
            children)
        }
        const kv = function (key, value, color) {
          return h('div', { className: 'nk-kv' },
            h('span', { className: 'nk-kv-key' }, key),
            h('span', { className: 'nk-kv-val', style: color ? { color } : undefined }, value))
        }

        const sourceRows = sources.length
          ? sources.slice(0, 8).map(function (item) {
              return kv(item.title || item.filename || String(item.sourceId).slice(0, 10),
                (item.chapterCount || 0) + ' 章 · ' + fmtNum(item.chars || 0) + ' 字')
            })
          : [inlineEmpty('还没有导入过原文。风格与同人页的导入都会在这里留一份来源。')]

        const bars = h('div', { className: 'nk-ebar', style: { marginBottom: 10 } }, contexts.map(function (segment, index) {
          return h('i', {
            key: 'bar-' + (segment.component || index),
            style: { width: (Math.max(1, segment.chars || 1) / totalChars * 100) + '%', background: palette[index % palette.length], opacity: segment.available ? 1 : .25 },
          })
        }))
        const contextRows = contexts.length
          ? [bars].concat(contexts.map(function (segment) {
              return kv(segment.component, segment.available
                ? fmtNum(segment.chars || 0) + '/' + (segment.budgetChars ? fmtNum(segment.budgetChars) : '?') + ' · rev ' + (segment.revision ?? '-')
                : '未接入')
            }))
          : [inlineEmpty('还没有装配依据。开章后这里显示四段字数与预算。')]

        const operationRows = operations.length
          ? operations.slice(0, 10).map(function (operation) {
              const color = operation.status === 'failed' ? c.error : operation.status === 'completed' ? c.success : c.warning
              return kv((operation.command || operation.operationId) + (operation.targetRef && operation.targetRef.book ? ' · ' + operation.targetRef.book : ''),
                operation.status + (operation.attempts > 1 ? ' ×' + operation.attempts : ''), color)
            })
          : [inlineEmpty('还没有操作记录。作者命令（拍板 / 保存 / 导入 / 确认）都会留一条。')]

        const profileRows = profiles.length
          ? profiles.slice(0, 6).map(function (profile) {
              return kv((profile.name || profile.id) + ' · ' + (profile.status === 'confirmed' ? '已确认' : '待确认'), (profile.rules ?? 0) + ' 条规则')
            })
          : [inlineEmpty('还没有文风档案；去「风格」页导入一本作品。')]

        const canonRows = canon.available
          ? [kv('原著', canon.title || canon.id || '—'),
             kv('事实 / 人物 / 规则', String((canon.facts || []).length) + ' / ' + String((canon.characters || []).length) + ' / ' + String((canon.worldRules || []).length)),
             kv('状态', canon.canonReady ? '已确认' : (canon.contractStatus || '待抽取'))]
          : [inlineEmpty('还没有绑定原著；去「同人」页导入。')]

        const issues = (data && Array.isArray(data.issues)) ? data.issues : []
        // 依据版本对照：只比同一套来源体系的账本 revision，不据此判定「本章失效」。
        const currentLedgers = (data && data.ledgers) || {}
        const versionRows = contexts.map(function (segment) {
          const ledger = currentLedgers[segment.component] || null
          const adoptedRevision = segment.revision
          const currentRevision = ledger ? ledger.revision : null
          let verdict = '当前无此账本'
          if (ledger && adoptedRevision !== null && adoptedRevision !== undefined && currentRevision !== null) {
            verdict = String(adoptedRevision) === String(currentRevision) ? '版本号相同' : '资料有更新'
          }
          return kv(segment.component,
            '开章 rev ' + (adoptedRevision ?? '—') + ' → 当前 rev ' + (currentRevision ?? '—') + ' · ' + verdict,
            verdict === '资料有更新' ? c.warning : undefined)
        })
        const versionBlock = contexts.length
          ? versionRows.concat([h('div', { className: 'nk-tiny', style: { marginTop: 8 } },
              '版本号不同只说明资料改过，不等于本章失效；要看最新装配请点「预览依据」。')])
          : [inlineEmpty('开章后，这里会比较本章采用的依据与当前资料。')]
        const issueRows = issues.length
          ? issues.slice(0, 8).map(function (issue, index) {
              return kv((issue.component || '?') + ' · ' + (issue.code || 'issue'), issue.message || '', c.warning)
            })
          : [inlineEmpty('账本读得完，没有诊断问题。')]
        const analysis = analysisData || {}
        const analysisRows = analysis.ok === false
          ? [inlineEmpty(analysis.message || '全书分析不可用。')]
          : [
              kv('决策', (analysis.decisions ? analysis.decisions.total : 0) + ' 条 · gate ' + (analysis.decisions && analysis.decisions.gateOk ? '正常' : '有缺口'), analysis.decisions && analysis.decisions.gateOk ? undefined : c.warning),
              kv('记忆', (analysis.memory ? analysis.memory.cards : 0) + ' 卡 · ' + (analysis.memory ? analysis.memory.archived : 0) + ' 归档'),
              kv('媒体证据', (analysis.media ? analysis.media.evidence : 0) + ' 条 · ' + (analysis.media && analysis.media.byStatus ? (analysis.media.byStatus.confirmed || 0) + ' 已确认' : '0 已确认')),
              kv('人物卡', (analysis.personas ? (analysis.personas.confirmed || 0) + ' / ' + analysis.personas.total : '0 / 0') + ' 已确认'),
              kv('runbook', (analysis.runs ? (analysis.runs.running || 0) + ' 进行 / ' + analysis.runs.total : '0 / 0')),
            ]

        const runs = runsData && Array.isArray(runsData.runs) ? runsData.runs : []
        const runRows = [
          h('div', { className: 'nk-option-foot', style: { marginBottom: 8 } },
            h('button', { type: 'button', className: 'nk-btn', onClick: function () { createRunNow() } }, '新建 run')),
          ...(runs.length
            ? runs.slice(0, 6).map(function (run) {
                return h('div', { key: run.runId, className: 'nk-kv', style: { alignItems: 'center', gap: 6 } },
                  h('span', { className: 'nk-kv-key', style: { flex: 1, minWidth: 0 } }, (run.title || run.runId) + ' · ' + run.steps.length + ' 步'),
                  h('span', { className: 'nk-badge' }, run.status),
                  run.status !== 'completed' && run.status !== 'aborted'
                    ? h('button', { type: 'button', className: 'nk-btn', onClick: function () { updateRunNow(run, 'completed') } }, '完成')
                    : null)
              })
            : [inlineEmpty('还没有 run；新建一个四步 run 记录本章推进。')]),
        ]
        const left = [
          workSettingsCard(),
          h(LegacyImportCard, { remote: remote, sessionId: sessionId, book: book, onDone: function () { load(book) } }),
          block('故事总控 runbook', runs.length ? runs.length + ' 个' : '无', runRows),
          block('来源库', sources.length + ' 份', sourceRows),
          block('本章依据', previewData && previewData.available ? fmtNum(previewData.chars || 0) + ' 字 · ' + previewData.mode : '已装配快照', contextRows),
          block('依据版本对照', '开章时 vs 现在', versionBlock),
          block('操作记录', operations.length + ' 条', operationRows),
        ]
        const right = [
          block('全书分析', analysis.ok === false ? '不可用' : '只读汇总', analysisRows),
          block('文风档案', profiles.length + ' 份', profileRows),
          block('同人 canon', canon.available ? (canon.canonReady ? '已确认' : (canon.contractStatus || '待抽取')) : '未绑定', canonRows),
          block('诊断', issues.length ? issues.length + ' 个问题' : '正常', issueRows),
        ]

        return h('div', { className: 'nk-wb-body' },
          pageHead('资料与设置', '来源库、本章依据、操作日志，以及总开关与模式。',
            h('button', { type: 'button', className: 'nk-btn', onClick: previewContextNow }, previewData ? '重新预览依据' : '预览依据')),
          h('div', { className: 'nk-wb-grid' },
            h('div', { className: 'nk-wb-col' }, left),
            h('div', { className: 'nk-wb-col nk-wb-aside' }, right)))
      }

      // 竖栏红点：有事要处理时才亮，不堆计数文字。
      const sectionDot = {
        beat: pendingIds.length + conflictTotal > 0,
        fanfic: !!(data && data.canon && data.settings && data.settings.mode === 'fanfic' && !data.canon.ready),
        data: !!(data && data.operations && Array.isArray(data.operations.items) && data.operations.items.some((item) => item.status === 'failed')),
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

      const sectionCopy = {
        chapter: ['正文', '还没有作品；先建书，正文页才有章节归属。'],
        beat: ['决策', '还没有作品；先建书，决策账本才有归属。'],
        fade: ['记忆', '还没有作品；先建书，记忆卡才有归属。'],
        voice: ['风格', '还没有作品；先建书，风格页才会出现导入文风入口。'],
        fanfic: ['同人', '还没有作品；先建书，同人页才会出现导入原著入口。'],
        data: ['资料', '还没有作品；先建书后，继承导入/runbook/备份才有目标。'],
      }
      const noBookCopy = sectionCopy[section] || ['小说工作台', '还没有作品；先建一本。']
      const noBookPage = h('div', { className: 'nk-wb-body' },
        pageHead(noBookCopy[0], noBookCopy[1]),
        h('div', { className: 'nk-wb-grid' },
          h('div', { className: 'nk-wb-col' },
            h('section', { className: 'nk-card' },
              h('div', { className: 'nk-card-head' }, h('div', { className: 'nk-card-title' }, '新建作品'), h('span', { className: 'nk-meta' }, 'kit 原生')),
              h('div', { className: 'nk-import-row' },
                h('input', {
                  className: 'nk-input', value: newBookName, placeholder: '作品名，例如：长夜行',
                  onChange: function (event) { setNewBookName(event.target.value) },
                  onKeyDown: function (event) { if (event.key === 'Enter') createBookNow() },
                }),
                h('button', { type: 'button', className: 'nk-btn primary', disabled: workBusy || !newBookName.trim(), onClick: createBookNow }, '新建作品')),
              h('div', { className: 'nk-tiny', style: { marginTop: 8 } }, '建书后本页内容才会出现；五件旧数据可在书桌「继承导入」。'),
              workMessage ? h('div', { className: 'nk-tiny', style: { marginTop: 6, color: c.sub } }, workMessage) : null),
            h('div', { className: 'nk-option-foot', style: { marginTop: 10 } },
              h('button', { type: 'button', className: 'nk-btn', onClick: function () { setSection('desk') } }, '去书桌建书'),
              h('button', { type: 'button', className: 'nk-btn', onClick: function () { setSection('data') } }, '去资料页')),
            section === 'voice'
              ? h('section', { className: 'nk-card', style: { marginTop: 12 } },
                  h('div', { className: 'nk-card-head' }, h('div', { className: 'nk-card-title' }, '导入作品 · 学文笔'), h('span', { className: 'nk-meta' }, '需先建书')),
                  h('div', { className: 'nk-import-row' },
                    h('input', { className: 'nk-input', disabled: true, placeholder: '先建作品，才能把文风绑定到本书' }),
                    h('button', { type: 'button', className: 'nk-btn', disabled: true }, '浏览')),
                  h('div', { className: 'nk-tiny', style: { marginTop: 8 } }, '建书后这里会变成真正的目录选择：导入 → 统计档案 → 确认 → 生成本书简报。'))
              : null,
            section === 'fanfic'
              ? h('section', { className: 'nk-card', style: { marginTop: 12 } },
                  h('div', { className: 'nk-card-head' }, h('div', { className: 'nk-card-title' }, '导入原著 · 建 canon'), h('span', { className: 'nk-meta' }, '需先建书')),
                  h('div', { className: 'nk-import-row' },
                    h('input', { className: 'nk-input', disabled: true, placeholder: '先建作品，才能绑定原著 canon' }),
                    h('button', { type: 'button', className: 'nk-btn', disabled: true }, '浏览')),
                  h('div', { className: 'nk-tiny', style: { marginTop: 8 } }, '建书后这里会变成真正的目录选择：导入 → 抽候选 → 逐条审阅 → 生效。'))
              : null),
          h('div', { className: 'nk-wb-col nk-wb-aside' },
            h('section', { className: 'nk-card' },
              h('div', { className: 'nk-card-head' }, h('div', { className: 'nk-card-title' }, '为什么是空的')),
              h('div', { className: 'nk-tiny', style: { lineHeight: 1.9 } },
                '当前工作区还没有 kit 原生作品。' + '\n' +
                '点击左侧分页不会自动建书，也不会借用旧五件账本。' + '\n' +
                '建书或继承导入后，本页才会显示对应功能。')))))

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
                  ref: draftRef,
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
            (function () {
              const findings = (session && session.verification && Array.isArray(session.verification.findings)) ? session.verification.findings : []
              if (!findings.length) return null
              return h('div', { style: { marginTop: 8, maxHeight: 168, overflowY: 'auto' } },
                h('div', { style: { ...faint, fontSize: 10.5, marginBottom: 4 } }, '本章检查 · ' + findings.length + ' 条'),
                findings.slice(0, 12).map(function (item, index) {
                  const locate = typeof item.at === 'number' && item.at >= 0
                  return h('div', {
                    key: index,
                    style: { display: 'flex', alignItems: 'baseline', gap: 8, padding: '3px 0', borderBottom: '1px dashed ' + c.border },
                  },
                  h('span', {
                    className: 'nk-badge' + (item.severity === 'blocker' ? ' accent' : ' warn'),
                    style: { flexShrink: 0 },
                  }, item.severity === 'blocker' ? 'blocker' : 'warning'),
                  h('span', { style: { flex: 1, minWidth: 0, fontSize: 11.5, color: c.sub, lineHeight: 1.6 } }, item.message || ''),
                  locate
                    ? h('button', {
                        type: 'button', className: 'nk-btn', style: { flexShrink: 0 },
                        onClick: function () { locateFinding(item) },
                      }, '定位')
                    : h('span', { style: { ...faint, fontSize: 10 } }, '全文级'))
                }))
            })(),
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
      return h('div', { className: 'nk-wb nk-tone-' + skinTone },
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
              h('div', { className: 'nk-chipline', title: '底色', style: { flexShrink: 0 } },
                h('span', { className: 'nk-meta', style: { alignSelf: 'center' } }, '底色'),
                [['paper', '纸白'], ['sepia', '米黄'], ['dark', '深色']].map(function (item) {
                  return h('button', {
                    key: item[0], type: 'button', className: 'nk-btn' + (skinTone === item[0] ? ' primary' : ''),
                    title: '底色 · ' + item[1],
                    style: { minWidth: 34, padding: '0 6px' },
                    onClick: function () { setSkinTone(item[0]) },
                  }, item[1])
                })),
              books.length
                ? h('select', {
                    className: 'nk-select',
                    value: book || (data && data.book) || '',
                    onChange: function (event) { requestBookSwitch(event.target.value) },
                    style: { width: 'auto', height: 30, margin: 0, fontSize: 12, padding: '0 8px' },
                  }, books.map((name) => h('option', { key: name, value: name }, name)))
                : null,
              h('button', { type: 'button', className: 'nk-btn', onClick: function () { load() } }, state.phase === 'refreshing' ? '…' : '刷新'))),
          state.error ? h('div', { style: { color: c.error, padding: '8px 22px', fontSize: 12 } }, state.error) : null,
          pendingBook
            ? h('div', { className: 'nk-warnbar' },
                h('span', { className: 'nk-warnbar-text' },
                  '「' + ((book || (data && data.book)) || '当前作品') + '」还有未保存的正文；切到「' + pendingBook + '」前先决定怎么处理。'),
                h('div', { className: 'nk-warnbar-actions' },
                  h('button', {
                    type: 'button', className: 'nk-btn primary',
                    disabled: saveState.phase === 'saving',
                    onClick: function () { saveAndSwitchBook() },
                  }, saveState.phase === 'saving' ? '保存中…' : '保存并切换'),
                  h('button', { type: 'button', className: 'nk-btn', onClick: function () { discardAndSwitchBook() } }, '丢弃并切换'),
                  h('button', { type: 'button', className: 'nk-btn', onClick: function () { setPendingBook(null) } }, '取消')))
            : null,
          !state.data && state.phase === 'loading'
            ? h('div', { className: 'nk-wb-body' },
                h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 } },
                  h('div', { className: 'nk-skeleton', style: { height: 84 } }),
                  h('div', { className: 'nk-skeleton', style: { height: 120 } }),
                  h('div', { className: 'nk-skeleton', style: { height: 200 } })))
            : !(data && (data.book || books.length)) && section === 'desk'
              ? h('div', { className: 'nk-wb-body' },
                  pageHead('开始一本作品', '先建一本自己的书，或把五件旧数据继承进来；建书后风格/同人页才会出现对应导入入口。'),
                  h('div', { className: 'nk-wb-grid' },
                    h('div', { className: 'nk-wb-col' },
                      h('section', { className: 'nk-card' },
                        h('div', { className: 'nk-card-head' },
                          h('div', { className: 'nk-card-title' }, '新建作品'),
                          h('span', { className: 'nk-meta' }, 'kit 原生')),
                        h('div', { className: 'nk-import-row' },
                          h('input', {
                            className: 'nk-input', value: newBookName, placeholder: '作品名，例如：长夜行',
                            onChange: function (event) { setNewBookName(event.target.value) },
                            onKeyDown: function (event) { if (event.key === 'Enter') createBookNow() },
                          }),
                          h('button', { type: 'button', className: 'nk-btn primary', disabled: workBusy || !newBookName.trim(), onClick: createBookNow }, '新建作品')),
                        h('div', { className: 'nk-tiny', style: { marginTop: 8 } },
                          '建书只创建 kit 自己的账本与正文目录，不依赖 beat/fade/voice/fanfic/conductor。'),
                        workMessage ? h('div', { className: 'nk-tiny', style: { marginTop: 6, color: c.sub } }, workMessage) : null),
                      h(LegacyImportCard, { remote: remote, sessionId: sessionId, book: book, onDone: function () { load(book) } }),
                      h('section', { className: 'nk-card' },
                        h('div', { className: 'nk-card-head' }, h('div', { className: 'nk-card-title' }, '建书之后')),
                        h('div', { className: 'nk-tiny', style: { lineHeight: 1.8, whiteSpace: 'pre-line' } },
                          '· 书桌：开章、写正文、收尾。' + '\n' +
                          '· 风格页：导入一本作品学文风，确认档案后可生成写前简报。' + '\n' +
                          '· 同人页：导入原著、抽取 canon，逐条确认后才会进写作依据。' + '\n' +
                          '· 资料页：继承导入、runbook、备份与全书分析。'))),
                    h('div', { className: 'nk-wb-col nk-wb-aside' },
                      h('section', { className: 'nk-card' },
                        h('div', { className: 'nk-card-head' }, h('div', { className: 'nk-card-title' }, '从这里开始')),
                        h('div', { className: 'nk-tiny', style: { lineHeight: 1.9, whiteSpace: 'pre-line' } },
                          '1. 在上方输入作品名，点「新建作品」。' + '\n' +
                          '2. 书桌点「开第 1 章」，在正文页写稿。' + '\n' +
                          '3. 写完后收尾，kit 会沉淀决策、记忆与收据。' + '\n' +
                          '4. 想学文风/写同人，再分别去风格页/同人页导入。')))))
              : !(data && (data.book || books.length))
                ? noBookPage
                : pageView))
    }

    return {
      inject: ['slots', 'remote'],
      async apply(ctx) {
        try {
          if (typeof document !== 'undefined' && !document.getElementById('dsh-novel-kit-ui-css')) {
            const tag = document.createElement('style')
            tag.id = 'dsh-novel-kit-ui-css'
            tag.textContent = NK_SKIN
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


