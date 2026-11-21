# dsh-novel-kit 发布清单（0.1.x）

> 当前状态：代码、测试、验收、tag 都已就绪；**只剩需要作者本人授权的两步**：
> npm 登录（2FA）与 GitHub Release（gh 登录或网页操作）。

## 0. 发布前自检（约 1 分钟）

```powershell
cd D:\Novel-gate\dsh-novel-kit
npm run check
node --test                    # 期望 95 通过
npm run acceptance             # 期望 19/19
npm run acceptance:real        # 期望 10/10（复制真实账本，不动原书）
npm pack --dry-run             # 期望 38 个文件左右，不夹带临时文件
```

## 1. npm 登录（需要你操作）

```powershell
npm login --registry=https://registry.npmjs.org
```

- 浏览器打开后完成 2FA（安全密钥 / 手机）。
- 确认：

```powershell
npm whoami --registry=https://registry.npmjs.org     # 应输出 DrizzleGig
```

## 2. 发布（可让我代跑）

```powershell
cd D:\Novel-gate\dsh-novel-kit
npm publish --registry=https://registry.npmjs.org --access public
```

- `latest` 会指向 0.1.x（占位版 `0.0.1-stage` 保持 `stage` tag 不动）。
- 校验：

```powershell
npm view dsh-novel-kit version --registry=https://registry.npmjs.org
npm view dsh-novel-kit dist-tags --registry=https://registry.npmjs.org
```

## 3. GitHub Release（gh 或网页）

gh 未登录时用网页：仓库 → Releases → Draft a new release → 选 tag `v0.1.5`（或最新）→ 标题 `v0.1.5` → 摘要见下。

发布说明模板：

```markdown
## dsh-novel-kit v0.1.5

一个包提供 beat / fade / voice / fanfic / conductor 的能力。

- 章节引擎：7 个 novel_* 工具，四段上下文，可恢复事务与回执
- 验证：禁忌 / 20 字复制 / 疑似错名 / 长句 / 称呼矩阵 / 文风 bands；strict 模式
- 作者操作：拍板、记忆钉/忘/恢复、原著导入、旧五件接管
- UI：右栏六页签 + 章节工作台
- 证据：测试 95/95，验收 19/19，真实数据验收 10/10

Co-authored-by: MiyueWinter <mingyue_11129@qq.com>
```

## 4. 发布后

1. 在 DSH「插件」里搜「小说」安装，确认面板六页签与 `/novel status`；
2. 在真实书上跑一章（建议先复制书目录）；
3. 记录 issue 到 `docs/LIMITS.md` 的已知边界一节。
