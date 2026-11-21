# Changelog

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
