# dsh-novel-kit · 小说整合包

> **一个独立包，装它一个就能写长篇**：章节引擎、八个 `novel_*` 工具、右栏「小说」面板与章节工作台。
> 兼容旧五件（beat / fade / voice / fanfic / conductor）的 `.dsh-novel-*` 账本——只读解码，不迁移、不改格式。
>
> **0.2.0-dev.0 开发中**：新增总开关、原创/同人项目模式、文风/同人双导入口、文风决策提示。当前面板仍是过渡版，完整「书桌 + 四入口工作台」在开发中；开发记录见 [docs/DEV-STATUS.md](docs/DEV-STATUS.md)。

[![stars](https://img.shields.io/github/stars/DrizzleGig/dsh-novel-kit)](https://github.com/DrizzleGig/dsh-novel-kit/stargazers)

`0.2.0-dev.0` · MIT · 需要 Node ≥ 20 的 DeepSeek Harness

## 它解决什么

AI 写长篇会忘（前文丢了）、会飘（设定自相矛盾）、会不像你（千篇一律的腔调）。kit 把五件事收进一个包，并在每次动笔前装配成**四段写作依据**：

| 依据 | 来自 | 作用 |
|---|---|---|
| 剧情约束 | beat 账本 | 本章已经拍板了什么、还欠什么 |
| 世界契约 | fanfic 契约 | 称呼矩阵、禁忌、人物、秘密 |
| 三维记忆 | fade 账本 | 近章重点记、旧事逐步淡的记忆简报 |
| 文风档案 | voice 档案 | 句长/段长/对话比的 bands 与 avoid 词 |

## 安装

DSH → 设置 → 插件 → 搜索 **小说**（`dsh-novel-kit`）→ 安装。

装好后：

1. 右栏出现「小说」页签（总览 / 拍板 / 记忆 / 文风 / 设定 / 冲突）；0.2.0-dev 顶部有总开关、项目模式与两个导入口；
2. 在会话里先 `/novel master on` 打开总开关，再 `/novel on` 打开本会话的八个 `novel_*` 工具（默认关，只影响本会话）。

## 0.2.0-dev：总开关、模式与双导入

```
/novel master on                     # profile 级总开关；默认关，跨重启保留
/novel on                            # 只开本会话
/novel mode original <书>            # 原创：导入作品只影响文笔
/novel mode fanfic <书>              # 同人：需要绑定原著，世界观强约束
/novel off                           # 收起本会话
```

面板顶部有两个导入口：

- **学文笔**：导入 txt/md → 生成 provisional `StyleProfile`（bands/规则/avoid/decisionPolicy），进入「文风」段；不写世界事实。
- **写同人**：导入原著 → 绑定 `CanonSource` + `WorldContract`；只允许在 `fanfic` 模式；没有抽取/确认契约时 `start` 返回 `canon-required` / `canon-not-ready`。

两类导入共用 `SourceDocument`：同一作品双导入只存一份原文、两个用途绑定；原文按完整 SHA-256 去重。

## 一章怎么走

```
/novel master on
/novel on
novel_plan({ book, chapter, proposals: [...] })        # 只登记提案；作者在面板 adopt/reject
novel_chapter_start({ book, chapter })                 # 装配四段上下文
novel_chapter_write({ session_id, text })              # 保存正文（版本化草稿）
novel_chapter_finish({ session_id, segments, memory }) # 引文校验 → verify → 事务落账 → 回执
```

`novel_plan` 只允许 propose：模型不能自己 adopt/reject；拍板走面板的作者命令。`finish` 先跑确定性检查：禁忌词、20 字原著复制（同人）、疑似写错名字、长句、称呼矩阵、文风 bands。**blocker 不落账**；`strict: true` 时只检查本章声明过的能力。落账走「计划 → CAS → 回读 → 回执」的可恢复事务，原子写带 fsync。

## 八个工具

| 工具 | 作用 |
|---|---|
| `novel_plan` | 只登记提案（`propose`）；作者在面板拍板，模型不能 adopt/reject |
| `novel_canon` | 同人 canon：outline/read/propose；propose 只进 pending-review，作者确认后才可开写 |
| `novel_chapter_start` | 开一章：四段上下文 + 会话 |
| `novel_chapter_write` | 写正文（新版本；不落账） |
| `novel_chapter_finish` | 校验并落账（正文 + beat 段落 + fade 记忆卡 + 回执） |
| `novel_chapter_resume` | 恢复/重装配上下文，查看未完成事务 |
| `novel_chapter_abort` | 放弃本会话（不动已落账内容） |
| `novel_query` | 只读查询：`session` / `conflicts` / `memory` / `style` / `canon` / `ledgers` / `history` |

## 面板

- **六个页签**：总览（含最近章节历史）、拍板、记忆（搜索 + 钉/忘/恢复）、文风、设定、冲突；
- **0.2.0-dev 顶部**：总开关、项目模式（原创/同人）、两个导入口（学文笔 / 写同人）；
- **章节工作台**（会话主视图）：完整正文编辑/保存（Ctrl S，版本/hash CAS）、四段依据、账本 revision、本章检查、正文文件路径；
- **写操作**：拍板、记忆钉/忘/恢复、原著导入、接管旧五件；0.2.0-dev 起全部先检查总开关，remote 的 action 严格枚举。

> 完整「书桌 + 四入口工作台」还在开发中；当前面板是过渡版，不能代表 0.2.0 最终 UI。

## 和 beat / fade 等五件能共存吗？

**能装在同一个 DSH 里，工具、命令、条目 id 都不撞**；要小心的是**账本**不是注册表。

- 工具名：kit 是 `novel_*`，五件分别是 `beat_*` / `memo_*` / `voice_*` / `fic_*` / `cue_*`，没有同名；
- 命令：`/novel` 与 `/beat` `/memo` `/voice` `/fic` `/cue` 各用各的；
- 但 `finish` 写的就是 beat / fade 的原文件——两边同时开着写同一章，会重复登记或撞上 CAS 冲突（报错停下，不会静默覆盖）。

推荐只用一套执行者：面板「接管旧五件」只关选择层（不卸载），随时可回退。细节与实测见 [docs/COEXIST.md](docs/COEXIST.md)。

## 数据放在哪

```
<workspace>/.dsh-novel-beat/<book>/book.json        # 章节段落与拍板（kit 写）
<workspace>/.dsh-novel-fade/<book>/memory.json      # 记忆卡（kit 写）
<workspace>/.dsh-novel-voice/<library>/library.json # 文风档案（只读）
<workspace>/.dsh-novel-fanfic/<project>/project.json# 契约与 canon（只读兼容）
<workspace>/.dsh-novel-kit/                         # kit 的会话、事务与 0.2.0 资产
  ├─ projects/<book>/settings.json                  # mode / 文风绑定 / canon 绑定
  ├─ sources/<sha256>/                              # 导入作品原文 + 分章（两门共用）
  ├─ styles/<profileId>.json                        # 文风档案（provisional）
  ├─ canon/<book>/<sourceId>/world.json             # 世界契约（待抽取/确认）
  ├─ sessions/  transactions/                       # 章节会话与事务
  └─ prefs.json（在 $DSH_HOME/profiles/<name>/novel-kit/）  # profile 级总开关
```

旧账本原样读取，不改格式；卸载 kit 不会动这些文件。

## 证据

| 项目 | 结果 | 命令 |
|---|---|---|
| 单元/集成测试 | **149/149** | `npm test` |
| 合成工作区完整一章 | **19/19** | `npm run acceptance` |
| 真实账本验收（复制，不动原书） | **11/11** | `npm run acceptance:real` |
| 语法检查 | 通过 | `npm run check` |
| 打包 | 45 文件 | `npm pack --dry-run` |

## 已知边界

没有写盘故障注入、`resume` 不自动补完 partial 事务、面板写入无撤销、冲突页签只看前 8 条……完整清单见 [docs/LIMITS.md](docs/LIMITS.md)。

## 开发

```powershell
npm test                    # 单元/集成
npm run acceptance          # 合成工作区一章
npm run acceptance:real     # 复制真实账本走一章
npm run check               # 语法检查
node scripts\publish.mjs --skip-publish   # 发布前自检
```

本地 `link:` 联调时，Node 从仓库真实路径解析依赖，remote 行需要仓库里有 `node_modules/@deepseek-ai/dsh-typert-protocol`（指向与当前 DSH 同版本的包）：

```powershell
New-Item -ItemType Junction -Path node_modules\@deepseek-ai\dsh-typert-protocol -Target <解包的 DSH 目录>\node_modules\@deepseek-ai\dsh-typert-protocol
```

## 文档地图

| 文档 | 内容 |
|---|---|
| [docs/STATUS.md](docs/STATUS.md) | 一页纸：能力、证据、一章路径、还差什么 |
| [docs/DETAIL.md](docs/DETAIL.md) | 详情页长描述（插件市场用） |
| [docs/COEXIST.md](docs/COEXIST.md) | 与旧五件共存：会撞的、不会撞的、正确用法 |
| [docs/LIMITS.md](docs/LIMITS.md) | 已知边界与未做清单 |
| [docs/RELEASE.md](docs/RELEASE.md) | 发布清单：登录、发布、校验、GitHub Release |

## 喜欢它？

如果「小说整合包」帮你把一章从拍板写到落账、把前文记忆和文风都接上了，欢迎在 [GitHub](https://github.com/DrizzleGig/dsh-novel-kit) 点亮 ⭐，也欢迎 [Issue](https://github.com/DrizzleGig/dsh-novel-kit/issues) 或 [PR](https://github.com/DrizzleGig/dsh-novel-kit/pulls)。

## 共同作者

- [@DrizzleGig](https://github.com/DrizzleGig)
- [@MiyueWinter](https://github.com/MiyueWinter) — 共同贡献

## 许可证

MIT





