# 墨巡可靠终端 · 阶段四实施记录

2026-11-07。工程门禁和本机验收已启动，安装包发布验收仍待完成。

## 变更

- `npm test` 在静态安全边界之外执行 `scripts/verify-managed-terminal.cjs` 的协议测试。使用现有 Node 测试运行器，补齐直接开发依赖。Vitest 集成与桌面夹具仍遵循仓库的本地测试约定。
- `scripts/build-macos-local.cjs` 统一执行一次 `verify:local`，随后打包该构建。npm 入口去掉外层重复的验收和二次构建链。
- `scripts/smoke-macos-app.cjs` 检查 ASAR 中的独立终端 Renderer、专用 Preload、索引进程和 xterm 许可。检查可执行程序和 node-pty helper 的 Intel 架构，可选比对当前构建文件以识别陈旧资源。
- 会话导航桌面夹具等窗口完成加载和获得焦点后才开始。两个桌面夹具的证据改写入各自的临时目录。前序测试曾使用旧的 `Document/new5` 验证目录，目录内部分旧截图、结果 JSON 和失败截图已被前序运行刷新。

## 验收

| 检查 | 结果 |
| --- | --- |
| `npm run ci` | 通过。ESLint 0 错误、150 警告，576 项静态安全检查和 4 项协议测试通过，TypeScript 与 Electron 构建通过 |
| 本地回归 | 556 通过、19 跳过、0 失败。命令另行排除两项会保存凭据的旧桌面夹具，以避免系统弹窗 |
| 整应用本地 Agent 夹具 | 通过。真实 Electron、Pi、回环模型和本地 PTY |
| macOS ASAR 内容检查 | 构建产物与 Intel 二进制组成的隔离夹具通过。替换终端 HTML 或移除专用 Preload 后均被拒绝 |
| Git 检查 | `git diff --check` 通过，暂存区为空 |

```sh
npm run ci
npm run test:local -- --exclude src/main/context-memory.browser.test.ts --exclude src/main/projects.browser.test.ts
MOXUN_AGENT_TERMINAL_LIVE=1 npm run test:local -- --project desktop src/main/terminal/managed/agent-collaboration.browser.test.ts
node scripts/smoke-macos-app.cjs "/path/to/墨巡.app" "$PWD"
```

当前阶段减少的是本地发布入口的重复构建步骤，尚无正式安装包构建耗时对照。回归用例使用临时目录和合成数据。用户登录钥匙串只核对了文件与登记状态。没有创建、签名或发布 DMG/ZIP；本机检查的是 ASAR 夹具和已安装的 Intel 二进制。正式安装启动、升级数据迁移、签名/公证、长时稳定性及 ARM64 真机验收尚待完成。当前仓库的正式打包入口仍按既有 Intel 约束运行。

如需回滚，撤回 `npm test` 的协议测试接线、两个打包脚本的本阶段增量以及专用夹具变更。终端、索引和 PDF 的运行时代码可以独立保留。
