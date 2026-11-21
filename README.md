# dsh-novel-kit · 小说整合包（Pro）

> **一个独立包，内含 beat / fade / voice / fanfic / conductor 的全部功能**：章节引擎、七个 `novel_*` 工具、右栏「小说」面板与章节工作台；用户不需要安装那五个插件。
> 当前 `0.1.0-dev`：S0 只读层已完成（codecs 兼容旧 `.dsh-novel-*` 账本 + 只读仓库，9/9 测试）。设计与排期见 [独立包设计](../../docs/小说插件系列-dsh-novel-kit-独立包设计-2026-11-22.md)。

## 它是什么

五个插件各管一件事：

| 插件 | 管什么 |
|---|---|
| `dsh-novel-beat` | 剧情事件与拍板（本章已拍板什么、欠了什么） |
| `dsh-novel-fade` | 长篇记忆（近章重点记、旧事逐步淡） |
| `dsh-novel-voice` | 文风（导入自己的写法、写前简报、写后改句） |
| `dsh-novel-fanfic` | 同人（原著导入、本作设定、节点检查） |
| `dsh-novel-conductor` | 编排（一章先做什么后做什么、收据核验） |

kit 不复制它们的代码，只复制**装、开、看、配**：

- **一次装**：装 kit 一次，面板向导按顺序装齐五件（套件形态，不做代码合并）；
- **一个开关**：`/novel on|off|status` 代理 conductor 的总开关，不维护第二份状态；
- **一块面板**：右栏「小说」——书/章、本章流程、四段上下文（剧情约束 / 世界契约 / 记忆简报 / 表达简报）、诊断；
- **一套工具分层**：默认 `core` 8 个工具，`fanfic` 11 个，`full` 35 个；
- **一套版本**：五件钉在 kit 声明的兼容范围，`/novel doctor` 报矩阵。

## 状态

| 版本 | 内容 |
|---|---|
| `0.0.1-stage` | 名字与仓库占位（本版） |
| `0.1.0` | 规划中：S0 技术探路 → M1 骨架 → M2 安装向导 → M3 分层 → M4 面板 → M5 发布 |

S0 要验的四件事（见设计方案 §5）：bundle 依赖能否经面板调 `plugin-manager` 装齐、已单装再装 kit 会否双挂、`agent.ctx.tools.restrict()` 能否压到 8 个、卸 kit 后五件是否仍独立可用。


## 五件能力 → kit 位置（2026-11-22，S1 阶段）

> 诚实口径：标「已迁移」的已在 kit 内有可用实现；「只读」只有查看；「未迁移」仍属 S2/S3 范围。

| 能力 | kit 位置 | 状态 |
|---|---|---|
| beat 拍板/决策、canon | `novel_plan`（propose/adopt/reject）+ 面板「拍板」+ 四段「剧情约束」 | 已迁移（拍板落账；改设定/回退未迁移） |
| beat 段落登记/校验 | `novel_chapter_finish`（引文校验 + 段落落账） | 已迁移（简化版） |
| fade 记忆卡沉淀 | `novel_chapter_finish` 的 `memory.cards` | 已迁移（简化版） |
| fade 记忆简报 | 四段「记忆简报」（三维打分） | 已迁移（familiarity/accessibility/fidelity） |
| fade 检索/遗忘/钉卡/历史 | 面板「记忆」+ 搜索框 + 钉/忘/恢复 + 总览「最近章节」 | 已迁移 |
| voice 书库/档案 | `codecs/voice` + 面板「文风」只读 | 简报与检查已迁移（档案导入/学习未迁移） |
| fanfic 契约/称呼/禁忌 | 四段「世界契约」+ 面板「设定」 | 契约/禁忌/检查/导入已迁移 |
| conductor 六步 runbook | kit 的 `plan → start → write → finish`（三段主线） | 已迁移（简化；strict/replay 未迁移） |`n| conductor 冲突扫描 | `novel_query({view:"conflicts"})` | 已迁移（只报告） |
| 收据与事务 | `storage/transaction` + `finish` 回执 | 已迁移 |
| 总开关 | `/novel on|off|status`（会话级） | 已迁移 |
| 旧五件接管/回退 | 面板按钮（`setBundleEnabled`） | 已迁移 |

**还差的（S2/S3）**：voice 的 Style Compiler 与 `voice_check`、fanfic 的 `fic_check` 与导入向导、fade 的三维记忆与检索/遗忘、beat 的改设定/回退、conductor 的 strict/replay/冲突扫描。
## 本地 link 联调（开发用）

DSH 插件以 `link:` 安装时，Node 从仓库真实路径解析依赖；要让 remote 行加载，需要在仓库里建 `node_modules/@deepseek-ai/dsh-typert-protocol`（指向与当前 DSH 同版本的包）。本机可指向解包目录：

```powershell
New-Item -ItemType Junction -Path node_modules\@deepseek-ai\dsh-typert-protocol -Target D:\Novel-gate\.tmp\dsh-asar-2026-11-21\node_modules\@deepseek-ai\dsh-typert-protocol
```
## 复审

- 外部评审简报：[docs/CODEX-REVIEW-BRIEF.md](docs/CODEX-REVIEW-BRIEF.md)（代码地图 + 五个待决问题）
- 已知边界：[docs/LIMITS.md](docs/LIMITS.md)

## 发布清单

见 [docs/RELEASE.md](docs/RELEASE.md)：自检命令、npm 登录、发布、GitHub Release 模板。

## 安装

`0.1.0` 发布后：在 DSH「插件」里搜索 **小说**（`dsh-novel-kit`）安装；或本地开发时用插件管理器的「添加插件」指向本目录。

## 设计依据

- [独立包设计 v1](../../docs/小说插件系列-dsh-novel-kit-独立包设计-2026-11-22.md)（2026-11-22，桌面端 Codex 评审后的最终形态）`n- [整合包设计方案 v0.2](../../docs/小说插件系列-dsh-novel-kit-整合包设计方案-2026-11-21.md)（历史：安装形态与面板 IA）
- [五插件协作契约 v1.2](../../docs/小说插件系列-五插件协作契约-v1.1.md)（服务 key / 目录 / 工具前缀 / 命令 / tab kind 冻结）

## 共同作者

- [@DrizzleGig](https://github.com/DrizzleGig)
- [@MiyueWinter](https://github.com/MiyueWinter) — 共同贡献

## 许可证

MIT
