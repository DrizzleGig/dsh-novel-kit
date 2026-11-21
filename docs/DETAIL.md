# dsh-novel-kit（小说整合包）

## 它是什么

一个**独立包**：装它一个，就获得 beat（事件与拍板）、fade（长篇记忆）、voice（文风）、fanfic（同人）、conductor（编排）五件的能力，不需要再装那五个插件。

## 一次装齐之后你会得到

- **7 个 `novel_*` 工具**：`novel_plan`（提案与拍板）、`novel_chapter_start`、`novel_chapter_write`、`novel_chapter_finish`、`novel_chapter_resume`、`novel_chapter_abort`、`novel_query`；
- **一个会话开关**：`/novel on|off|status`，默认关，只影响本会话；
- **右栏「小说」面板**：总览 / 拍板 / 记忆 / 文风 / 设定 五个页签；
- **章节工作台**（会话主视图）：正文只读预览 + 四段写作依据 + 账本 revision + 本章检查；
- **旧五件接管**：面板一键停用旧插件（保留安装状态），随时可恢复。

## 一章怎么走

```
/novel on
novel_plan({book, chapter, proposals:[...]})        # 作者拍板：novel_plan({action:'adopt',...})
novel_chapter_start({book, chapter})                # 装配四段上下文
novel_chapter_write({session_id, text})             # 保存正文（新版本）
novel_chapter_finish({session_id, segments, memory})# 引文校验 → verify → 事务落账
```

`finish` 会先跑确定性检查：禁忌词、20 字复制（同人）、疑似写错名字、长句、称呼矩阵、文风 bands；**blocker 不落账**。

## 数据

沿用五件的 `.dsh-novel-*` 目录（只读兼容，不迁移）；kit 自己的会话与事务在 `.dsh-novel-kit/`。所有写入走「计划 → CAS → 回读 → 回执」的可恢复事务。

## 边界

- 面板只读 + 导航；写操作（拍板、钉卡/遗忘、接管）都有明确的 remote 方法与二次确认；
- 不执行 `/cue`、`/fic` 之类的命令来读数据（那会往会话日志写行）；
- 旧五件仍是独立可用的包；kit 卸载后不会自动恢复它们，需要手动重新启用。
