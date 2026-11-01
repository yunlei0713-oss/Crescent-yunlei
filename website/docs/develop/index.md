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

本地 Mac 打包只生成一份 x64 + arm64 Universal app/DMG/ZIP，禁用签名、公证和发布。`build:mac` 是预配置签名身份的 Universal 入口；旧架构命令为 alias。打包期间冻结 `out/`，不能并发构建。Windows/Linux 脚本保留，但不代表本轮平台验收成功。

## 文档站

```bash
npm run docs:dev
npm run docs:build
```

站点源码在 `website/`，发布由仓库 Pages workflow 受控执行，本轮不自动推送或发布。

工程规范：[开发](https://github.com/aide-family/Crescent/blob/main/Document/DEVELOPMENT.md)、[测试](https://github.com/aide-family/Crescent/blob/main/Document/TESTING.md)、[架构](https://github.com/aide-family/Crescent/blob/main/Document/ARCHITECTURE.md)、[签名](https://github.com/aide-family/Crescent/blob/main/Document/CODE_SIGNING.md)。

欢迎在 [仓库](https://github.com/aide-family/Crescent) 提交 Issue、Pull Request 或可复用 Skill；请勿附带密钥、用户配置和敏感终端输出。
