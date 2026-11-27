# 六包能力对照与双向反馈台账

> 当前实施依据 · 2026-11-24。取代本文件 2026-11-22 的审计与旧实施结论。五件与 kit 均持续开发；本页是唯一能力台账，不表示六包已完全对齐。
> 配套：[六包方案](../../docs/小说插件系列-六包并行开发与设计方案-2026-11-23.md)、[共享写入边界](COEXIST.md)、[发布门禁](RELEASE.md)。

## 1. 规则与状态

新功能、行为变化、数据格式变化、安全修复在开工时登记。源侧先实现并发布，目标侧再移植；同一能力沿用同一 ID。双向反馈只移植差额，不能把已有能力算成再次新增。

- **已实现·未复验**：本轮已读到相关代码，没有重跑产品测试或真机验收。
- **部分实现**：只覆盖行内明确范围，其余不能宣称可用。
- **计划**：版本是目标，源码尚未交付。
- **待核验**：只继承历史功能清单，本轮未逐项核对代码与行为；不得当成已实现、缺失或已移植。
- **已验收**：须有命令、结果、数据版本、宿主操作证据；本轮没有新增此状态。

### 字段定义

| 字段 | 必填内容 |
|---|---|
| ID | 稳定 capabilityId，CHANGELOG 与夹具沿用 |
| 领域/归属 | 领域，以及五件独有、kit 独有、两边或共同协议 |
| 能力边界 | 可独立验证的语义，不能只写页面名 |
| 源包@版/提交 | 基线或计划首发版本；移植开工前补来源提交 |
| 目标包@版 | 承接版及方向，双向反馈只补差额 |
| 双方状态 | 源、目标分开，避免将源已实现误读为已移植 |
| 格式/写路径 | 资源、schema、只读边界；新写路径同步 COEXIST |
| 适配差异 | 领域模型、界面差异及未覆盖范围 |
| 夹具/gate/证据 | 共同输入、输出/落盘/错误/重试断言及证据索引 |
| 负责人 | Codex 实施，DSH Agent 复核，作者验收；表内简写 Codex |
| 日期/延期理由 | 最后更新、目标变更原因及复核截止时间 |

源版发布后进入移植队列。安全/格式变更未兼容则阻断目标发版；普通能力延期必须同时修改目标版、日期与理由。目标 CHANGELOG 写“移植自 fade@0.8.0”等确切版本、来源提交、能力 ID、适配差异。验收复用同一组行为夹具，比较输出、磁盘副作用、错误与重试，再验旧数据及真实 DSH 操作；通过才改为“已验收”。

本表日期均为 2026 年。“提交待钉”指尚未记录来源 commit；“提交待定”指计划增量还未实现。未钉提交和验收证据的行不得标已验收。包版本使用 brief 给定发布基线，未联网复查。本轮未细审的领域组先登记待核验，核验后拆成独立能力行再排移植版。

## 2. 已实现基线

修正旧表漏记的 kit 0.5 能力；没有五件目标的行只表示 kit 自用，并不表示五件已接收。

| ID | 领域/归属 | 能力边界 | 源包@版/提交 | 目标包@版 | 双方状态 | 格式/写路径 | 适配差异 | 夹具/gate/证据 | 负责人 | 日期/延期理由 |
|---|---|---|---|---|---|---|---|---|---|---|
| KIT-INBOX | 跨域/kit独有 | 拍板、canon、检查、失败操作统一收件箱 | kit@0.5.2（0.5.0引入；提交待钉） | kit@0.5.2 | 源已实现·未复验；目标同源 | 聚合只读视图 | 五件保留领域入口 | E1；条目与阻断范围对账 | Codex | 11-23 |
| KIT-EXCERPT | 资料/kit | 按来源与章节回查原文 | kit@0.5.2（0.5.0补强；提交待钉） | kit@0.5.2 | 源已实现·未复验；目标同源 | 读取 sources/、兼容 source/ | 不能再作为下一版新增回查 | E1；缺章/偏移/emoji | Codex | 11-23 |
| CANON-REVIEW | 同人/两边 | 候选/生效版本分离、显式应用、防漂移、幂等 | kit@0.5.2（0.5.0引入；提交待钉） | fanfic@0.3.0 → kit@0.6.0兼容差额 | 源已实现·未复验；目标计划 | kit canon schema 2；fanfic项目/canon | 保留旧confirmed，不整份覆盖schema | E1/E4；旧数据、过期零写、重试一次生效 | Codex | 11-23 |
| KIT-CHECK-LOCATION | 检查/kit | 可定位项带UTF-16范围；全文文风不定位 | kit@0.5.2（0.5.0补强；提交待钉） | kit@0.5.2 | 源已实现·未复验；目标同源 | findings只读 | voice已有定位，非整体首创回流 | E1；逐项对照README | Codex | 11-23 |
| KIT-DRAFT-BOUNDARY | 正文/kit | 切书脏稿提示、保存互斥、回包归属 | kit@0.5.2（0.5.0补强；提交待钉） | kit@0.5.2 | 源已实现·未复验；目标同源 | kit草稿/会话 | 不等于成稿已分书或partial可续交 | E1/E6；晚回包/切书/双保存 | Codex | 11-23 |

## 3. 五个领域与反馈队列

### beat（拍板）

| ID | 领域/归属 | 能力边界 | 源包@版/提交 | 目标包@版 | 双方状态 | 格式/写路径 | 适配差异 | 夹具/gate/证据 | 负责人 | 日期/延期理由 |
|---|---|---|---|---|---|---|---|---|---|---|
| BEAT-IDEMPOTENCY | beat/两边 | 写工具持久幂等键、task_context审计 | beat@0.11.0（本地提交 59e733f；未发布） | kit@0.6.0 | 源计划；目标部分操作已有幂等，统一语义计划 | book.json/操作回执 | 移植语义/夹具，不重复造kit操作日志 | E2/E6；重启不重账，同键异参拒绝 | Codex | 11-23 |
| BEAT-REVISE | beat/两边 | 改选与重写工单 | beat@0.11.0（本地提交 59e733f；未发布） | kit@0.5.2 | 源待核验（历史清单）；目标部分实现·未复验 | book.json/kit工单 | kit已有reviseDecision，不等于安全回退 | E2/E6；改选结果/工单核验 | Codex | 11-23；11-29前核验源侧 |
| BEAT-DEEP-AUDIT | beat/两边 | 状态差分检测、选项代价/后果/信息增量、可恢复改选与UI | beat@0.11.0（本地提交 59e733f；未发布） | kit@0.6.0（beat发布并验收后移植） | 源计划；目标计划 | 既有book.json/正文/rewinds快照；不新增共享根路径 | 先修复正文+账本半状态；voice仅只读贴合度 | E2/E6；3真分叉/9假候选、故障注入无半状态、同夹具对齐 | Codex | 11-24；目标在kit 0.6 gate后 |

| BEAT-SEGMENT-LOOP | beat/两边 | 段落循环：单自然段 append、段后检查、确定性合并、段边界回退与 merge verify（默认关闭实验） | beat@0.11.0（本地提交 59e733f；未发布） | kit@待定（beat 发布后另排） | 源实验切片·默认关闭·未发布；目标未排 | 只写 .dsh-novel-beat/<书>/ 自有目录，不写章节文件 | loop 章仍走旧提案口径（无 v3 证据闸门），已知问题；共享写者/恢复未过 gate 前不接 kit | E2/E5；段序/hash/合并/回退/重启幂等 | DSH | 11-25；目标待 beat 发布后 |
### fade（褪色）

| ID | 领域/归属 | 能力边界 | 源包@版/提交 | 目标包@版 | 双方状态 | 格式/写路径 | 适配差异 | 夹具/gate/证据 | 负责人 | 日期/延期理由 |
|---|---|---|---|---|---|---|---|---|---|---|
| FADE-OMISSION | fade/两边 | 逐卡漏装原因、原文回查闭环 | fade@0.8.0（计划；基线0.7.2；提交待定） | kit@0.6.0 | 源已有段级omitted/来源，逐卡增量计划；目标计划 | memory.json/原文读取 | 扩展已有来源，不造另一份记忆账本 | E3；正文/来源/遗漏逐卡对账，不破预算 | Codex | 11-23 |
| FADE-MEMORY-LAYERS | fade/两边 | 明确全量来源与淡化卡职责、字段/预算；禁止重复全文索引 | fade@0.8.0（计划；提交待定） | kit@0.6.0（fade发布并过同夹具后移植） | 源计划；目标计划 | 复用sources/与memory.json；原文64MiB、记忆库目标4MiB，超限拒写 | kit复用同一账本，不另建储存库 | 100章gold facts exact-ID召回100%，溢出不静默丢卡 | Codex | 11-24 |
| FADE-CROSS-SESSION | fade/两边 | 新会话开章前确定性生成≤1400字brief并校验回执；缺简报拒绝工具开章 | fade@0.8.0（计划；提交待定） | kit@0.6.0（fade发布并过同夹具后移植） | 源计划；目标计划 | brief由memo_brief派生；回执扩展现有run/事务记录，不新增handoff文件 | 工具驱动流程强门禁；自由对话无法阻止 | 新会话一次接续；第1章钉卡跨40章仍可取；forgotten卡不泄漏 | Codex | 11-24 |
| FADE-DEEP-AUDIT | fade/两边 | 三维/因果/锚句、档案、预算、artifact、stale完整呈现 | fade@0.7.2（提交待钉） | kit@0.5.2（基线核验） | 源待核验；目标待核验 | 记忆/原文/artifact | kit已有检索/分层/回查不能整块列缺口 | E3；逐视图及原文hash核验后拆行 | Codex | 11-23；11-29前核验 |

### voice（创作风格）

| ID | 领域/归属 | 能力边界 | 源包@版/提交 | 目标包@版 | 双方状态 | 格式/写路径 | 适配差异 | 夹具/gate/证据 | 负责人 | 日期/延期理由 |
|---|---|---|---|---|---|---|---|---|---|---|
| VOICE-EVIDENCE | voice/两边 | 完整证据分页，补G2–G4质量验收 | voice@0.4.0（0.3.0 证据分页合并；0.3.3 质量验收未做）；基线0.2.2；本地未发布 | kit@0.7.0 | 源现截支持40/反例20，增量计划；目标计划 | 文风库/档案、分页只读 | 移植证据语义，排字房布局留voice | E3/E7；分页无重漏，真人指标达线 | Codex | 11-25 拆分；kit 0.7 等两项都过 |
| VOICE-PERSONA | voice/两边 | 与文笔分离的人物卡；整书叙述/内心/行动/选择/对白证据提案与确认；beat 软排序只读适配；fade 不做（作者 2026-11-25 决定） | voice@0.4.0（0.3.1 人物/0.3.2 组合合并；getPersonaBrief）；本地未发布 | kit@0.8.0（0.7验收后；复用voice契约） | 源计划；0.3.1 extract/propose/confirm + 人物卡 sheet、0.3.2 getPersonaBrief、beat personaText 只读已本地实现（未发布）；A-B-C UI 未做；fade 不做；目标计划 | 既有profile.json可选characterStyles；personas/ 新增写入面；无新共享根路径；旧档缺省为空 | voice先做并发布；beat 仅消费确认卡；fade 不新增接口；kit 消费确认卡，不复制排字房UI | E3；全书证据回查、行为证据、未确认不注入、beat不自动拍板、无voice降级 | Codex | 11-25 调整；kit 0.7验收后排期 |
| VOICE-READER | voice/beat | 读者引用原文段落 + 喜欢/不喜欢 + 1–5 强度；作者确认后进 brief 的【写法】；beat 只读建议 | voice@0.4.0（合并发布候选；默认关；本地未发布） | 待定（kit 暂无排期） | 源计划；账本/工具/brief 读者行/面板 sheet/beat 读取已本地实现（未发布）；目标未排 | 新增 .dsh-novel-voice/<book>/ratings.jsonl + reader.json；不新增共享根 | 不训练、不给作品总分；beat 只建议、不改 gate/事实；无 voice 降级 | E3；引用回查、未确认注入=0、无 score、beat 降级 | Codex | 11-25 新增 |
| VOICE-DEEP-AUDIT | voice/两边 | 书架、学习、对照镜、反馈、定点改写、权重/回滚完整对照 | voice@0.2.2（提交待钉） | kit@0.5.2（基线核验） | 源待核验；目标待核验 | 档案/样本 | kit已有导入/确认/简报不算新增 | E3；逐工具/视图核验后拆行 | Codex | 11-23；11-29前核验 |

### fanfic（同人）

CANON-REVIEW 是本域下一版主项，状态与双向差额只在 §2 维护，避免重复行漂移。

| ID | 领域/归属 | 能力边界 | 源包@版/提交 | 目标包@版 | 双方状态 | 格式/写路径 | 适配差异 | 夹具/gate/证据 | 负责人 | 日期/延期理由 |
|---|---|---|---|---|---|---|---|---|---|---|
| FANFIC-DEEP-AUDIT | fanfic/两边 | Fic Canon、本作差异、剧情/任务卡、waiver、next完整对照 | fanfic@0.2.3（提交待钉） | kit@0.5.2（基线核验） | 源待核验；目标待核验 | 项目/canon/任务卡 | kit原著审阅/回查已有，不等于本作差异 | E4；逐类读写/检查闭环后拆行 | Codex | 11-23；11-29前核验 |
| FANFIC-AVATAR | 同人/两边 | 人物形象资产：官方图（Bangumi/AniList/Kitsu）+ 网页搜图（Bing/百度）+ 本地上传；作者确认、本地缓存、hash/stale、默认本地动漫头像 | fanfic@0.4.3（存储+来源+remote+工具+网页搜图/官方匹配/批量/上传 UI 已落；20 角色批次例 + 20 张真实官方图裁剪入库 20/20 confirmed；势力卡头像同步；真实宿主截图未做；提交待定） | kit@待定（源版发布后） | 源部分实现；目标计划 | `.dsh-novel-fanfic/<project>/avatars.json` + `assets/avatars/`；不 bump canon revision；图片不进 npm 包 | kit 复用元数据/读取，不复制 fanfic UI；kit 不写头像 | E4/E9；写入/替换/删除/stale/坏图/路径穿越/来源解析/下载 allowlist；接 UI 前补串行队列 | DSH | 11-26 更新；不得称已可用 |

### conductor（故事总控）

| ID | 领域/归属 | 能力边界 | 源包@版/提交 | 目标包@版 | 双方状态 | 格式/写路径 | 适配差异 | 夹具/gate/证据 | 负责人 | 日期/延期理由 |
|---|---|---|---|---|---|---|---|---|---|---|
| CONTEXT-FINGERPRINT | conductor/两边 | 续跑四源指纹、失效阻断 | kit@0.5.2（提交待钉） | conductor@0.2.0 → kit@0.6.0差额 | 源已有指纹·未复验；目标计划 | run上下文/依赖记录 | 补齐各源完整依赖，非盲拷算法 | E5；四源各变更，重装配后续跑 | Codex | 11-23 |
| CONDUCTOR-OWNERSHIP | conductor/共同协议 | 获取/传递/结束或恢复同一flowId；步骤收据绑定所有权 | contracts@0.1.0（条件立项） | conductor@0.2.0 → kit@0.6.0 | 源计划；目标计划 | flow登记/run记录与既有收据 | conductor不代写兄弟账本；kit只传同一flowId，写权由底层锁拒绝 | E5/E6、COEXIST；双run仅一写者、旧回执不能串用 | Codex | 11-24 |
| CONDUCTOR-DEEP-AUDIT | conductor/两边 | runbook、步骤、能力矩阵、收据时间线、等待态完整对照 | conductor@0.1.4（提交待钉） | kit@0.5.2（仅基线，不移植完整runbook） | 源六步代码已读·未复验；kit有plan→start→write→finish，无conductor adapter | run.json/receipts/events | 五件场景由conductor编排；kit-only走kit原生流程，0.2.0不做adapter | E5；五件与仅kit两环境、缺能力阻断、真实整章收据核验 | Codex | 11-24 |

## 4. kit 独有增量

以下跨域产物由 kit 首发，无整套界面回流目标；五件继续开发各自领域能力。

| ID | 领域/归属 | 能力边界 | 源包@版/提交 | 目标包@版 | 双方状态 | 格式/写路径 | 适配差异 | 夹具/gate/证据 | 负责人 | 日期/延期理由 |
|---|---|---|---|---|---|---|---|---|---|---|
| KIT-EXPORT | 交付/kit独有 | 成稿清单、MD/TXT导出 | kit@0.6.0（计划；提交待定） | kit@0.6.0 | 源计划；目标同源 | 分书正文/导出目标 | 依赖0.5.3隔离 | E6/E8；双书章序/内容一致 | Codex | 11-23 |
| KIT-RECOVERY-VIEW | 跨域/kit独有 | 恢复/流程交接视图 | kit@0.6.0（计划；提交待定） | kit@0.6.0 | 源计划；目标同源 | kit事务/会话/共同锁目录 | 续交底层先在0.5.3修；旧写者不开放安全交接 | E6/E8；partial界面续交、冲突停写 | Codex | 11-23 |
| KIT-IMPACT | 跨域/kit独有 | 影响清单、逐章复核重算队列 | kit@0.7.0（计划；提交待定） | kit@0.7.0 | 源计划；目标同源 | 依赖索引/复核状态 | 未知显式，不自动覆盖正文 | E8；早章改动后依赖对账 | Codex | 11-23 |
| KIT-PORTABILITY | 交付/kit独有 | 备份还原预演、迁移/升级回退 | kit@1.0.0（计划；提交待定） | kit@1.0.0 | 源计划；目标同源 | 正文/账本/外部资料清单 | 空目录还原；原地覆盖须确认 | E8；hash/升降级/真人4周门禁 | Codex | 11-23 |

## 5. 共享协议与兼容

当前“一本书一套写流程”是人工约定，尚无跨包锁保证。.dsh-novel-locks/ 仅是目标路径，不能建立目录便宣称安全。写路径、判活、回收、外部编辑边界统一见 [COEXIST](COEXIST.md)。

| ID | 领域/归属 | 能力边界 | 源包@版/提交 | 目标包@版 | 双方状态 | 格式/写路径 | 适配差异 | 夹具/gate/证据 | 负责人 | 日期/延期理由 |
|---|---|---|---|---|---|---|---|---|---|---|
| COMMON-WRITER | 共享/六包 | 资源身份/流程所有权/跨进程锁/锁内校验 | contracts@0.1.0（kit+beat原型过闸后） | beat@0.10.0、fade@0.8.0、voice@0.3.0、fanfic@0.3.0、conductor@0.2.0、kit@0.6.0 | 源计划；各目标计划 | 新增.dsh-novel-locks/；原账本保留 | 不统一业务schema；所有写入口接入 | E6/E8；别名/双进程/判活/回收竞争 | Codex | 11-23 |
| KIT-BOOK-PATH | 共享/kit修复 | 成稿按稳定书身份隔离 | kit@0.5.3（计划；提交待定） | kit@0.5.3 | 源计划；目标同源 | 正文由平铺改分书（目标） | 旧稿归属不明即停，不猜迁移 | E6；两书同章不覆盖 | Codex | 11-23 |
| KIT-PIN-WINDOW | 记忆/kit修复 | 钉卡不被40章窗口丢弃 | kit@0.5.3（计划；提交待定） | kit@0.5.3 | 源计划；目标同源 | 记忆候选读取，不改格式 | 超预算提示；不泄漏未来/复活遗忘卡 | E6；第1章钉卡在100章可取 | Codex | 11-23 |
| KIT-PARTIAL | 共享/kit修复 | 续交、冲突停写、补回执 | kit@0.5.3（计划；提交待定） | kit@0.5.3 | 源计划；目标同源 | 正文/beat/fade、事务镜像/回执 | after跳过、before补交、第三种hash处理后新事务 | E6；逐写点中断、不重账 | Codex | 11-23 |

contracts 在双消费者同实现、跨进程/崩溃/别名 gate 通过后建包；此前维持文档契约及原型。协议未完成时继续人工单流程，不冻结五件开发。各包独立 semver，精确记录协议依赖。

## 7. 2026-11-24 媒体与新人群设计（部分实现）

下列能力来自 [fanfic媒体与kit新人群设计](../../docs/小说插件系列-fanfic媒体导入与kit新人群-2026-11-24.md)。目标版本是建议，不替代系列总计划；开工前补来源 commit 和负责人，目标版本若冲突须同步更正本节与主文档。媒体源先在 fanfic，发布后 kit 才移植；kit 两个新人群能力为 kit 独有。

| ID | 领域/归属 | 能力边界 | 源包@版/提交 | 目标包@版 | 双方状态 | 格式/写路径 | 适配差异 | 夹具/gate/证据 | 负责人 | 日期/延期理由 |
|---|---|---|---|---|---|---|---|---|---|---|
| FANFIC-HONGGUO-SOURCE | 同人/两边 | 红果短剧只读元数据：搜索/剧集/分集/弹幕；不取播放地址/内容密钥 | fanfic@0.4.1（WASM+四个 `fic_source` action+红果独立一级页（名称搜索/分集/弹幕）已落；真实宿主未测；提交待定） | kit@待定 | 源部分实现；目标计划 | 无新写路径；`lib/vendor/openhongguo/` 为代码；不存播放地址/密钥 | kit 复用同一只读接口，不复制 WASM/UI | E9；无 `resolvePlayback`、只读白名单、网络失败降级 | DSH | 11-26 新增；不得称独立可用 |
| FANFIC-COMIC-READ | 同人/两边 | 本地 CBZ/ZIP/图片目录分页；灰度分格；只对选中页做 Windows 内置 OCR；可分格逐格 OCR；不接平台、不整本 OCR | fanfic@0.4.1（`lib/comic.mjs`、`lib/image-gray.mjs`、`lib/image-crop.mjs`、`lib/panel-detect.mjs`、`lib/windows-ocr.mjs`、`comic_list/comic_panels/comic_ocr` 已落；金标合成页 2 格/整页+逐格 OCR 通过；真实商业漫画集/证据跳转未做；提交待定） | kit@待定 | 源部分实现；目标计划 | 无新写路径；OCR/分格/裁剪临时文件在系统 temp，完成后删除 | kit 复用只读接口，不复制 UI；不接漫画平台 | E9；CBZ/目录夹具、选中页边界、分格合成夹具/金标合成页、OCR 失败不中断、路径穿越 | DSH | 11-26 新增；不得称独立可用 |
| FANFIC-MEDIA-EVIDENCE | 同人/两边 | 本地只读漫画/视频来源；页格/时间码类型化证据、hash verifier；提案/接受/拒绝/应用分离 | fanfic@0.4.1（`lib/media.mjs` + `media_*` action + verifier + 媒体视图代码已落；真实宿主未测；提交待定） | kit@0.8.0（建议；精确源版发布后移植） | 源部分实现；目标计划 | `.dsh-novel-fanfic/<project>/media.json` 只存来源元数据/短证据；原件外置；详见 COEXIST | fanfic 绑定项目 canon；kit 复用证据协议与审阅差额，不复制解析器 | E9；来源/定位/短引文、hash/stale、删除级联、失败零写；真实 DSH 审阅未做 | DSH | 11-26 更新；kit版等源版发布且夹具通过 |
| FANFIC-MASTERY | 同人/两边 | 关系演化、叙事结构、AU 影响、OOC 证据卡、读者假设 | fanfic@0.4.2（`lib/analysis.mjs` + `fic_analyze` + 剧情→分析 UI + 夹具项目五类报告已落；OOC 走 `fic_check`；真实商业项目/证据跳转/宿主未做；提交待定） | kit@0.8.0（建议；复用差额） | 源部分实现；目标计划 | canon/事件/引用；不自动改正文 | 证据与解释分开；kit 使用同一规则/夹具 | E9；金标来源覆盖、未知显式、无依据自动改写为0 | DSH | 11-26 更新；视真实报告通过调整 |
| KIT-FAN-MATERIAL | kit独有 | 手工公开素材引用、时间线核验、事实/传闻/解读分型，虚构AU | kit@0.8.0（计划；提交待定） | kit@0.8.0 | 计划；未实现 | `.dsh-novel-kit/community-sources/`；见 COEXIST | 不自动抓平台；canon 引用需用户确认 | E9；失效链接 stale；敏感/未成年边界拒绝 | Codex | 11-24；上线前合规样例审查 |
| KIT-OTOME-IMPORT | kit独有 | 官方许可分享或用户粘贴短文本→角色候选→作者确认 | kit@0.8.0（计划；提交待定） | kit@0.8.0 | 计划；未实现 | 用户来源元数据/短摘录，不保存整线资源 | 角色事实入 canon；角色写法提示不并入 voice 作者档案 | E9；撤回失效；无授权档案/存档/逆向拒绝 | Codex | 11-24；逐款协议不明则仅手工笔记 |

E9 指设计门槛，不是已执行报告；实施时补命令、样例、测试输出、来源提交及宿主证据。当前仍按 COEXIST 人工单流程写入，不因新增计划假定已有锁或书间隔离。

## 6. 验收证据

本轮为源码/文档读取，没有重跑测试、查 npm、安装或发布。表中 gate 是待执行标准，不是通过报告；实际验收时补来源提交、命令、输出与截图。

| 索引 | 依据及本轮能证明什么 |
|---|---|
| E1 | [kit CHANGELOG](../CHANGELOG.md) 0.5.0/0.5.1；[canon](../lib/engine/canon.js)、[remote](../lib/host/remote.js)、[README](../README.md)：收件箱/回查/审阅/定位边界/草稿已有 |
| E2 | [beat适配协议](D:/插件/plugins/novel-beat/docs/conductor-adapter.md) §0.9；[kit chapter](../lib/engine/chapter.js) reviseDecision：beat未做持久幂等/task_context，kit已有改选工单；深层能力未逐项复验 |
| E3 | [fade brief](../../dsh-novel-fade/lib/brief.js) 第277–313行已有段级遗漏/来源；[voice remote](../../dsh-novel-voice/lib/remote.js) 第446、456行截断证据 |
| E4 | [fanfic proposals](../../dsh-novel-fanfic/lib/proposals.mjs) 第289行确认改status；[canon-store](../../dsh-novel-fanfic/lib/canon-store.mjs) 第158–186行单一revision |
| E5 | [kit context](../lib/engine/context.js) 第194–218行指纹；[conductor run-machine](../../dsh-novel-conductor/lib/run-machine.js) 第889–950行resume；[contract](../../dsh-novel-conductor/docs/contract.md) 服务差异 |
| E6 | [transaction](../lib/storage/transaction.js) 第76–82行先hash后写、第107–122行恢复仅分类；[chapter](../lib/engine/chapter.js) 第894–906行未分书；[memory3d](../lib/engine/memory3d.js) 第20、30行先窗口后pinned |
| E7 | [voice设计](../../docs/小说插件系列-voice-v0.2.0-设计与开发方案.md) 第145–147、562–564行；[voice README](../../dsh-novel-voice/README.md) 第156行未完成人工验收：50–100句召回≥70%、误报≤1/千字；3章真实fix零新增事实/窗外diff=0；10组盲选≥7组偏好改后 |
| E8 | [六包方案](../../docs/小说插件系列-六包并行开发与设计方案-2026-11-23.md) §4–8；[COEXIST](COEXIST.md)、[RELEASE](RELEASE.md)：目标与门禁，不是实现证明 |

## 9. 2026-11-26 kit 0.6.x 同步队列（历史，第一版）

> **历史**：本节建立在“共享账本 + schema 闸门 + 写者所有权 + 委托写”上；作者 2026-11-26 21:14 明确 kit 运行时与五件零交互/零写入，唯一交互是单向继承导入。本节保留作历史，当前口径见 §10。

> 本节是 [方案-kit-0.6.x-同步与拓展-2026-11-26.md](../../docs/方案-kit-0.6.x-同步与拓展-2026-11-26.md) §5 的台账化版本；§2–§7 的旧行保留作历史/证据，不删除。源包已发布版本：beat@0.12.1、fade@0.8.2、voice@0.4.0、fanfic@0.4.3、conductor@0.2.0；kit 基线 0.5.2。所有行状态为“计划/待实施”，不得标“已验收”；实施时补源提交、夹具、命令与证据。

| ID | 来源@版 | kit 现状 | 目标版/形态 | 写路径/边界 | 夹具/gate |
|---|---|---|---|---|---|
| KIT-BEAT-V3-GUARD | beat@0.12.1 | P0：kit 写 v3 会缺 requestId/requests 与 ledgerHash | 0.5.3：v3+ 业务写全拒、只读；0.6：完整 v3 写 | 共享 `.dsh-novel-beat/<book>/book.json`；只写完全支持的 profile | 双书同章、v3 adopt/revise/finish/recovery 全拒、beat loader 回读 0 损坏 |
| KIT-CORRUPT-GUARD | kit 自身 | P0：ensureBook 吞读错、可能覆盖坏账本 | 0.5.3 | `lib/engine/book.js` 仅 ENOENT 初始化 | 坏 JSON 建书字节不变、权限错不重建 |
| KIT-TXN-RECOVER | kit 自身 | P0：partial/conflict 只分类；plan 可覆写；all-applied 可缺回执 | 0.5.3 inspect/resume/rollback | `.dsh-novel-kit/transactions/` 不可变计划/镜像 | 各写点中断、第三 hash 停、重复重试一次副作用 |
| KIT-FANFIC-WRITE-OFF | fanfic@0.4.3 | P0：旧 importSource 直接写 fanfic source/project | 0.5.3 停用/重路由；0.7 委托 | 不写 `.dsh-novel-fanfic`；kit 自有来源 | kit 不再写 fanfic 目录；旧项目只读可查 |
| KIT-TEST-ISOLATION | kit 自身 | P0：真实书测试以目录存在决定执行，当前 217/219 | 0.5.3 夹具/opt-in | `test/fixtures/`，不写作者目录 | 干净夹具 219/219；不删除真实目录换绿 |
| BEAT-V3 | beat@0.12.1 | 旧投影 | 0.6 解码＋决策/收尾写 | 六要素/零岔路/作答/hash/回退约束 | 源 loader 回读、回退、继续拍板 |
| BEAT-CUSTOM | beat@0.12.1 | 缺 | 0.6 pendingCustom 读；0.7 写 | 作者回答凭据不可由模型填 | 待补不冒充已执行、重复回答 |
| BEAT-REVERT | beat@0.12.1 | 部分改选工单 | 0.6 回退预览/0.7 完整改选 | 正文 binding/stale/逐写点中断 | 后章只标待复核 |
| BEAT-LOOP | beat@0.12.1 | 缺 | 0.7 段落 UI/存储，默认关 | beat 产合并 artifact，kit 唯一写章稿 | 顺序/合并 hash/回退/幂等 |
| FADE-CURVE | fade@0.8.2 | 旧三维部分 | 0.6 曲线/L0–L3/容量读 | 只读；不复制宽 sheet | 百章/钉卡/遗忘/未来章 |
| FADE-ARCHIVE | fade@0.8.2 | 缺 | 0.6 归档/摘要/check 读；0.7 委托写 | proposalHash+expectedRevision；失败不删 L0 | 3/4 MiB、缺对象、恢复 |
| FADE-DIGEST | fade@0.8.2 | legacy 追加 | 0.7 新版委托 | 原文/索引/卡/回执一致 | 重复提交、源 hash |
| VOICE-STYLE | voice@0.4.0 | 0.2 部分 | 0.6 规则/指纹读 | 只读；default off | 未知规则/无服务降级 |
| VOICE-PERSONA | voice@0.4.0 | 缺 | 0.6 人物/ABC 读；0.7 委托入库 | 未确认不注入；不串卡 | 全书证据、作者确认 |
| VOICE-READER | voice@0.4.0 | 缺 | 0.6 偏好读；0.7 委托评分 | 引文/hash/去重/改评重审 | 不输出作品总分 |
| FIC-AVATAR | fanfic@0.4.3 | 缺 | 0.6 头像/权利读 | 只读，不写 avatars | confirmed/缺图/懒加载 |
| FIC-MEDIA | fanfic@0.4.3 | 文本 canon 部分 | 0.6 媒体证据读；0.7 审阅委托 | 页格/时间码/hash/stale | unverified 不应用 |
| FIC-ANALYSIS | fanfic@0.4.3 | 缺 | 0.6 五类分析摘要 | 事实/推断分开 | 不自动改正文 |
| CUE-SCOPE | conductor@0.2.0 | 缺 | 0.6 身份/能力/锁读 | 工作区锁 + bookId 记录；不宣称六包每书锁 | 多书歧义/alive/dead/unknown |
| CUE-RECEIPT | conductor@0.2.0 | 仅 kit 事务 | 0.6 runbook/收据读 | 不改 run/不造收据 | 书/章/run/hash 错配拒收 |
| COMMON-WRITER-KIT | contracts 未建 | kit 模块内锁 | 0.6 原型/0.7+ | 最终提交点、资源固定顺序 | 双进程/别名/PID 复用/迟到 token |

**登记规则**：源包先发布、目标侧同夹具通过后才可把“计划”改为“已验收”；读适配写“只读适配自 x@版本”，委托写注明执行者；`CHANGELOG` 逐项写来源版本与适配差异。kit-only 的高级能力缺口见主方案 §4.5。

## 10. 2026-11-26 kit v2 原生移植与继承队列（当前）

> 依据 [方案-kit-v2-独立化-2026-11-26.md](../../docs/方案-kit-v2-独立化-2026-11-26.md)。**kit 运行时与五件零交互、零写入**：不共享账本、不做 live binding、不委托五件写；五件数据只在显式“继承导入”时只读，转成 kit 原生数据。本节取代 §9 的共享账本口径；§2–§9 保留作历史。
>
> 写路径只有 kit 自有：`.dsh-novel-kit/` 与 `正文/<bookId>/`。五件目录一律只读；导入源文件不改、不移动、不删除。

| ID | 五件源@版 | kit 原生模块/目标 | 0.6 / 0.7 | 状态 | 夹具/gate |
|---|---|---|---|---|---|
| KIT-NATIVE-BOOK | kit@0.5.2 | `books.json` + `books/<id>/book.json` + `正文/<bookId>/` | 0.6 | 计划 | 双书同章不覆盖、bookId 稳定、坏 JSON 不重建 |
| KIT-NATIVE-DECISIONS | beat@0.12.1 | `native/decisions.js` + `decisions/<id>/ledger.json` | 0.6 读/写基础；0.7 v3 请求/回答/gate/loop | **0.7 起步**：requests/answers/decision + gate + loop 状态；loop 执行/段落 UI 未做 | 作者回答凭据、段落引用、完整性 hash、恢复 |
| KIT-NATIVE-MEMORY | fade@0.8.2 | `native/memory.js` + `memory/<id>/memory.json` | 0.6 卡/实体/线索/归档导入；0.7 曲线/巩固 | **0.7 起步**：archive/restore + retentionCurve/consolidateMemory；曲线 UI 未做 | 钉卡跨窗口、遗忘/未来章、归档恢复 |
| KIT-NATIVE-STYLE | voice@0.4.0 | `native/styles.js`（复用 profiles/metrics） | 0.6 规则/指纹读、人物/评分导入；0.7 写侧 | **0.7 起步**：评分 + 人物卡提案/确认；证据分页未做 | 未确认不注入、人物不串卡、读者不回写总分 |
| KIT-NATIVE-CANON | fanfic@0.4.3 | `native/canon.js`（契约/审阅/回查） | 0.6 canon/媒体/头像导入；0.7 原生媒体/分析 | **0.7 起步**：fanfic media → native media，确认/拒绝才进 brief；canon 媒体绑定/分析未做 | 事实/推断分开、stale 不注入、不自动改正文 |
| KIT-NATIVE-RUNS | conductor@0.2.0 | `native/runs.js` | 0.6 历史 run 只读；0.7 原生 runbook | **0.7 起步**：create/list/update/step；UI 未做 | 不恢复五件调度/锁/会话；收据仅 kit |
| KIT-LEGACY-MIGRATION | kit@0.5.x | `migrations/{classify,legacy-kit}.js` | 0.6 | 计划 | kit 来源/五件/混合分类；平铺正文按证据归书；旧事务不重放 |
| KIT-INHERIT-BEAT | beat@0.12.1 | `imports/readers/beat.js` | 0.6 | 计划 | v1/v2/v3 字段、源 hash 不变、缺凭据标 legacy |
| KIT-INHERIT-FADE | fade@0.8.2 | `imports/readers/fade.js` | 0.6 | 计划 | v3 新旧、archive/stub、retention 字段、缺件报告 |
| KIT-INHERIT-VOICE | voice@0.4.0 | `imports/readers/voice.js` | 0.6 | 计划 | library/profiles/personas/ratings、引用重映射 |
| KIT-INHERIT-FANFIC | fanfic@0.4.3 | `imports/readers/fanfic.js` | 0.6 | 计划 | project/canon/source/media/avatars、deltas 本作设定 |
| KIT-INHERIT-CONDUCTOR | conductor@0.2.0 | `imports/readers/conductor.js` | 0.6 | 计划 | book(s)/runs/receipts 历史化，不恢复锁/调度 |
| KIT-IMPORT-WIZARD | kit 自身 | `client-src/import-wizard.js` + remote | 0.6 | 计划 | 预览/缺件/冲突/取消/报告；卸载五件不报缺服务 |
| KIT-OWN-LOCK | kit 自身 | `lib/storage/locks.js` | 0.6 | 计划 | 工作区写锁、token/PID/心跳；未知锁主拒接管 |
| KIT-NO-FIVE-RUNTIME | 全部五件 | 删除 `binding/ledger/import/takeover` 运行时耦合 | 0.6 | 计划 | 五件不存在/拒读/卸载三态，核心链全通，外部访问=0 |

**登记规则**：源包先发布 → kit 原生模块设计 → 移植/重写 → 同夹具验收；`CHANGELOG` 写“移植自 x@版本（原生实现，不共享账本）”；只借思路的项目不入 vendor。任何行都不得标“已验收”，直到 DSH 有命令/夹具/证据。

## 11. 2026-11-27 六包同步补丁（本地，未发布）

> 依据 [方案-六包同步补丁与双栈实测-2026-11-27.md](../../docs/方案-六包同步补丁与双栈实测-2026-11-27.md)。状态统一为“已实现·本地 check/test 通过·未发布·未真实 GUI 验收”；不得标“已验收”或“已发布”。

| ID | 领域/归属 | 本轮改动 | 目标版本 | 证据 |
|---|---|---|---|---|
| KIT-NATIVE-CANON-IMPORT | 同人/kit | fanfic 继承导入把已确认 canon 投影成 kit `world.json` 并绑定 `mode=fanfic`/`activeCanonSourceId`；原文进 kit `sources/` | kit 0.7.1 | `test/native-import.test.mjs`；QA 导入 `canonReady=true`，源 hash diff=0 |
| KIT-HEADLESS-CWD | 运行/kit | 无 `exec.cwd`/`workingDirectory` 时回落到进程工作目录；工具输出 lossless JSON | kit 0.7.1 | headless `novel_query/start/write/finish` 跑通 |
| KIT-QUERY-TRUNCATION | 模型输入/kit | 非 session 结果从 400 字放宽到 4000 字并标截断 | kit 0.7.1 | `view=canon` 返回完整条目 |
| KIT-STYLE-LOCK | 并发/kit | 先持有跨进程锁再启动 confirm/rate task | kit 0.7.1 | `npm test`；锁顺序代码复核 |
| CONDUCTOR-KIT-ISOLATION | 共存/conductor | `MANAGED_PREFIXES` 去掉 `novel_`/`kit_`；总控开关/scope 不再拦 kit；`cue_call`/`listTools` 在 ProviderPolicy 前硬拒 kit 命名空间 | conductor 0.2.1 | gateway 边界测试；all-six `novel_query` 返回 ok |
| CONDUCTOR-FANFIC-PROJECT | 共存/conductor | `cue_run` schema 增加 `fanfic_project`；run 未声明项目时允许显式 project | conductor 0.2.1 | five-stack `cue_run` blocked=false，fanfic ready |
| CONDUCTOR-RUNBOOK-TOOLS | 路由/conductor | `fic_canon→fic_contract`；plan `novel_plan→beat_plan`；verify 不再硬绑 beat.verify；close 回读 chapter hash | conductor 0.2.1 | run.json runbook 与 `npm test` |
| FADE-BEAT-SCHEMA3 | 记忆/fade | 只读 beat schema 3；malformed v3 decisions 中性降级 | fade 0.8.3 | schema 3/坏形状测试 |
| FANFIC-MISSION-PATH | 安全/fanfic | 任务卡 project/chapter 路径校验，拒绝穿越/保留名；junction 缺口登记下一补丁 | fanfic 0.4.4 | 路径负例测试 |
| VOICE-PROJECT-BINDING | 风格/voice | 多项目无显式 project 时返回歧义，不取第一个 | voice 0.4.1 | 多项目测试 |
| VOICE-POLISH-PATH | 安全/voice | `write:true` 只允许工作区内普通文件；`dir` 必须与宿主 cwd 一致；拒绝越界/符号链接 | voice 0.4.1 | 越界 dir/文件测试 |
| KIT-PUBLISH-SKIP | 发布/kit | `acceptance-real` SKIP 用 exit 2；publish 只对 `code=2 && SKIP` 跳过，其余失败 | kit 0.7.1 | 本机自检实际输出 SKIP 而不再 pass |
| KIT-CANON-PAGE | 模型输入/kit | `novel_canon(read)` 增加 `offset/limit/nextOffset`，默认 3000 字；不再只有 4k 渲染窗口 | kit 0.7.1 | 模拟 `chars=4023 next=100` |
| KIT-IMPORT-STALE | 导入/kit | `world.json` 记录 `fanficCanonHash`；原文不变但 fanfic confirmed canon 变化时拒绝复用旧投影 | kit 0.7.1 | 新增 stale projection 测试 |
| KIT-IMPORT-AMBIGUOUS | 导入/kit | 多来源 fanfic 无法按 `project.sourceId` 唯一匹配时，在写数据前拒绝导入 | kit 0.7.1 | 新增多来源拒绝测试 |
| KIT-IMPORT-JOURNAL | 导入/kit | journal 先 importing、成功 completed、回滚 rolledBack；新书失败批次可 `rollbackImport` 清理；同 operationId 失败新书自动回滚重试 | kit 0.7.1 | rollback/auto-retry 测试 |
| KIT-IMPORT-IDEMPOTENT | 导入/kit | `operationId` 同 id 已完成批次返回原结果；同 id 另一本书拒绝；不再重复建批次/递增 settings | kit 0.7.1 | operationId 幂等测试 |
| KIT-SOURCE-CHAPTERS | 导入/kit | 复用 fanfic 的 `index.json`/`chapters/`，kit 原生 source 保留 7 章；不再只切出 ch001 | kit 0.7.1 | 新增章节 index 测试；模拟 ch006 643 字可读 |
| FANFIC-MISSION-REPARSE | 安全/fanfic | `projectDirSafe` 对 `.dsh-novel-fanfic` 及项目目录做 lstat/realpath 检查；任务卡、canon-store、media、avatars 共用 | fanfic 0.4.4 | junction 负例测试；普通穿越测试保留 |
| CONDUCTOR-DRIVE-HOOK | 共存/conductor | 宿主 `write/edit` 的路径检查与锁只在 `isDriving` 时启用；cue off 不干扰 kit 的宿主写工具 | conductor 0.2.1 | `npm test`；模拟共存检查 |
| BEAT-PERSONA-READ | 拍板/beat | 纳入未发版 voice 人物画像只读建议 `personaText` | beat 0.12.2 | `voice-guidance` 测试；426/426 |

下一批仍是：真实 GUI 七页冒烟、all-six 模型路由矩阵、fade/voice 与 beat/fanfic 同 run 四域链路、计数口径统一、冻结 tarball 后重跑。


