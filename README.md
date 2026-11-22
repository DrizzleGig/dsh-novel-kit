# dsh-novel-kit · 小说整合包

> **一个包，写完一部长篇。** 章节引擎、四段写作依据、八个 `novel_*` 工具、右栏任务卡与四入口小说工作台，都在一个 DSH 插件里。
>
> 当前 `0.2.0-dev.0`：三层开关、原创/同人模式、文风/世界观双导入、作者命令链、完整草稿与收尾事务已落地；真实 DSH 界面验收仍在小步进行。

[![stars](https://img.shields.io/github/stars/DrizzleGig/dsh-novel-kit)](https://github.com/DrizzleGig/dsh-novel-kit/stargazers)

`0.2.0-dev.0` · MIT · 需要 Node ≥ 20 的 DeepSeek Harness

## 为什么是整合包

AI 写长篇有三个绕不过去的问题：

- **会忘**：上一章的人、事、伏笔，写到第三十章只剩一个大概；
- **会飘**：设定、称呼、禁忌前后矛盾，越写越像另一本书；
- **会不像你**：句子、节奏、对话比例千篇一律，读起来像 AI 写的。

kit 把「事件 / 拍板 / 记忆 / 文风 / 同人世界观 / 编排」收进一个安装，在每次动笔前装配成四段依据，在收尾时把正文、剧情账、记忆卡放进一个可恢复事务。它不是五个插件拼在一起，而是**一条从导入、计划、拍板、写作、检查到落账的链**。

## 0.2.0 核心能力

### 三层开关，先管住调用

```text
/novel master on          # profile 级总开关；默认关，跨重启保留
/novel on                 # 只开本会话
/novel off                # 收起本会话
/novel status             # 看总开关 / 本会话 / 工具数
```

- 不开 `master`，任何小说工具都不会出现；
- 不开 `/novel on`，工具不进入当前会话；
- 工具执行前再查一次开关，避免「准入后关掉 master 仍能执行」。

### 原创 / 同人，两条不同的写作路

```text
/novel mode original <书>   # 原创：导入作品只影响文笔，不注入世界事实
/novel mode fanfic <书>     # 同人：需要原著与已确认的世界契约
```

**原创模式**只使用文风档案、剧情账和记忆；即使误绑了同人项目，也不会把 canon 注入正文。

**同人模式**必须绑定 `CanonSource`，并且 `WorldContract` 已经由作者确认；否则开章直接返回 `canon-required` / `canon-not-ready`，不会无约束硬写。

### 两个导入口，不是同一种导入

| 入口 | 导入什么 | 产出 | 影响 |
|---|---|---|---|
| **学文笔** | 你喜欢的小说的 txt/md | `StyleProfile`：句长/段长/对话比 bands、规则、avoid 词、决策倾向 | 只影响怎么写，不写世界事实 |
| **写同人** | 原著 txt/md | `CanonSource` + `WorldContract`：人物、称呼、事实、关系、禁忌、秘密 | 强约束世界观，必须作者确认 |

两类导入共用 `SourceDocument`：同一部作品双导入只存一份原文，原文按完整 SHA-256 去重；文风与世界观是两个独立产物，互不污染。

### 文风不是形容词，是决策倾向

- `novel_plan` 返回 `styleHint`；
- 每个提案选项可以带 `styleFit` / `styleWhy`，用「克制、慢揭示、留白、对话驱动」等可解释标签标注；
- 决策记录保存选项、提案 id、文风适配与理由；
- 模型只能 **propose**，不能 adopt/reject；作者在面板拍板后，工具才继续。

### 一章有始有终

```text
novel_plan({ book, chapter, proposals })          # 只登记提案
novel_chapter_start({ book, chapter })             # 装配四段依据
novel_chapter_write({ session_id, text })          # 保存完整草稿（版本/hash）
novel_chapter_finish({ session_id, segments, memory })  # 检查 → 事务落账
```

`finish` 会检查禁忌词、同人原著复制、疑似写错名字、称呼矩阵、文风 bands。blocker 不落账；通过后，**正文文件 + beat 段落 + fade 记忆卡**在同一个可恢复事务里提交，返回回执。中断后 `resume` 能看事务进度，`finish` 能从回执补齐会话。

### 作者命令与可恢复操作

面板上的拍板、导入、切模式、保存草稿、确认文风/canon，都走 `executeAuthorCommand`：

- 每个操作有 `operationId`，同键同输入幂等，同键不同输入冲突；
- 操作日志在 `.dsh-novel-kit/operations/<id>.json`；
- 模型身份不能调用作者命令；
- canon 编辑/确认带独立 revision，切书不会把 A 书的契约写进 B 书。

### 面板与工作台

- **右栏 v2**：品牌头 + 当前作品 + 大号「下一笔」卡 + 本章依据/收件箱/最近章节；右上角「工作台」直接展开为全屏七域工作台；总开关、模式、导入、诊断和六页签都收进「设置与详情」，首屏不再被表单占满；
- **小说工作台 v3**：书桌、正文、故事、记忆、风格、同人、资料七个入口；故事含地图/时间线/体检，记忆含卡片/线索/人物，风格含档案/旧书库，同人含原著事实/人物/规则/称呼，书桌含章节流程/runbook；资料含依据与设置；
  - 书桌：下一笔、收件箱、最近章节；
  - 章节：完整正文编辑 + Ctrl S 保存 + 四段依据 + 检查；
  - 故事：拍板记录、待拍板提案、未回收线索、章节历史；
  - 资料：四段依据、文风档案、canon 摘要。

## 安装与启用

1. DSH → 设置 → 插件 → 搜索 **小说**（`dsh-novel-kit`）→ 安装；
2. 重启 DSH，右栏出现「小说」页签；
3. 在会话里执行：

```text
/novel master on
/novel on
```

4. 打开「小说工作台」；如果工作区还没有书，右栏首屏可以直接**新建作品**（kit 会创建剧情账、记忆账与项目设置，不依赖 beat/fade）；
5. 用「学文笔 / 写同人」导入样本。

> `master` 默认关，这是有意的：不写小说时，kit 不会把任何 `novel_*` 工具塞进你的会话。

## 从旧五件迁移（推荐这样做）

如果你已经在用 beat / fade / voice / fanfic / conductor，建议**先让 kit 接管旧账本，再卸载五件**，不要反过来。

### 1. 先备份

备份工作区里的旧账本目录（至少这些）：

```text
<workspace>/.dsh-novel-beat/
<workspace>/.dsh-novel-fade/
<workspace>/.dsh-novel-voice/
<workspace>/.dsh-novel-fanfic/
<workspace>/.dsh-novel-conductor/
```

### 2. 安装 kit 并接管旧账本

```text
/novel master on
/novel on
/novel legacy
```

`/novel legacy` 会扫描旧账本，为每本书建立 kit 项目设置：

- 有 fanfic 项目的书 → `fanfic` 模式；
- 其他书 → `original` 模式；
- 已有项目设置的书会跳过，不覆盖你后来的选择。

它不复制、不迁移、不改写旧账本格式；kit 就在原目录读写这些文件。

### 3. 验证内容都还在

- 面板能看到旧书、章节历史、拍板、记忆卡；
- `novel_query({ view: 'history' })` / `memory` / `ledgers` 能读到数据；
- 同人书能读到旧 canon（只读兼容）；需要 kit 自己的 canon 时，用「写同人」重新导入并确认。

### 4. 再卸载五件

确认 kit 能独立工作后，在插件管理里**卸载** beat / fade / voice / fanfic / conductor（不是只停用）：

- 两套执行者同时写同一本账，会重复登记或撞 CAS 冲突；
- 卸载插件**不会删除** `.dsh-novel-*` 数据目录；
- kit 继续就地读写这些目录，所以旧内容/记忆不会丢；
- 卸载前仍然建议保留第 1 步的备份。

### 5. 文风与同人的迁移边界

- **旧 voice 文风库**：kit 只读兼容 `library.json`，不会把它变成 kit 的 `StyleProfile`；想用 kit 的新文风档案，用「学文笔」重新导入原文。
- **旧 fanfic 项目/canon**：kit 只读兼容；kit 自己的 `WorldContract` 需要「写同人」导入 + 作者确认。
- **旧 beat/fade 记忆**：kit 直接读写，不需要迁移；`/novel legacy` 只是把书登记成 kit 项目。

## 八个工具

| 工具 | 作用 |
|---|---|
| `novel_plan` | 只登记提案（propose）；作者在面板拍板，模型不能 adopt/reject |
| `novel_canon` | 同人 canon：outline / read / propose；propose 只进 pending-review |
| `novel_chapter_start` | 开一章：四段依据 + 会话 |
| `novel_chapter_write` | 保存完整草稿（新版本；不落账） |
| `novel_chapter_finish` | 校验并落账（正文 + beat 段落 + fade 卡 + 回执） |
| `novel_chapter_resume` | 恢复/重装配上下文，查看未完成事务 |
| `novel_chapter_abort` | 放弃本会话（不动已落账内容） |
| `novel_query` | 只读查询：session / conflicts / memory / style / canon / ledgers / history |

## 数据放在哪

```text
<workspace>/.dsh-novel-beat/<book>/book.json        # 章节段落与拍板
<workspace>/.dsh-novel-fade/<book>/memory.json      # 记忆卡
<workspace>/.dsh-novel-voice/<library>/library.json # 旧文风库（只读兼容）
<workspace>/.dsh-novel-fanfic/<project>/            # 旧同人项目（只读兼容）
<workspace>/.dsh-novel-conductor/                   # 旧编排数据（不读不写）
<workspace>/.dsh-novel-kit/                         # kit 自己的资产
  ├─ projects/<book>/settings.json                  # mode / 文风绑定 / canon 绑定
  ├─ sources/<sha256>/                              # 双导入口共用原文
  ├─ styles/<profileId>.json                        # kit 文风档案
  ├─ canon/<book>/<sourceId>/world.json             # 世界契约
  ├─ sessions/  transactions/ operations/           # 会话、事务、作者命令日志
  └─ ...
```

profile 级总开关在 `$DSH_HOME/profiles/<name>/novel-kit/prefs.json`。

## 验收

当前开发版的模拟验收（不依赖真实 DSH 界面）：

```text
node --test                 167/167
npm run acceptance:load      8/8
npm run acceptance          19/19
npm run acceptance:real     11/11
npm run check               通过
npm pack --dry-run          57 文件
```

> `acceptance:load` 模拟 DSH 的加载链：package 元数据、bundle patch 两条 entry、Host index/tools/remote 导入、client tab/面板/工作台注册。它专门锁住「重启后整包不出现」这类事故。
>
> `acceptance:real` 会把真实账本复制到临时工作区再跑一章，不动原书。

## 边界与未完成

- 这是 `0.2.0-dev.0`，不是最终稳定版；
- 真实 DSH 界面验收、写盘故障注入还没完成；
- operation/canon 锁目前是单 Host 进程内锁，多进程同时写同一工作区未覆盖；
- canon 逐条接受/证据回查、页边批注、文风规则/锚句编辑仍在后续；
- 旧 voice/fanfic 只读兼容，不等于完整迁移；需要 kit 自有档案时请重新导入/确认。

## 开发

```text
git clone https://github.com/DrizzleGig/dsh-novel-kit.git
cd dsh-novel-kit
node --test
npm run acceptance
npm run acceptance:real
npm run check
```

设计和开发记录见 [docs/](docs/)；界面设计见 [UI-V2.md](docs/UI-V2.md)，五插件功能对照见 [FIVE-PLUGIN-PARITY.md](docs/FIVE-PLUGIN-PARITY.md)，与旧五件的共存细节见 [docs/COEXIST.md](docs/COEXIST.md)。

## 许可

MIT。作者：DrizzleGig。






