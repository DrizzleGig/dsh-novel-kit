# dsh-novel-kit（小说整合包）

## 它是什么

一个**独立包**：装它一个，就获得 beat（事件与拍板）、fade（长篇记忆）、voice（文风）、fanfic（同人）、conductor（编排）五件的能力，不需要再装那五个插件。

## 一次装齐之后你会得到

- **7 个 `novel_*` 工具**：`novel_plan`（提案与拍板）、`novel_chapter_start`、`novel_chapter_write`、`novel_chapter_finish`、`novel_chapter_resume`、`novel_chapter_abort`、`novel_query`；
- **一个会话开关**：`/novel on|off|status`，默认关，只影响本会话；
- **右栏「小说」面板**：总览 / 拍板 / 记忆 / 文风 / 设定 / 冲突 六个页签（总览含最近章节历史）；
- **章节工作台**（会话主视图）：正文只读预览 + 四段写作依据 + 账本 revision + 本章检查 + 正文文件路径；
- **旧五件接管**：面板一键停用旧插件（保留安装状态），回退只恢复 kit 停用过的那几件。

## 一章怎么走

```
/novel on
novel_plan({book, chapter, proposals:[...]})        # 作者拍板：novel_plan({action:'adopt',...})
novel_chapter_start({book, chapter})                # 装配四段上下文
novel_chapter_write({session_id, text})             # 保存正文（新版本）
novel_chapter_finish({session_id, segments, memory})# 引文校验 → verify → 事务落账
```

`finish` 会先跑确定性检查：禁忌词、20 字复制（同人）、疑似写错名字、长句、称呼矩阵、文风 bands；**blocker 不落账**。`strict:true` 时只检查本章声明过的能力（`required_capabilities`）。

写成什么文件：`正文/第N章_标题.md`（同章覆盖，不产生副本）；即使账本提交失败，也不会把「已完成」写进会话。

## 作者操作

- **拍板**：`novel_plan({action:'adopt'|'reject'})` 把提案写进 beat decisions（或只标记拒绝），面板里也能二次确认；
- **记忆**：面板对每张卡「钉 / 忘 / 恢复」，事务写 fade 账本；
- **原著导入**：面板填 txt 绝对路径导入（切章 + 写 fanfic 的 source 布局，重复导入幂等；只收 UTF-8）；
- **接管旧五件**：面板一键停用（只动选择层），恢复时只开 kit 停用过的那几件。

## 只读查询（给模型按需查账本）

`novel_query({ view })`：

| view | 内容 |
|---|---|
| `session` | 当前/指定会话 |
| `conflicts` | beat canon 与同人原著的同键不同值（只报告） |
| `memory` | 记忆卡（可带 `query` 检索、`chapter` 影响 fidelity） |
| `style` | voice 档案（bands/rules/avoid）与书库 |
| `canon` | 同人契约：称呼矩阵、禁忌、人物、秘密 |
| `ledgers` | 四本账的 revision 与规模 |
| `history` | 章节历史：状态、字数、正文文件、完成时间 |

## 数据

沿用五件的 `.dsh-novel-*` 目录（只读兼容，不迁移）；kit 自己的会话与事务在 `.dsh-novel-kit/`。所有写入走「计划 → CAS → 回读 → 回执」的可恢复事务，原子写带 fsync。

## 证据

- `node --test` **105** 项；
- `npm run acceptance` **19** 项（合成工作区完整一章，含一次故意 verify 失败）；
- `npm run acceptance:real` **10** 项（复制真实账本，不动原书）。

## 边界

- 面板只读 + 少量写操作（拍板、钉卡/遗忘、导入、接管），都要二次确认，没有撤销；
- 不执行 `/cue`、`/fic` 之类的命令来读数据（那会往会话日志写行）；
- 旧五件仍是独立可用的包；kit 卸载后不会自动恢复它们，需要手动重新启用；
- 更完整清单见 [LIMITS.md](LIMITS.md)。
