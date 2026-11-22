# 五插件功能与 UI 审计 / kit 统一信息架构

> 目标：kit 不依赖旧五件，也必须完整提供五件的能力与展示，并且比五件分开使用更高效。
>
> 本文是 2026-11-22 对五个仓库 README + `client.js` 的只读审计；不是「已实现」声明。

## 1. 五件各自有什么

### beat（拍板）— 右栏「拍板台」

**主入口**：`拍板台`，三个一级视图：

| 视图 | 内容 |
|---|---|
| 地图 | 按章/卷看已拍板决策、当前选择、其他走向、设定变化；搜索人物/秘密/物品/关键词；筛选（全部/待确认/已回退/待复核）；点决策看详情 |
| 时间线 | 拍板、段落登记、回退、体检、待复核按时间排列；可按类型过滤；回退条目可看旧线 |
| 体检 | 本章 10 项结构检查：未答决策、已拍板未登记正文、待确认设定、段落待续写、正文跑偏、未登记区间、到期承诺、待复核章、旧账缺正文等；分阻断/提醒/提示 |

**操作**：
- 决策卡片：选择一条走向、查看影响预览（截断多少字、作废哪些段落、撤回哪些设定、重开哪些决策）、确认回退/改选；
- 回退前保存正文+账本快照；旧线只读回看；
- 后续章节标「待复核」；
- 生成「重写工单」，交回当前会话；没有续写入口时可复制；
- 关闭拍板后侧栏仍可看历史，但不能回退/改选。

**对话侧**：`/beat on|off/status/list/revert/body/fork`；输入框上方的段落状态栏（当前章、已登记段、最后段字数、重写这一段、刷新）。

**数据**：`.dsh-novel-beat/<book>/book.json`，决策/段落/承诺/设定/审计/回退快照。

---

### fade（褪色）— 右栏「长篇记忆」

**主入口**：`长篇记忆`，三个一级入口：

| 入口 | 内容 |
|---|---|
| 总览 | 记忆预算（原文 token → 记忆 token、少读比例、累计少读）、人物/事件/已褪迷你统计、本章体检、最新人物、时间轴事件、原文贮存状态、「生成本章简报」；版本 vN |
| 记忆 | 搜索人物/事件/地点；卡片/人物两个分段；已钉住/已褪筛选；卡片详情（三维分数、因→果、锚句、回查原句并高亮）；章节档案（场景/关键动作/关键句/结尾/未闭合线索） |
| 溯源 | 时间线（沉淀/重做/遗忘/恢复/钉住）+ 原文索引/片段 + 按 artifactId 回查产物；原文 hash 不符标 stale |

**Sheet**：简报、卡片详情、人物记忆、原文片段、协作状态（只报 available/adapted/unavailable/unknown）。

**操作**：`memo_digest`、`memo_brief`、`memo_recall`、`memo_forget`（软删除/恢复，必须理由）、`memo_pin`（只保护）、`memo_state`、`memo_ingest`、`memo_source`；面板只读，不写/删。

---

### voice（创作风格）— 右栏「创作风格 / 风格工作室」

**主入口**：`风格工作室`（排字房），三个 tab + 五个 sheet：

| Tab | 内容 |
|---|---|
| 书架 | 容量、作品卡、来源类型（参考/旧稿）、统计状态、证据条数；统计/看证据/移除（二次确认） |
| 档案 | 风格卡（一句话+模式+统计）、来源与证据（按作品列证据条数）、核心选择、模式权重、档案时间线、对照镜入口 |
| 学习 | 候选技法（支持/反例，确认/忽略）、版本记录、最近反馈 |

**Sheet**：简报（场景切换/预览/复制）、证据（每条规则/作品原文与 hash）、时间线（版本与变更）、对照镜（粘贴文本→六项区间 + findings，无评分）、导入（参考/旧稿 + 文件夹/文件/路径）。

**能力**：`voice_import`、`voice_learn`（measure/sample/analyze/commit）、`voice_profile`（list/show/create/confirm/update/weights/rollback/templates/apply/regenerate）、`voice_brief`、`voice_check`（lint/rank）、`voice_polish`（定点改写五道校验）、`voice_feedback`。

---

### fanfic（同人）— 右栏「同人」

**主入口**：四个一级 tab：

| Tab | 内容 |
|---|---|
| 原著 | canon 与原著资料：事实、人物、关系、世界（规则/地点/物品/术语）、冲突、原文；每条带章节/偏移/引文；待审/已确认/有矛盾/已拒绝 |
| 本作 | Fic Canon：本作前提与改动（关系/时间线/知情/世界规则/称呼等），带来源、状态、证据；新增/编辑/确认 |
| 剧情 | 时间线、伏笔、事件；章节任务卡（目标/情绪曲线/节拍/开放问题） |
| 写作 | 章节选择、场景契约、去会话开写、草稿贴回检查、findings（在哪/凭什么/跟哪条冲突）、登记为改动/忽略/改稿 |

**顶部**：下一步（next）一行；待办 N 收进顶栏；项目选择器 + revision。

**操作**：导入原著、canon 提案确认/拒绝/裁决、本作改动、任务卡保存/丢弃、检查、忽略（waiver）、登记改动、原文回查、`/fic` 命令。

---

### conductor（故事总控）— 无客户端 UI

**核心**：一章 runbook，不写正文、不改兄弟账本。

- 步骤：`preflight → await_author → write → segment → verify → digest → close`；
- 能力矩阵：beat/fade/voice/fanfic 是否安装、ready、revision；
- 预算：四段字数；
- 收据：每步由宿主 `tools/result` 证明，绑定 agent/book/chapter/step 窗口；
- 失败/恢复：blocked、awaiting_author、resume、revert、close gate；
- 数据：`.dsh-novel-conductor/runs/<runId>/{run.json,receipts.jsonl,events.jsonl}`。

**kit 对应**：目前只有 `novel_plan → start → write → finish` 的隐式流程；没有显式的 runbook、步骤状态、收据时间线、能力矩阵。

## 2. kit 现状对照

| 领域 | 现有 | 主要缺口 |
|---|---|---|
| beat | `novel_plan`、`getDecisions`、面板拍板/拒绝、章节历史 | 决策地图/时间线/体检/搜索/影响预览/回退改选/旧线快照/重写工单/待复核 |
| fade | `getMemory`、搜索、钉/忘/恢复、记忆卡列表 | 预算与节省、健康检查、卡片详情/三维、人物/地点、章节档案、原文索引与片段、artifact 溯源、stale |
| voice | `importStyle`、档案列表、确认、styleHint/styleFit | 书架/导入证据、四层档案、技法卡、学习/候选、简报预览/复制、对照镜、反馈、定点改写、版本回滚 |
| fanfic | `importCanon`、`getCanon`、canon 编辑/确认、`novel_canon` | 原著事实/人物/关系/世界/冲突/原文、Fic Canon 本作差异、剧情时间线/伏笔、任务卡、检查 findings 与处置、待办 |
| conductor | 会话/事务/回执（部分） | 显式 runbook、步骤状态、收据时间线、能力矩阵、预算、失败恢复 UI |
| 导入/设置 | 学文笔/写同人、`/novel legacy` | 作品书架、来源证据、导入进度/错误、旧五件迁移面板 |

## 3. 建议的统一 IA

右栏只做「现在」：当前作品、下一笔、待处理、依据摘要。完整工作放在全屏工作台。

全屏工作台用**左侧 rail + 右侧检查器**，不是六个并排页签：

```text
left rail          main                         inspector
书桌               下一笔 / 收件箱 / 最近 +
                   章节流程（runbook/收据）      当前对象详情
正文               编辑器 / 工具条              依据 / 检查 / 批注
故事 (beat)        地图 / 操作时间线 / 体检 / 搜索 决策详情 / 影响预览 / 回退 / 旧线 / 工单
记忆 (fade)        总览 / 卡片 / 人物 / 溯源     卡详情 / 三维 / 原文 / stale
风格 (voice)       书架 / 档案 / 学习 / 对照镜   证据 / 简报 / 版本 / 反馈
同人 (fanfic)      原著 / 本作 / 剧情 / 写作     事实证据 / 契约 / findings / 任务卡
资料              导入 / 来源 / 设置 / 迁移      文件 / 版本 / 权限
```

规则：

- 一级入口固定 7 个：书桌、正文、故事、记忆、风格、同人、资料；
- conductor 的 runbook/收据/能力矩阵放在书桌的固定子视图「章节流程」，不单独占一级入口；
- 故事页的「操作时间线」（拍板/回退/体检）与同人页的「剧情时间线」（故事内事件）分开命名，不能混；
- 每个入口内部再用 2–4 个子视图，而不是再长一排平级 tab；
- 详情统一进 inspector/sheet，不把列表挤成卡片；
- 收件箱是跨域唯一「需要作者动手」队列：拍板、canon 审阅、冲突、失败操作、恢复；
- 主行动由确定性规则选择，不把 warning 全变成 blocker；
- 旧五件的视觉语言（朱批纸本、排字房、账本）可以作为域内装饰，但容器和控件统一用 DSH token。

## 4. 后端缺口（按优先级）

P0（没有这些，页面只能是空壳）：

1. `getBeatMap` / `getBeatTimeline` / `getBeatHealth` / `getBeatSearch`；
2. `previewDecisionImpact` / `applyDecisionRevert` / `getOldLine` / `getRewriteWorkOrder`；
3. `getFadeOverview`（预算/健康/统计）/ `getMemoryCardDetail` / `getMemorySource` / `getFadeTimeline`；
4. `getStyleShelf` / `getStyleEvidence` / `getStyleBrief` / `getStyleMirror`；
5. `getFanficSource`（事实/人物/关系/世界/冲突/原文）/ `getFicCanon` / `getFanficPlot` / `runFanficCheck` / `getChapterTaskCard`；
6. `getConductorRun` / `getConductorReceipts` / `getCapabilityMatrix`（或 kit 自己的等价 run 记录）。

P1：写操作（回退/改选、canon 审阅、任务卡保存、check 处置、waiver、本作差异、反馈、定点改写）和统一 operation receipt。

## 5. 结论

当前 kit 只是「有五个域的数据入口」，还不是「五个域的工作台」。下一步必须先补后端读模型，再按上面的 rail 结构做 UI；否则只是把空列表换个皮肤。
