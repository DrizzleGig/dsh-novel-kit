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

## 本地 link 联调（开发用）

DSH 插件以 link: 安装时，Node 从仓库真实路径解析依赖；要让 emote 行加载，需要在仓库里建 
ode_modules/@deepseek-ai/dsh-typert-protocol（指向与当前 DSH 同版本的包）。本机可指向解包目录，例如：

``powershell
New-Item -ItemType Junction -Path node_modules\@deepseek-ai\dsh-typert-protocol -Target D:\Novel-gate\.tmp\dsh-asar-2026-11-21\node_modules\@deepseek-ai\dsh-typert-protocol
``n
## 安装

`0.1.0` 发布后：在 DSH「插件」里搜索 **小说**（`dsh-novel-kit`）安装；或本地开发时用插件管理器的「添加插件」指向本目录。

## 设计依据

- [整合包设计方案 v0.2](../../docs/小说插件系列-dsh-novel-kit-整合包设计方案-2026-11-21.md)（含桌面端 Codex 只读评审：`installBundle` 只激活目标 bundle、`restrict` 真实签名、面板首屏优先级）
- [五插件协作契约 v1.2](../../docs/小说插件系列-五插件协作契约-v1.1.md)（服务 key / 目录 / 工具前缀 / 命令 / tab kind 冻结）

## 共同作者

- [@DrizzleGig](https://github.com/DrizzleGig)
- [@MiyueWinter](https://github.com/MiyueWinter) — 共同贡献

## 许可证

MIT
