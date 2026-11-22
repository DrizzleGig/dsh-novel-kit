# 与旧五件共存（beat / fade / voice / fanfic / conductor）

结论先说：**能装在同一个 DSH 里，而且不会因为「工具同名」报错**——六件各用各的命名空间。
真正需要小心的是**账本**：kit 的 `finish` 落账写的就是 beat / fade 的原文件。两边同时写同一章会冲突。

本文的证据来自 2026-11-22 的 desktop profile 检查；修复 `package.json` 的 UTF-8 BOM 后，`plugin_manager list_plugins` 显示 `novel-kit` / `novel-kit-remote` 与旧五件均 `enabled=true`、`fiberPhase=active`，没有注册冲突。

## 1. 不会撞的部分

| 层面 | kit | 旧五件 |
|---|---|---|
| 插件条目 id | `novel-kit` / `novel-kit-remote` | `novel-beat(-remote)` / `novel-fade(-remote)` / `novel-voice(-remote)` / `novel-fanfic(-remote)` / `novel-conductor(-remote)` |
| 工具名 | `novel_*`（8 个） | `beat_*`（11）、`memo_*`（8）、`voice_*`（8）、`fic_*`（7）、`cue_*`（3） |
| 会话命令 | `/novel` | `/beat` `/memo` `/voice` `/fic` `/cue` |
| 右栏页签 / 槽位 id | `novel-kit.*` | 各自前缀 |
| remote 命名空间 | `dsh-novel-kit` | 各自的包名 |

所以：

- **不会**出现「工具已存在，注册失败」或「一个把另一个顶掉」；
- 面板会出现多个页签（小说 + 五件各自的 tab），这是并排显示，不是覆盖；
- `/novel on` 只把 `novel_*` 放进会话，**不会**自动关掉 beat / fade 的工具。

## 2. 会冲突的部分：账本

kit 的 `novel_chapter_finish` 提交时写这两份文件——它们属于 beat 与 fade：

```
<workspace>/.dsh-novel-beat/<book>/book.json      # 章节段落、决策
<workspace>/.dsh-novel-fade/<book>/memory.json    # 记忆卡
```

如果 beat / fade 同时开着并且在写同一本书：

1. **重复登记**：两边各自把同一章追加一次，章节列表出现两条或顺序错乱；
2. **CAS 冲突**：kit 落账前会用「计划时读到的前镜像哈希」（`beforeHash`）做提交校验。若期间文件被别人改过，提交失败：

   ```
   transaction: 冲突（book.json 已被外部修改）
   ```

   会话进入 `blocked`（`code: commit-failed`），要 `novel_chapter_resume` 看清状态再重试。**不会静默覆盖别人的写入。**

3. **面板看到的不是同一份状态**：两个面板各自取快照、各自刷新，同一时刻可能显示不同的「本章已完成/未完成」。
4. **坏账本会硬失败**：读到解析不了的 JSON，kit 报 `ledger-corrupt：...` 并停下，不会把坏文件当成空账本继续写。

这不叫「读取错误」，叫**两个写者对同一份数据没有共同事务**——kit 的事务只覆盖它自己那一次提交。

## 3. 正确用法

**只用 kit（推荐，长期使用）**

1. 先备份 `.dsh-novel-*`；
2. 装 kit，`/novel master on` → `/novel on` → `/novel legacy`，让 kit 接管旧账本；
3. 确认面板能看到旧书、章节、拍板、记忆；
4. 在插件管理里**卸载** beat / fade / voice / fanfic / conductor（不是只停用），让同一本账只有一个执行者；
5. 旧账本留在原目录，kit 就地读写；卸载插件不会删除这些文件。

如果只是暂时不想卸载，面板「接管旧五件」只关选择层（`setBundleEnabled(false)`），随时可回退；但它不等于卸载，长期仍建议只留一套执行者。

**只用旧五件**

不装 kit，或者装着但别 `/novel on`。kit 在关着的时候只占一个面板入口，不写任何账本。

**两个都留着做对比**

- 给**不同的书 / 不同工作区**用：账本按 `<workspace>/<book>` 隔离，互不相干；
- 别让两边同时写**同一本书的同一章**；如果已经发生，用 `novel_query({ view: "history" })` 和 `view: "ledgers"` 看实际情况，再手工修账本。

## 4. 一句话

| 问题 | 答案 |
|---|---|
| 工具同名会冲突吗？ | 不会，`novel_*` 与其他五件前缀不同，实测共存 |
| 会读取错误吗？ | 读到坏账本会明确报 `ledger-corrupt`；正常共存不报错 |
| 会写坏数据吗？ | 同时写同一章会重复登记或 CAS 冲突（停下，不覆盖） |
| 怎么最稳？ | 一套执行者：先 `/novel legacy` 接管，再卸载五件；临时可「接管旧五件」 |
