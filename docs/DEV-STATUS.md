# dsh-novel-kit 0.4.0 开发状态（2026-11-22）

> 版本：`0.4.0`（未发布）｜基线：`0.3.0`｜设计：[v0.4.0 单入口与作者动线](/D:/Novel-gate/docs/小说插件系列-dsh-novel-kit-v0.4.0-单入口与作者动线.md)
> 这一页只写「已经能跑什么、还没做什么、怎么验证」，不替代 README 与 CHANGELOG。

## 0.4.0 这一刀交付了什么

### 一个插件一个界面

- 删除右栏「小说」页签、会话头部「小说 / 工作台」两个按钮，只保留 `conversation.view`「小说工作台」；`client.js` 177 KB → 111 KB。
- 插件名改「小说工作台」（zh）/ `Novel Workbench`（en）。
- 测试锁死：`client.test.mjs` 断言只注册一个 slot，且源码不许残留 `sidebar.right.pane.tab` / `conversation.session.header.utilities` / `function Panel(`。

### 左竖栏七页

- 书桌 / 正文 / 决策 / 记忆 / 风格 / 同人 / 资料，主区只渲染当前页；每页 `pageHead(title, sub, actions)`。
- 有情况才点红点（拍板+冲突 / canon 未确认 / 失败操作）。
- 竖栏底部显示当前作品与「工作区设置」。

### 导入动线进界面

- 风格工作室顶部：目录 → 浏览 `.txt/.md` → 选一本 → `importStyle`；
- 同人顶部：同一套选择器 → `importCanon`；
- 无作品时提示先建书（导入绑定到当前作品）。

### 右栏能力迁移

- 总开关 `setMaster`、模式 `setMode`、新建作品 `createBook` 全部迁到「资料 · 工作区设置」；`/novel legacy` 提示保留。

### 快照验收覆盖七页

- `npm run ui:snapshot` 产出 `wb-{desk,chapter,beat,fade,voice,fanfic,data}-{light,dark}.png`（每页一张，改哪页看哪页）。

### 收件箱与证据回查（0.4.0 后半）

- **`getInbox`**：Host 聚合待拍板 / canon / 冲突 / 阻断检查 / 失败操作，带 `severity`、`blockScope`（拦开章 / 拦收尾）、`target.page`；书桌按它渲染，点一条跳页。
- **`getSourceExcerpt`**：按 `sourceId + 章号` 读回原文切片（offset/length），兼容 kit `sources/` 与旧同人 `source/` 两套布局；同人页事实可「看原文」。
- 测试：`inbox.test.mjs` + `excerpt.test.mjs`，共 **182/182**。

## 0.3.0 这一刀交付了什么

### 界面：从「调试列表」做到「任务卡 + 工作台」

- **NK_SKIN 视觉层**：一套从宿主 alias token 派生的设计 token（暖纸底 / 三级墨色 / 朱砂强调 / 三档圆角），暗亮同源；右栏与工作台共用。
- **右栏重做**：头（印 / 书名 / 刷新）→ 下一笔卡（朱砂竖线，不再整块反色）→ 待处理 → 本章依据（条形 + 2×2 图例）→ 最近章节 → 五本账 → 固定底栏。删掉重复动作与重复书名下拉。
- **工作台重做**：`NOVEL WORKBENCH` 头 + 中文状态胶囊 + 页签条（有情况才点红点）+ 主栏/300px 侧栏网格（<1080px 收单栏）。书桌 = hero 卡 + 四指标 + 章节流程 + 本章场景 + 收件箱 + 最近章节，侧栏 = 写作依据 / 五本账 / 本章检查。
- **其余六域**：根容器换成 `nk-wb-body`，与书桌共用间距与滚动；内部明细行仍是旧 inline 样式（0.3.1 统一）。
- **状态中文化**：`stateLabel()` 覆盖 idle/planning/writing/awaiting_author/checking/committing/completed/blocked。
- **UI 快照验收**：`npm run ui:snapshot` 用最小 React 替身渲染同一份 client.js，数据走真实 Host 远端 + 真实账本，产出四张截图。

### 评审确认的缺陷（已修）

- **切书清稿**：`load(nextBook)` 检测切书 → 清空草稿/版本/保存提示，防止 A 书正文按 B 书版本号写回。
- **未保存保护**：「返回任务卡」有未保存时先变色提醒（未保存 · 再点一次），保存成功自动解除。
- **文档债**：0.2.0 的 `UI-V2.md` 写「四入口」，与七域不一致；0.3.0 设计文档取代其结构描述。

## 1. 这一刀交付了什么

### F1 三层开关

- `$DSH_HOME/profiles/<name>/novel-kit/prefs.json`：profile 级 `master`，**默认关**，跨重启保留。
- `<workspace>/.dsh-novel-kit/projects/<book>/settings.json`：项目级 `mode: original | fanfic`、文风绑定、canon 绑定。
- 会话级 `/novel on|off`；master 关时 `/novel on` 拒绝。
- `/novel master on|off`、`/novel mode original|fanfic <book>`、`/novel status`。
- 工具仍用 `when` 门控（master + session），不热切换注册/注销；remote 写操作额外检查 master。

### F2 双导入口 + 共用 SourceDocument

- `SourceDocument`：`.dsh-novel-kit/sources/<完整 SHA-256>/`，原文/分章/meta/index；同内容重复导入幂等。
- 门 A `importStyle`：确定性 bands/rules/avoid → `sty_*` provisional `StyleProfile`，绑定项目。
- 门 B `importCanon`：原创模式先 `mode-required`（原文暂存、不绑定）；确认后切 `fanfic`、绑定 `activeCanonSourceId`、写 `world.json`（`pending-extraction`）。
- 同一作品双导入：一份原文、两个产物/绑定。

### F3 按模式装配 + 硬预算

- `assembleContext({ mode })`：`original` 不装配 canon（即使调用方误传 fanfic 项目）；`fanfic` 才装配。
- canon 段：优先 kit `WorldContract`（世界规则/人物/秘密/称呼/禁忌），否则兼容旧 fanfic 项目。
- 同人无 canon / 契约未确认：`start` 返回 `canon-required` / `canon-not-ready`。
- 四段 `clip` 改为按预算截断（不再 2 倍），返回 `truncated`；文风段优先 kit StyleProfile，≤600 字。

### 文风影响决策（最小版）

- `planChapter` 返回 `styleHint`；提案选项可带 `styleFit/styleWhy`。
- 插件做轻量规则标注（avoid/taboo/revealPace/restraint），不输出百分比，不替作者选择。
- 决策记录带 `option/proposalId/styleFit/styleWhy/effect:'option-recorded'`。
- `novel_plan` 只允许 propose；模型不能再 `adopt/reject`。

- **kit-only 建书**：`book.create` 作者命令 + `/novel` 面板新建作品；kit 自己创建 `.dsh-novel-beat` / `.dsh-novel-fade` 与项目设置，不依赖旧五件。
- **工作台 v3**：书桌/正文/故事/记忆/风格/同人/资料七个入口；故事含地图/时间线/体检，记忆含卡片/线索/人物，风格含档案/旧书库，同人含原著事实/人物/规则/称呼，书桌含章节流程/runbook；资料含依据与设置。
- **右栏直达工作台**：右上角「工作台」按钮调用 `layout.openRightbar(false,true)` 并嵌入七域工作台；embedded 时「返回任务卡」。
- **决策操作**：故事页可采纳/拒绝提案；已拍板决策可改选，追加「改选」记录并生成重写工单，旧决策保留；`decision.revise` 走作者命令。
- **记忆详情**：卡片可展开三维、原文引文、因/果与人物；支持钉住/遗忘/恢复。
- **同人事实**：`canonView` 输出 facts/worldRules/引文；同人页事实列表带原文和章号。
- **风格详情**：档案可展开看规则/避免词/区间/决策倾向；列表接口带 `ruleTexts`。
- **canon 确认**：同人页显示 contract 状态/rev，可直接确认；走 `canon.confirm` 并刷新。
- **记忆检索**：记忆页可按人物/物品/秘密搜索，命中可点开卡片。
- **记忆漂移**：drift 提示 + 低保真「已褪色」。
- **同人检查**：同人页显示 verification findings（严重度/消息/引文）。
- **场景编排**：书桌「本章场景」可编辑（意图/视角/地点/场景目标/转折），保存走 `plan.save`；文件带 revision，冲突不覆盖；`getPlan` 返回 ≤1200 字 brief。
- **收件箱**：拍板/canon/冲突/failed operation 统一汇总；`getOperations` 只读最近操作，资料页显示状态与 attempts。
- **依据预览**：`previewContext` 现场重算四段，资料页显示字/预算/revision；与 session 已装配快照分开。
- **恢复**：blocked/committing 主行动为「恢复本章」，走 `resumeChapter`；面板与书桌共用同一判断。
- **文风简报**：档案可生成 ≤600 字 brief（`getStyleBrief`），显示在档案展开区。
- **五插件审计**：新增 [FIVE-PLUGIN-PARITY.md](FIVE-PLUGIN-PARITY.md)，逐项对照五件 UI 与能力，列出 kit 缺口。

### 第二刀：作者命令、完整草稿、收尾事务

- **canon 审阅**：新增 `novel_canon` 工具（outline/read/propose）；propose 只进 `pending-review`，作者在面板确认后才 `confirmed`；空契约拒绝确认；面板可编辑事实/人物/规则/禁忌并保存为待审阅。
- **作者命令**：`decision.adopt` / `decision.reject` / `draft.save` / `mode.set` / `import.style` / `import.canon` / `canon.confirm`；`operationId` + 输入 hash 幂等，同键不同输入 `operation-conflict`；模型身份 `author-required`。
- **操作日志**：`.dsh-novel-kit/operations/<operationId>.json`，running → completed/failed，含 attempts/result/receipt；失败可重试。
- **完整草稿**：`readDraft` 不截断；`writeChapter` 带 `expectedVersion`/`expectedDraftHash`，同会话串行化；冲突 `draft-conflict` 不覆盖。
- **收尾事务**：`finish` 把正文文件 + beat 段落 + fade 卡放进同一个事务（`effects` 3 项），不再先写正文再提交账本。
- **右栏任务卡**：默认总开关/模式/导入/下一笔/四段尺/收件箱/最近章节；详细六页签收进「详情」，不再首屏台账。

- **工作台编辑**：完整正文 textarea + 保存（Ctrl S），显示未保存/已保存/冲突；旧宿主无 `getDraft` 时退回只读。

### Codex 第五轮复核后修复

- **finish/write 串行化**：收尾与会话保存共用锁，避免 finish 把保存成功的新稿回退成旧稿。
- **decision 重试**：beat 已落账、会话保存失败时按 proposalId 找回，不重复写 decision。
- **operation 锁**：同 root+operationId 的并发请求串行化，不同输入只成功一个。
- **草稿编辑竞态**：保存期间继续输入，成功后仍保持 dirty；冲突不自动覆盖本地稿，提供「重新载入」。
- **canon 目标/版本**：编辑固定 book/source，切书清缓存；update/confirm 带 contract revision，冲突 `canon-conflict`；已确认 canon 不能被模型 propose 悄悄取消确认。
- **canon 条目有效性**：空白规则、null 事实不通过 ready/confirm；装配与视图对 null 条目容错。
- **事务原文**：commit 只写 after 文本，正文恰好是合法 JSON 时不再被重新序列化。
- **收尾回执恢复**：事务已完成但会话未保存时，从 receipt 补齐 receipt/chapterFile。
- **文风确认**：`style.confirm` 作者命令；面板把 provisional 档案确认成 confirmed，带 revision 校验。


- **启动修复（2026-11-22）**：`package.json` 被写成带 BOM 的 UTF-8；`remote.js` 用 `JSON.parse` 读它，导致 Host remote 导入失败，DSH 中整包不出现。已去 BOM，新增 `test/package.test.mjs` 锁回归，并加 `npm run acceptance:load` 逐段模拟加载。
- **加载模拟验收**：8/8；package 元数据、bundle patch、Host index/tools/remote、client tab/工作台注册。
- **旧账本迁移**：`/novel legacy` 扫描 `.dsh-novel-beat/fade/voice/fanfic/conductor`，为每本书建 kit 项目设置（fanfic 项目 → 同人，否则原创），已有设置跳过；旧账本就地读写。
- **UI v2（2026-11-22）**：右栏重做为品牌头 + 当前作品 + 大号「下一笔」卡 + 依据/收件箱/最近；设置/导入/诊断/六页签收进「设置与详情」；主行动接 `chapter.start`，可真正开章。工作台补作品头、状态胶囊与书桌主行动。
- **文档重写**：README / market-intro / DETAIL / locale 改成 0.2.0 口径，补「先接管、验证、再卸载五件」的迁移建议。


### P0 顺手修复

- `decide` / `memoryAction` 的 action 严格枚举（不再静默回退）。
- 接管记录持久化到 profile 的 `novel-kit/takeover.json`；无记录时 `restore` 拒绝，不默认恢复全部五件。
- 快照冲突扫描统一走 `resolveBinding`，不再用 `project ?? fanfic[0]` 猜。
- native 工具输出补四段上下文（`output.render` 的 `humanize`）。

### Codex 第四轮复核后补的 P1/P2

- **作者拍板不能被 write 绕过**：有 pending 提案时 `writeChapter` 不改状态，`finishChapter` 返回 `awaiting_author`；作者 adopt/reject 完才回 writing。
- **执行时再查开关**：每个工具 `execute` 先 `gate.isOn(exec)`，防止「步骤准入后关 master」仍执行。
- **并发导入**：`mkdtemp` 独占临时目录；同毫秒不同内容不会串。
- **重复导入不覆盖已审核产物**：已有 `StyleProfile` / `WorldContract` 直接复用，保留作者规则/确认状态。
- **canon 就绪收紧**：必须 `status=confirmed` 且至少一条可用约束；legacy 项目先读真实 project/canon，不再把空目录当 canon。
- **facts/relationships/timeline 进世界段**；`isCanonReady` 与编译器使用同一套约束定义。
- **原创隔离**：`useFanfic` 要求当前 `mode==='fanfic'`；原创 finish 不跑旧同人复制/名字检查。
- **切回原创**：`resume` 每次核对当前 mode 并重装配，不返回旧 canon。
- **profile 隔离**：`profileStateDir` 按 `DSH_HOME/profiles/<name>` 隔离 prefs/takeover。
- **接管记录**：`changed:true`（含 restart-required）才记；空记录落盘；客户端检查 `ok/code`，不把 `no-restore-record` 显示成成功。仍欠「先持久化原状态再变更」的完整事务。
- **kit 文风可见**：`getStyle` 用 kit 档案补 `available`；客户端兼容 `{band:[lo,hi]}` 结构。

## 2. 证据

```powershell
cd D:\Novel-gate\dsh-novel-kit
node --test                 # 169/169
npm run acceptance:load     # 8/8
npm run acceptance          # 19/19
npm run acceptance:real     # 11/11
npm run check               # 通过
npm run ui:snapshot         # 四张 UI 快照（light/dark × panel/workbench）
```

新增测试：`settings.test.mjs`、`import-dual.test.mjs`、`context.test.mjs`；`chapter.test.mjs` 增加文风/同人 canon 用例；`takeover.test.mjs` 增加「无记录不默认恢复」。

## 3. 怎么用（开发版）

```powershell
/novel master on
/novel on
/novel mode original 长夜行        # 原创：只学文笔
# 面板顶部「学文笔」导入 txt
/novel mode fanfic 长夜行          # 同人：需要原著
# 面板顶部「写同人」导入原著
```

当前面板是过渡版：顶部有总开关、模式、两个导入口；六页签仍是旧 IA。

## 4. 还没做（按优先级）

1. **canon 逐条接受/证据回查**：结构化编辑已通；还缺逐条接受/拒绝、从原文回查证据、提案与已确认版本 diff。
2. **会话完成结果纳入事务**：正文/beat/fade 已同一事务；会话 `completed` 与收据仍在事务后单独写，故障窗口还在。
3. **文风高阶归纳**：确认链路已通；rules/decisionPolicy/锚句的编辑、锚句遮蔽与按场景检索未做。
4. **完整 UI**：右栏任务卡 + 工作台四入口已落地；还剩视觉打磨、页边批注、统一收件箱处理。
5. **P0 剩余**：接管「原状态」而非只记 disabled；写盘故障注入；面板写操作统一二次确认；冲突页签全量。

## 5. 关键文件

| 文件 | 作用 |
|---|---|
| `index.js` | 工具注册、`when` 门控、`/novel` 命令接线 |
| `lib/host/gate.js` | master + session 门控、持久化 |
| `lib/engine/settings.js` | prefs、项目 settings、绑定 |
| `lib/engine/sources.js` | 共用 SourceDocument |
| `lib/engine/profiles.js` | StyleProfile、brief、decisionHint/annotate |
| `lib/engine/canon.js` | CanonSource/WorldContract、requireCanon |
| `lib/engine/context.js` | 四段装配、mode 隔离、硬预算 |
| `lib/engine/chapter.js` | 章节流程、mode/canon/style 接入、决策记录 |
| `lib/host/remote.js` | 面板读/写、master 检查、双导入、草稿/CANON 作者命令 |
| `lib/engine/operations.js` / `author.js` | operationId 幂等、作者命令入口 |
| `client.js` | 过渡面板（顶部开关/模式/导入）+ 可编辑工作台 |

## 6. 下一刀建议（v0.3.1）

1. **统一收件箱走 Host 聚合**：`InboxItem{kind, book, target, severity, blockScope, revision, status, availableActions}`；右栏/书桌/完整收件箱共用一个结果，处理完并回报才移除。依赖：操作日志先持久化可重放 payload，否则不要上「通用重试」。
2. **canon 逐条接受 / 证据回查**：按条目 diff，证据（sourceId/chapter/quote）随条目走，不要压成文本再重建。
3. **会话完成结果进事务**：收尾事务把 session `completed` 与收据一并写，或用 receipt 重放补齐。
4. **其余六域视图统一到卡片骨架**（正文/故事/记忆/风格/同人/资料）＋ 真实 DSH 亮色主题截图验收。
5. **页边批注**与统一收件箱入口合并，不另起一套投递。

















