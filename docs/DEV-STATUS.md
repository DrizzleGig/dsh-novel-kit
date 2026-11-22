# dsh-novel-kit 0.2.0 开发状态（2026-11-22）

> 版本：`0.2.0-dev.0`（未发布）｜基线：`0.1.14`｜设计：[v0.2.0 设计方案](../../docs/小说插件系列-dsh-novel-kit-v0.2.0-设计方案.md)
> 这一页只写「已经能跑什么、还没做什么、怎么验证」，不替代 README 与 CHANGELOG。

## 1. 这一刀交付了什么

### F1 三层开关

- `$DSH_HOME/profiles/<name>/novel-kit/prefs.json`：profile 级 `master`，**默认关**，跨重启保留。
- `<workspace>/.dsh-novel-kit/projects/<book>/settings.json`：项目级 `mode: original | fanfic`、文风绑定、canon 绑定。
- 会话级 `/novel on|off`；master 关时 `/novel on` 拒绝。
- `/novel master on|off`、`/novel mode original|fanfic <book>`、`/novel status`。
- 工具仍用 `when` 门控（master + session），不热切换注册/注销；remote 写操作额外检查 master。

### F2 双导入口 + 共用 SourceDocument

- `SourceDocument`：`.dsh-novel-kit/sources/<完整 SHA-256>/`，原文/分章/meta/index；同内容重复导入幂等。
- 门 A `importStyle`：确定性 bands/rules/avoid → `sty_*` provisional `StyleProfile`，绑定项目。
- 门 B `importCanon`：原创模式先 `mode-required`（原文暂存、不绑定）；确认后切 `fanfic`、绑定 `activeCanonSourceId`、写 `world.json`（`pending-extraction`）。
- 同一作品双导入：一份原文、两个产物/绑定。

### F3 按模式装配 + 硬预算

- `assembleContext({ mode })`：`original` 不装配 canon（即使调用方误传 fanfic 项目）；`fanfic` 才装配。
- canon 段：优先 kit `WorldContract`（世界规则/人物/秘密/称呼/禁忌），否则兼容旧 fanfic 项目。
- 同人无 canon / 契约未确认：`start` 返回 `canon-required` / `canon-not-ready`。
- 四段 `clip` 改为按预算截断（不再 2 倍），返回 `truncated`；文风段优先 kit StyleProfile，≤600 字。

### 文风影响决策（最小版）

- `planChapter` 返回 `styleHint`；提案选项可带 `styleFit/styleWhy`。
- 插件做轻量规则标注（avoid/taboo/revealPace/restraint），不输出百分比，不替作者选择。
- 决策记录带 `option/proposalId/styleFit/styleWhy/effect:'option-recorded'`。
- `novel_plan` 只允许 propose；模型不能再 `adopt/reject`。

### 第二刀：作者命令、完整草稿、收尾事务

- **canon 审阅**：新增 `novel_canon` 工具（outline/read/propose）；propose 只进 `pending-review`，作者在面板确认后才 `confirmed`；空契约拒绝确认；面板可编辑事实/人物/规则/禁忌并保存为待审阅。
- **作者命令**：`decision.adopt` / `decision.reject` / `draft.save` / `mode.set` / `import.style` / `import.canon` / `canon.confirm`；`operationId` + 输入 hash 幂等，同键不同输入 `operation-conflict`；模型身份 `author-required`。
- **操作日志**：`.dsh-novel-kit/operations/<operationId>.json`，running → completed/failed，含 attempts/result/receipt；失败可重试。
- **完整草稿**：`readDraft` 不截断；`writeChapter` 带 `expectedVersion`/`expectedDraftHash`，同会话串行化；冲突 `draft-conflict` 不覆盖。
- **收尾事务**：`finish` 把正文文件 + beat 段落 + fade 卡放进同一个事务（`effects` 3 项），不再先写正文再提交账本。
- **右栏任务卡**：默认总开关/模式/导入/下一笔/四段尺/收件箱/最近章节；详细六页签收进「详情」，不再首屏台账。
- **工作台四入口**：书桌/章节/故事/资料；章节是可编辑正文 + 依据/检查，书桌给下一笔/收件箱/最近，故事给拍板/提案/线索，资料给四段依据/文风/canon。
- **工作台编辑**：完整正文 textarea + 保存（Ctrl S），显示未保存/已保存/冲突；旧宿主无 `getDraft` 时退回只读。

### P0 顺手修复

- `decide` / `memoryAction` 的 action 严格枚举（不再静默回退）。
- 接管记录持久化到 profile 的 `novel-kit/takeover.json`；无记录时 `restore` 拒绝，不默认恢复全部五件。
- 快照冲突扫描统一走 `resolveBinding`，不再用 `project ?? fanfic[0]` 猜。
- native 工具输出补四段上下文（`output.render` 的 `humanize`）。

### Codex 第四轮复核后补的 P1/P2

- **作者拍板不能被 write 绕过**：有 pending 提案时 `writeChapter` 不改状态，`finishChapter` 返回 `awaiting_author`；作者 adopt/reject 完才回 writing。
- **执行时再查开关**：每个工具 `execute` 先 `gate.isOn(exec)`，防止「步骤准入后关 master」仍执行。
- **并发导入**：`mkdtemp` 独占临时目录；同毫秒不同内容不会串。
- **重复导入不覆盖已审核产物**：已有 `StyleProfile` / `WorldContract` 直接复用，保留作者规则/确认状态。
- **canon 就绪收紧**：必须 `status=confirmed` 且至少一条可用约束；legacy 项目先读真实 project/canon，不再把空目录当 canon。
- **facts/relationships/timeline 进世界段**；`isCanonReady` 与编译器使用同一套约束定义。
- **原创隔离**：`useFanfic` 要求当前 `mode==='fanfic'`；原创 finish 不跑旧同人复制/名字检查。
- **切回原创**：`resume` 每次核对当前 mode 并重装配，不返回旧 canon。
- **profile 隔离**：`profileStateDir` 按 `DSH_HOME/profiles/<name>` 隔离 prefs/takeover。
- **接管记录**：`changed:true`（含 restart-required）才记；空记录落盘；客户端检查 `ok/code`，不把 `no-restore-record` 显示成成功。仍欠「先持久化原状态再变更」的完整事务。
- **kit 文风可见**：`getStyle` 用 kit 档案补 `available`；客户端兼容 `{band:[lo,hi]}` 结构。

## 2. 证据

```powershell
cd D:\Novel-gate\dsh-novel-kit
node --test                 # 150/150
npm run acceptance          # 19/19
npm run acceptance:real     # 11/11
npm run check               # 通过
```

新增测试：`settings.test.mjs`、`import-dual.test.mjs`、`context.test.mjs`；`chapter.test.mjs` 增加文风/同人 canon 用例；`takeover.test.mjs` 增加「无记录不默认恢复」。

## 3. 怎么用（开发版）

```powershell
/novel master on
/novel on
/novel mode original 长夜行        # 原创：只学文笔
# 面板顶部「学文笔」导入 txt
/novel mode fanfic 长夜行          # 同人：需要原著
# 面板顶部「写同人」导入原著
```

当前面板是过渡版：顶部有总开关、模式、两个导入口；六页签仍是旧 IA。

## 4. 还没做（按优先级）

1. **canon 逐条接受/证据回查**：结构化编辑已通；还缺逐条接受/拒绝、从原文回查证据、提案与已确认版本 diff。
2. **会话完成结果纳入事务**：正文/beat/fade 已同一事务；会话 `completed` 与收据仍在事务后单独写，故障窗口还在。
3. **文风高阶归纳**：目前只做确定性 bands + 少量规则；锚句/decisionPolicy/rules 的作者确认流程未做。
4. **完整 UI**：右栏任务卡 + 工作台四入口已落地；还剩视觉打磨、页边批注、统一收件箱处理。
5. **P0 剩余**：接管「原状态」而非只记 disabled；写盘故障注入；面板写操作统一二次确认；冲突页签全量。

## 5. 关键文件

| 文件 | 作用 |
|---|---|
| `index.js` | 工具注册、`when` 门控、`/novel` 命令接线 |
| `lib/host/gate.js` | master + session 门控、持久化 |
| `lib/engine/settings.js` | prefs、项目 settings、绑定 |
| `lib/engine/sources.js` | 共用 SourceDocument |
| `lib/engine/profiles.js` | StyleProfile、brief、decisionHint/annotate |
| `lib/engine/canon.js` | CanonSource/WorldContract、requireCanon |
| `lib/engine/context.js` | 四段装配、mode 隔离、硬预算 |
| `lib/engine/chapter.js` | 章节流程、mode/canon/style 接入、决策记录 |
| `lib/host/remote.js` | 面板读/写、master 检查、双导入、草稿/CANON 作者命令 |
| `lib/engine/operations.js` / `author.js` | operationId 幂等、作者命令入口 |
| `client.js` | 过渡面板（顶部开关/模式/导入）+ 可编辑工作台 |

## 6. 下一刀建议

先做「canon 逐条接受/证据回查 + 会话完成结果纳入事务 + 统一收件箱（含页边批注）」三件；它们决定同人能不能顺畅开写、崩溃窗口是否真正闭合、以及任务卡是否从摘要变成可操作。写盘故障注入与真实 DSH UI 验收并行。每刀完成后更新本页与 CHANGELOG，并跑 `node --test` + 两个 acceptance。





