# 墨巡可靠终端 · 阶段一验收

2026-11-07。基线为本地 `test` 分支原有工作区，含未提交的项目、记忆、文档和终端改动。原有 diff 已另存，未创建提交。

## 改动

- `src/main/terminal/managed/session-manager.ts`、`src/shared/managed-terminal.ts` 复用现有 `createPtySession`。Main 以随机 Session ID 和 generation 管理原生 PTY。文档级 attachment 可独立回收，重连沿用同一 Shell。缓存仅保留最近 512 Ki 个 UTF-16 代码单元。明确结束时清理，原生进程退出有单独的状态。
- `src/main/terminal/managed/ipc.ts`、`src/main/ipc-security.ts` 对独立终端窗口验证 Main 绑定、主 frame、已提交的页面 URL、Session ID、generation 和 attachment。导航、崩溃和关闭使旧文档失去写入资格。专用终端窗口与聊天通用 IPC 分离。
- `src/main/terminal/managed/*.test.ts` 是本地夹具，包含真实 Electron 双窗口、Bash/Zsh 和 SSH。用 `@xterm/headless@6.0.0` 的 OSC 处理器验证解析。Envelope 夹具使用固定命令，Agent 尚无可用的写入或派发入口。
- `Document/TESTING.md` 恢复测试入口与隔离规则，外置终端说明归入 `Document/EXTERNAL_TERMINALS.md`。大 DOCX 回归改用合成文件，Electron 组件截图写入测试专用临时目录。
- `electron.vite.config.ts` 删除原有 Renderer 包大小硬门槛和自定义警告预算，保留已有的按需加载及构建设置。Vite 自带的提示不影响构建成功。

## 验收证据

| 检查 | 结果 |
| --- | --- |
| 原工作区 `npm run ci` | 通过。366 项安全检查，ESLint 0 错误、149 警告，TypeScript 和构建通过 |
| 阶段一 `npm run ci` | 通过。368 项安全检查，ESLint 0 错误、150 警告，TypeScript 和构建通过 |
| `npm run test:local`，短 `TMPDIR` | 555 通过、15 跳过。运行启动后新增的 SSH 用例另行执行 |
| `npm run test:local -- src/main/terminal/managed` | 5 通过。真实 Electron 关闭、刷新、导航、崩溃与恢复，过期凭据、PTY 缓存、退出、resize 和 Ctrl+C |
| `npm run test:local -- --project unit src/main/terminal/managed/shell-integration.test.ts` | 5 通过，包含新增的回环 SSH。远端命令状态为退出码 1，离开远端后本地 `ssh` 退出码为 37 |
| `git diff --check` | 通过 |

最初使用过长的临时目录，旧 iTerm Socket 夹具报 `EINVAL`。改用 `/private/tmp` 下的短临时路径后通过。Bash 3.2 在缺少 UTF-8 locale 时会误解释非 ASCII 输入。固定 UTF-8 locale 后，固定中文和 Emoji 命令夹具通过。远端夹具仅使用回环端口、临时密钥及配置。

## 可复测的性能基线

Intel Core i5-1038NG7、macOS 26.7、Node 24.18.0、Electron 41.10.7。指标来自同一设备，运行之间的后台负载和进程模型可能不同。

| 场景 | 基线 |
| --- | --- |
| node-pty → Bash → Main 可见输出，50 次合成回显 | P50 0.36 ms，P95 1.11 ms |
| 16 MiB 合成 PTY 流，仅测原始传输 | 2.01 s，16,385 次数据回调，测试进程峰值 RSS 46.55 MiB，CPU 用户态 427 ms / 内核态 272 ms，事件循环 P95 5.32 ms |
| Electron 展开 1,000 条混合消息 | 初次显示 152.62 ms，展开 2,599.77 ms，60 帧滚动采样最大间隔 136.10 ms |
| 150 个合成 TypeScript 文件，1,800 个符号 | 全量 1,799 ms，增量 123 ms，搜索 P95 2.30 ms，整个文档和索引夹具峰值 RSS 1,319 MiB |
| 约 25 MiB 和约 100 MiB 文本日志 | 全文件字面搜索 P95 167.10 / 663.75 ms |
| 文档和索引夹具事件循环 | P95 11.12 ms，最大 47.71 ms |

PTY 数据是原始传输基线，未计入用户按键、IPC、xterm 或显示器绘制。阶段一未调整运行时性能路径，表中没有将夹具数据计作优化收益。原始 JSON 和原始 PTY 基准脚本附于此次交付。索引与历史可分别使用以下命令复测，文件路径均相对于仓库根。

```sh
MOXUN_NEW7_PERF=1 MOXUN_NEW7_PERF_OUTPUT=/tmp/moxun-doc-index.json npm run test:local -- --project unit src/main/local-document-performance.test.ts
MOXUN_FULL_QUALITY_LIVE=1 npm run test:local -- --project desktop src/renderer/src/components/full-app-quality.browser.test.ts
```

## 组件审查与剩余风险

- 现有 node-pty 1.1.0 为 MIT，复用原生 PTY 和进程回收。本机 Electron 原生夹具通过。node-pty 以应用用户权限运行，因此终端原始输入仍限定于操作员路径。[node-pty](https://github.com/microsoft/node-pty)
- xterm.js 6.0.0 的 headless 包无运行依赖。npm tarball 未附许可证文件，已按包标注的源码 commit 查到 MIT 许可证和版权声明。正式引入浏览器端依赖时需保留其许可文本。[xterm.js 许可证](https://github.com/xtermjs/xterm.js/blob/f447274f430fd22513f6adbf9862d19524471c04/LICENSE)
- VS Code Shell Integration 文档提供 OSC 133 / 633 语义。普通输出、错误 nonce 和非配对标记在测试中不会完成 Envelope。流内 nonce 提供关联能力，已知 nonce 的恶意程序仍能构造同格式控制帧，因此本阶段没有赋予该原型生产执行权限。[VS Code 协议说明](https://code.visualstudio.com/docs/terminal/shell-integration)
- CanvasTTY 和 terminal-use 的许可证为 MIT，仅参考 Electron/PTY 连接、缓冲和 attach 设计。它们的共享控制、Socket 和自动化权限模型不进入墨巡的审批路径。[CanvasTTY](https://github.com/howdeploy/CanvasTTY) · [terminal-use](https://github.com/computer-agent-labs/terminal-use)
- Crescent-yunlei 的本地 `origin/main` 快照为 `c4c400c`，根目录无 LICENSE，公开 LICENSE 请求返回 404。只核对本仓已有行为，未移植参考仓代码。

阶段二需要验证回放不会把终端控制序列的应答重新发送到 Shell，并测量输出积压、输入延迟和多窗口资源。任意命令、复杂语法、生产 SSH 和交互式接管仍须单独验收。安装包、原生多显示器及长时间稳定性留待后续阶段。

## 回滚

阶段一原型由 `src/main/terminal/managed/`、`src/shared/managed-terminal.ts` 及 `ipc-security.ts` 中对应的独立入口组成。回滚只移除本阶段添加的模块、依赖条目和文档片段。原工作区 diff 另存用于核对，不能整仓回放或覆盖既有修改。阶段一未修改用户数据库、Shell 配置及远端配置。
