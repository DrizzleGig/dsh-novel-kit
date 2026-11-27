# Changelog

## 0.7.1 — 2026-11-27 · 独立基座修复（本地版，未发布）

### 修复

- **继承导入 fanfic 建立原生 canon**：原文复制进 kit `sources/`，把 fanfic 已确认的 facts/characters/addresses/secrets/worldRules/forbidden 投影成 kit `world.json` 并绑定 `settings.mode=fanfic` + `activeCanonSourceId`；不再出现“导入成功但静默落回原创模式”或开章 `canon-required`。源文件仍只读，不修改。
- **headless/CLI 工作区兜底**：没有 `exec.cwd` 且没有 agent 级 `workingDirectory` 时使用进程工作目录；8 个 `novel_*` 工具不再报“拿不到工作区”。
- **原生 canon 空绑定**：`novel_query(view="canon")` 对原生书不再解引用 null `binding`；无 canon 时返回空 canon。
- **文风档案锁顺序**：`confirmStyleProfile`/评分等改为先拿跨进程锁再启动 task，避免另一进程持锁时已经改了内存/文件。
- **模型可见描述**：`novel_chapter_start/finish` 去掉“读/写 beat/fade 账本”的旧口径；`required_capabilities` 明确只是 kit 原生能力标签，不依赖五件。
- **工具输出 lossless**：工具返回值统一做 JSON 归一，修掉 `novel_query(view="ledgers")` 的 `value is not lossless JSON`。
- **查询截断**：非 session 工具结果从 400 字放宽到 4000 字并明确标“已截断”，避免 canon/memory 数组被切在半条记录上。
- **导入 journal 标记**：批次先写 `journal.json status=importing`，成功写 `completed`；失败至少留下可识别现场。自动恢复/回滚仍列已知问题。
- **fanfic 章节映射**：导入时复用 fanfic 的 `index.json`/`chapters/`，kit 原生 source 保留 7 章，`novel_canon read ch006` 可读。
- **发布自检**：真实验收失败不再一律降格为“环境跳过”；只有明确的账本缺失/ENOENT 才跳过，其余算失败。

### 测试

- `npm test` 268 项，265 过 / 3 跳过 / 0 失败；`npm run check` 通过。3 项跳过是真实书夹具显式 opt-out。
- 新增 `test/native-import.test.mjs` 用例：fanfic + mode=fanfic 建原生 canon 并原生开章；多来源无法按 sourceId 匹配时拒绝导入；canon 投影变化时拒绝复用旧契约；复用 fanfic 章节 index。

## 0.7.0 — kit v2 独立工作台（2026-11-27）

- 新增 `lib/native/`：`schema.js`（`kit.books`/`kit.book`/`kit.decisions`/`kit.memory`）、`store.js`（books.json + bookId + `正文/<bookId>/`）、`decisions.js`、`memory.js`、`import/legacy.js`（五件只读导入）。
- 新增开发 CLI `scripts/kit-v2-import.mjs`：`preview` 只读扫描、`apply` 显式导入；只写 `.dsh-novel-kit/` 与 `正文/<bookId>/`，五件源文件不改。
- S1 硬化：事务计划/镜像不可变（同 txId 拒绝覆盖）、显式 `beforeHash:null` 语义、`commit` 幂等、all-applied 补回执、`resumeTransaction` 续交 partial、`rollbackTransaction` 只撤 after；`chapter.finish/resume` 复用；`book.js` 坏账本不覆盖；`memory3d/context` 钉卡跨窗口、遗忘卡排除、去 18 卡硬截断；`lib/storage/locks.js` 工作区写锁接入 finish/decision/revise/memory/import。
- S2 前半：`ensureBook` 建原生书（`books.json`/bookId/decisions/memory/`正文/<bookId>/`），不再建 `.dsh-novel-beat/-fade`；`readContext/chapter.start|finish|decideProposal|reviseDecision` 原生账路径；`readBeat/readFade` 原生优先；`snapshot`/`remote.getMemory/searchMemory`/`diagnostics` 原生适配；`client` 书列表优先 `kitBooks`；`/novel legacy` 改只读预览；`takeover/restore` 返回 v2 removed；`importSource` 停写 fanfic；`migrateKitBook` + CLI `migrate` 迁移 kit 0.5.x 自有数据；写锁接 finish/decision/revise。
- 继承导入 UI/remote：`previewLegacy`/`importLegacy`/`migrateKitLegacy` + 资料页「继承导入」卡片（voice/fanfic 多候选下拉）；清理 `importSource`/`takeover`/`restore` 后当前 63 个方法，`build:client` 同源生成。
- 0.7 决策 v3 起步：原生 `decideProposal` 同步写 `requests/answers/decision`，作者 adopt 才写 `answeredAt`；`decisionGate` 在 finish 校验回答凭据；`decisionLoop` 统计待答请求，决策页显示 gate/待答。
- 0.7 记忆归档起步：原生 `archiveCard`/`restoreArchivedCard`，archive.objects + stub 可恢复，重复调用幂等。
- 0.7 runbook 起步：`native/runs.js` 的 create/list/read/update/step 状态推进；只写 `.dsh-novel-kit/runs/`，不恢复五件调度；资料页「故事总控 runbook」卡可新建/完成 run。
- 0.7 fade 曲线/巩固起步：`consolidation.js` 的 `retentionCurve`/`consolidationPlan`，`consolidateMemory` 只归档窗口外、非钉、低显著度卡。
- 0.7 voice persona 起步：原生人物卡 `create/confirm/brief`，未确认不进入简报；存 `.dsh-novel-kit/personas/<bookId>/`；风格页「人物卡」区可确认提案。
- 0.7 fanfic 媒体证据起步：导入 fanfic media 到 `.dsh-novel-kit/media/<bookId>/`，默认 unverified；`reviewMediaEvidence` 确认/拒绝后才进 brief。
- 0.7 fanfic 媒体 UI：同人页「媒体证据」卡（状态/页码/引文，确认/拒绝），remote `getMedia`/`reviewMedia`。
- 0.7 全书分析起步：`native/analysis.js` 汇总决策 gate/未答、记忆归档、媒体状态、人物卡、runbook；remote `getAnalysis`；资料页「全书分析」卡。
- 0.8 媒体资料分类起步：`mediaFromLegacy` 保留 claimType/visibility/version/route；`mediaBrief` 分 facts/rumors/fiction/unclassified，只给 confirmed。
- `acceptance:native` 扩展为四段：原生建书写章 → 五件导入后原生写章 → 备份校验 → 故事圣经；`backupVerified=true`。
- 0.8 合成规模基准：`scripts/bench-native.mjs`（10000 卡/1000 决策/1000 媒体证据，40 轮）本机 p95：curve 2.5ms、analysis 7.2ms、bible 0.8ms。
- 单本备份：`native/backup.js` 导出 kit 数据+正文+hash manifest，`refreshBackup` 增量刷新；CLI `backup --book --out`；不含五件目录。
- 故事圣经导出：`native/bible.js` 汇总决策/记忆/已确认人物/媒体分类/runbook 为 Markdown，CLI `bible --book --out`。
- 0.7 记忆归档 UI：`memoryAction` 增加 `archive`/`unarchive`；记忆页「归档」按钮与「已归档」恢复列表；`memoryView` 暴露 stub 摘要。
- 0.7 voice 评分起步：`rateStyleProfile`/`readStyleRatingSummary` 追加作者/读者评分，不改规则，不输出跨作品总分；风格页 1–5 评分按钮 + remote `rateStyle`。
- 删除旧 fanfic 写路径：`lib/engine/import.js`、`lib/host/takeover.js` 及对应旧测试；`listSourceFiles` 移到 `lib/engine/source-files.js`；补 `test/source-text.test.mjs`。
- 七页组件级 UI 快照用原生夹具（`原生验收书`）重新生成到 `docs/mockups/live/`；资料页可见「继承导入」卡片；补 `max-width:720px` 响应式（420 侧栏顶部横排）与 `NK_SNAPSHOT_WIDTH` 多宽度快照。
- 仍非重启 DSH 后的宿主截图。
- 风格档案规则写侧：`updateStyleRule` 权重 0–5 / 确认状态、`addStyleCandidate` 学习候选、`readStyleHistory` 最近 50 条；简报只收 confirmed 并按权重排序；remote 新增 3 方法（52）。
- `test/style-rules.test.mjs` 2 项（权重排序/拒绝/候选/历史/stale revision）。
- 记忆总览健康/曲线：`memoryView` 增加 `curve`/`health`，总览显示低保真/窗口外/钉卡与最低保真 5 张；`test/memory-view-curve.test.mjs` 1 项。
- 风格解绑：`unbindStyleProfile` 只从本书移除绑定、保留档案/评分/历史；remote `unbindStyle`（53）；`test/style-unbind.test.mjs` 1 项。
- 风格重测：`remeasureStyle` 从原来源重算 metrics/bands，保留规则/评分/历史；remote `remeasureStyle`（54）；`test/style-remeasure.test.mjs` 1 项。
- 章节历史：`chapterHistory` 带 `verification` 摘要，决策页「按章体检」显示 blocker/warning；`test/chapter-history.test.mjs` 1 项。
- 风格档案移除：先解绑，再把 profile JSON 移到 `styles/trash/`，来源/评分不删；remote `removeStyleProfile`（55）。
- 读者偏好备注：`setStyleReaderPreference` 只写 profile.readerPreference，不进规则简报；remote `saveStyleReader`（56）；测试 1 项。
- 原生漫画/OCR：从 fanfic 本地漫画读取移植到 `lib/native/comic/`（CBZ/ZIP/图片目录、分格、Windows OCR），remote `listComicPages`/`getComicPage`/`ocrComicPages`（59）；测试 6 项；不共享 fanfic 运行时。
- 原生红果/弹幕：从 fanfic 只读适配移植 `lib/native/hongguo/`（vendored openhongguo，Apache-2.0；search/series/episodes/danmaku），remote 4 方法（63）；红果 tab 可搜剧、看集、看弹幕；不读取播放地址/内容密钥。
- 红果网络实测：真实搜索「庆余年」返回剧集；`series/episodes` 可读；`danmaku` 首窗 total 72、items 为空但 has_more=true；不读播放地址/密钥。
- 红果安全边界：`safeHongguoClient` 只暴露 search/getSeries/listEpisodes/listDanmaku；测试 1 项。
- 全量 `npm test` 264 项、261 过 / 3 跳过 / 0 失败；3 项跳过是真实书夹具显式 opt-out；生产默认关闭旧口径。`npm run check` 63 remote、client 同源。
- Codex 终审修复：`acceptance` 切原生入口并删除断链旧脚本；voice/fanfic 旧读取加 LEGACY gate；profile 写锁+expectedRevision、settings bind/unbind/mode 锁；共享档案只解绑；切书清空证据/风格详情；`compileDecisionHint` 只收 confirmed 规则与确认档案的 policy；readerPreference 回传、counterExamples 保留；publish 检查失败拒发、窄屏 aside 不再隐藏、memory lowest 全量算。
- 0.7.0 发布范围：四页分页、原生漫画/OCR、红果/弹幕、统一审阅、风格质量/评分/读者备注、七页工作台与底色。
- 已知问题（0.7.1 继续）：真实 DSH 宿主逐页冒烟尚未完成；红果需网络；读者偏好目前是作者备注而非自动模型；Codex 复审记录见 `docs/kit-0.7.0-Codex终审-2026-11-27.md`。

## 0.5.2 — 2026-11-23

README 结尾改成**句内链接**：

- 「共同作者」写成 `v0.5.2 共同作者：[MiyueWinter] —— 文案、测试、设计与开发。`
- 「喜欢它？」写成一句话，`GitHub`、`Issue`、`PR` 三个词本身就是链接（`欢迎在 GitHub 点亮 ⭐，也欢迎 Issue 或 PR`），不再用项目符号列链接。
- 「许可证」一句 `MIT License，见 LICENSE。`

## 0.5.1 — 2026-11-23

文案与显示名修正（按 Codex 只读评审）：

- **插件显示名统一为「小说工作台」**：`locale/en.json` 的 `name` 与 `meta.title` 从 `Novel Workbench` 改掉，已安装插件列表不再显示英文名。
- **README 增加「它好在哪」与结尾 CTA**：六条可验证的体验（下一笔不淹没你、检查能跳到那句、世界观不被偷偷改、换书不丢稿、平时不打扰、暗亮都好看）；结尾补「共同作者 / 喜欢它？/ 许可证」——星标、Issue、PR 都是可点击链接。
- **按评审收窄说法**：删掉「一个界面写完一部长篇」这类容易被读成「自动写完」的开头；检查定位范围改成表格，明确文风区间属于整章指标、不能定位；风格档案说明「新建档案的避免词与决策倾向默认为空」；标题「草稿是你的，不会丢」改为「保存草稿与切换作品」；开发小节去掉会过期的测试条数。
- **市场简介与 npm description 同步**：`locale/zh-CN.json`、`locale/en.json`、`package.json` 三处改用同一段保守表述。
- Tagline：**长篇写作，有据可续** / Long-form writing with continuity。

## 0.5.0 — 2026-11-23

单入口 + canon 审阅队列 + 检查定位 + 草稿边界（未发布；0.4.0 的内容一并并入本版）：

- **定位与文案重做**：README、市场简介（`locale/*.json` 的 description）、`docs/DETAIL.md`、`docs/market-intro.md` 全部改为**独立产品介绍**——不再以「整合了哪五个插件」作为卖点，按「作者实际得到什么」组织：七页工作台、四段依据、一章一条链、检查能定位、同人逐条审阅、草稿不丢、默认关闭。
- **版本号 0.5.0**。
- **发布门禁**：`scripts/publish.mjs` 改为「默认只自检、必须 `--publish` 才发」；自检七项任一失败就拒发——版本一致（package/CHANGELOG/README）、构建产物一致、测试、合成验收、加载链验收、真实验收、工作区干净、打包清单必需文件。
- **打包瘦身**：`files` 不再整体包含 `docs`，只带 `docs/*.md` 与 README 用到的三张界面图——安装包从 95 个文件 / 约 5 MB 降到 **62 个文件**。
- **发布清单重写**：`docs/RELEASE.md` 增加「真实 DSH 冒烟 8 条」（重载 → 开关 → 书桌 → 存草稿 → 切书提示 → 待审队列 → 检查定位 → 资料设置），并把发布说明模板更新到 0.5.0。
- 测试 **219/219**（新增 `test/pack.test.mjs`：发布清单包含必需文件与三张图、不整体打包 docs、README 图片必须真实存在）。

- **唯一入口**：删除右栏「小说」页签、会话头部「小说 / 工作台」两个按钮；只保留 `conversation.view`「小说工作台」。`client.js` 因此从 177 KB 降到约 111 KB（右栏面板整块移除）。
- **插件改名**：`locale/zh-CN.json` 的 name/title 改为「小说工作台」，`locale/en.json` 改为 `Novel Workbench`；市场简介同步。
- **左竖栏 IA**：书桌 / 正文 / 决策 / 记忆 / 风格 / 同人 / 资料，主区只渲染当前页；每页有自己的页头（标题 + 一句说明 + 页内动作）。
- **导入动线进工作台**：右栏删掉后，导入必须在新界面里闭环——
  - 「风格工作室」顶部是「导入作品 · 学文笔」：填目录 → 浏览 `.txt/.md` → 选中一本 → 走 `importStyle`；
  - 「同人」顶部是「导入原著 · 建 canon」：同一套选择器，走 `importCanon`；
  - 无作品时提示先建书，导入绑定到当前作品。
- **工作区设置**：总开关（`getSettings`/`setMaster`）、本项目模式（`setMode`，原创/同人）、新建作品（`createBook`）从右栏迁到「资料与设置」页；`/novel legacy` 接管提示保留。
- **修复空白页**：工作台没有自动选书，快照的 `book/session` 一直是 null，导致决策/记忆/风格/同人/资料五页永远停在「加载…」。现在挂载后自动取工作区第一本书再取一次；同时补了首屏骨架、无作品引导页与各页空态。
- **决策页重做**：四个指标（已拍板/待拍板/未回收线索/beat 版本）+ 待你拍板（提案带选项、影响、文风贴合度，逐个「选它」或整条拒绝）+ 本章已拍板列表 + 右侧详情（选项、改选自、拍板时间、改选生成重写工单）+ 本章意图 + 文风倾向。
- **记忆页重做**：四项指标（卡片/已钉住/未回收线索/漂移）+ 检索（人物/物品/秘密）+ 记忆卡列表（层级徽章、钉住标记、章号、情绪）+ 详情（原文引文、因/果、记住程度、人物标签、钉住/遗忘/恢复）+ 人物词条 + 未回收线索。
- **风格工作室重做**：导入作品 → 指标（档案/已确认/书库作品/书库字数）→ 档案卡（六项区间条形图、规则、避免词、写前简报、确认档案）+ 旧 voice 书库。
- **同人页重做**：canon 状态与四个指标 + 原著事实（带原文引文与章号）+ 世界规则与禁忌 + 人物与称呼 + 秘密 + 本章检查 findings；没有 canon 时给「建 canon 的四步」引导。
- **资料页重做**：左列工作区设置 / 来源库（`listSources`）/ 本章依据（四段条形 + 预算 + revision）/ 操作记录（`getOperations`，状态与次数），右列文风档案与 canon 摘要。
- **决策页加线索**：`decisionsView` 现在返回结构与文本都完整的 `obligations`（含章号与到期章），决策页右栏显示未回收线索。
- **记忆页加分布**：按章卡片数条形图，和人物词条一起构成「这条记忆从哪来、谁在里面」的一眼视图。
- **代码瘦身**：删掉右栏时代的整份 `UI_CSS`（-6 KB）、未使用的 `flowView` 与 `sectionLabel/sectionButton` 块，`client.js` 177 KB → 132 KB；仍被使用的控件基础规则并入 `NK_SKIN`，快照逐页比对无视觉回归。
- **统一收件箱（Host 聚合）**：新增 `lib/host/inbox.js` 与 remote 方法 `getInbox`：把待拍板、canon 未确认、设定冲突、本章阻断检查、失败操作合成一组 `{id, kind, severity, blockScope, target, actions}`，按严重度稳定排序，并给出 `blocked.start` / `blocked.finish`。书桌收件箱改为读它（kind 徽章 + 「拦开章 / 拦收尾」标记，点一条直接跳对应页），「待处理」指标也改用它的总数。
- **证据回查**：新增 remote 方法 `getSourceExcerpt`（`sourceId + 章号` → 原文切片，支持 offset/length、区分 kit `sources/` 与旧同人项目 `source/` 两套布局、缺章返回 `source-not-found`）。同人页每条带章号的事实都有「看原文」，点开在右栏显示原文那一段。
- **契约同步**：两个新方法同时注册进 `DESCRIPTORS` 与客户端 `TYPERT_REMOTE`；`client.test.mjs` 的 descriptor 对位检查覆盖到它们。
- **新增测试**：`test/inbox.test.mjs`（五类事项、阻断范围、原创模式不误报、冲突不可重试、limit 不改变 total）、`test/excerpt.test.mjs`（两套原文布局、offset、越界、缺章、参数校验）；测试 **182/182**。
- **决策页加「全书拍板」**：`decisionsView` 新增 `timeline`（跨章已拍板，按章倒序，最多 30 条），决策页右栏显示这本书一路拍了什么，不受当前章过滤。
- **书桌加「章节字数」**：最近 8 章的字数柱状图（无字数的章显示浅色空柱），一眼看出更新节奏。
- **记忆页加「记忆分层」**：按 L0/L1/L2 统计卡片数并出条形图，和「按章分布」一起回答「这条记忆有多硬、从哪来」。
- **资料页加「诊断」**：把快照里的 `issues`（账本读不出来之类的真问题）列出来，没有问题时明确写「正常」，不再让读盘错误静默消失。
- **同人页「对话称呼速查」**：`canonView` 一直返回 `addresses`（from/to/公开/私下/起始章）但 UI 没用，现在按人物名可筛；原来那张「人物与称呼」实际展示的是别名与角色，改名「人物与别名」，两个概念不再混。
- **风格页「本书已绑定档案」**：用 `snapshot.settings.activeStyleProfileIds` 连到档案，显示名称/状态/版本；明确标注「绑定 ≠ 已确认 ≠ 本章已采用，旧书库不在列」，档案读不到时保留该行并写「档案暂不可读」。
- **记忆页「可恢复的记忆」**：列出本次载入范围内 `status === 'forgotten'` 的卡，可一键恢复；卡上写明「只统计本次载入范围，不代表全书遗忘率」。
- **资料页「依据版本对照」**：本章装配时的四段 revision vs 当前账本 revision，写「版本号相同 / 资料有更新 / 当前无此账本」；明确「版本不同只说明资料改过，不等于本章失效」，不做越过边界的判定。
- **canon 审阅队列（schema 2）**：`lib/engine/canon.js` 升到 schemaVersion 2——`revision`（整份文件）与 `contractRevision`（已生效）分离，新增只覆盖生效内容的 `contentHash`，`pendingChanges[]` 保留拒绝与已应用记录，`appliedOperations[]` 存幂等回执。旧契约**读时升级**，不写盘也能被新代码消费。
- **三个队列动作**：`proposeCanonChanges`（新增候选，只动 revision）/ `reviewCanonChange`（接受、拒绝）/ `applyCanonChanges`（显式 changeIds、整批原子、生效版本 +1）。接受要求基线仍是最新生效版本（`canon-base-stale`）；条目被外部改过则 `canon-entry-drift` 整批不写；同 operationId 同输入重试返回上次回执。
- **作者命令**：新增 `canon.review` / `canon.apply`，与 `canon.update` / `canon.confirm` 同一套 operation 日志与 master 校验，模型工具调不到。
- **remote**：新增 `getCanonQueue` / `reviewCanonChange` / `applyCanonChanges`，同步 `DESCRIPTORS` 与客户端契约。
- **同人页「待审阅队列」**：显示「生效 v4 · 待审 2 · 已接受待应用 1」，逐条接受/拒绝，已接受的可一键应用，并明确「已接受未应用 / 已拒绝都不进上下文」。
- **测试**：新增 `test/canon-queue.test.mjs`（提案不动生效版本、拒绝不改内容、应用才 +1、漂移整批不写、丢回执幂等、基线过期、schema1 读时升级、同批重复条目），`test/excerpt.test.mjs` 增 emoji 码点用例；测试 **191/191**。
- **堵死绕队列的口子**：`novel_canon propose` 与作者命令 `canon.update` 不再整份覆盖生效内容——`diffContractPatch()` 把整份契约换算成 add / update / remove 候选，统一走 `pendingChanges`；工具结果改为「已提交 N 条候选，等作者接受并应用」，应用前不进写作依据。
- **整份确认加闸**：队列里还有「待审」或「已接受未应用」的候选时，`canon.confirm` 返回 `canon-queue-pending` 并列出 changeId，不允许整份批准绕过逐条审阅；这条排在 `canon-empty` 之前，提示更可操作。
- **修一个静默丢条目的 bug**：`isUsableEntry` 的 facts 只认 `entity`/`subjectName`，而 fanfic 导入用 `subject`——带 `subject` 的事实会被静默过滤掉。现在两个字段都认（由 diff 测试当场发现）。
- 测试 **192/192**。
- **按 Codex 实现评审修正迁移与投影**：`migrateWorldContract(raw, {book, sourceId})` 改成纯函数——schema 1 **未确认**契约不再把旧数组当生效内容，而是清空生效区、把旧条目逐条转成确定性 ID 的待审 `add` 候选（重复条目不合并、反复迁移 ID 不变），`contractRevision=0`、`contentHash=null`；已确认契约保留数组、`contractRevision=1`；两种都保留原 `revision` 与 `legacyV1` 原始资料。未知/损坏 schema 抛 `canon-schema-unsupported` / `canon-corrupt`，不再「顺手修复」。
- **投影收紧**：`getPublishedCanon()` 在 `contractRevision === 0` 时返回 `null`（不再拿空数组冒充），返回深拷贝，不含候选与审阅历史。
- **指纹改白名单**：`computeContentHash()` 只哈希 title/sourceId + 八类条目的白名单字段（含 `entryId`、`evidenceRefs`），审阅时间、备注、回执、文档 revision 都不进指纹；对象键序无关、数组顺序有关。
- **锁与回执**：canon 锁键改为含 `root` 的完整路径（不同工作区不再互相占锁）；`appliedOperations` 不再截断 50 条，旧 operationId 的持久幂等不会被挤掉。
- **导入不再覆盖坏契约**：`importCanon` 只在文件不存在（ENOENT）时创建默认契约，损坏或不支持的 schema 直接抛错。
- **界面收口**：同人页去掉「确认这份 canon」按钮（确认已由「应用候选」隐含完成），页头改为生效状态 + 指向待审阅队列；删掉随之失效的 `confirmCanonNow`。
- 测试 **195/195**。
- **上下文指纹改口径（version 2）**：`assembleContext()` 的指纹不再只哈希裁剪后的 markdown，而是把每段的完整来源身份（beat/fade 修订号、canon 的 `contentHash`、文风档案 id、原著名）一起压进去——**改了预算之外的事实/人物/规则也会让依据失效**。返回值新增 `fingerprintVersion` 与 `dependency`。
- **会话不再二次哈希**：`session.contextFingerprint` 直接存装配指纹本身，并记录 `contextFingerprintVersion`；`start / plan / resume / finish` 共用 `stampContext()` 一个 setter。
- **旧会话显式升级**：缺口径版本的会话在收尾时返回 `context-upgrade-required`（不能拿旧指纹判定「有没有变」）；只有显式 `resume` 才重新装配，保留正文、恢复 blocked 状态，并要求重新提取与检查。
- **测试**：上下文指纹三条新用例（裁剪外 canon 改动使指纹失效、同内容但 revision 变化使指纹失效、口径版本号）+ 章节级「旧会话必须先升级」用例；测试 **199/199**。
- **审阅历史不再被覆盖**：`reviewCanonChange` 改为向 `reviewHistory` 追加记录（`decision/reviewedBy/reviewedAt/note`），`decision` 表示当前结论；已接受未应用的可以改判为拒绝，反过来要重新提案；**已应用的提案不能再审阅**（`canon-already-applied`）；请求带 `expectedChangeHash` 且对不上时返回 `canon-change-conflict`。界面审阅时会带上候选的 `changeHash`。
- **世界契约视图统一**：新增 `worldContractView(contract)`（`lib/host/views.js`），一处理清 `revision` / `contractRevision` / `contentHash` / `published` / `reviewSummary`，`getCanonQueue` 改为读它，不再自己拼版本语义；`published` 在没有生效版本时就是 `null`。
- 测试 **203/203**。
- **旧写入口全部关掉**：`updateWorldContract` / `confirmWorldContract` 变为兼容桩，统一返回 `canon-queue-required`；作者命令 `canon.update` / `canon.confirm` 同样拒绝，新增 `canon.propose` 作候选入口。整份替换会误删「没出现在新契约里」的条目，这条路径不能再留。
- **模型提案改单条**：`novel_canon propose` 参数从 `contract: {整份}` 改为 `change: {collection, operation, entryId?, after?, evidenceRefs?}`，并可带 `expected_revision` / `base_contract_revision` / `base_content_hash`；旧整份参数明确返回 `canon-queue-required`，不再静默 diff 兼容。
- **提案基线校验**：`proposeCanonChanges` 新增 `baseContractRevision` / `baseContentHash` 校验（不符返回 `canon-base-stale`），并拒绝不成立的条目（`canon-invalid-change`）。
- **测试重写**：`canon.test.mjs` 改为「旧入口零写 + 候选队列是唯一入口 + 评审应用闭环后自动确认」；`tools.test.mjs` 覆盖单条 change 与旧参数报错。测试 **204/204**。
- **检查项可以定位到句子**：`checks.js` 的所有 findings 统一带 `coordinate: 'utf16'` + `at` + `length`；复制检查改为「去空白 + 下标映射」回原文，带换行的正文也能定位到正确那句；文风区间这类全文级检查显式给 `at: null`，界面显示「全文级」而不是假装能跳。
- **正文页检查列表**：编辑器下方列出本章检查（blocker/warning 徽章 + 消息 + 定位按钮），点「定位」把正文选区挪到那一段；空态不占位。
- **不再双重检查**：kit 生效 canon 时不再叠加旧 fanfic 账本的复制/人名检查（两套同时判会把同一句报两次）。
- **测试**：定位三条用例（下标与长度、带换行正文的下标映射、全文级为 null）；测试 **207/207**。
- **客户端拆分第一步：样式出源 + 构建入口**：`NK_SKIN` 移到 `client-src/styles.css`，`client.js` 里只留标记块；新增 `scripts/build-client.mjs`（`npm run build:client`）负责内联写回，`--check` 模式校验产物与源文件一致，并检查三条产物不变量：唯一 `__ModuleLoader__.load` 入口、`id: 'dsh-novel-kit'`、**不出现运行时相对 `require('./…')`**（宿主只提供 React）。`npm run check` 现在先跑这一步。
- **截图脚本改用样式源文件**：`ui-snapshot` 不再从 `client.js` 里正则抠 CSS，直接读 `client-src/styles.css`，拆分后取到的就是实际注入的样式。
- 测试 **210/210**（新增 `test/build.test.mjs`：样式一致、产物不变量、源文件不含模板残留）。
- **契约同源生成**：`lib/host/remote-contract.js` 导出 `REMOTE_METHOD_SPECS`（`[方法名, 是否带 request]`），构建脚本把它内联进 `client.js` 的 `NK:REMOTE` 块，客户端 `descriptors` 由这张表生成——40 个方法不再有两份手抄。`--check` 同时校验样式块与契约块，`npm run check` 一次跑完。
- **契约一致性测试改口径**：`client.test.mjs` 从「找 `method: 'xxx'` 字面量」改为「逐行核对 Host 方法表都在产物里」，防止有人手改生成块。测试 **210/210**。
- **草稿边界（防丢稿 / 防串稿）**：切换作品时若有未保存正文，不再静默清空——先停住并给出「保存并切换 / 丢弃并切换 / 取消」；`saveDraft` 加互斥口（按钮与 Ctrl+S 共用），保存回包要校验**书 + 章节会话 + 编辑序号**，期间切过书就不把回包写进当前编辑器；`loadDraft` 记录目标归属，晚到的响应直接丢弃，不会把 A 章草稿写进 B 章。
- **拆分第二步：纯展示工具出源**：`fmtNum / pageStat / inlineEmpty / badge / metaLine` 移到 `client-src/ui-kit.js`（`createUiKit({ h, c })`），构建脚本内联进 `NK:UIKIT` 块。这个文件**可以被测试直接 import**（`test/ui-kit.test.mjs` 用假的 `h` 断言结构与类名），同时保持产物仍是单文件、不引入运行时模块。
- 测试 **216/216**。
- **决策页改名**：「故事 → 地图」改为「决策 → 拍板记录」，与内容一致。
- **测试更新**：`client.test.mjs` 改为锁「只能有一个入口」，新增「源码里不许残留右栏面板与头部按钮」的回归测试；`acceptance:load` 同步。测试 **170/170**。
- 新增 `initialSection` 仅用于快照验收：`npm run ui:snapshot` 现在逐页出图（`wb-{desk,chapter,beat,fade,voice,fanfic,data}-{light,dark}.png`）。

## 0.3.0 — 2026-11-22

UI 重做 + 对象绑定修复（未发布）：

- **视觉层 `NK_SKIN`**：新增一整套设计 token（暖纸底、三级墨色、朱砂强调、三档圆角、衬线/等宽字体），全部从宿主 alias token 用 `color-mix` 派生，暗色/亮色同一份样式成立；右栏与工作台共用。
- **字阶与密度**：eyebrow 9.5 / 小标 11 / 正文 12.5 / 书桌标题 26 衬线 / 卡标题 17 衬线；正文不再低于 11px，旧版 9.5px 的图例与状态全提到 10–11px。
- **右栏重做**：印+书名+刷新的头、下一笔卡（朱砂竖线、不再整块反色）、待处理、本章依据（条形 + 2×2 图例）、最近章节、五本账、固定底栏（打开工作台 / 设置与详情）。去掉顶部与底栏重复的动作、去掉与书名重复的下拉。
- **工作台重做**：`NOVEL WORKBENCH` 头 + 书 + 状态胶囊（中文状态）、页签条（有情况才点红点）、主栏 300px 侧栏网格（<1080px 收单栏）。书桌改为 hero 卡 + 四指标 + 章节流程 + 本章场景 + 收件箱 + 最近章节 + 侧栏（写作依据 / 五本账 / 本章检查）。
- **状态中文化**：`stateLabel()` 统一 writing→写作中、committing→提交中、completed→已落账等，面板与工作台不再外泄英文枚举。
- **切书清稿**：切换作品时清空编辑器草稿、版本号与保存提示，避免把 A 书正文按 B 书版本号写回。
- **未保存保护**：「返回任务卡」在正文未保存时先变色提醒（未保存 · 再点一次），保存成功后自动解除。
- **新增 UI 快照验收** `scripts/ui-snapshot.mjs` / `npm run ui:snapshot`：用最小 React 替身渲染**同一份 client.js**，数据走真实 `NovelKitPanelRemote.prototype` + 真实账本，输出 `docs/mockups/live/{panel,workbench}-{light,dark}.{html,png}`。
- 设计说明：[小说插件系列-dsh-novel-kit-v0.3.0-UI重做-设计方案](/D:/Novel-gate/docs/小说插件系列-dsh-novel-kit-v0.3.0-UI重做-设计方案.md)。
- 测试 169/169；`npm run check` 通过。

## 0.2.0 — 2026-11-22

开发版第一刀（未发布）：

- **三层开关**：profile 级总开关 `master`（默认关，持久化到 `$DSH_HOME/profiles/<name>/novel-kit/prefs.json`）；项目级 `mode: original | fanfic`；会话级 `/novel on|off`。`/novel master on|off`、`/novel mode original|fanfic <book>`。
- **双导入口**：`importStyle`（学文笔，产出 provisional `StyleProfile`）与 `importCanon`（写同人，绑定 canon）；共用 `SourceDocument`，完整 SHA-256 去重，原文只存一份。原创模式先拒绝 canon，作者确认后才切同人并绑定。
- **按模式装配**：`assembleContext({ mode })`；原创模式即使误传 fanfic 项目也不装配世界段；同人模式绑定 canon 后使用 kit 契约；无 canon 契约时 `start` 返回 `canon-required` / `canon-not-ready`。
- **硬预算**：四段 `clip` 按预算截断（不再 2 倍），返回 `truncated`；文风段优先用 kit `StyleProfile`，≤600 字。
- **文风决策**：`planChapter` 返回 `styleHint`；提案选项可带 `styleFit/styleWhy`，插件做轻量规则标注；`novel_plan` 只允许 propose，模型不能再 adopt/reject。
- **P0 修复**：remote 写操作检查 master、`decide`/`memoryAction` 严格枚举、接管记录持久化且无记录不默认恢复全部五件、快照绑定统一走 `resolveBinding`、native 工具输出补四段上下文。
- **作者命令与操作日志**：`executeAuthorCommand`（decision.adopt/reject、draft.save、mode.set、import.style/import.canon、canon.confirm）；`operationId` + 输入 hash 幂等，同键不同输入 conflict；模型工具不能调用。
- **canon 审阅**：新增 `novel_canon` 工具（outline/read/propose）；propose 进入 `pending-review`，作者在面板「确认 canon」后才 `confirmed`；空契约拒绝确认；面板可编辑事实/人物/规则/禁忌，保存为待审阅。
- **完整草稿读写**：`readDraft` 不截断；`writeChapter` 支持 `expectedVersion`/`expectedDraftHash`，同会话保存串行化，冲突返回 `draft-conflict`。
- **收尾事务覆盖正文**：`finish` 把正文文件、beat 段落、fade 卡放进同一个可恢复事务，不再先写正文后提交账本。
- **工作台编辑器**：工作台可编辑完整正文并保存（Ctrl S），显示未保存/已保存/冲突；旧 DSH 版本自动退回只读。
- **工作台四入口**：书桌（下一笔/收件箱/最近）、章节（可编辑正文+依据/检查）、故事（拍板/提案/线索/历史）、资料（四段依据/文风/canon）；右栏顶部补「下一笔」卡。
- **右栏任务卡**：默认显示总开关/模式/导入/下一笔/四段尺/收件箱/最近章节；详细六页签收进「详情」，不再一打开就是台账。
- **Codex 第五轮复核修复**：finish/write 共用会话锁；decision 重试按提案 id 找回；operationId 加锁；草稿保存期间的新输入保持 dirty；冲突不自动覆盖本地稿；canon 编辑固定 book/source 并带 contract revision；canon 条目有效性与已确认保护；事务按 after 原文写入，合法 JSON 正文不再被重序列化。
- **收尾回执恢复**：事务已完成但会话未保存时，从 receipt 补齐 `receipt/chapterFile`，不再只标 completed。
- **文风确认**：面板可把 provisional `StyleProfile` 确认为 confirmed；`style.confirm` 走作者命令，带 revision 校验。
- **启动修复**：`package.json` 被写成带 BOM 的 UTF-8，`remote.js` 的 `JSON.parse` 抛错，DSH 里表现为整个 kit 不出现；已去 BOM 并加回归测试，锁死这个入口。
- **加载模拟验收**：新增 `npm run acceptance:load`（8/8），逐段验证 package 元数据、bundle patch、Host index/tools/remote 导入与 client tab/工作台注册。
- **旧账本迁移**：新增 `/novel legacy`，扫描 `.dsh-novel-*` 为每本书建立 kit 项目设置（有 fanfic 项目即同人，否则原创）；旧账本就地读写，不复制、不迁移格式。
- **README / 市场简介重写**：补「先 `/novel legacy` 接管、验证、再卸载五件」的迁移步骤，并更正旧文档里「只读解码」「7 个工具」「45 文件」等过期说法。
- **UI v2（2026-11-22）**：右栏改成「品牌头 + 当前作品 + 大号下一笔卡 + 依据/收件箱/最近」；总开关、模式、导入、诊断与六页签收进「设置与详情」；主行动可真正开章。工作台补作品头、状态胶囊与书桌主行动。
- **五插件审计**：新增 [docs/FIVE-PLUGIN-PARITY.md](docs/FIVE-PLUGIN-PARITY.md)，逐项对照 beat 地图/时间线/体检/搜索/回退/旧线/工单、fade 总览/记忆/溯源/简报/人物/原文、voice 书架/档案/学习/对照镜、fanfic 原著/本作/剧情/写作/检查、conductor runbook/收据/能力矩阵，并列出 kit 缺口与建议 IA。
- **kit-only 建书**：工作区没有书时，右栏可直接新建作品；kit 自己创建 beat/fade 账本与项目设置，不依赖旧五件。
- **工作台 v3**：七个入口——书桌/正文/故事/记忆/风格/同人/资料；故事含地图/时间线/体检，记忆含卡片/线索/人物，风格含档案/旧书库，同人含原著事实/人物/规则/称呼，书桌含章节流程/runbook；资料含依据与设置。
- **右栏直达工作台**：右上角「工作台」按钮展开右栏为全屏并切到七域工作台；embedded 时提供「返回任务卡」。
- **决策操作进入工作台**：故事页可直接采纳/拒绝待拍板提案；已拍板决策可「改选」并生成重写工单，旧决策保留、重复调用幂等。
- **记忆卡详情**：卡片可展开看三维、原文引文、因/果与人物；保留钉住标记；支持钉住/遗忘/恢复。
- **同人原著事实**：`canonView` 输出事实、世界规则与原文引文；同人页「事实」直接显示引文和章号。
- **风格档案详情**：风格页档案可展开看规则、避免词、六项区间与决策倾向；`styleView`/`listStyleProfiles` 提供 `ruleTexts`。
- **同人 canon 确认**：同人页显示 contract 状态/版本，可直接「确认这份 canon」，走 `canon.confirm` 作者命令并刷新。
- **记忆检索**：记忆页可按人物/物品/秘密搜索，命中结果可点开对应卡片。
- **记忆漂移提示**：drift 时显示回查提醒，低保真卡片标「已褪色」。
- **同人检查**：同人页显示本章 `verification.findings`（severity / message / 引文），没有检查时如实提示。
- **场景编排**：书桌新增「本章场景」编辑；`plan.save` 作者命令写 `.dsh-novel-kit/plans/<book>/<chapter>.json`，带 revision 冲突与 ≤1200 字写前 brief。
- **收件箱汇总**：右栏/书桌统一收 pending 拍板、canon 待确认、冲突、failed operation；资料页显示最近操作日志。
- **依据预览**：资料页可现场调用 `previewContext`，显示重新计算的四段字数/预算/revision，与已装配快照区分。
- **恢复会话**：blocked/committing 状态的主行动变成「恢复本章」，走 `resumeChapter`，避免重复收尾。
- **文风简报**：风格档案可现场编译 ≤600 字写前简报（`getStyleBrief`），不再只显示规则条数。
- 测试 **169/169**；`npm run acceptance` **19/19**；`npm run acceptance:real` **11/11**。

## 0.1.14 — 2026-11-22

- **修复仓库署名**：57 个历史提交的作者/提交者邮箱从 `MiyueWinter@users.noreply.github.com` 改回 `captain2233@qq.com`（此前 GitHub 贡献者页把整个仓库算在 MiyueWinter 名下，实际应记在 DrizzleGig 账上）；共同贡献仍以 `Co-authored-by: MiyueWinter <mingyue_11129@qq.com>` 记在提交与 Release 里。
- README 补 stars 徽章与「喜欢它？」小节（与 beat / fade / voice / fanfic / conductor 的写法一致）。
- npm `dsh-novel-kit@0.1.14` 发布，GitHub Release `v0.1.14`。

## 0.1.13 — 2026-11-22

- **npm 首发**：`dsh-novel-kit@0.1.13` 发布到 npm 官方 registry（`latest`；2026-11-21T19:28:59Z，shasum `605075fd…`，46 文件），GitHub Release [v0.1.13](https://github.com/DrizzleGig/dsh-novel-kit/releases/tag/v0.1.13) 同源。
- **README 重写**：口径回到 0.1.12 的真实形态（独立包，不再是 0.1.0-dev 的「套件安装器」设想）；补「和 beat / fade 等五件共存吗」一节。
- **新增 `docs/COEXIST.md`**：实测六件 12 行插件共存；工具名（`novel_*` vs `beat_*`/`memo_*`/`voice_*`/`fic_*`/`cue_*`）、命令、条目 id 都不撞；冲突只在账本——两边同时写同一章会重复登记或撞上 CAS（`transaction: 冲突`，会话 `blocked`），坏账本报 `ledger-corrupt` 而不是当空账本。
- **`docs/LIMITS.md` / `docs/RELEASE.md`**：修掉损坏的文本（`pm`/`est/` 之类的残字）与过期的「未发布」状态；发布流程按实测重写（web 2FA、显式 `--registry`、CDN 负缓存 15 分钟）。
- **`scripts/publish.mjs`**：publish 改 `stdio: inherit`，账号要求 2FA 时授权链接能直接显示在终端；registry 校验改成带时间戳的 version 文档 + 重试，避免 `npm view` 缓存误报「未发布」。
- 测试 110/110，合成验收 19/19，真实账本验收 10/10。

## 0.1.12 — 2026-11-22

- **`scripts/publish.mjs`**：自检（check / 测试 / 合成验收 / 真实验收）→ `npm whoami` → 发布 → `npm view` 校验版本；`--skip-publish` 只自检。Windows 上 npm 通过本机 `npm-cli.js` 调用，不依赖 PATH。
- RELEASE.md 改成「登录后一条命令」。
- 测试 110/110。
## 0.1.11 — 2026-11-22

- **binding 补测试**：同名绑定、单候选回退、多候选不猜、显式优先、无账本 available:false（此前唯一没有直接测试的引擎模块）。
- 测试 **105 → 110**；文档里的证据数字同步。
## 0.1.10 — 2026-11-22

- **章节历史**：`chapterHistory`（每章取最近一个会话，给出状态/字数/正文文件/完成时间）+ `novel_query({view:"history"})`；快照带最近 30 章；面板总览显示「最近章节」。
- 会话记录 `draftChars` / `completedAt`，历史不再靠猜。
- 测试 **104 → 105**。
## 0.1.9 — 2026-11-22

- **渲染冒烟测试**：用最小 React/宿主替身加载 `client.js`，渲染面板、工作台与会话头按钮；能抓到 TDZ、hooks 顺序、undefined 属性这类只有真渲染才炸的问题（复审第 3 条正是这类）。
- 测试 **103 → 104**。
## 0.1.8 — 2026-11-22

- **restore 只恢复 kit 停用的**：接管时记住真正停用的名字，恢复时不再把用户自己停用的插件重新打开。
- **持久性**：原子写改为「写入 → fsync → rename → 目录 fsync（不支持的平台忽略）」。
- 导入目录列举上限 200 条并标记是否截断。
- 测试 **102 → 103**。
## 0.1.7 — 2026-11-22

复审第二批：

- **客户端请求竞态**：面板/工作台加请求序号，慢响应不会覆盖新选择；换书清空检索。
- **状态机**：`writeChapter` 不再无条件把状态改成 `writing`——`committing` / `blocked` 明确拒绝并提示先 resume。
- **事务 CAS**：`planTransaction` 接受调用方观测到的 `beforeHash`，不一致立刻拒绝（并发写不会被当成自己的前镜像）；`finish` / `decideProposal` / `updateMemoryCard` 都传入。
- **纯文本文件**：事务 `after` 是字符串时按原文写入（不再 JSON.parse 失败）。
- **拍板视图**：已 adopted/rejected 的提案不再算待拍板。
- 测试 **99 → 101**。
## 0.1.6 — 2026-11-22

独立代码复审后的修复（按严重度）：

- **路径越界**：新增 `assertSafeName`，`book` / `project` / `txId` 一律拒绝 `..`、分隔符、盘符；事务目录与导入路径不再能写到工作区外。
- **工作台 TDZ**：`Workbench` 里 `runTakeover` 的依赖数组引用了未声明的 `load`（每次渲染抛错）——删除这段未使用的接管代码。
- **正文先落盘**：`finish` 先写 `正文/第N章_标题.md` 再提交账本；写失败返回 `chapter-file-failed`，账本不动；beat 段落记录**真实**相对路径（之前记的是不存在的 `第N章.md`）。
- **损坏账本不再当「没有」**：只有 ENOENT 才归为缺失，解析/权限错误报 `ledger-corrupt`。
- **上下文指纹按内容**：同 revision、同长度的改动也能被 `context_stale` 发现。
- **绑定不再乱猜**：`voice` / `fanfic` 只有在显式指定、同名、或全工作区唯一时才绑定，否则为 null。
- **提交/恢复**：`finish` 遇到上次未完成的提交先查事务日志（completed 直接收尾、partial/conflict 拒绝重复落账）；`blocked` 状态不再因重复 transition 抛错；`awaiting_author` 明确拒绝收尾。
- **导入**：先校验 `project.json` 存在再写 source；事务 id 带项目名，避免覆盖别的项目的计划。
- 测试 **95 → 99**；验收 19/19；真实验收 10/10。
## 0.1.5 — 2026-11-22

- **真实数据验收**：`npm run acceptance:real` 把真实书（默认《斗罗：开局炸毁冰火两仪眼》）的 `.dsh-novel-*` 复制到临时工作区，用 kit 引擎走完一章：**10/10**（beat rev 87→88、segments 5→6、cards 73→74、快照/冲突可读）。
- 修：冲突扫描在缺账本时 `total` 为 0（之前是 undefined）。
- 测试 95/95。
## 0.1.4 — 2026-11-22

- 工作台显示「正文文件」路径（收尾后一眼看到写到哪），与「本章检查」并排。
- 测试 95/95；验收 19/19。
## 0.1.3 — 2026-11-22

- **正文落盘**：`finish` 成功后把正文写到 `正文/第N章_标题.md`（同章已有文件就覆盖，重复收尾不产生副本），路径记进会话与快照。
- 验收脚本加「正文落盘」一项，**18 → 19/19**。
- 测试 **94 → 95**。
## 0.1.2 — 2026-11-22

- **novel_query 扩展为只读视图入口**：`view` 增加 `memory`（可带 query/chapter）、`style`、`canon`、`ledgers`；模型不装配上下文也能按需查账本。
- 测试 **93 → 94**。
## 0.1.1 — 2026-11-22

- **resume 能解除 blocked**：`context_stale` 后调用 `novel_chapter_resume` 会重新装配四段、回到出错前的状态，随后 `finish` 可以正常完成（之前只能停在那里）。
- 新增 `docs/LIMITS.md`：与五件的能力对照、引擎与 UI 的已知限制、发布/验收状态。
- 测试 **92 → 93**。
## 0.1.0 — 2026-11-22

首个「独立包」版本：只装 kit 一个包，即可用章节引擎写一章，不需要装 beat/fade/voice/fanfic/conductor。

- **章节引擎**：`novel_plan / chapter_start / chapter_write / chapter_finish / chapter_resume / chapter_abort / novel_query` 七个工具；四段上下文（剧情约束 / 世界契约 / 三维记忆 / 文风档案）；可恢复事务与回执。
- **验证**：禁忌、20 字原著复制、疑似错名、长句、称呼矩阵、文风 bands；blocker 不落账；strict 只检查声明过的能力。
- **账本兼容**：只读解码已有 `.dsh-novel-*`（beat/fade/voice 档案/fanfic 项目与 canon），不迁移。
- **作者操作**：拍板（adopt/reject）、记忆钉/忘/恢复、原著导入、旧五件接管/回退。
- **UI**：右栏「小说」六页签（总览/拍板/记忆/文风/设定/冲突）+ 章节工作台。
- 测试 **92/92**，验收脚本 **18/18**。
## 0.1.0-dev.25 — 2026-11-22

- **strict 模式**：`novel_chapter_start({strict:true})` 后，`finish` 只跑 required_capabilities 对应的检查（没声明 fanfic 就不扫同人禁忌/复制/称呼，没声明 voice 就不比文风 bands）；非 strict 行为不变。
- 测试 **90 → 92**。
## 0.1.0-dev.24 — 2026-11-22

- 快照带冲突摘要（beat canon vs 同人原著，最多 8 条）；面板加「冲突」页签（双方值/章号/决策 id，只报告不裁决）。
- 测试 **89 → 90**。
## 0.1.0-dev.23 — 2026-11-22

- **冲突扫描**：`scanConflicts`（beat canon vs 同人原著 facts，同键不同值才报，只报告不裁决）；`novel_query({view:"conflicts", book})` 返回双方的值/章号/引文/决策 id。
- `decodeFanficCanon` 输出 facts 摘要。
- 测试 **85 → 89**。
## 0.1.0-dev.22 — 2026-11-22

- **三维记忆**：`engine/memory3d.js`（familiarity / accessibility / fidelity，按距章、重要度、人物出场、钉卡计算）；简报改用三维排序，低 fidelity 只给模糊印象不给细节。
- 面板记忆卡显示「准 N%」；memoryView 支持 currentChapter。
- 测试 **80 → 85**。
## 0.1.0-dev.21 — 2026-11-22

- **同人原著导入**：`splitChapters`（第N章/序章/楔子/番外）+ `importSource`（source 布局：raw.txt / meta.json / index.json / chapters，project.json 走事务更新，重复导入幂等）。
- remote 增 `importSource` / `listSourceFiles`；面板「设定」页签加导入路径输入与「导入」按钮。
- 只支持 UTF-8（含 BOM），GB18030 如实报错提示先转码。
- 测试 **75 → 80**。
## 0.1.0-dev.20 — 2026-11-22

- **一章验收脚本**：`npm run acceptance` 跑 plan → adopt → start → write(坏稿) → finish(verify-failed) → 改写 → finish → query → resume → snapshot → pin，14/14 通过。
- 修两个真问题：续上会话时刷新上下文（避免 adopt 后被误判 context_stale）；快照改用 latestSession（收章后仍能看到）。
- 验收文档：`docs/kit-acceptance-2026-11-22.md`（含对照 Codex 7 条）。
- 测试 **74 → 75**。
## 0.1.0-dev.19 — 2026-11-22

- 发布资料：`docs/DETAIL.md`（详情页长描述）、`docs/market-intro.md`（市场简介）、locale `meta.detail`。
- 尝试 npm 首发（`--tag dev`）：npm 会话已过期（PUT 404），需作者重新登录 + 2FA 后再发。
- 打包 38 files。
## 0.1.0-dev.18 — 2026-11-22

- **记忆检索**：`searchMemory`（gist / 实体 / 引文匹配，按重要度排序）+ remote `searchMemory`；面板记忆页签加搜索框与「命中 N 条」列表。
- 测试 **73 → 74**。
## 0.1.0-dev.17 — 2026-11-22

- **记忆卡作者操作**：`engine/memory.js` 的 `updateMemoryCard`（pin / forget / restore）走事务写 fade 账本：lifecycle + 卡片状态 + audit + revision+1；未知卡/未知动作直接拒绝。
- remote 增 `memoryAction`；面板「记忆」页签每张卡带「钉 / 忘 / 恢复」按钮。
- 测试 **70 → 73**。
## 0.1.0-dev.16 — 2026-11-22

- 记忆视图补「未回收线索」（fade threads）与「常出现人物」（按 entityIds 统计），面板记忆页签展示。
- 测试 **69 → 70**。
## 0.1.0-dev.15 — 2026-11-22

- **疑似写错名字**：`checkNames` 用 canon 人物名（2–3 字）做一字差比对，进 finish verify（只 warning，不阻塞）。
- **设定视图补人物与秘密**：`decodeFanficCanon` 增 characters；`canonView(project, canon)` 输出人物（含别名/角色）与秘密（公开章/知情者）；面板「设定」页签展示。
- 测试 **67 → 69**。
## 0.1.0-dev.14 — 2026-11-22

- **原著复制检查**：`checkCopy` 用 canon 的 evidence 引文做 20 字窗口比对，命中即 blocker，并入 finish 的 verify（账本不变）。
- `decodeFanficCanon` + `readFanficCanon`：读 characters / secrets / facts 的只读摘要（人物名与别名、秘密、证据引文）。
- 测试 **65 → 67**。
## 0.1.0-dev.13 — 2026-11-22

- 面板「文风」页签展示档案（名称/版本/状态/bands/避免词），不再只有书库。
- `checkDraft` 返回确定性指标（句长/CV/对话占比等）；工作台「本章检查」显示 blocker/warning 与指标。
- 测试 **63 → 65**。
## 0.1.0-dev.12 — 2026-11-22

- **voice 档案接入**：`codecs/voice.decodeVoiceProfile` + `repositories.readVoiceProfiles`；文风简报改用 confirmed 档案（bands / rules / avoid），无档案时退回书库摘要。
- **文风检查**：`engine/metrics.js` 计算句长均值/CV、段长、对话占比、抽象/解释词密度；`checkBands` 与档案 bands 对齐（越界 warning，avoid 词 warning），并入 finish 的 verify。
- 真实档案验证：斗罗书库的 confirmed 档案（v1.4）成功解出 bands 并进入简报。
- 测试 **59 → 63**。
## 0.1.0-dev.11 — 2026-11-22

- **作者拍板落账**：`novel_plan` 增加 `action: adopt|reject`（带 `proposal_id` / `option`），`adopt` 走事务写 beat `decisions` + revision + audit；重复拍板幂等；有多个选项却未指定时拒绝。
- 面板「拍板」页签：选项按钮 → 二次确认 → `decide` remote 落账，并刷新列表。
- 测试 **57 → 59**。
## 0.1.0-dev.10 — 2026-11-22

- **finish 增加 verify 闸门**：`engine/checks.js` 做确定性检查（禁忌词 blocker、长句 warning、称呼矩阵 warning），blocker 时返回 `verify-failed` 且不落账。
- 检查统计（字数/句数/平均句长）写进会话，快照可读。
- 测试 **51 → 57**。
## 0.1.0-dev.9 — 2026-11-22

- **拍板视图**：`host/decisions.js` 的 `decisionsView`（本章已拍板 + 会话里待拍板提案 + 未回收义务），remote 增 `getDecisions`，面板加「拍板」页签。
- README 增加「五件能力 → kit 位置」对照表（已迁移 / 只读 / 未迁移），把「全部功能」的进度写实。
- 测试 **48 → 51**。
## 0.1.0-dev.8 — 2026-11-22

- **记忆 / 文风 / 设定 三块只读视图**：`host/views.js` 的 `memoryView`（按章/领域筛、按重要度排序）、`styleView`（书库规模）、`canonView`（称呼矩阵 + 禁忌）。
- remote 增 `getMemory` / `getStyle` / `getCanon`；面板加「总览 / 记忆 / 文风 / 设定」页签，按需拉取。
- 测试 **44 → 48**。
## 0.1.0-dev.7 — 2026-11-22

- **接管旧五件**：`host/takeover.js` 只动选择层（`setBundleEnabled`），逐件记录 `application`，`restart-required` 不算成功；`restore` 可一键恢复。拒绝未知插件名。
- remote 增 `takeover` / `restore`；面板出现「停用旧五件（由 kit 接管）」按钮，两步确认；失败时列出具体哪件、什么状态。
- 测试 **39 → 44**。
## 0.1.0-dev.6 — 2026-11-22

- **装载诊断**：新增 `host/diagnostics.js`（bundle 与运行行合并，回答「现在跑的是谁」）与 `novelKitPanel.getDiagnostics`。
- 面板显示旧五件在跑数量；`takeoverNeeded` 为后续「停用旧五件、由 kit 接管」提供判据。
- 真实四段装配验证：斗罗同人第 13 章 beat 402 / fade 998 / voice 75 字，binding 把 `斗罗大陆` 书库绑到书名上。
- 测试 **35 → 39**。
## 0.1.0-dev.5 — 2026-11-22

- **四段上下文全部接通**：新增 `engine/binding.js` 显式解析「书 ↔ 四家目录」（beat/fade 用书名，voice 书库与同人项目名可不同），`assembleContext` 现在同时装配 beat 约束、fanfic 世界契约（称呼矩阵 + 禁忌）、fade 记忆、voice 文风摘要。
- `startChapter` / `planChapter` / `finishChapter` 共用同一份 `readContext`；上下文指纹包含四家 revision，任何一家在写作期间变动都会 `context_stale`。
- 测试 **34 → 35**（四本账齐备时四段都可用）。
## 0.1.0-dev.4 — 2026-11-22

- **真机装载**：kit 已装进 desktop profile（`link:`），`novel-kit` 与 `novel-kit-remote` 两行 `fiberPhase=active`。
- **工具 output 声明**：DSH 要求每个工具带 `output { schema, render }`，7 个工具补齐（这是首次装载失败的直接原因）。
- **remote 依赖解析**：`remote.js` 去掉 `dsh-session` 依赖；`package.json` 声明可选 peer `@deepseek-ai/dsh-typert-protocol`；本地 link 联调需要在仓库建 `node_modules/@deepseek-ai/*` 链接（见 README）。
- 顺带修复 fanfic 的 remote 在本机 link 安装下的导入失败（同一个原因），五件 remote 现已全部 active。
## 0.1.0-dev.3 — 2026-11-22

- **上下文漂移保护**：写作期间 beat/fade 账本被改（revision 变化）时，`novel_chapter_finish` 返回 `context_stale` 并进 `blocked`，不落账。
- **章节工作台**：`conversation.view` 注册「章节工作台」（左正文只读预览、右写作依据与账本 revision），与右栏面板共用 `novelKitPanel.getSnapshot`。
- 快照增加草稿预览（≤4000 字）。
- 测试 **32 → 34**。
## 0.1.0-dev.2 — 2026-11-22

右栏「小说」面板接线（S2 第一步）。

- 新增 `novelKitPanel` typert remote（`identity` / `getSnapshot`）：读宿主只读快照，**不执行任何命令**。
- `cordis.patch.yml` 增加 remote 行；`package.json` 增加 `./remote`、`./client` 与 `dsh.client`。
- 新增 `client.js`：右栏「小说」tab + 会话头入口 + 面板（书列表、会话状态、四段上下文摘要、五本账 revision、issues）。
- 面板数据全部来自 remote；`node --test` **32/32**。
## 0.1.0-dev — 2026-11-22

S0 只读层：只装 kit 也能读懂已有五本账，且绝不改文件。

- `lib/workspace.js`：只读发现 `.dsh-novel-{beat,fade,voice,fanfic,conductor}`，不创建目录。
- `lib/codecs/beat.js`：`book.json` 解码；旧账本 `revision` 按 `revisions.length + audit.length` 兜底（与 beat 0.9.x 一致）；chapters 字典与数组两种形态都收。
- `lib/codecs/fade.js`：`memory.json` 解码；`meta.revision` 缺失用 `audit.length`，`revisionAt` 落后标 `drift`。
- `lib/codecs/voice.js`：书库 `works[]` 索引。
- `lib/codecs/fanfic.js`：项目头 + `exports` 契约摘要（称呼按 `fromChapter` 过滤）。
- `lib/repositories/ledger.js`：四本账只读读取；缺本返回 `null`；目录名做路径穿越校验。
- 真实数据验证：斗罗同人 12 章 / 35 决策 / 67 canon / 73 卡 / 12 audit / voice 687 章；同人项目 revision 46。`node --test` **9/9**。

## 0.0.1-stage — 2026-11-21

- npm 名字与 GitHub 仓库占位：只注册包名、声明 bundle 入口，不挂工具、面板或命令。
- 目的：市场 PR 要求仓库满 1 天；先建仓，`0.1.0` 发布后即可提 PR。
- 方案见 `docs/小说插件系列-dsh-novel-kit-整合包设计方案-2026-11-21.md`。
















