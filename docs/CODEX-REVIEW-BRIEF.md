# dsh-novel-kit 复审简报（给 Codex / 外部评审）

> 版本：0.1.9；仓库：`D:\Novel-gate\dsh-novel-kit`（GitHub `DrizzleGig/dsh-novel-kit`，tag `v0.1.9`）。
> 目标：一个包提供 beat / fade / voice / fanfic / conductor 的全部能力，**不依赖五件**，可验证、可回退。

## 1. 先跑这三条

```powershell
cd D:\Novel-gate\dsh-novel-kit
node --test            # 104/104
npm run acceptance     # 19/19（合成工作区完整一章）
npm run acceptance:real # 10/10（复制真实《斗罗：开局炸毁冰火两仪眼》账本走一章）
npm pack --dry-run     # 约 38 files
```

## 2. 代码地图

| 层 | 文件 | 职责 |
|---|---|---|
| 入口 | `index.js` / `remote.js` / `cordis.patch.yml` | host 行与 remote 行；7 工具 + `/novel on|off|status` |
| 只读解码 | `lib/codecs/{beat,fade,voice,fanfic}.js` | 兼容已有 `.dsh-novel-*` 账本，不改写 |
| 仓库 | `lib/repositories/ledger.js` | 读账本、读 voice 档案、读 fanfic canon |
| 引擎 | `lib/engine/chapter.js` | plan → adopt → start → write → finish → query/resume/abort |
| | `lib/engine/context.js` | 四段上下文（剧情约束 / 世界契约 / 三维记忆 / 文风档案） |
| | `lib/engine/checks.js` + `metrics.js` + `memory3d.js` + `conflicts.js` + `import.js` | 验证、指标、三维记忆、冲突扫描、原著导入 |
| | `lib/engine/{state-machine,session-store,binding}.js` | 状态机、会话、资源绑定 |
| 存储 | `lib/storage/{atomic-json,transaction}.js` | 原子写（含 fsync）+ 可恢复事务（计划/前后镜像/CAS/回执） |
| 宿主 | `lib/host/{tools,remote,remote-contract,snapshot,diagnostics,takeover,views,decisions}.js` | 工具、remote、快照、诊断、接管、只读视图 |
| Web | `client.js` | 右栏六页签 + 章节工作台 + 会话头入口（只读 + 少量写按钮） |
| 测试 | `test/*.test.mjs` | 104 条；`test/render.test.mjs` 用替身真渲染客户端 |

## 3. 想请你重点看的五个问题

1. **独立性**：`dsh-novel-kit` 的 `package.json` 没有 `@deepseek-ai/dsh-*` 之外的运行依赖，也不 import 五件；但 `lib/engine/binding.js` 会去读五件的目录。这算「不依赖」还是「隐式耦合」？如果五件卸载，kit 应该表现成「没有账本可用」还是「降级仍可写作」？
2. **事务边界**：正文文件先写、账本后提交（`finishChapter`）；若正文写成功而事务冲突，会留下一个「有正文、没段落」的章。这比「账本先行、正文失败」更好还是更坏？建议怎么改。
3. **验证门槛**：blocker 只有「禁忌词 / 20 字复制」；称呼、长句、错名、文风 bands 都只是 warning。这个宽严是否合适？strict 模式只按 `required_capabilities` 过滤，会不会让作者误以为「检查通过」？
4. **UI IA**：六页签（总览/拍板/记忆/文风/设定/冲突）+ 工作台；面板写操作只有拍板、钉忘恢复、导入、接管。有没有该合并/该拆的？
5. **发布**：0.1.9 作为首个独立包版本，先发 npm `latest` 还是 `next`？CHANGELOG 与 `docs/DETAIL.md` 的措辞是否在承诺做不到的事？

## 4. 已知边界（`docs/LIMITS.md` 全文）

- 无写盘故障注入；`resume` 只重装配上下文，不自动补 partial 事务；
- 引文重复时要求精确 offset；
- 冲突页签只显示前 8 条；
- `/novel on` 是内存态，重启需再开；
- 面板写入无撤销；
- npm 未发布（作者 npm 登录态过期，`whoami` 401）、GitHub Release 未建（`gh` 未登录）。

## 5. 我这边已做过的评审

- 2026-11-22 独立子代理只读复审：12 条发现 + 4 条 minor，已修 14 条（提交 `b0b40b1`、`595c185`、`37021e0`、`ce41be9`），包括路径越界、工作台 TDZ、正文先落盘、事务 CAS、客户端竞态、fsync；
- 每轮都跑 `node --test` + 两个 acceptance 脚本，结果写在各版本 CHANGELOG。

请按「严重度 + 最小修法」给意见，不需要改代码。
