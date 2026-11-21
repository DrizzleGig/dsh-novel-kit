# Changelog

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
