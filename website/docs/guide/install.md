# 安装

<LatestDownloads locale="zh" />

当前仅交付 Mac Intel（x64）包：`墨巡.app`、`moxun-<version>-x64.dmg` 和 `moxun-<version>-x64-mac.zip`。不再生成 Universal、arm64 或其他平台包。下载列表可能来自历史 Release，文件存在不代表本轮已验收或已签名。

## macOS 安全提示

确认下载来源和 SHA-256，按 Release 说明检查签名、公证。Gatekeeper 提示“已损坏”可能来自签名、隔离或文件损坏，不能直接断言文件正常；不要对来源不明的应用解除隔离。源码本地无签名包仅供开发验证。详见 [签名说明](https://github.com/aide-family/Crescent/blob/main/Document/CODE_SIGNING.md)。

## 从源码安装

```bash
npm ci
npm run dev
```

详见 [开发与构建](/develop/)；AI 需另行配置模型，终端操作需 iTerm。
