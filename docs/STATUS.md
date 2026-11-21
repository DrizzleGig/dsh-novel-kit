# dsh-novel-kit 状态一页纸（2026-11-22 · 0.1.12）

## 一句话

一个独立包，装它一个就能写长篇：章节引擎 + 四段上下文 + 七种只读查询 + 六页签面板 + 可回退的旧五件接管。

## 能力（对照五件）

| 五件 | kit 里的位置 | 状态 |
|---|---|---|
| beat：拍板 / 段落 / 校验 | `novel_plan`（propose/adopt/reject）、`finish` 段落登记、面板「拍板」 | 已迁移（改设定/回退未做） |
| fade：记忆卡 / 三维简报 / 检索 / 钉忘 / 历史 | `finish` 落卡、四段「三维记忆」、面板搜索 + 钉/忘/恢复、总览「最近章节」 | 已迁移 |
| voice：档案简报 / 文风检查 | 四段「文风档案」、`checkBands`（进 verify） | 已迁移（档案学习未做） |
| fanfic：契约 / 称呼 / 禁忌 / 复制 / 导入 / 冲突 | 四段「世界契约」、verify 三项 blocker、面板导入、冲突页签 | 已迁移（审阅队列未做） |
| conductor：编排 / 收据 / 严格模式 | `plan → start → write → finish`、事务回执、`strict`、快照诊断 | 已迁移（replay 未做） |
| 旧五件本身 | 面板一键停用（只动选择层），回退只恢复 kit 停用的 | 已迁移 |

## 证据

| 项目 | 结果 | 命令 |
|---|---|---|
| 单元/集成测试 | **110/110** | `node --test` |
| 合成工作区完整一章 | **19/19** | `npm run acceptance` |
| 真实账本验收（复制，不动原书） | **10/10** | `npm run acceptance:real` |
| 客户端渲染冒烟（面板/工作台/按钮） | 通过 | `node --test test/render.test.mjs` |
| 语法检查 | 通过 | `npm run check` |
| 打包 | 约 38 文件 | `npm pack --dry-run` |
| 真机插件行 | `novel-kit` / `novel-kit-remote` 均 `fiberPhase=active` | `plugin_manager list_plugins` |

## 一章的路径

```
/novel on
novel_plan({book, chapter, proposals})         → 作者 adopt/reject
novel_chapter_start({book, chapter})           → 四段上下文（beat/fanfic/三维记忆/文风）
novel_chapter_write({session_id, text})        → 版本化草稿
novel_chapter_finish({session_id, segments, memory})
   → 引文定位 → 指纹比对 → verify（禁忌/复制/错名/长句/称呼/文风）
   → blocker 不落账；通过则写正文 + 事务写 beat/fade + 回执
```

## 还差什么（都不是代码侧）

| 项 | 谁来做 |
|---|---|
| npm 发布 0.1.12 | 你 `npm login` 后跑 `npm run release`（脚本已备好，自检全过） |
| GitHub Release | 你 `gh auth login` 或网页发（tag 已推，模板在 RELEASE.md） |
| 面板目视验收 | 你刷新 DSH，看六个页签与工作台 |
| 隔离 profile 安装矩阵 | 真机装/卸一次（Codex 验收第 1、7 条） |

## 文档地图

- [README](../README.md)：安装、能力对照
- [DETAIL](DETAIL.md)：详情页长描述
- [LIMITS](LIMITS.md)：已知边界（含发布阻塞证据）
- [RELEASE](RELEASE.md)：一条命令发布 + GitHub Release 模板
- [CODEX-REVIEW-BRIEF](CODEX-REVIEW-BRIEF.md)：给外部评审的代码地图与五个待决问题
- [验收记录](../../docs/kit-acceptance-2026-11-22.md)：一章验收 19 项的证据
