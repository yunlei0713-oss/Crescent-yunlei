# 测试与验收

## 本地测试入口

| 命令 | 覆盖范围 |
| --- | --- |
| `npm run ci` | ESLint、安全静态检查、TypeScript、Electron 构建 |
| `npm run test` | Main、Preload、Renderer 与 Agent 能力的安全静态检查，以及可在 CI 运行的终端协议测试 |
| `npm run test:local -- --project unit` | Vitest 单元测试、SQLite、PTY 和 IPC 集成测试 |
| `npm run test:local -- --project desktop` | 使用真实 Electron 的隔离窗口夹具 |
| `npm run test:local` | 当前可用的完整本地回归 |
| `npm run smoke:packaging -- <产物路径>` | 安装包检查，具体参数见发布操作文档 |

按当前仓库规则，Vitest 文件仍为本地测试。终端连接、观察授权和人工验收流程见 [外置终端说明](EXTERNAL_TERMINALS.md)。发布及原生依赖验收见 [发布操作](RELEASE_OPERATIONS.md)。

## 隔离和复测

- 文档、项目、SQLite 和 Shell 使用临时目录及合成数据。Electron 测试使用独立 Profile，回环 SSH 使用临时密钥和单独的已知主机文件。
- macOS 上 Unix Socket 路径长度受系统限制。给 `TMPDIR` 传短路径，例如用 `mktemp -d /private/tmp/mx9.XXXXXX` 创建本次目录。部分旧夹具需要在其中先创建 `opencode` 子目录。
- 真实 iTerm、业务 SSH、模型和打包验收单独记录。默认回归采用本地夹具。
- 报告区分实际通过、跳过及未覆盖场景。命令完成的测试必须有匹配的结束标记和退出码，应用任务的验证单独断言。

## 阶段一的独立终端原型

`npm run test:local -- src/main/terminal/managed` 使用隔离的 Electron 窗口、真实 node-pty、Bash/Zsh 和回环 SSH。夹具覆盖 Renderer 权限、窗口生命周期、PTY 保留、Ctrl+C、尺寸、有限缓存，以及分块 OSC 和命令退出码。

## 独立终端、索引和 PDF 整应用验收

先执行 `npm run build`。使用专用短 `TMPDIR`，按需运行下列夹具。终端夹具使用临时 Shell 和独立 Profile。索引夹具使用合成代码并验证解析进程崩溃后保留旧索引。PDF 夹具使用合成文件，统计范围读取并验证渲染。

```sh
MOXUN_MANAGED_TERMINAL_LIVE=1 MOXUN_CODE_INDEX_PERF=1 MOXUN_CODE_INDEX_EXPECT_UTILITY=1 MOXUN_PDF_PREVIEW_LIVE=1 npm run test:local -- --project desktop src/main/terminal/managed/product.browser.test.ts src/main/code-intelligence/worker.browser.test.ts src/main/pdf-preview.browser.test.ts
```

阶段进度、基线和回滚方式见 [阶段一验收](new9/MOXUN_RELIABLE_TERMINAL_PHASE1_REPORT_20261107.md) 与 [阶段二实施记录](new9/MOXUN_RELIABLE_TERMINAL_PHASE2_REPORT_20261107.md)。

## 本地 Agent 协作

`npm test` 包含开始/结束帧匹配、过期、隐藏目标、软超时与人工接管。构建后可运行真实 Electron/Pi 回环夹具。夹具只在子进程中提供回环模型所需的临时值，保持应用的凭据存储实现。

```sh
MOXUN_AGENT_TERMINAL_LIVE=1 npm run test:local -- --project desktop src/main/terminal/managed/agent-collaboration.browser.test.ts
```

`lifecycle.browser.test.ts` 也验证 Electron 内实际 Bash 和 PTY，涵盖 Agent 原始写入拒绝和审批结果，无需模型。

## new4 persistence / lifecycle regression

Local-only suites cover transactional Conversation migration/rollback, orphan logs,
86-step keyset pagination, cache eviction, restarted service numbering, 1/2/3 choices,
exact batch approval paths, transient iTerm errors and explicit native-confirmed end
with mocked consent. `new4.browser.test.ts` uses real Electron rendering with synthetic
IPC data to exercise batch/digest/expiry states and paginated history; this is not
native iTerm or real consent acceptance. `live-iterm.test.ts` additionally records
PID/cwd/environment/foreground-task/socket continuity when the native environment
is available. Never substitute mock consent or static bundle hashes for that check.

See the [2026-11-03 report](new4/MOXUN_ISSUE_REFACTOR_IMPLEMENTATION_REPORT_20261103.md)
for the actual complete-gate results, retained screenshot-stability failures and
native Automation limitations. Tests remain gitignored and are not committed.

## 内置文档写作 Skill 与命令块主题（2026-11-03）

`src/shared/document-writing.test.ts` 和
`src/main/agent/builtin-document-writing.test.ts` 为本地测试，覆盖中英文自动触发、
普通问答和代码任务排除、相邻任务续接、完整 Prompt 注入、手动 Skill 合并去重及资源失败降级。
运行 `npm run ci` 和 `npm run test:local`；结果与 Electron 目录/ASAR 资源夹具、
深浅主题截图见 [文档写作实施记录](new4/MOXUN_DOCUMENT_WRITING_IMPLEMENTATION_REPORT_20261103.md)。
ASAR 夹具不代表正式 macOS 安装包验收；本轮未创建安装包，未使用付费模型或业务终端。

2026-11-03 对话区布局优化、引用元数据标题修复，以及工具/建议折叠交互的
Electron 视觉验证和完整回归结果，见 [对话区优化记录](new4/MOXUN_CHAT_LAYOUT_OPTIMIZATION_REPORT_20261103.md)。
新增 `src/shared/conversation-title.test.ts` 保持本地 gitignored；视觉夹具使用合成消息，
不代表真实文件变更、业务终端或原生授权验收。

首字断段、Pi 内容块身份和 Codex 风格阅读区/定位条回归见
[流式与导航实施记录](new4/MOXUN_CONVERSATION_STREAM_AND_NAVIGATION_REPORT_20261103.md)。
本地 `agent-stream-steps.test.ts`、`runtime-stream.test.ts` 与
`conversation-refinement.browser.test.ts` 分别检查纯拼接、Pi 订阅身份和真实 Electron 组件链路；
桌面测试使用独立 Profile、合成事件和测试自有窗口，不接业务终端或付费模型。

该组件回归还覆盖定位条贴边及悬停波形、消息角色/时间/复制按钮的悬停显示、
回复用时分割线和行内代码跨行边框；最新视觉与完整回归结果见
[对话区细节打磨记录](new4/MOXUN_CHAT_DETAIL_POLISH_REPORT_20261103.md)。
