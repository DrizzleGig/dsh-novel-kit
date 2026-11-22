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
node --test                 # 139/139
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

1. **作者命令 + 操作收据**：`executeAuthorCommand`、operationId、前后镜像、幂等/冲突；把 adopt/reject/canon 审阅/保存草稿统一。
2. **收尾事务覆盖全部产物**：正文文件、beat、fade、会话结果在一个可恢复操作里；当前正文仍先写、事务只覆盖 beat/fade。
3. **完整草稿读写**：工作台可编辑 8,000 字，保存带 `expectedVersion` + `expectedDraftHash`；当前 snapshot 仍截 4000 字、工作台只读。
4. **canon 抽取/审阅**：目前 `world.json` 是 `pending-extraction`；需要抽取 + 作者确认，才能让同人真正开写。
5. **文风高阶归纳**：目前只做确定性 bands + 少量规则；锚句/decisionPolicy/rules 的作者确认流程未做。
6. **完整 UI**：右栏任务卡 + 四入口工作台 + 收件箱 + 页边批注；当前是过渡面板。
7. **P0 剩余**：接管「原状态」而非只记 disabled；写盘故障注入；面板写操作统一二次确认；冲突页签全量。

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
| `lib/host/remote.js` | 面板读/写、master 检查、双导入 |
| `client.js` | 过渡面板（顶部开关/模式/导入） |

## 6. 下一刀建议

先做「作者命令 + 收尾事务 + 完整草稿读写」三件；它们决定 0.2.0 的「一条链」是否闭合。canon 抽取/审阅与完整 UI 可以并行，但不要先于这三件。每刀完成后更新本页与 CHANGELOG，并跑 `node --test` + 两个 acceptance。


