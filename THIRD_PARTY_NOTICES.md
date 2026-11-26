# 第三方与移植说明

## dsh-novel-fanfic 的本地媒体读取

`lib/native/comic/` 由 `dsh-novel-fanfic`（MIT，Copyright (c) 2026 DrizzleGig）的本地漫画/OCR 实现移植而来：

- CBZ/ZIP/图片目录读取
- 分格检测
- Windows 内置 OCR 适配

移植后由 kit 原生加载，不共享 fanfic 的账本或运行时；kit 只读作者指定的本地文件，且限制在工作区内。

## openhongguo

`lib/native/hongguo/vendor/openhongguo/` 来自 `dsh-novel-fanfic` 的 vendored `openhongguo` 客户端，用于红果短剧的只读元数据/弹幕查询：

- 许可证：Apache-2.0（见 `lib/native/hongguo/vendor/openhongguo/LICENSE`）
- 只暴露 `search / getSeries / listEpisodes / listDanmaku`
- 不暴露播放地址、内容密钥或下载能力

## 许可

kit 本体：MIT，见 `LICENSE`。
