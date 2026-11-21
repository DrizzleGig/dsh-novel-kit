# dsh-novel-kit 已知边界与未做清单（0.1.13）

> 目的：把「没有做」写清楚，避免把只读当成已实现、把简化版当完整版。

## 1. 与五件的能力对照（2026-11-22）

| 能力 | kit 状态 | 说明 |
|---|---|---|
| beat 拍板/段落/校验 | 已迁移（拍板落账、段落登记、引文校验） | 改设定、回退未迁移 |
| fade 记忆卡/三维简报/检索/钉忘恢复 | 已迁移 | 检索是子串匹配，不是向量检索 |
| voice 档案简报/文风检查 | 已迁移 | 档案学习/导入未迁移（沿用旧档案） |
| fanfic 契约/称呼/禁忌/20 字复制/导入/冲突 | 已迁移 | 审阅队列（proposals 确认/拒绝）未迁移；canon 抽取未迁移 |
| conductor 六步/收据/严格模式 | 已迁移（三段主线 + strict） | replay、6 类冲突裁决、分支/多书未迁移 |

## 2. 引擎的已知限制

1. **没有写盘故障注入**：事务恢复逻辑有单测（completed/not_started/partial/conflict），但没有在真实断电/锁竞争下验证。
2. **`resume` 只重装配上下文**：不会自动补完 partial 事务；遇到 `partial/conflict` 只报告，需要作者或后续版本处理。
3. **引文定位**：offset 不准时按唯一引文自动定位；同一引文出现多次会要求准确 offset。
4. **strict 只影响检查**，不改变上下文装配（四段仍会读，但只读）。
5. **章节号与正文文件名**：finish 写 beat 段落时用 `正文/第N章.md` 作为文件名占位，不校验本地正文文件是否存在。
6. **与旧五件同时写同一章**：`finish` 写的是 beat/fade 的原文件；两边同时开着写同一本书，会重复登记或撞上 CAS 冲突（停下，不静默覆盖）。见 [COEXIST.md](COEXIST.md)。

## 3. 宿主与 UI 的已知限制

1. **面板写入都要二次确认**（拍板、接管），但没有撤销按钮；错误操作需手动反向操作（如 restore）。
2. **冲突页签只看前 8 条**（快照截断），完整列表走 `novel_query({view:"conflicts"})`。
3. **工作台正文只读**：编辑仍回聊天或原插件；工作台里没有直接保存。
4. **渲染冒烟只覆盖首屏**：`test/render.test.mjs` 用宿主替身渲染三个组件，能抓到 TDZ/hooks 崩溃，但不验证真实浏览器里的视觉与交互。
5. **`/novel on` 是会话级内存态**，重启 DSH 后需要再开（暂无 prefs 持久化）。

## 4. 发布与验收状态

- npm：**`dsh-novel-kit@0.1.13` / `0.1.14` 已发布**（`latest` = 0.1.14，2026-11-21T19:58:13Z，shasum `e962516fe6ae5fbe93a6f4f320ae9981d29b366a`，46 文件 / 232,814 B）。核版本一律显式指定官方 registry；国内镜像（npmmirror）可能滞后数小时。
- 首发/安全扫描期间 registry 会先收下再处理：CLI 打印 `being processed`，版本文档约 2 分钟才可见（`scripts/publish.mjs` 现在最多等 4 分钟）。
- GitHub：tag `v0.1.14` 与 [Release v0.1.14](https://github.com/DrizzleGig/dsh-novel-kit/releases/tag/v0.1.14) 同源，发布说明保留 `Co-authored-by: MiyueWinter <mingyue_11129@qq.com>`。
- 插件市场：PR [#17651](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/17651)（`data/plugins/DrizzleGig__dsh-novel-kit.yml`）；仓库满 24 小时前 age gate 会先红。
- 发布后 15 分钟内别反复探同一个 tarball URL：CDN 会按完整 URL 负缓存（`max-age=300`），`npm i` 自测等一会儿再做；查 version 文档不受影响。
- 隔离 profile 的安装/卸载/回退矩阵**未做**（Codex 验收第 1 条）。
- 真实请求（PTC/native）下的工具面**未验**（第 7 条）。
