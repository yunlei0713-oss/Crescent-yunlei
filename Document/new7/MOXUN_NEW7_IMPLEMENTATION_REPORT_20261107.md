# 墨巡 new7 实施与验收报告

2026-11-07 · `test` 工作树 · 墨巡 1.0.12

按 P0 → P1 → P2 → P3 → P4 → P5 实施。每阶段先编写或更新本地回归用例，再实现并复跑。开始前的定向基线为 5 个套件、44 个通过。计划与实际调用链的差异、原有工作树状态及 iTerm 能力调查见 [P0 审计](MOXUN_NEW7_P0_AUDIT_20261107.md)。

## 逐项验收

| 阶段 | 实施内容 | 验收证据 |
| --- | --- | --- |
| P1 终端生命周期 | Main 按授权流识别 OSC 133/633，关联命令 ID 和组 ID。配对的结束事件区分退出码 0、非零与缺失。重复、乱序和跨协议标记不借用旧开始事件。未收到结束事件时保留未确认状态，文本提示符与快照不触发主动分析。多行粘贴仅记录实际观察到的子命令，末尾边界无法证明时保留批次不完整。人工确认绑定当前 owner、会话、终端及证据摘要，证据变化时提示重新确认。 | 观察器与通知单测、授权和生命周期 IPC 用例、本机 iTerm 合成 OSC 0、7、无退出码以及原有快照/PTY 回归。 |
| P2 Agent 回合队列 | Main/SQLite 按稳定 `conversationId` 领取 FIFO 回合并保存原始输入、显示引用、模型、工作风格、语言、附件身份、项目版本与终端绑定快照。Renderer 展示排队和恢复状态，负责正常聊天运行入口的连续领取。普通发送保留当前回答，显式停止只取消 Agent，停止并发送将新消息放在普通待处理项前面。旧回合结果和孤立 IPC 事件按 run ID 丢弃。 | SQLite 测试检查跨会话并行、单会话互斥、重启后待继续及优先级。真实 BrowserWindow、preload、Main、SQLite 和 Pi 使用本地 HTTP 夹具验收发送、取消、恢复与草稿。 |
| P3 项目关联 | Main 专用 typed IPC 按稳定 ID 关联、更换、解除、验证及重选目录。SQLite 将关联与标签页保存分开。目录状态按 owner 和根目录身份核对，索引单独显示状态、覆盖及跳过原因。项目切换给模型上下文建立时间边界，历史原文仍可在 UI 查看。项目激活与窗口独立资料授权分别管理。 | SQLite 事务与迁移测试、本机真实 Electron/Pi 项目路径读取和文件审批、项目切换及历史保持测试。根目录同路径替换需重新选择。 |
| P4 文件读取和索引 | 普通文本使用复用的有界读缓冲、行/字节定位和签名游标。单次返回约 50 KB。支持 UTF-8/UTF-16、超长行分页、末尾读取、字面搜索及有界正则。PDF 使用文件范围和页文本流，DOCX 流式解析选定 XML。大型附件走本地引用。Tree-sitter 小文件索引正文、符号和引用，中型文件保留符号和引用。SQLite 分批暂存，在事务中发布增量结果，未变化文件复用原索引。 | 25/100 MiB 合成文本、编码和游标失效、符号链接和脱敏、超过 2 MiB/30 页的 PDF、超过 5 MiB 的 DOCX、ZIP 压缩比、逐文件索引原因和取消保留旧索引。 |

## 安全边界

- Agent 永久没有 PTY、iTerm、SSH 的输入、粘贴、执行和中断能力。结构化终端事件是观察证据，命令建议供用户在 iTerm 人工执行。
- 终端观察继续绑定 owner、Conversation、Tab、iTerm UUID、PTY 代次及授权。现有快照保留未知状态。测试仅向测试自有的本机 iTerm 会话发出合成输入，SSH 回归使用隔离的 `127.0.0.1` 临时服务。
- 文件修改沿用完整 Diff 和 Main 原生审批。验收检查了拒绝时原始字节保持、同意时只写入批准内容。未调用付费模型，未连接或修改远端主机。
- 文本游标绑定已授权路径与设备号、inode、大小、mtime 和 ctime。它的摘要用于识别文件版本。文件内容按需读取，每页仍在返回前复核文件身份及授权。

## 已知限制与未覆盖范围

- 现有 iTerm 的 Python PromptMonitor 路径完成了文档和本机能力探测。本机 iTerm 3.7.6 没有可用的 Python 客户端配置来验证 UUID 映射和订阅，已有会话继续走快照及人工确认。[iTerm2 Prompt API](https://iterm2.com/python-api/prompt.html)
- OSC 133/633 是 Shell 集成证据。OSC 633 `E` 中的命令文本和 nonce 缺少本产品可验证的信任链，解析器忽略该字段。无法证明最终边界的粘贴批次仍需人工确认。单个 compound command 只有 Shell 提供的整体退出码。[VS Code Shell Integration](https://code.visualstudio.com/docs/terminal/shell-integration)
- 文本正则支持字符类、锚点和转义，禁用分组、量词、回溯引用等高耗时语法。DOCX 支持段落分页、字面搜索和基本标题/表格结构。PDF 支持按页提取和字面搜索。扫描页显示当前范围无文本层，OCR 未纳入本轮。
- 文本游标可直接续读字节位置。DOCX 的压缩 XML 段落游标继续从流的开头扫描，以恢复段落和脱敏状态。PDF 每次打开文档并按页和片段位置定位。图片及粘贴上传保持原有大小预算，大文档通过文件选择器作为本地引用。
- 超出索引预算的路径保留跳过原因，可通过已授权的 `read` 按需读取。代码索引的全文查询覆盖保留正文的小型文件。中型文件通过符号和引用查询。未引入 ripgrep、Aider、Python helper 或新运行时依赖。
- 验收在源码构建和隔离数据上进行，签名、公证、安装包和日常数据库迁移未纳入本轮验收。

## P5 实测结果

| 实际执行命令 | 结果 |
| --- | --- |
| `npm run ci` | 通过。ESLint 0 错误，安全边界 365 项通过，Node 与 Web TypeScript 检查、Main/Preload/Renderer 构建均通过。仓库和本地夹具仍有格式警告。 |
| `npm run test:local -- --maxWorkers=4` | 93 个套件通过、10 个跳过，546 个用例通过、15 个跳过，0 失败。默认跳过需要单独启用的本机验收及性能用例。 |
| `CRESCENT_LOCAL_TESTS=1 npx vitest run src/main/terminal/observer/{terminal-observer,evidence-notifications}.test.ts` | 38 通过，覆盖分段 OSC、重复/跨协议标记、多行粘贴、人工确认、敏感抑制及通知去重。 |
| `CRESCENT_LOCAL_TESTS=1 npx vitest run src/main/agent/multimodal.test.ts src/main/local-document-reader.test.ts` | 21 通过，覆盖分页返回预算、PDF/DOCX 和文档附件。 |
| `CRESCENT_LOCAL_TESTS=1 npx vitest run src/renderer/src/hooks/useAgentController.test.ts` | 2 通过，覆盖三条排队消息、草稿保留及显式重试。 |
| `CRESCENT_LOCAL_TESTS=1 MOXUN_NEW7_PERF=1 MOXUN_NEW7_PERF_OUTPUT=/tmp/moxun-new7-perf-gated.json npx vitest run src/main/local-document-performance.test.ts` | 1 通过，实测见下表。 |
| `git diff --check` | 通过。 |

### 本机桌面验收

组合命令在真实 Electron 和 iTerm 上执行。模型请求发往隔离的本机 HTTP 夹具，SSH 使用独立的 `127.0.0.1` 服务。项目目录选择和主动观察确认按夹具配置模拟。

```sh
CRESCENT_LOCAL_TESTS=1 MOXUN_ELECTRON_LIVE=1 MOXUN_CONNECTION_CARDS_LIVE=1 \
MOXUN_ITERM_LIVE=1 MOXUN_PROACTIVE_LIVE=1 npx vitest run \
  src/main/projects.browser.test.ts \
  src/main/terminal/external/{electron-iterm,live-iterm,electron-proactive}.test.ts

CRESCENT_LOCAL_TESTS=1 MOXUN_PROACTIVE_LIVE=1 npx vitest run \
  src/main/terminal/external/electron-proactive.test.ts
```

| 桌面套件 | 实际结果 |
| --- | --- |
| `projects.browser.test.ts` | 通过。14 条真实 BrowserWindow/preload/Main/Pi 断言，包括运行中连续发送三条、保留新草稿、两种停止操作、SQLite 待继续、附件失效、项目更换与解除、审批和大文件搜索期间 Renderer 计时器继续运行。 |
| `live-iterm.test.ts` | 通过。使用测试自有 UUID，验证共享 PTY、合成 OSC 的 0 / 7 / 缺失退出码、快照绑定和解绑。 |
| `electron-iterm.test.ts` | 通过。真实 BrowserWindow 的本机共享、已有会话和临时回环 SSH 连接卡片入口，覆盖默认不参与和新授权选择。 |
| `electron-proactive.test.ts` | 组合执行时夹具脚本的转义错误阻止启动。修正测试脚本后按上方第二条命令复跑，1/1 通过（78.49 秒）。验证真实 Electron、Pi、本机 iTerm、配对 OSC 缺失退出码、输出间歇不触发、观察撤销及主动建议行为。 |

### 性能与资源

同一台 Intel macOS 开发机，Node/Vitest 隔离进程。文本取各 7 次，以 UTF-8 合成日志末尾唯一匹配测量全文搜索。局部范围返回 120 行，按实际序列化 UTF-8 字节计。毫秒数为 P50 / P95。

| 合成文本 | 局部范围 | 尾读 | 全文检索 | 局部返回峰值 |
| --- | ---: | ---: | ---: | ---: |
| 27,261,254 B | 3.17 / 9.04 ms | 2.34 / 3.51 ms | 376.34 / 407.35 ms | 15,226 B |
| 105,899,429 B | 3.06 / 3.22 ms | 1.91 / 2.12 ms | 1,446.99 / 1,511.35 ms | 15,229 B |

- 文本阶段进程 RSS 峰值 89 MiB。完整夹具的事件循环延迟 P95 为 10.86 ms，最大值 17.38 ms。
- 150 个合成 TypeScript 文件首轮索引 1,552 ms。增量索引 53 ms，复用 150 个文件，重新解析 0 个。索引内检索 25 次 P50 0.88 ms，P95 1.48 ms。
- 索引阶段进程采样 RSS 峰值 1,323 MiB。采样同时计入 Node、Tree-sitter 和 SQLite 的原生内存。本轮实现了分批暂存、文件解析时间/大小预算及内存压力下停止新解析的策略，仍观察到短时 RSS 高峰。当前数据不足以确认 2,000 文件索引的内存表现。
- 本次大文本检索使用 Node 流式实现，局部读取及全文扫描达到上述实测结果。依赖列表维持原状。

## 修改文件清单

清单列出本轮有编辑的源码及本地测试。工作树已有早期任务修改，部分文件同时包含这些原有改动。本轮未创建 Git commit。

### Main、SQLite 与观察

```text
src/main/agent/context-assembly.ts
src/main/agent/guided-ops.ts
src/main/agent/ipc.ts
src/main/agent/multimodal.ts
src/main/agent/pi-host.ts
src/main/agent/pi-knowledge.ts
src/main/agent/pi-local-files.ts
src/main/agent/pi-terminal-bash.ts
src/main/agent/turn-queue-ipc.ts
src/main/agent/turn-queue.ts
src/main/code-intelligence/parser.ts
src/main/code-intelligence/service.ts
src/main/crescent-sqlite.ts
src/main/document-cursor.ts
src/main/index.ts
src/main/knowledge-ipc.ts
src/main/local-document-errors.ts
src/main/local-document-ipc.ts
src/main/local-document-reader.ts
src/main/local-docx-reader.ts
src/main/local-pdf-reader.ts
src/main/local-text-reader.ts
src/main/projects.ts
src/main/sqlite/conversations.ts
src/main/sqlite/history-search.ts
src/main/sqlite/project-association.ts
src/main/terminal/ipc.ts
src/main/terminal/observer/command-observation.ts
src/main/terminal/observer/evidence-notifications.ts
src/main/terminal/observer/observation-grants.ts
src/main/terminal/observer/registry.ts
src/main/terminal/observer/terminal-observer.ts
```

### Preload、Renderer 和 Shared

```text
src/preload/modules/agent.ts
src/preload/modules/documents.ts
src/preload/modules/knowledge.ts
src/preload/modules/projects.ts
src/renderer/src/App.tsx
src/renderer/src/components/AgentTurnQueuePanel.tsx
src/renderer/src/components/AppSidebar.tsx
src/renderer/src/components/ChatWorkspace.tsx
src/renderer/src/components/CodeIntelligenceSettings.tsx
src/renderer/src/components/ComposerAttachments.tsx
src/renderer/src/components/GuidedOpsPanel.tsx
src/renderer/src/components/LocalDocumentsSheet.tsx
src/renderer/src/components/ProjectSidebar.tsx
src/renderer/src/hooks/useAgentController.ts
src/renderer/src/lib/agent-message-refs.ts
src/shared/agent-turn-queue.ts
src/shared/agent-types.ts
src/shared/knowledge.ts
src/shared/local-documents.ts
src/shared/projects.ts
src/shared/terminal-observation-types.ts
```

### 文档

```text
Document/EXTERNAL_TERMINALS.md
Document/new7/MOXUN_NEW7_IMPLEMENTATION_REPORT_20261107.md
Document/new7/MOXUN_NEW7_P0_AUDIT_20261107.md
```

### 本地测试（gitignored）

```text
src/main/agent/multimodal.test.ts
src/main/agent/turn-queue.test.ts
src/main/code-intelligence/service.test.ts
src/main/local-document-performance.test.ts
src/main/local-document-reader.test.ts
src/main/projects.browser.test.ts
src/main/projects.test.ts
src/main/sqlite/conversations.test.ts
src/main/sqlite/project-association.test.ts
src/main/terminal/external/electron-iterm.test.ts
src/main/terminal/external/electron-proactive.test.ts
src/main/terminal/external/ipc-external.test.ts
src/main/terminal/external/live-iterm.test.ts
src/main/terminal/lifecycle-integration.test.ts
src/main/terminal/observer/evidence-notifications.test.ts
src/main/terminal/observer/terminal-observer.test.ts
src/renderer/src/components/terminal-actions.browser.test.ts
src/renderer/src/hooks/useAgentController.test.ts
```
