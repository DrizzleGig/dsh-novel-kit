# Changelog

## 0.2.0-dev.0 — 2026-11-22

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
- 测试 **159/159**；`npm run acceptance` **19/19**；`npm run acceptance:real` **11/11**。

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








