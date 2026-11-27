# dsh-novel-kit 发布清单

> 2026-11-27：0.7.1/0.7.2 已发布；0.7.2 只修正 README 版本口径。四页 tab 冒烟与缺口见 `D:\Novel-gate\docs\kit-0.7.0-发布准备.md`。本清单的 0.5 版本号/验收项仅作流程示例。

> 发布 = **自检** → **真实 DSH 冒烟** → 登录 → `npm publish` → 校 registry → GitHub Release。
> 本机默认源是 npmmirror，**所有版本查询都要显式加 `--registry=https://registry.npmjs.org`**，否则会读到滞后的镜像。

## 0. 自检（默认不发布）

```powershell
cd D:\Novel-gate\dsh-novel-kit
node scripts\publish.mjs              # 只自检；任何一项失败就拒发
node scripts\publish.mjs --publish    # 自检全绿才真正发布
```

自检七项，任一失败即停：

| 项 | 检查什么 |
|---|---|
| 版本一致 | `package.json` = CHANGELOG 首条 = README 标注 |
| 构建产物 | 样式 / remote 契约 / ui-kit 三块与源文件一致 |
| 测试 | `node --test` 全过 |
| 合成验收 | `npm run acceptance`（19 项行为） |
| 加载链 | `npm run acceptance:load`（8 项，锁「重启后整包消失」） |
| 真实验收 | `npm run acceptance:real`（复制账本跑一章，缺账本时跳过不阻塞） |
| 工作区 | `git status` 为空；同名 tag 会提示 |
| 打包清单 | `npm pack --dry-run` 必需文件齐全（0.5.2 实测 76 文件，不含开发截图） |

## 1. 真实 DSH 冒烟（必须人工点一遍）

插件市场装的是**打包后的产物**，`node --test` 证明不了真实 remote 调用链。发布前在真实 DSH 里：

1. **重载 DSH**（`Ctrl+R` 或重开窗口），确认「小说工作台」入口出现；
2. 会话里 `/novel master on` → `/novel on` → `/novel status`；
3. 打开工作台，**书桌**能看到当前作品与「下一笔」；
4. **正文**页写两行、Ctrl S 保存，刷新后内容还在；
5. 有未保存正文时**切换作品** → 应出现「保存并切换 / 丢弃并切换 / 取消」；
6. **同人**页：待审阅队列能接受一条、拒绝一条，点「应用」后生效版本 +1；
7. **正文**页检查列表点「定位」，光标跳到那一句；
8. **资料**页能改总开关与模式。

任一项不对：先修，再重跑自检。

### 1b. 0.7 四页分页冒烟（新增）

1. **决策**：决策地图/时间线/体检；搜索/筛选；纸白/米黄/深色；收尾后按章体检能看到 findings。
2. **记忆**：总览健康/曲线；记忆按章/分层筛选；溯源来源索引/看原文/切片。
3. **风格**：书架/档案/学习；导入、规则权重/正文编辑/确认拒绝、证据分页、重测、移除、解绑。
4. **同人**：原著/漫画/红果/本作/剧情/写作六 tab；原著六 chip；人物详情/知情矩阵；本作审阅详情；媒体证据详情。
5. 每个 tab 截图存 `docs/mockups/host/`（真实宿主，不是组件快照）。

## 2. 登录（需要作者的 2FA / 安全密钥）

```powershell
npm login --auth-type=web --registry=https://registry.npmjs.org
npm whoami --registry=https://registry.npmjs.org     # 应输出 DrizzleGig
```

## 3. 发布

```powershell
node scripts\publish.mjs --publish
```

- `auth-and-writes` 账号可能再要求一次浏览器 2FA（打印授权 URL），按提示确认；
- 首发/安全扫描期间 registry 会先收下再处理，**版本文档约 2 分钟才出现**，`npm view` 此刻仍是旧版本，不要当成失败；
- 脚本用带时间戳的 version 文档轮询，最多等 4 分钟。

## 4. 校验

```powershell
npm view dsh-novel-kit version --registry=https://registry.npmjs.org
npm view dsh-novel-kit dist-tags --registry=https://registry.npmjs.org
```

> **别在发布后马上反复探同一个 tarball URL**：CDN 按完整 URL 负缓存（`max-age=300`），加任意 query（`?t=<ts>`）立刻 200。安装自测等 10–15 分钟。

## 5. GitHub Release

```powershell
git tag v0.5.0
git push origin main --tags
gh release create v0.5.0 --repo DrizzleGig/dsh-novel-kit --title "v0.5.0" --notes-file <notes.md>
```

发布说明模板：

```markdown
## dsh-novel-kit v0.5.0 · 小说工作台

一个界面写完一部长篇：七页工作台 + 四段写作依据 + 一章一条链。

- 七页工作台：书桌 / 正文 / 决策 / 记忆 / 风格 / 同人 / 资料
- 四段依据：剧情决策、世界契约、长篇记忆、文风，各有预算与来源修订号
- 章节链：plan → start → write → finish，检查 → 事务落账，中断可恢复
- 检查定位：禁忌 / 与原著雷同 / 疑似错名 / 称呼矩阵 / 文风越界，点「定位」选中那句
- 同人：原著导入 → 世界契约 → 待审阅队列逐条接受/拒绝，应用后才进依据
- 草稿保护：切作品不静默丢稿、保存互斥、回包校验归属
- 默认关闭：不开总开关不占工具列表
- 证据：测试 219/219、合成验收 19/19、加载链 8/8、真实验收 11/11、`npm pack` 62 文件

Co-authored-by: MiyueWinter <mingyue_11129@qq.com>
```

## 6. 发布后

1. DSH → 插件 → 搜「小说工作台」安装，确认入口与 `/novel status`；
2. 在真实书上跑一章（先复制书目录）；
3. 把新发现写进 [docs/LIMITS.md](LIMITS.md)。

## 附：提交与标签

```powershell
git -c user.name=DrizzleGig -c user.email=captain2233@qq.com commit -m "<type>(kit): <what>" -m "Co-authored-by: MiyueWinter <mingyue_11129@qq.com>"
git tag v0.5.0
git push origin main --tags
```
