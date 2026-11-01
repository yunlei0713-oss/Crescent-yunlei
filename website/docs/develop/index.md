# 从源码运行与贡献

在仓库根目录运行：

```bash
npm ci
npm run dev
```

Pi 依赖按根锁文件统一版本；网站依赖和锁文件独立。当前 Agent 不执行终端命令，不注册 OpenAPI 工具；Agent MCP 因已审计名单为空而禁用，设置侧显式发现另行受控。

## 门禁与打包

```bash
npm run verify:local
npm run build:mac:local
```

`verify:local` 是 CI（lint、静态安全、含类型检查的 build）加本地行为测试。测试文件仅本地保留，不提交。pre-commit 自动运行 CI；有本地测试时提交前须自行运行完整门禁。

当前只生成 Mac Intel（x64）app/DMG/ZIP，应用名“墨巡”、安装包前缀 `moxun`。本地入口禁用签名、公证和发布；`build:mac` 用于预配置签名身份。仅 `:x64` alias 保留，arm64／Universal 和 Windows／Linux 打包入口已移除。打包期间冻结 `out/`，不能并发构建。

## 文档站

```bash
npm run docs:dev
npm run docs:build
```

站点源码在 `website/`，发布由仓库 Pages workflow 受控执行，本轮不自动推送或发布。

工程规范：[开发](https://github.com/aide-family/Crescent/blob/main/Document/DEVELOPMENT.md)、[测试](https://github.com/aide-family/Crescent/blob/main/Document/TESTING.md)、[架构](https://github.com/aide-family/Crescent/blob/main/Document/ARCHITECTURE.md)、[签名](https://github.com/aide-family/Crescent/blob/main/Document/CODE_SIGNING.md)。

欢迎在 [仓库](https://github.com/aide-family/Crescent) 提交 Issue、Pull Request 或可复用 Skill；请勿附带密钥、用户配置和敏感终端输出。
