# 墨巡可靠终端 · 阶段二实施记录

2026-11-07。阶段一的 Session、IPC 和 Shell 探针已通过隔离验收。本次把自有终端接入墨巡，并处理了终端数据积压、索引解析和 PDF 预览。阶段二整体验收仍未通过。阶段三的 Agent 执行接入、阶段四的发布验收尚未开始。

## 可用入口

启动后侧栏选择「打开墨巡终端」。独立窗口按需创建。直接输入可操作本地 Shell，也可手动输入 SSH 命令。关闭窗口后从同一入口恢复原来的 Shell 和近期输出。「中断」向当前 PTY 发送 Ctrl+C。「结束会话」经原生确认后回收 PTY。应用退出时回收其拥有的 PTY。

终端支持滚屏搜索、复制、粘贴、清屏、自动适配和 macOS 字号快捷键。当前入口管理一个本地启动的 PTY，并独立于对话关联。旧 iTerm 入口继续服务保存连接、观察和已有 iTerm 会话。新终端的 SSH 目标与 cwd 状态、会话标签和观察授权仍待接入。

## 修改清单

| 范围 | 文件和行为 |
| --- | --- |
| 双窗口与生命周期 | `src/main/index.ts`、`src/main/menu.ts`、`src/main/terminal/managed/window.ts`。接入独立窗口，聊天和终端可分别关闭，macOS Dock 激活时可恢复聊天。终端记住本次进程内的窗口位置和尺寸 |
| IPC 和 UI | `src/main/ipc-security.ts`、`src/main/terminal/managed/ipc.ts`、`src/preload/terminal.ts`、`src/preload/modules/terminal.ts`、`src/renderer/terminal.html`、`src/renderer/src/terminal/`、`AppSidebar.tsx`。独立 sandbox、精确页面和会话授权、专用 Preload、终端与聊天 IPC 分离 |
| 终端性能 | `src/main/terminal/managed/output-buffer.ts`、`session-manager.ts`、`src/main/terminal/session/{pty-session,types}.ts`。有界分块缓存、每个 attachment 一条待消费通知、按帧拉取、256 Ki 代码单元积压背压。回放期间屏蔽协议回写 |
| 索引 | `src/main/code-intelligence/{language,parser,parser-protocol,service,utility-parser,worker}.ts`。WASM AST 解析移到独立 Electron Utility Process，Main 保留路径授权、SQLite 暂存和事务提交。限制一次索引，子进程崩溃或取消时旧索引保留 |
| PDF | `src/main/local-document-{ipc,reader}.ts`、`src/shared/local-documents.ts`、`src/preload/modules/documents.ts`、`LocalPdfPreview.tsx`、`LocalDocumentsSheet.tsx`。以有界二进制范围替代整份 Base64，预览仍受目录授权、文件身份和用量限制，切换页面会销毁上一次加载 |
| 构建及兼容 | `electron.vite.config.ts`、`package.json`、`package-lock.json`、`scripts/check-security-boundaries.cjs`、`resources/licenses/xterm/`。增加终端、Preload 和索引进程入口，保留 Main 产物的相对路径，更新静态权限断言。锁定官方 xterm.js 6.0.0、Fit 0.11.0、Search 0.16.0、Unicode11 0.9.0，四者 MIT 且来自同一源码提交。相应许可文本随应用资源分发 |
| 文档和本地测试 | `Document/{ARCHITECTURE,SECURITY_MODEL,EXTERNAL_TERMINALS,TESTING,UI_DESIGN_SYSTEM}.md`；新增独立终端、索引进程和 PDF 预览的 Electron 夹具，补充文件身份变化与超限测试 |

## 测试和性能

使用 Intel i5-1038NG7、macOS 26.7、Electron 41.10.7。整应用终端夹具使用构建产物、独立 Profile、临时 Bash、实际 xterm 和 node-pty。窗口焦点、剪贴板与原生确认由夹具模拟。

| 场景 | 实测 |
| --- | --- |
| 终端粘贴到可见回显，20 次 | P50 26.3 ms，P95 36.8 ms。包括 IPC 与 xterm 渲染 |
| 16 MiB 合成输出 | 2.56 秒显示末尾标记，挂载期间无截断提示。输出测试窗口内 Main 事件循环 P95 6.05 ms，最大 7.61 ms。一次聊天 Renderer 轻量求值 11.19 ms |
| 同一 Electron 夹具，150 个 TypeScript 文件和 1,800 个符号 | 主进程峰值 RSS 254.3 → 142.0 MiB，下降 44.2%。Main 加索引进程的采样峰值 254.3 → 302.5 MiB，上升 19.0% |
| 同一索引夹具 | 全量 665 → 1,017 ms，增量 97 → 106 ms，Main 事件循环最大延迟 35.36 → 25.61 ms。两次全量均索引 150 个文件，增量复用全部 150 个 |
| 大于 3 MiB 的合成 PDF | 从文件选择到渲染 1.20 秒。预览读了 65,536、65,536、677 字节三个范围，另有至多 1 KiB 初始文件头 |

终端粘贴耗时与阶段一的原始 PTY 回显耗时测量边界不同。索引的前后对比来自同一 Electron 夹具。阶段一 Node/Vitest 的索引峰值来自不同进程模型，不能与这组数据直接比较。以上为本机样本，未覆盖 IME、真实多显示器、持续四至八小时或高负载下持续聊天输入。

- `npm run ci` 通过。ESLint 0 错误、151 警告，572 项静态检查通过。TypeScript 和三个 Electron 构建目标通过。
- `npm run test:local -- --project unit src/main/local-document-reader.test.ts src/main/local-document-ipc.test.ts` 通过 18 项。
- 开启下列环境开关后，真实 Electron 的终端、索引和 PDF 三项整应用夹具全部通过。索引夹具还验证了强制结束解析进程、取消请求及旧索引保留。
- 初版多 Main 入口使 Vite 改变了 chunk 输出目录，导致聊天 IPC 的文件 URL 校验拒绝合法请求。保留原 Main chunk 目录后，整应用夹具通过。
- 默认完整本地回归 555 通过、1 失败、18 跳过。既有 `conversation-refinement.browser.test.ts` 在改造前与阶段二均出现 `textContent` 空节点，单独重跑也复现。
- 独立补测应用退出。先在新 PTY 中采集 Shell PID，再触发真实应用退出，父进程确认该 PID 已消失。测试通过。
- 1,000 条混合历史的两次阶段二滚动最大帧间隔分别为 148.3 和 128.7 ms，阶段一基线为 136.1 ms。第一次在后续 1.25 倍缩放布局断言失败，完整重跑通过。两次滚动样本不足以证明性能改善。
- `npm audit --omit=dev` 未报告新增 xterm 包的公告。既有生产依赖仍有 16 项审计告警，其中 2 项为 critical。
- `git diff --check` 通过。原有变更路径仍在当前工作区，暂存区为空。

```sh
MOXUN_MANAGED_TERMINAL_LIVE=1 MOXUN_CODE_INDEX_PERF=1 MOXUN_CODE_INDEX_EXPECT_UTILITY=1 MOXUN_PDF_PREVIEW_LIVE=1 npm run test:local -- --project desktop src/main/terminal/managed/product.browser.test.ts src/main/code-intelligence/worker.browser.test.ts src/main/pdf-preview.browser.test.ts
```

## 阶段门槛与回滚

聊天虚拟列表和 5,000 条会话场景尚未实现。索引改善了 Main 峰值和事件循环，合计 RSS 仍未达到本计划的下降目标。DOCX Utility Process、SQLite 与记忆性能及长时稳定性尚未验收。新终端还缺少已保存 SSH 目标和对话的迁移。这些结果不足以进入阶段三；当前 Agent 执行入口仍由 Main 拒绝。阶段四的 CI 用例迁移、原生多架构及安装包验收亦尚未执行。仓库现有发布规则只提供 Intel macOS 构建入口。

回滚时可以分别撤回终端窗口接入、索引解析进程和 PDF 范围读取。先保留用户原工作区变更。独立终端回滚仅移除新入口、专用 Preload/Renderer、Session/IPC 路由和 xterm 依赖。索引回滚只恢复原解析调用及构建入口，数据库仍沿用现有结构。PDF 回滚需一起恢复 Main、Preload 和预览接口。阶段二没有新增数据库迁移、远端配置或发布动作。
