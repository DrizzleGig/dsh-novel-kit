# 小说整合包（dsh-novel-kit）

## 它是什么

一个**独立包**：装它一个，就获得 beat（事件与拍板）、fade（长篇记忆）、voice（文风）、fanfic（同人）、conductor（编排）五件的能力，并把它们串成一条作者决策链。

不需要再装那五个插件；如果已经装过，先按下面的迁移步骤接管旧账本，再卸载它们。

## 安装后你会得到

- **八个 `novel_*` 工具**：`novel_plan`、`novel_canon`、`novel_chapter_start`、`novel_chapter_write`、`novel_chapter_finish`、`novel_chapter_resume`、`novel_chapter_abort`、`novel_query`；
- **三层开关**：`/novel master on|off`（profile 级，默认关）、`/novel mode original|fanfic <书>`、`/novel on|off`（本会话）；
- **两个导入口**：学文笔 → `StyleProfile`；写同人 → `CanonSource` + `WorldContract`；
- **右栏任务卡**：下一笔 / 四段尺 / 收件箱 / 最近章节，详细页签收进「详情」；
- **小说工作台**：书桌、章节、故事、资料四个入口，章节可编辑完整正文并保存；
- **旧账本接管**：`/novel legacy` 扫描 `.dsh-novel-*`，为每本书建 kit 项目设置，就地读写，不复制、不迁移格式。

## 一章怎么走

```text
novel_plan({ book, chapter, proposals })          # 只登记提案；作者在面板拍板
novel_chapter_start({ book, chapter })             # 装配四段依据
novel_chapter_write({ session_id, text })          # 保存完整草稿（版本/hash）
novel_chapter_finish({ session_id, segments, memory })  # 检查 → 事务落账 → 回执
```

`finish` 先跑确定性检查：禁忌词、同人原著复制、疑似写错名字、称呼矩阵、文风 bands。blocker 不落账；通过后正文、beat 段落、fade 卡在同一个可恢复事务里提交。

## 原创与同人

- **原创**：导入只影响文笔，不注入 canon；即使误绑同人项目也不会加载世界段。
- **同人**：必须绑定原著，且世界契约已由作者确认；否则开章返回 `canon-required` / `canon-not-ready`。
- 同一作品双导入只存一份原文；文风与世界观是两个独立产物。

## 作者操作

- **拍板**：模型只能 propose；作者在面板拍板，走 `executeAuthorCommand`，带 operationId 幂等；
- **canon**：`novel_canon` outline/read/propose；面板可编辑事实/人物/规则/禁忌，确认后同人才可开写；
- **文风**：面板确认 provisional 档案；后续规则/锚句编辑仍在开发；
- **记忆**：面板钉卡 / 遗忘 / 恢复；
- **迁移**：`/novel legacy` 接管旧账本，再卸载五件。

## 从五件迁移

1. 备份 `.dsh-novel-beat/`、`.dsh-novel-fade/`、`.dsh-novel-voice/`、`.dsh-novel-fanfic/`、`.dsh-novel-conductor/`；
2. 安装 kit，`/novel master on` → `/novel on` → `/novel legacy`；
3. 确认面板能看到旧书、章节、拍板、记忆；
4. **再卸载** beat / fade / voice / fanfic / conductor（不是只停用），避免两套执行者同时写同一本账；
5. 旧账本仍在原目录，kit 就地读写；卸载插件不会删除这些文件。

旧 voice 文风库和旧 fanfic canon 是只读兼容；需要 kit 自己的档案时，用「学文笔」/「写同人」重新导入并确认。

## 数据

```text
<workspace>/.dsh-novel-beat/      # 剧情段落与拍板（读写）
<workspace>/.dsh-novel-fade/      # 记忆卡（读写）
<workspace>/.dsh-novel-voice/     # 旧文风库（只读兼容）
<workspace>/.dsh-novel-fanfic/    # 旧同人项目（只读兼容）
<workspace>/.dsh-novel-kit/       # kit 项目、原文、文风、canon、会话、事务、操作日志
```

## 边界

- 当前是 `0.2.0-dev.0`，真实 DSH 界面验收与写盘故障注入未完成；
- operation/canon 锁是单 Host 进程内锁；
- 不做 `/cue`、`/fic` 命令读取；旧数据只读兼容不等于完整迁移；
- 完整清单见 [LIMITS.md](LIMITS.md)，开发状态见 [DEV-STATUS.md](DEV-STATUS.md)。
