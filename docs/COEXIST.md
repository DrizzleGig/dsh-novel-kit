# 六包长期共存与共享写入边界

> 当前实施依据 · 2026-11-24（2026-11-26 增补 fanfic 人物形象资产路径）。六包共存是常态；五件和 kit 都继续开发。当前“一本书一套写流程”是人工约定，不是代码保证；共同锁尚未实现。
> 配套：[六包方案](../../docs/小说插件系列-六包并行开发与设计方案-2026-11-23.md)、[唯一能力台账](FIVE-PLUGIN-PARITY.md)。本轮只改文档，不创建锁目录、不改账本。

## 1. 当前能确认什么

六包分别使用 novel_*、beat_*、memo_*、voice_*、fic_*、cue_* 工具前缀，各有 remote/命令命名空间。brief 提供的本机状态是六包同时启用；本轮未重新验证安装态。kit 当前入口是“小说工作台”，不沿用旧文档的右栏“小说”描述。

命名空间分开只解决注册层问题，不能阻止两个流程修改同一份账本。kit 的模块内锁只保护本进程的相应调用；[transaction.js](../lib/storage/transaction.js) 第76–82行先读 hash、比对、再替换，中间仍能插入其他写者，**不是跨进程原子 CAS**。不能承诺并发写入“必然只报冲突、不会覆盖”。

当前 [recoverTransaction](../lib/storage/transaction.js) 第107–122行只分类 completed/not_started/partial/conflict；partial/conflict 尚无完整续交闭环。[chapter.js](../lib/engine/chapter.js) 第894–906行成稿仍为工作区平铺路径，同一工作区两书同章也有覆盖风险。上述修复目标是 kit 0.5.3，未通过验收前不得按已修复使用。

## 2. 共享资源与风险

| 资源 | 当前风险 | 目标适配与记录要求 |
|---|---|---|
| .dsh-novel-beat/<book>/book.json | kit与beat均可落账；同书不同章也可能覆盖整份文件 | 统一实际资源身份、共同锁、锁内revision/hash校验 |
| .dsh-novel-fade/<book>/memory.json | kit与fade重复沉淀、丢失更新 | 同上，重试必须有持久幂等回执 |
| 正文/第N章… | kit当前未按书隔离；事务中断可半写 | 0.5.3按稳定书身份分目录；旧稿归属不明停止，不猜迁移 |
| .dsh-novel-voice/、.dsh-novel-fanfic/及kit自身档案/canon/会话/事务 | 风格、canon、来源绑定可能跨书共享；voice 0.3.1 新增 `personas/`（候选/确认卡）与 profile.json 可选 characterStyles，人物卡确认/回滚会写 voice 档案 | 按实际路径锁定；beat/fade只读已确认卡；旧档缺字段视为空，不重导；personas 只写 voice 根 |
| .dsh-novel-voice/<book>/ratings.jsonl、reader.json | 读者评分 append-only；多个读者/进程可能同时提交；reader.json 开关是单文件覆盖 | 只追加不重写；同书写者串行；开关用原子写；失败保留旧行；不跨书共享；默认关 |
| sources/、source/及绑定的外部资料 | 两种布局并存，多个书可指同一来源；导入/修订可能改共享依据 | 读写路径逐项登记；纯读不抢写锁，写来源必须纳入资源集合 |
| .dsh-novel-locks/（新增目标） | **当前不存在共同锁实现**；建目录不等于有保护 | contracts原语+六包存储适配，支持版本与gate见parity |

任一包改写路径、资源标识或数据格式，都同步本表与 parity，写明涉及哪些写者、旧数据兼容、并发测试、失败保留方式。正文与账本的多文件提交不能因单文件原子替换而被称为整体原子事务。

## 3. 当前如何避免同书双写

“一套流程”可以是 kit，也可以是 conductor 串联 beat/fade/voice/fanfic，或作者顺序使用五件。五件协作内部也要等上一项写操作完成；仅仅属于同一套流程不自动提供并发安全。

1. **写前人工登记**：记录工作区绝对路径、作品/实际账本绑定、当前执行流程、会话及操作者。检查其他会话、窗口、自动任务和写入面板，不对同书开启第二个写任务。
2. **一套写、一套只读**：非当前流程停止自动写入与工具任务；可以明确执行只读查看，不点保存、审阅应用、导入、回退或落账。会话工具开关、选择层接管与“面板已关闭”都不是存储锁，不能证明 remote 写入口已被禁止。
3. **切换先排空**：在上一流程保存草稿，结束或取消生成/写任务，确认后台及在途写入全部结束，检查回执和未完事务，再备份正文、账本及绑定资料。状态不明时不启动另一流程。
4. **确认后再交接**：重新读取实际文件和章节状态，人工把当前写者改成新流程，再执行一个小写操作核对。六包继续保留使用；无需把某个插件的安装状态当成写者所有权。
5. **遇到冲突立即停交接**：保留稿件、事务前后镜像、日志及现场副本，先只读核对 history/ledgers 与磁盘。当前版本不能靠反复 resume 或强行重放保证修复，也不要直接删除事务记录掩盖 partial。

**对比验证优先用不共享实际资源的工作区副本。** 在 kit 0.5.3 成稿隔离验收前，同一工作区不同书名也不算隔离。即使后来分书，共用风格库/原著仍需检查绑定。任何版本对未接入协议的外部编辑器、脚本或手工改 JSON 都不作并发安全承诺；人工编辑也应等当前流程停止、备份后进行。

## 4. 目标机制（尚未实现）

目标为“持久化流程所有权 + 实际资源文件锁 + 锁内版本校验 + 事务日志”，不改变六包独立发布和业务模型。

- **流程身份**：kit/conductor 在启动写流程时创建 flowId；独立五件由第一个写入口创建并显式关联后续调用。子工具继承同一 flowId，不能自行创建第二个所有者。同 flowId 的并行调用仍须串行获取资源锁。
- **生命周期**：登记写流程后拒绝其他流程写同书；正常结束须先禁止新写、排空在途任务、确认事务终态再带 token 释放。失败时保留所有权及恢复信息，只允许只读诊断和受仲裁的恢复，不能把会话取消等同于已经释放。
- **覆盖入口**：所有工具、remote、作者命令、导入、恢复路径在最终存储层拒写；conductor 只传流程身份，不替兄弟写账本。各入口不得以“已在UI禁用”为由豁免。
- **资源身份**：规范化工作区与实际文件路径，处理Windows大小写、路径别名及绑定共享；尚未创建的文件按已存在父路径及安全文件名解析。多个资源固定排序获取，避免死锁；同一flow不能跳过锁内revision/hash校验。
- **发布边界**：先由kit+beat双消费者原型验证，过闸才建contracts@0.1.0；各包下一版接入，kit0.6提供交接视图。未升级的写者不能强制遵守协议，因此不得向混装旧版宣称自动安全交接。

### 所有者判活与僵锁回收

锁记录必须包括持久稳定的本机 hostId、PID、操作系统报告的进程启动时间 processStartTime、flowId、随机 ownerToken、generation、最近心跳及未完事务引用。进程启动时间取 Windows 进程信息（如 Win32_Process.CreationDate 或等价系统接口），不能用写锁时间代替。

| 判定 | 必须观测到的条件 | 处理 |
|---|---|---|
| 存活 | 同hostId；系统查询成功，PID与启动时间均一致 | 拒绝其他流程接管；即使心跳超时也不能抢 |
| 原持有进程已结束 | 同hostId；系统查询明确成功且PID不存在，或PID存在但启动时间不同（PID复用） | 仅允许进入回收仲裁，不立即删锁；不得结束复用PID的新进程 |
| 未知 | 访问被拒、主机不符/不可确认、元数据损坏、启动时间无法取得、查询结果不确定 | 保留锁、拒绝自动接管，报告需人工排查 |
| 同进程中的流程结束 | PID仍活，但旧流程禁止新写、排空在途操作、事务终态确认，并由原ownerToken释放 | 正常交接；关闭窗口/会话取消/心跳消失都不足以证明已结束 |

心跳只用于提示异常；阈值不是判死证据。崩溃回收与正常获取/释放必须进入**同一串行仲裁**，在其中重读ownerToken/generation并再次判活；记录变化则旧回收请求作废。恢复未完事务后才递增generation、登记新token并移交；不能“读到旧锁后无条件删除”。迟到回调、重试和释放都校验当前token/代次，旧token不得写新资源或删除新锁。仲裁自身状态不明同样拒绝抢占。

### 可执行 gate（待实现、待实测）

| 场景 | 放行标准 |
|---|---|
| 两流程/两进程争写、同flow并行 | 仅一个资源持有者写入，其余等待或明确拒绝；同flow不绕互斥；别名指向同资源仍生效 |
| 活进程停心跳 | 暂停持有者超过心跳阈值，第二写者仍拒写，恢复后原流程可继续 |
| PID复用 | 注入同PID不同启动时间；只判旧进程结束，不终止新进程；仍先仲裁与恢复 |
| 查不清身份 | 模拟权限不足、异机hostId、坏元数据/启动时间缺失；全部拒绝自动回收 |
| 取消会话仍有在途写 | 保留一个未完成写任务，另一流程不能接管；排空并带token释放后才允许 |
| 双回收者竞争 | 终止持有者后两个回收者同时请求，至多一个恢复/接管；token变化使另一旧请求失效 |
| 迟到旧token | 新持有者建立后，旧token的写入、释放、回调均拒绝，新锁与账本不变 |
| 半提交与结果未知 | 各写点注入中断；恢复不重复落账；第三种hash停写；恢复未完或结果不明不移交 |

## 5. 一句话结论

**六包长期共存；当前靠人工保证一本书只有一套写流程，跨包锁与自动安全交接须等共同协议实现并验收后才能承诺。**

## 6. 2026-11-24 媒体来源和 kit 新人群（设计目标，目录未创建）

本节登记 [fanfic媒体设计](../../docs/小说插件系列-fanfic媒体导入与kit新人群-2026-11-24.md) 的拟议写路径。下列路径目前不存在；不能据此宣称媒体导入或锁已实现。

| 资源（建议） | 写者/共享边界 | 风险与门禁 |
|---|---|---|
| 用户原件：任意外部路径 | 用户拥有；fanfic/kit 只读打开，不复制原视频/漫画/截图到仓库 | 导入时保存 SHA-256；路径/内容变化即 stale。删除或移动用户原件由用户决定 |
| `.dsh-novel-fanfic/<project>/media/<assetHash>/manifest.json`、`ocr.json`、`transcript.json`、`frames/`、`panels/` | fanfic 媒体派生物的唯一写者；kit 后续读取引用，不另存第二份抽帧/识别结果 | 单书配额 200MB；派生物可由作者清除。生成/清除互斥；临时文件先写后校验再替换；校验失败不更新 manifest/canon |
| `.dsh-novel-kit/community-sources/<book>/<sourceId>.json` | kit 粉丝素材/乙游来源 metadata 与短摘录；不含整页、私信、完整剧情资源 | 链接失效、用户撤回/删除须 stale 并从提示词索引排除；与 canon 应用共用一本书 writer 约定 |
| canon 提案和应用回执 | fanfic 或 kit 按其既有账本分别写；不能双侧同时应用同一份书账本 | evidence verifier 读取媒体路径并核验 hash；记录 proposal/apply revision。未有跨包锁前遵守单流程人工交接 |

实施前须把实际路径、引用关系、并发写者、清除流程和失败保留策略对账到此表；媒体导入和 canon 应用若分属多文件，不能用单文件原子替换宣称整笔事务原子。媒体云端分析仅临时发送经作者选中的帧/文本；默认不持久保存云端副本，记录本地选样清单与成本回执。kit 移植按 parity 来源版本读取同一媒体协议，不自行生成另一套格式。

## 5. 0.11.0 变更登记（2026-11-25）

beat 0.11.0（本地提交 `59e733f`，**未发布**）在本表之上的新增与变化：

- **账本新增字段（同一份 book.json）**：作者自定拍板写入 `origin: 'author'` 的 request 回执、`decision.pendingCustom` 与 `chosen.customText`；不新增共享根路径，不改写路径。
- **只读消费 voice**：`beat_plan / beat_next / beat_segment / beat_append / beat_verify` 读取 voice 已确认档案生成"选项写法基线"；不写 voice 任何文件，不需要 voice 新增接口，读取失败一律中性降级。
- **会话设置**：`_sessions.json` 新增可选 `voice` 字段（auto/on/off）；`setSessionMode` 改为合并写，避免覆盖 `bodyRoots`/`voice`。
- **段落循环**：默认关闭；artifact 只写 `.dsh-novel-beat/<书>/` 自有目录，不写章节文件；loop 章仍走旧提案口径（无 v3 证据闸门），已列入已知问题，不据此宣称与正式流程同强度。
- **共同锁/跨进程安全**：仍未实现。本版没有改变"一本书一次只走一套写流程"的人工约定，也没有新增跨包自动交接。

## 7. 2026-11-26 fanfic 人物形象资产（存储层已实现，remote/UI 未接）

fanfic 0.4.0 新增的输出路径；本节登记不是为了宣称锁/并发安全已具备。

| 资源 | 写者/共享边界 | 风险与门禁 |
|---|---|---|
| `.dsh-novel-fanfic/<project>/avatars.json` | fanfic 唯一写者；kit 后续只读/复用，不另存第二份 | 与 `project.json` 分离：头像确认/删除只 bump `assetRevision`，不 bump `project.json.revision`；当前无跨进程锁，同书仍须单写流程；同进程并发写会 last-writer-wins，接 remote 写入口前加串行队列，后续接共同锁 |
| `.dsh-novel-fanfic/<project>/assets/avatars/<characterId>-<sha256>.<png/jpg/webp>` | fanfic 唯一写者；只保留当前确认图 | 单图 ≤512KB、256×256 目标；替换成功后删旧图；删除人物形象即删文件；孤儿文件可清理；不把图打进 npm 包/云同步 |
| `avatars.json.works[]` | fanfic 写；记录官方来源/网页搜图查询词/来源 ID | 来源失效/换作品时人物图标 stale；不因来源失效删 canon；图版权归版权方，仅本地参考 |
| `.dsh-novel-fanfic/<project>/media.json` | fanfic 唯一写者；kit 后续只读，不另存第二份 | 登记漫画/红果来源与最小证据；`mediaRevision` 独立于 `project.json.revision`；来源文件只存外部路径+hash，不复制整本/整集；不存播放地址/内容密钥；当前无跨进程锁，同书仍须单写流程 |

实施进度：`lib/avatars.mjs` + `lib/avatar-sources.mjs` + `lib/avatar-fetch.mjs` + `lib/hongguo.mjs`（vendored WASM）+ `lib/windows-ocr.mjs` + `lib/comic.mjs` + `lib/image-gray.mjs` + `lib/image-crop.mjs` + `lib/panel-detect.mjs` + `lib/media.mjs` + `lib/analysis.mjs` + 对应测试已落地（2026-11-26，全量 231/231）；`getAvatar`/`avatar`/`media`/`analysis` 四个 panel remote 已接（16 方法），第 7 个 `fic_avatar`、第 8 个 `fic_analyze` 已注册，`fic_source` 增红果四个只读 action + `comic_list/comic_panels/comic_ocr` + `media_*` 六个 action（含 `media_verify`）；人物卡 44px/详情 64px 头像、网页搜图/官方匹配/批量/上传/删除 sheet、一级页「原著/漫画/红果/本作/剧情/写作」（漫画支持文件夹选择、页面预览 + 分格框；红果分集/弹幕）、剧情→分析视图（可导出 Markdown）、金标合成漫画页（整页+逐格 OCR）已接入；真实宿主截图、真实商业漫画集、分析证据跳转尚未做，不能对外宣称“人物形象/红果/漫画/分析已验收”。`lib/vendor/openhongguo/` 是代码，不新增书内写路径；红果数据不落盘（仅工具响应）；漫画 OCR/分格/裁剪临时文件在系统 temp，完成后删除；页面预览以 ≤6MB data URL 走 panel remote，不落盘；`media.json` 只存来源/短证据，不复制原件；`fic_analyze` 只读 canon，不写盘。

## 8. 2026-11-26 晚新增/复核的写风险

以下四条由 DSH 实读代码复核，是 kit 0.5.2 的历史风险；v2 目标不是修好共写，而是按 [方案-kit-v2-独立化-2026-11-26.md](../../docs/方案-kit-v2-独立化-2026-11-26.md) 切断 kit 对五件账本的运行时读写。修复前仍按“一本书一次只走一套写流程”操作。

1. **beat v3 写入会破坏账本**：beat 0.12.1 的 `SCHEMA_VERSION=3`，加载时把 v2 迁到 v3（`lib/remote.js:96–99`、`lib/store.js:229`），`validateBook` 要求 committed decision 有 `requestId` 且 `requests` 有对应 `answeredAt`（`lib/schema.js:788–797`），segment 有 `decisionIds`（`:803–806`），并在 `store.js:284–286` 校验 `integrity.ledgerHash` 与内容一致。kit 的 decision 没有 requestId/requests，finish 不重算 ledgerHash；只要 beat 先迁移过，kit 再 adopt/finish，beat 下次加载即 `book-corrupt` 或 `ledger-hash-mismatch`。**目标**：0.5.3 对 schemaVersion≥3 的 beat 账本一律只读；0.6 移植完整 v3 写模型后再共写。
2. **坏账本被当“不存在”重建**：`lib/engine/book.js:12–14,51–56` 的 `exists()` 吞掉任何读取异常，`ensureBook` 随后写默认账本；坏 JSON/权限错误时可能覆盖用户账本。**目标**：仅 ENOENT 可初始化；其他错误保留原字节并报错。
3. **事务计划/镜像可被重试覆盖**：`lib/storage/transaction.js:31–64` 同 txId 会重写 `plan.json`/before/after；`null` 前镜像走真假判断跳过（`:44`）；`recoverTransaction` 只分类（`:107–122`），`all-applied` 缺回执时 `chapter.js:273–281` 仍可标完成。**目标**：计划/镜像不可变；显式 null 比较；all-applied 补回执；partial/conflict 走 inspect/resume/rollback。
4. **kit 仍直接写 fanfic**：`lib/engine/import.js:21–88` 直接写 `.dsh-novel-fanfic/<project>/source/` 与 `project.json`；与 fanfic 的单一写者承诺冲突，也让 fanfic 的 revision/媒体账本可能被旁路。**目标**：0.5.3 停用/重路由旧 importSource，kit 只写自有来源或经 fanfic 工具。

**conductor 锁口径更正**：0.2.0 的锁文件是 `<workspace>/.dsh-novel-conductor/locks/book-write.lock`（`lib/locks.js:33–35`），默认 resource 不含 bookId，属“每工作区写锁 + 记录 bookId”，不是六包共同每书锁；同 cwd 多书仍被硬拦。不要把它当作已覆盖 kit/beat/fade 的共同锁。

**计划新增路径（未实现，先登记）**：

| 资源 | 计划写者/边界 | 风险与记录要求 |
|---|---|---|
| `.dsh-novel-kit/books.json` | kit 写；bookId/目录/绑定映射 | 只由 kit 维护；bookId 不从书名推导；已有 conductor ID 不一致时只读等待裁定 |
| `正文/<bookId>/第N章…` | kit 写；章节文件唯一写者 | 0.5.3 先固定每书正文根；旧平铺稿只有唯一归属才迁移，歧义人工选 |
| `.dsh-novel-kit/community-sources/<bookId>/` | kit 写；追星/乙游最小证据 | 摘录≤500 字，URL 去凭据，不存原件；撤回/失效清派生提示词 |

## 9. 2026-11-26 v2 边界更正：kit 不再是共同写者

作者 2026-11-26 21:14 明确：**kit 运行时与 beat/fade/voice/fanfic/conductor 零交互、零写入**；唯一交互是单向“继承导入”。本节取代 §2–§8 中把 kit 当共享写者的口径；旧内容保留作历史。

- **kit 只写**：`.dsh-novel-kit/`（books/decisions/memory/styles/canon/sessions/imports/transactions 等）与 `正文/<bookId>/`。
- **五件目录只读**：`.dsh-novel-beat` / `-fade` / `-voice` / `-fanfic` / `-conductor` 只在作者显式触发导入时被只读扫描；不写、不移动、不删除、不加锁、不调插件服务、不启停插件。
- **无共享锁**：v1 的“共同写者/共同锁/contracts”不再适用；kit 用自己的工作区写锁。五件的锁归五件。
- **导入是复制**：源数据转成 kit 原生数据；导入报告记录源路径/版本/hash/批次。源文件变化不自动同步；再次导入是显式新快照，默认不覆盖已有 kit 创作。
- **卸载五件不影响 kit**：导入完成后 kit 只读自己的数据；五件不存在、被禁用或不可读都不应让 kit 报错。
- **kit 自己的正文**：`正文/<bookId>/`，bookId 稳定；旧平铺 `正文/` 只作为 kit legacy 迁移证据，迁移后不再按章号猜归属。
- **五件升级**：只作 kit 原生能力的移植来源（设计/规则/代码借鉴），不是运行时依赖；CHANGELOG 写“移植自 x@版本（原生实现，不共享账本）”。

**结论**：v1 的 §8“beat v3 写入、坏账本、事务镜像、kit 直写 fanfic”仍是 kit 0.5.2 的历史风险，但 v2 的目标不是“修好共写”，而是**切断共写**：kit 0.6 起不再写五件账本；五件数据只经导入进入 kit。


