# dsh-novel-kit 发布清单

> 发布 = 自检 → 登录 → `npm publish` → 校 registry → GitHub Release。
> 本机默认源是 npmmirror，**所有版本查询都要显式加 `--registry=https://registry.npmjs.org`**，否则会读到滞后的镜像。

## 0. 一条命令

```powershell
cd D:\Novel-gate\dsh-novel-kit
node scripts\publish.mjs                  # 自检 → whoami → 发布 → 校 registry
node scripts\publish.mjs --skip-publish   # 只自检（离线/CI）
```

自检项：`npm run check`、`node --test`（110）、`npm run acceptance`（19）、`npm run acceptance:real`（10）。
`whoami` 失败会直接退出并提示先登录；发布后脚本用带时间戳的 version 文档校验，不吃缓存。

## 1. 登录（需要作者的 2FA / 安全密钥）

```powershell
npm login --auth-type=web --registry=https://registry.npmjs.org
```

- 输出一个 `https://www.npmjs.com/login?next=/login/cli/<uuid>`；
- 在本机浏览器里完成 **2FA 安全密钥**确认（页面停在「Use security key」时就是这一步）；
- 成功后 token 写进 `NPM_CONFIG_USERCONFIG`（本机 `D:\data\node-env\npmrc`）。

确认：

```powershell
npm whoami --registry=https://registry.npmjs.org     # 应输出 DrizzleGig
```

## 2. 发布

```powershell
cd D:\Novel-gate\dsh-novel-kit
npm publish --registry=https://registry.npmjs.org --access public
```

- 账号是 `auth-and-writes` 时，publish 可能再要求一次浏览器 2FA（打印 `Authenticate your account at: https://www.npmjs.com/auth/cli/<uuid>`），按 ENTER 打开授权页即可；
- 首发/安全扫描期间 registry 会先收下再处理：CLI 打印 `Your package is being processed`，**版本文档约 2 分钟才出现**，`npm view` 此刻仍是旧版本，不要当成失败；
- `latest` 指向新版本；占位版 `0.0.0-stage` / `0.0.1-stage` 的 `stage` tag 不动。

## 3. 校验

```powershell
npm view dsh-novel-kit version --registry=https://registry.npmjs.org
npm view dsh-novel-kit dist-tags --registry=https://registry.npmjs.org
```

- 刚发布时 packument 可能还要几秒；脚本轮询 version 文档，最多等 4 分钟（40 × 6s）；
- **别在发布后马上反复探同一个 tarball URL**：CDN 按完整 URL 负缓存（`max-age=300`），裸路径会 404 几分钟；加任意 query（`?t=<ts>`）立刻 200。安装自测等 10–15 分钟。

## 4. GitHub Release

tag 已在仓库；`gh` 未登录时可以用 git credential 里的 token：

```powershell
$in = "protocol=https`nhost=github.com`n`n"
$tok = (($in | git credential fill) -split "`n" | Where-Object { $_ -like 'password=*' }) -replace '^password=',''
$env:GH_TOKEN = $tok
gh release create v0.1.13 --repo DrizzleGig/dsh-novel-kit --title "v0.1.13" --notes-file <notes.md>
```

或网页：仓库 → Releases → Draft a new release → 选 tag → 粘贴下面的模板。

发布说明模板：

```markdown
## dsh-novel-kit v0.1.13

一个独立包：章节引擎 + 四段上下文 + 8 个 `novel_*` 工具 + 右栏「小说」面板 + 旧五件接管。

- 章节引擎：`plan → start → write → finish`，可恢复事务（CAS + fsync）、回执、blocker 不落账
- 验证：禁忌 / 20 字复制 / 疑似错名 / 长句 / 称呼矩阵 / 文风 bands；`strict` 只查声明过的能力
- 作者操作：拍板、记忆钉/忘/恢复、原著导入、旧五件接管（只关选择层，可回退）
- 相容性：只读兼容 beat / fade / voice / fanfic 的 `.dsh-novel-*` 账本；与五件共存说明见 docs/COEXIST.md
- 证据：测试 161/161、合成验收 19/19、真实验收 11/11、`npm pack` 54 文件

Co-authored-by: MiyueWinter <mingyue_11129@qq.com>
```

## 5. 发布后

1. DSH → 插件 → 搜「小说」安装，确认右栏六页签与 `/novel status`；
2. 在真实书上跑一章（先复制书目录）；
3. 把新发现写进 [docs/LIMITS.md](LIMITS.md)。

## 附：提交与标签

```powershell
git commit -m "<type>(kit): <what>" -m "Co-authored-by: MiyueWinter <mingyue_11129@qq.com>"
git tag v0.1.13
git push origin main --tags
```

