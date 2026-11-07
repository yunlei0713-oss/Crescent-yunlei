# new10 当前工作区基线 · 2026-11-07

本次以 new10 总计划的 Gate 为准。已完整阅读两份 new10 计划和 new9 总计划及四份阶段报告。历史数据仅用于定位待复测项。

- Git 分支 `test`，HEAD 与本地 `origin/test` 均为 `d3813972b2610511ee63d5b1f7e976de67cdf613`。原有 155 个已跟踪路径有未暂存变更，暂存区为空。初始暂存及未暂存 diff check 均通过。完整 Git 状态和文件哈希存于 [证据目录](evidence-20261107)。
- Intel macOS，Node 24.18.0、npm 11.16.0，安装的 Pi 包为 1.0.3。项目技能及对应的安装包 SDK 文档和类型用于核对 Main 和 Pi 接口。
- `npm run ci` 通过。ESLint 0 错误、150 警告，576 项静态检查和 4 项协议用例通过，Main、Renderer 类型检查和 Electron 构建通过。[完整输出](evidence-20261107/baseline-ci.txt)
- `npm run test:local -- --project unit` 使用隔离短 TMPDIR，540 通过、3 跳过。[完整输出](evidence-20261107/baseline-unit.txt)
- 生产审计重新报告 2 Critical、6 High、6 Moderate、2 Low。完整审计另报告 2 Critical、8 High、19 Moderate、2 Low。公告影响范围与实际调用路径的逐项分析属于 P1 Gate。[生产审计](evidence-20261107/baseline-audit-production.json) · [完整审计](evidence-20261107/baseline-audit-all.json)

## 当前实现与冲突

- Pi 顶层对话工具 → `ManagedTerminalWindow` 原生审批 → `ManagedTerminalSessions` → `ManagedCommandExecutor` → Main-owned PTY。Session/attachment 分开，审批后重验可见性及对话，协议匹配命令 ID、generation 和 nonce，软超时保留执行锁。复用双窗口、独立 preload、xterm 和滚屏缓冲。
- 当前协作 Shell 为无 profile 的本地 Bash。任意终端输入撤权，普通 SSH 和旧 iTerm 入口保持人工。软超时以后缺少原 commandId 查询，结果审计为内存记录。
- 索引解析已在 Utility Process，PDF 为授权范围读取。DOCX 仍在 Main，聊天仍构建全量已加载消息节点。它们的性能复测与变更按 P1 Gate 处理。
- `.gitignore` 排除 Vitest 源码。同目录 `*.test.ts` 按项目规则保留本地，P0 增量通过既有 `node --test` 的 CJS 入口纳管。现有 CJS 协议入口本身也尚未进入索引。项目发布规则和配置目前仅提供 x64，最新请求的 arm64/Universal 在 P2 再核对构建入口。

## 隔离桌面与资源采样

四项构建产物夹具通过，分别覆盖双窗口和 PTY、Pi 回环模型本机审批、索引 Utility Process、PDF 范围预览。[完整输出](evidence-20261107/baseline-desktop.txt)

| 边界 | 本轮基线 |
| --- | --- |
| xterm 可见回显，20 次，含 Main 和 Renderer IPC | P50 35.21 ms，P95 42.97 ms |
| 16 MiB 合成 PTY 输出至 xterm 末尾标记 | 2,945.17 ms，Main event-loop P95 5.78 ms、最大 13.80 ms |
| 150 文件、1,800 符号的索引夹具 | 全量墙钟 1,210.03 ms、增量 111 ms，Main + Utility 同时采样峰值 305.95 MiB |
| PDF 合成夹具 | 三次范围读取 65,536、65,536 和 677 字节，选择到渲染约 1,119.29 ms |

[PTY 原始样本](evidence-20261107/baseline-pty.json) · [索引原始样本](evidence-20261107/baseline-index.json)

两个旧桌面测试会通过真实设置入口保存合成凭据，当前需要隔离钥匙串后才运行。`vitest list --project desktop --filesOnly` 复测确认，给该 project 传两个 `--exclude` 仍会列出这两个文件。安全回归改用从列表计算的显式文件参数。该选择不构成完整默认测试套件已通过的证据。[文件列表](evidence-20261107/desktop-test-list.json) · [参数复测](evidence-20261107/desktop-exclude-probe.json)
