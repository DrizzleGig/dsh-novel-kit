# Changelog

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
