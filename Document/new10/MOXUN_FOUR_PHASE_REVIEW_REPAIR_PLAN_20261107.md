# 墨巡四阶段改造复审与后续修复计划

- 日期：2026-11-07
- 项目：/Users/xusong.yu/Desktop/moxun-test
- 计划目录：Document/new10
- 上一轮基线：Document/new9
- 文档性质：Codex 后续实施计划与验收规范
- 总目标：保留已经完成的双窗口终端基础设施，补齐 Agent SSH 协作、命令生命周期恢复、长会话性能、文档/索引资源治理、测试工程化、安全依赖和 macOS Universal 交付。

---

## 0. 执行摘要

本计划不是推倒重构，也不是重新执行 new9 的四阶段工作。new9 已经完成了大量有价值的基础设施；本轮应依据独立复审结果，把尚未闭环的能力补齐，并将原型级实现提升到可长期使用的工程质量。

**最高优先级是让 Agent 能在用户当前可见、可控制的 SSH 终端会话中安全协作，并且准确知道命令究竟开始了、结束了、退出码是多少，还是结果未知。**

其次解决人工接管与重新授权、聊天长会话渲染、索引与 DOCX 解析内存、测试纳入版本管理、生产依赖安全和 macOS x64/arm64 Universal 打包验收。

### 0.1 本轮独立复审确认的现状

- 当前分支为 test；复审时与 origin/test 的提交位置一致。
- 复审时工作区约有 155 个已修改或新增路径，存在大量未提交工作。必须视为用户资产。
- git diff --check 通过。
- npm test：576 项静态安全边界检查通过，4 项命令协议测试通过。
- npm run typecheck：Main 和 Renderer 类型检查通过。
- 本地 Vitest 回归：556 passed、19 skipped、0 failed；95 个测试文件通过、14 个文件跳过。
- 四项真实 Electron 测试通过：终端窗口/PTY 生命周期、Agent 与 Pi 回环模型协作、索引 Utility Process、PDF 分页预览。
- 真实 Agent 测试覆盖本机受限 Bash，不等于已完成 SSH 运维能力。
- 阶段报告记录阶段二仍有性能缺口，阶段三只交付受限本机命令，阶段四没有完成正式安装包验收。

以上是 2026-11-07 本轮复审时的工作区快照。Codex 开始执行前必须重新采集，不得假定数字和文件状态没有变化。

### 0.2 当前阶段结论

| 领域 | 当前判断 | 后续目标 |
| --- | --- | --- |
| 独立聊天/终端窗口 | 基础通过 | 保留并补齐会话迁移与长时稳定性 |
| Main 管理 PTY | 基础通过 | 保持 Main 唯一权威 |
| xterm.js 与输出缓冲 | 基础通过 | 验证交互协议、持续高负载和人工接管 |
| Agent 本机执行 | 受限原型通过 | 扩展为经审批的 SSH 当前会话协作 |
| 命令状态与结果恢复 | 部分通过 | 增加 wait/query/reconcile 和持久化执行记录 |
| 人工接管 | 有撤权机制 | 支持可验证恢复后的显式重新授权 |
| 长聊天性能 | 未达标 | 真正虚拟列表和 1,000/5,000 条消息验收 |
| 索引资源 | Main 隔离有收益 | 控制 Main + Utility 总 RSS |
| DOCX 解析 | 已有分页/限额 | 移出 Main，降低重复解压和解析 |
| 测试工程化 | 部分通过 | 测试文件可跟踪，CI 分层执行 |
| 依赖安全 | 未通过发布门槛 | 核实并修复 Critical/High 公告 |
| macOS 发布 | Intel 本地检查 | x64 + arm64 Universal 安装验收 |

### 0.3 工作包与优先级

1. WP0：复核基线、保护工作区、建立可复现测试环境。
2. WP1：Agent SSH 协作与命令执行状态恢复（P0）。
3. WP2：人工接管、输入来源分类、会话重新授权与审计（P0）。
4. WP3：聊天消息虚拟列表与长会话性能（P1）。
5. WP4：代码索引总内存治理、DOCX Utility Process 与文档读取优化（P1）。
6. WP5：测试文件跟踪、CI 分层和依赖安全修复（P1；安全修复是发布阻断项）。
7. WP6：macOS x64/arm64 Universal 构建、安装、升级和长时验收（P2，发布前必须完成）。

Codex 应按顺序实施；WP1/2 未通过前，不得把 Agent SSH 功能标记为完成。安全 Critical/High 未处理前，不得标记为可发布。

---

## 1. 项目范围与不可变约束

### 1.1 必须保留的架构决策

- Chat Window 与 Terminal Window 保持两个独立 Electron BrowserWindow。
- Terminal Window 使用 xterm.js；真实 Shell/PTY 由 Main 中的 node-pty 管理。
- 用户和 Agent 操作同一个 PTY、同一个 Shell、同一个 SSH 交互会话。
- Main 是 PTY、会话、命令状态、审批、权限和审计的唯一权威。
- 终端窗口关闭是 detach，不等于结束 PTY；明确的结束会话操作才回收 PTY。
- Agent 命令必须显示在用户可见终端中，不允许后台另开不可见 Shell 执行。
- Agent 只能走 Command Executor；不得直接调用原始 terminal write IPC。
- 超时不等于失败；结果未知时不得盲目重试。
- 不能可靠判断命令状态的 Shell/SSH/交互式程序必须降级为人工模式，不得伪造成功。
- 索引、文档解析、消息渲染和终端输出不得阻塞聊天输入及终端交互。

### 1.2 明确禁止

- 不推倒现有双窗口、PTY、xterm、Session Manager、输出缓冲、Agent 审批和 Utility Process 架构。
- 不为实现 SSH Agent 执行而启动第二个后台 Shell 或第二条不可见 SSH 命令通道。
- 不修改远端主机的 .bashrc、.zshrc、profile、系统服务或其他持久配置。
- 不要求远端安装常驻 Agent、守护进程或获得 root 权限。
- 不绕过用户审批，不因“提高自动执行成功率”而扩大默认权限。
- 不把 Shell Integration 的 OSC 标记本身当作安全认证凭据。
- 不把普通 PTY 文本、无输出超时或 prompt 猜测当作命令完成证据。
- 不在结果未知时自动重发、重新执行或生成新的 commandId 代替原命令。
- 不清理、覆盖、格式化、回滚用户已有改动。
- 不执行 git reset、git clean、强制 checkout、批量 restore 等破坏性操作。
- 不擅自提交 Git。
- 不升级 Electron 主版本或大批量依赖，除非安全公告和兼容性验证证明必须如此。
- 不设置安装包体积或 Renderer bundle 体积硬门槛；优先保证功能和运行体验。

### 1.3 工作区保护规则

每次开始和结束工作包都必须记录：

- git status --short --branch
- git diff --stat
- git diff --check
- git diff --cached --stat
- 当前工作包新增、修改、删除的文件列表

任何与原有未提交修改重叠的文件，先查看 diff，再做最小增量修改。若无法确认某段代码属于本轮还是用户原有改动，停止覆盖并报告。不得用整文件重写处理局部问题。

本轮只允许在项目源码、测试、构建配置和文档中进行计划范围内的增量改造；不得修改远端服务器。

---

## 2. 复审证据与待复核文件

### 2.1 关键实现位置

Codex 必须重新打开并核对这些文件，行号可能随改动变化：

| 文件 | 复审观察 | 本轮要求 |
| --- | --- | --- |
| src/main/terminal/managed/command-executor.ts | 已有 command envelope、审批和状态机；软超时约 5 秒，开始等待约 3 秒 | 完成状态查询、等待、恢复和 SSH 适配 |
| src/main/terminal/managed/session-manager.ts | Main 管理 Session、Attachment、输出和写入 | 加入可验证的命令仲裁与人工接管恢复 |
| src/main/terminal/managed/window.ts | 审批绑定聊天窗口和当前终端身份 | 明确 SSH host/cwd/sessionGeneration 快照 |
| src/main/agent/pi-managed-terminal-tool.ts | 当前命令白名单限制在 pwd/true/false/uname/受限 echo 等 | 通过风险分级和逐条审批扩展，不可直接放开任意命令 |
| src/main/agent/pi-host.ts | 仅符合条件的对话暴露 managed terminal tool | 继续保留能力策略、对话绑定和主动任务隔离 |
| src/renderer/src/terminal/main.ts | xterm onData 统一写回 PTY | 区分真实用户输入与终端协议响应 |
| src/main/terminal/managed/output-buffer.ts | 已有有界输出缓存与背压 | 支持 commandId 关联、有界分页和丢失检测 |
| src/renderer/src/components/AgentLogList.tsx | 全量遍历消息，CSS content-visibility 辅助 | 实现真正虚拟列表 |
| src/main/code-intelligence/service.ts | 索引解析移入 Utility Process，但预算主要看 Main RSS | 纳入总进程 RSS 预算 |
| src/main/code-intelligence/utility-parser.ts | 独立解析进程 | 加强内存、取消、超时和崩溃恢复 |
| src/main/local-docx-reader.ts | DOCX 分页解析仍在 Main 路径 | 将重解析移至 Utility Process |
| .gitignore | 测试文件通配忽略规则可能排除新增测试 | 建立可跟踪测试目录/白名单 |
| package.json / package-lock.json | 本地测试、CI、打包脚本 | 分层测试和安全依赖修复 |
| scripts/build-macos-local.cjs | 本地打包入口 | Universal 架构构建和 smoke test |
| scripts/smoke-macos-app.cjs | 检查 ASAR、Renderer、Preload、Intel 原生二进制 | 增加双架构检查 |

### 2.2 当前测试与性能证据

本轮复测：

- npm test：576 项静态安全检查、4 项命令协议测试通过。
- npm run typecheck：Main、Renderer 类型检查通过。
- npm run test:local：556 通过、19 跳过、0 失败。
- 四项 Electron Live 夹具通过：终端生命周期、Agent/Pi 回环模型、Utility Process、PDF 预览。
- git diff --check 通过。

注意：这些结果不等于所有场景均通过。19 项跳过仍需分类；四项 Live 测试使用本机 Bash、回环模型和隔离夹具，未证明真实 SSH 目标兼容。

性能样本：

| 场景 | 已有样本 | 主要问题 |
| --- | --- | --- |
| 1,000 条混合聊天消息 | 首次显示约 153ms；展开约 2.6s；滚动最大帧间隔约 128.7ms，另一次样本约 148ms | 尚非真正虚拟列表 |
| 16 MiB PTY 输出 | 约 2.56s；Main 事件循环 P95 约 6.05ms，最大约 7.61ms | 缺少长时间持续输出和多窗口并发压力 |
| 索引进程 | Main RSS 下降约 44.2% | Main + Utility 峰值约 302.5 MiB，比旧样本 254.3 MiB 高约 19% |
| 索引耗时 | 全量约 665ms → 1,017ms；增量约 97ms → 106ms | 总内存与速度仍需优化 |
| DOCX | 有分页/限额 | 重解析仍可能在 Main，翻页可能重复解压 |
| 生产依赖审计 | npm audit --omit=dev 曾报告 2 Critical、6 High | 需要重新拉取当前公告并逐项核实 |

性能数字必须在相同设备、相同 fixture、相同构建模式下重新采样；不得把不同运行模式的数据直接比较。

---

## 3. 目标架构与关键设计约束

### 3.1 会话与身份模型

继续由 Main 管理稳定 Session，不把 WebContents ID 作为 PTY 唯一身份。

每个终端 Session 至少包含：

- terminalSessionId：随机且稳定的会话 ID。
- sessionGeneration：Shell/PTY 重建时递增。
- shellType、shellVersion、platform。
- cwd、host、sshTarget、connectionIdentity。
- createdAt、lastActivityAt。
- ptyState、shellState、windowAttached。
- conversationId：可选关联，不作为 PTY 主身份。
- executionOwner、manualTakeoverState。
- activeCommandId、commandQueueState。
- shellIntegrationState、observationConfidence。

所有 IPC 和 Agent 命令均重新校验 Session ID、generation、调用窗口、对话绑定和可见性。旧 generation 的事件不得写入新 Session。

### 3.2 Shell Adapter 分层

建立明确的 Shell Adapter，而不是把 Bash/Zsh 特判散落在 Agent Tool 内。

首批适配目标：

1. macOS 本地 zsh。
2. macOS/Linux Bash。
3. Linux POSIX sh：只支持经过验证的有限子集。
4. SSH 内的远端 Bash/Zsh：需要独立能力探测和回环 SSH 验收。

Adapter 至少提供等价能力：

- detectShell()
- detectRemoteContext()
- installEphemeralIntegration()
- getPromptState()
- executeReviewedCommand()
- waitForCommand()
- interruptCommand()
- reconcileSession()
- removeEphemeralIntegration()

接口命名可调整，但职责要完整。临时集成只作用于当前 Shell 会话，不写远端持久配置。

不能确认远端 Shell 类型、当前主机、cwd 或命令边界时，降级为 manual-only。

### 3.3 Shell Integration 与安全信任边界

可参考 VS Code Shell Integration 的 OSC 133/633 语义识别 Prompt、Command Start、Command Finish、退出码和 CWD。

但必须明确：

- OSC 标记来自 PTY 数据流；命令输出本身也可能包含相似控制序列。
- nonce 解决的是关联和误匹配问题，不自动构成对恶意输出的密码学认证。
- Shell Integration 是命令状态证据，不是授权凭据。
- 授权只能来自 Main 侧审批服务和一次性审批令牌。
- Agent 不得通过伪造 OSC、命令文本或 Renderer IPC 获得执行权限。
- 解析器应校验 commandId、nonce、terminalSessionId、generation、状态顺序和时间窗口。
- 需要在命令输出中故意打印相同/近似 OSC 序列的负向测试。
- 如果当前 Shell/SSH 结构无法排除标记伪造或可靠性不足，降低结果置信度并转人工模式；不得声称获得了可信退出码。

不要为了“解决伪造”而声称 PTY 内 nonce 可抵御同一 Shell 权限下的恶意命令。文档必须清楚区分同步可靠性与安全认证。

### 3.4 命令状态机

状态至少覆盖：

- queued
- approval-pending
- approved
- dispatched
- running
- awaiting-input
- completed-success
- completed-failure
- interrupted
- timed-out-running
- unknown
- shell-exited

转换规则：

- 只有匹配的开始证据才进入 running。
- 只有匹配的结束证据、有效退出码和可接受的 Shell 状态才进入 completed。
- 退出码 0 才是 completed-success；非 0 是 completed-failure。
- 无开始证据的 Dispatched 超时，进入 unknown，不假定命令没执行。
- Running 超过软超时进入 timed-out-running；命令仍可能运行。
- 软超时不杀进程、不重发、不释放执行锁。
- SSH 断连、PTY 崩溃、Shell 退出、generation 变化、标记缺失均需保留 unknown/不可确认状态。
- 人工中断后必须重新确认 Shell prompt、SSH host、cwd 和 generation。
- 同一 PTY 同一时刻最多一条 Agent 命令；人工输入和 Agent 输入由 Main 仲裁。
- Agent 不得在上一条命令仍 running、awaiting-input 或 unknown 时发送下一条命令。

### 3.5 命令身份、审批与持久化记录

每条命令具有：

- commandId、nonce。
- terminalSessionId、sessionGeneration。
- conversationId。
- commandHash。
- approvalId、approvedAt、expiresAt。
- host、cwd、shellType、SSH identity snapshot。
- command risk level。
- startedAt、finishedAt、duration。
- resultState、exitCode、output reference。
- cancellation/timeout/reconciliation history。

审批令牌绑定完整上下文：命令哈希、主机、目录、Session、generation、对话、风险等级和有效期。任何一项变化都使旧审批失效。

审计记录应持久化到现有数据层或专用表，记录请求、审批、拒绝、开始、完成、退出码、超时、接管、重新授权和未知结果。敏感输出必须脱敏；不要保存密码、Token、私钥、Cookie 或原始凭据。

若新增数据库表或迁移，必须是向前兼容、可恢复的增量迁移，并验证旧数据库升级和失败恢复。

---

## 4. WP0：基线复核与工作区保护

**优先级：P0；其他工作包的前置门槛。**

### 目标

建立当前真实工作区基线，避免把旧报告、旧行号或旧测试结果当成现状；保证 Codex 不覆盖用户现有修改。

### 实施

1. 采集分支、HEAD、origin 状态、工作区、暂存区、未跟踪文件。
2. 对照 new9 主计划和四份阶段报告，核实每项已完成能力是否仍存在。
3. 重新执行 npm test、typecheck、npm run ci、test:local；耗时较长的命令采用可轮询方式，不因等待超时重复启动。
4. 统计跳过测试的原因，区分环境跳过、凭据弹窗跳过、已知失败和未覆盖。
5. 运行四项 Electron Live 夹具，记录实际构建、fixture、环境变量和结果。
6. 重新采集聊天、PTY、索引、DOCX 的基线数据。
7. 保存基线报告到 new10，不覆盖 new9。

### 验收

- 有完整的工作区快照和基线测试报告。
- 所有既有未提交变更保持不变。
- 每个失败/跳过用例都有明确原因和后续处理。
- 未复核的功能不得标记为已验收。

---

## 5. WP1：Agent SSH 协作与命令生命周期恢复

**优先级：P0；本轮核心工作包。**

### 5.1 目标

让 Agent 在用户当前可见的 SSH 终端会话中协助运维。用户与 Agent 共用同一个 PTY、同一个远端 Shell、同一套环境变量和当前目录。

Agent 可以提出命令，经用户审批后在该会话执行；用户可以随时接管。Agent 必须能观察执行状态、等待长命令、取回最终退出码和输出摘要。

### 5.2 先完成 SSH 能力探测

探测并展示：

- 本地 Shell 类型和版本。
- 是否处于 SSH 会话。
- 远端 host、user、连接身份的非敏感标识。
- 远端 Shell 类型和版本。
- 当前远端 cwd。
- 是否存在可用 Shell Integration。
- 是否支持可靠命令 Envelope。
- 是否处于交互式程序、密码输入或 TUI 状态。

探测失败时明确显示“Agent 仅观察/人工操作”，不能把本地 Shell 结果冒充远端结果。

不得读取或展示私钥内容、密码、Agent socket 凭据或敏感环境变量。

### 5.3 当前 SSH Shell 内临时集成

优先在当前已建立的交互式 SSH Shell 内建立临时 Shell Adapter：

- 不另开第二个 SSH 命令通道。
- 不修改远端 profile 或其他持久配置。
- 不要求远端安装程序或 root 权限。
- 临时函数、prompt hook、控制状态只存在当前 Shell 会话。
- 退出 SSH/结束会话后临时集成自然消失。
- 处理 Bash/Zsh 不同 prompt hook、trap、set -e、子 Shell、管道和退出码传播。
- 不支持的 shell option、命令结构或交互模式应拒绝 Agent 执行并说明原因。

若无法在不改变远端环境的前提下建立可靠状态检测，保留人工终端，不强行自动化。

### 5.4 命令执行入口

扩展现有 request_terminal_command，但不直接放开所有命令。

执行流程：

1. Agent 生成候选命令和简短目的说明。
2. Main 读取当前 Session 快照：host、cwd、shell、generation、对话。
3. 风险分类：只读查询、状态变更、破坏性操作、凭据/权限操作。
4. 将完整命令、目标、目录、风险和影响展示给用户。
5. 用户批准当前命令一次；审批绑定 commandHash 和完整 Session 快照。
6. Main 重新验证审批、会话、generation、host、cwd 和窗口状态。
7. Command Executor 通过当前 Shell Adapter 写入同一 PTY。
8. 输出实时显示在用户终端；Agent 获取有界状态和输出。
9. 收到最终证据后返回退出码和结果摘要。
10. 记录审计事件。

不得默认自动批准。危险命令、删除/覆盖、权限变更、数据库写入、服务重启等必须显示更高风险说明；必要时二次确认。对不可逆或无法判断影响的操作可保持人工执行。

### 5.5 新增状态恢复接口

必须提供等价能力（名称可调整）：

- wait_command(commandId, waitPolicy)：继续等待原命令，不创建新命令。
- get_command_result(commandId)：获取当前/最终状态、退出码和输出引用。
- get_command_output(commandId, cursor, limit)：分页取回有界输出。
- cancel_queued_command(commandId)：取消尚未派发的命令。
- interrupt_command(commandId)：向当前 PTY 发起明确中断，并等待 Shell 状态确认。
- reconcile_command(commandId)：根据现有证据核对执行状态；不能确认时返回 unknown。
- list_active_commands(sessionId)：列出当前会话运行、等待和未知的命令。

同一个 commandId 的 wait/query 可以重复调用；执行本身不能重复派发。幂等性由 Main 持久状态保证。

### 5.6 超时策略

- 软超时与硬超时分离。
- 软超时只通知 Agent 和用户“仍在运行/等待结果”，不能判失败。
- 允许 Agent 在软超时后调用 wait_command。
- 硬超时只能由用户或明确的执行策略触发。
- 中断后等待可信 prompt；无法恢复则标记 unknown 或 shell-exited。
- 禁止因 Agent 请求超时、IPC 超时或模型响应超时而自动重新执行命令。
- 任何重试都必须先查询原 commandId，并由用户明确批准新的执行请求。

### 5.7 输出管理

- xterm 实时渲染不等待 Agent 分析。
- Main 按 commandId 关联有界输出缓冲。
- 返回摘要、尾部、错误片段和分页 cursor。
- 输出截断必须明确标记，不能静默丢弃。
- 对超大输出采用分页，不把完整输出无限塞进模型上下文。
- ANSI/OSC 控制序列与业务文本分开处理。
- 敏感字段脱敏；不得保存凭据。

### 5.8 WP1 测试矩阵

| 场景 | 预期 |
| --- | --- |
| 本机 Bash/Zsh pwd、uname、df | 目标与 cwd 正确，退出码准确 |
| SSH 远端 Bash/Zsh pwd、hostname、df | 确认是远端结果，不是本地结果 |
| 远端命令退出码 0/1/127 | 准确区分成功和失败 |
| sleep 30 / 长时间只读命令 | 软超时后仍可 wait，最终拿到原 commandId 结果 |
| 命令无输出但持续运行 | 不按无输出判完成 |
| 管道、子 Shell、here-document、中文、Emoji | 不丢输出、不误判结束 |
| 命令输出伪造 OSC 133/nonce | 不得伪造授权或错误完成 |
| SSH 网络断开/远端 Shell 退出 | unknown 或 shell-exited，不自动重发 |
| SSH 密码/二次验证 | Agent 不读取或自动填充密码；转人工输入 |
| 交互式 TUI、sudo、确认提示 | awaiting-input 或 manual-only |
| 终端窗口关闭再打开 | 原 PTY/SSH 状态保持；无重复会话 |
| Chat 窗口刷新/崩溃 | 不错误释放正在运行的 PTY |
| 应用退出/崩溃 | 记录可恢复的未知状态，不自动重放 |
| 过期审批、host/cwd/generation 变化 | 审批失效 |
| 同一 commandId 重复 wait/query | 结果一致，命令只执行一次 |

SSH 自动化先使用本机回环 SSH fixture、临时密钥和临时配置；通过后再由用户选择真实测试主机验证。不得对生产主机做未经批准的探测或写入。

### WP1 验收门槛

- Bash 与 Zsh 本地执行通过。
- 至少一种远端 Bash 和一种远端 Zsh 的回环 SSH 测试通过；无法支持的组合有明确降级。
- 所有状态转换和退出码测试通过。
- 结果未知时无自动重发。
- Agent 命令与人工终端操作共用同一 PTY。
- 任意失败、断连和超时均不会造成错误成功提示。
- Shell Integration 证据不越权替代 Main 审批。
- 端到端 Live Electron + Pi 测试通过。

---

## 6. WP2：人工接管、输入来源分类和重新授权

**优先级：P0；与 WP1 联合验收。**

### 6.1 当前问题

当前 xterm onData 路径将输入统一写入 PTY，而 Session Manager 对非空输入撤销 Agent authority。需要确认 xterm 产生的数据中哪些是用户输入、哪些是终端模拟器协议响应。

人工接管不能被终端自动回复、光标查询、设备属性查询、协议协商或 Shell Integration 自身输出误触发。

### 6.2 输入来源分类

区分：

- 用户键盘输入。
- 用户粘贴。
- 用户快捷键（Ctrl+C、Ctrl+D 等）。
- IME 输入和组合输入。
- xterm 对终端查询的自动响应。
- 终端协议响应/OSC/DCS 相关数据。
- Agent 命令输入。
- Main 内部控制消息。

不要仅凭字符串内容猜测输入来源。应结合 xterm API、键盘/粘贴事件和 Main 写入仲裁设计。任何 Renderer 声称的来源仍需 Main 校验。

### 6.3 接管状态机

建议状态：

- agent-ready
- approval-pending
- agent-running
- manual-takeover
- awaiting-shell-recovery
- reauthorization-pending
- manual-only

规则：

1. 用户真实输入、粘贴、Ctrl+C 或点击“接管”时，Agent 停止派发新命令。
2. 若命令正在运行，先保留 commandId 和状态，不把人工输入伪装成命令完成。
3. 等待 Shell 恢复到可验证 prompt。
4. 重新读取 host、cwd、Shell、generation 和 SSH 状态。
5. 由用户点击明确的“恢复 AI 协作/重新授权”操作。
6. 重新授权只恢复候选命令和逐条审批能力，不沿用旧审批令牌。
7. 无法确认 Shell 状态时保持 manual-only。

### 6.4 UI 要求

- 明确显示 Agent 当前是否有执行权限。
- 显示“人工接管中”“等待 Shell 恢复”“可重新授权”等状态。
- 提供单独的“恢复 AI 协作”按钮。
- 重新授权前展示当前 host、cwd、Session 和风险说明。
- 不因关闭/打开终端窗口自动重新授权。
- 不因换对话自动继承上一对话的 Agent 权限。
- 用户随时可以永久关闭本轮协作。

### 6.5 验收

- 键盘、粘贴、IME、快捷键、协议自动回复均有独立测试。
- 只有真实人工操作触发接管。
- 接管后 Agent 无法继续发送命令。
- Shell 恢复后可通过明确操作重新授权，不必强制结束整个 PTY。
- 重新授权生成新审批上下文，旧 commandId/approvalId 不复用。
- SSH host 或 cwd 发生变化后，必须刷新上下文再允许新命令。

---

## 7. WP3：聊天消息虚拟列表与长会话性能

**优先级：P1。**

### 7.1 当前问题

AgentLogList 目前仍会遍历全部已加载消息；CSS content-visibility 不是虚拟列表。当前 1,000 条消息展开约 2.6 秒，滚动最大帧间隔样本超过 128ms。

### 7.2 实施目标

采用成熟、维护活跃且与当前 React/Electron 版本兼容的虚拟列表方案。优先评估现有依赖能否复用；引入依赖前检查许可证、体积、React 兼容性和动态高度支持。

必须支持：

- 动态高度消息。
- 流式输出和思考状态更新。
- Markdown、代码块、表格、图片、工具调用卡片。
- 折叠/展开长内容。
- 用户滚动位置锚定。
- 新消息到达时是否自动滚底的既有语义。
- 历史分页加载。
- 搜索定位和跳转。
- 消息编辑/重试/复制。
- 正在流式输出的消息不能因虚拟卸载丢失状态。
- 不重复挂载重型组件，不重复执行副作用。

优先采用稳定消息 ID，不以数组 index 作为 key。

### 7.3 性能验收

固定同一台设备、相同构建和相同消息数据：

| 场景 | 验收目标 |
| --- | --- |
| 1,000 条混合消息初次打开 | 首屏可交互不超过 200ms |
| 5,000 条混合消息初次打开 | 首屏可交互不超过 300ms |
| 展开/折叠单条长消息 | 不阻塞主线程超过 100ms |
| 连续滚动 30 秒 | P95 帧间隔不超过 16.7ms，最大不超过 50ms |
| 流式输出期间滚动 | 不丢字、不跳动、不反复回顶 |
| 图片/代码块/表格 | 高度测量稳定，无持续布局抖动 |
| 频繁切换对话 | 无明显 DOM/内存持续增长 |

如果设备/浏览器测量工具不能精确达到某项阈值，必须说明测量边界和原因，并提供对照数据，不能直接删除验收项。

---

## 8. WP4：索引总内存治理与 DOCX 解析隔离

**优先级：P1。**

### 8.1 代码索引

当前 Utility Process 降低了 Main RSS，但 Main + Utility 总 RSS 比既有样本上升约 19%，索引耗时也有所增加。

要求：

1. 同时采集 Main、Utility Process、Renderer 的 RSS、CPU、事件循环延迟。
2. 建立整个索引任务的总内存预算，而非只监控 Main。
3. 文件读取、AST 解析、符号提取、SQLite 暂存之间采用有界批次。
4. 限制单文件大小、单任务文件数、总解析字节数和并发。
5. 取消任务时终止解析工作并释放资源。
6. Worker 崩溃时旧索引继续可用；新索引只在事务完成后切换。
7. 不允许索引任务阻塞终端输入、聊天输入和窗口响应。
8. 缓存增量复用必须检查 inode、size、mtime、ctime 和内容 hash 等必要身份。
9. 对超预算文件返回可解释的跳过原因，不能悄悄丢失索引覆盖范围。

性能目标：

- 同一 150 文件/1,800 符号 fixture 下，Main + Utility 峰值 RSS 相比当前约 302.5 MiB 至少降低 15%，目标继续接近或低于 254 MiB。
- 全量索引耗时相对当前约 1,017ms 不得恶化超过 10%；若内存下降以合理耗时增加换取，必须给出权衡数据。
- Main 事件循环 P95 小于 16.7ms，最大延迟小于 50ms。
- 连续三次全量/增量索引后无持续 RSS 增长。

### 8.2 DOCX 读取

把 ZIP/XML 解压和 SAX 解析等重任务移出 Electron Main，复用 Utility Process 的隔离思路，但不得把所有文档读取都塞入一个无界 Worker。

要求：

- 分页读取具有稳定 cursor。
- 避免每次翻页从头完整解压和解析。
- 对中间解析结果使用有界缓存。
- 文件身份变化时使 cursor 失效并提示重新读取。
- 对压缩炸弹、超大 XML、超多节点、异常关系和嵌入资源设置限制。
- 支持取消、超时和 Worker 崩溃恢复。
- 继续保留路径授权、敏感信息脱敏和文件身份检查。
- 失败不影响聊天主进程和其他文档读取。

验收：

- 大型 DOCX 连续翻页不重复完整解析。
- 取消后 Utility Process 能及时释放。
- Main 事件循环 P95 小于 16.7ms。
- 超限、损坏、加密、异常压缩比文件有明确错误。
- PDF/DOCX/TXT 等现有读取回归全部通过。

---

## 9. WP5：测试纳入版本管理、CI 分层与依赖安全

**优先级：P1；Critical/High 漏洞修复是正式发布阻断项。**

### 9.1 测试文件管理

复核 .gitignore 中测试文件通配规则。当前规则可能忽略 *.test.ts、*.browser.test.ts 等文件，导致新测试无法被正常跟踪。

要求：

- 建立明确的测试目录规则或精确 allowlist。
- 测试源文件必须能被 Git 正常识别为未跟踪/修改文件。
- 不允许通过长期忽略测试文件的方式绕过 CI。
- 区分 unit、integration、desktop live、manual acceptance。
- 需要凭据、系统弹窗或真实设备的测试单独标记；默认 CI 不应弹出用户系统钥匙串窗口。
- 测试夹具使用临时目录、临时数据库、回环服务和合成凭据。
- 禁止测试读写用户真实 Desktop 项目或生产数据。
- 修正测试排除参数，确保命令行传入的 exclude 确实生效；用 dry-run 或测试列表证明。

### 9.2 CI 分层

建议分为：

1. fast：lint、typecheck、静态安全、命令协议测试。
2. unit：无外部服务和桌面依赖的单元测试。
3. integration：SQLite、PTY、SSH loopback、文档解析。
4. desktop-live：真实 Electron BrowserWindow、xterm、Pi 回环模型。
5. release-smoke：ASAR、Preload、native binary、许可、安装启动和升级。

每层都要有独立命令、失败退出码和报告。npm test 不应悄悄省略核心协议测试；npm run ci 应明确说明实际覆盖范围。

### 9.3 依赖安全

复审时 npm audit --omit=dev 曾报告 2 Critical、6 High。涉及依赖包括但不限于 dompurify、proxy-addr、electron、@modelcontextprotocol/sdk、body-parser、follow-redirects、undici、zod。

Codex 必须重新执行 npm audit --omit=dev --json，并结合：

- npm explain / npm ls 依赖路径。
- 漏洞公告、受影响版本区间和修复版本。
- 项目实际调用路径和暴露面。
- Electron 原生模块兼容性。
- lockfile 中是否存在多版本副本。

修复原则：

- 优先升级到兼容的安全补丁版本。
- 不执行 npm audit fix --force。
- 不无理由升级 Electron 主版本。
- 不删除仍在使用的依赖来消除告警。
- 传递依赖通过上游依赖升级或经过验证的 overrides 修复。
- 每次升级后跑完整 CI、Electron 构建、Live 夹具和打包 smoke。
- 对暂时无法修复的公告记录 CVE/GHSA、受影响路径、可利用条件、缓解措施和接受风险的依据。

### 9.4 安全验收

- 生产依赖 Critical = 0。
- 生产依赖 High = 0；若确有无法升级的上游阻塞，必须列明并由用户明确接受，不能静默放行。
- 无新增高危许可证问题。
- Agent 原始 PTY 写入仍受拒绝。
- Agent 执行必须经过 Main 侧审批和命令执行服务。
- Preload 最小暴露面、IPC sender 校验、Session generation 校验全部有自动化测试。

---

## 10. WP6：macOS x64/arm64 Universal 与安装验收

**优先级：P2；正式交付前必须完成。**

### 10.1 目标

提供同时支持 Intel x64 与 Apple Silicon arm64 的 macOS Universal 应用包。

此前用户已明确：没有 Apple 开发者证书，Gatekeeper 警告可接受；本轮不把签名/公证作为实现前提，但必须保证本地构建、安装和运行正确。

### 10.2 实施要求

- 检查 electron-builder / forge 当前打包配置和脚本。
- 为 x64、arm64 构建分别验证原生依赖。
- 检查 Electron Framework、node-pty helper、其他 native module 的架构。
- 生成 Universal .app，并按现有发布方式生成 DMG/ZIP。
- ASAR 检查独立 Terminal Renderer、专用 Preload、索引 Utility Process、xterm 资源和许可证。
- 检查资源路径、动态库、权限和辅助二进制。
- 避免重复构建；打包必须使用刚刚验证的产物。
- 保留当前 Intel 构建作为兼容回退，直到 Universal 真机验收通过。
- 不提交 Git，不自动发布。

### 10.3 验收

- Intel Mac 上安装、启动、打开聊天和终端、PTY 输入输出。
- Apple Silicon Mac 上原生 arm64 启动和相同功能测试。
- Universal 二进制架构检查。
- node-pty 原生 helper 架构检查。
- 终端窗口关闭/恢复、SSH loopback、Agent 审批、命令结果恢复。
- 旧版本数据升级和首次启动迁移。
- 应用退出和重新启动后的数据完整性。
- Gatekeeper 首次打开提示记录；允许用户手动允许，不尝试绕过系统安全设置。
- 安装包完整性和 SHA256 记录。

没有 Apple Silicon 实机时，只能标记“交叉构建通过，arm64 真机未验收”，不得宣称 Universal 完全通过。

---

## 11. 全局验收指标

### 11.1 Agent 与终端

- Agent 和人工共享同一个 PTY。
- 所有命令具有稳定 commandId。
- 同一命令只派发一次；wait/query 不产生执行副作用。
- 退出码 0/1/127 均能正确识别。
- 软超时不释放执行锁、不杀进程、不重发。
- 断连、缺标记、Shell 退出、generation 变化时进入 unknown 或 shell-exited。
- 结果未知时 UI 与 Agent 明确显示“结果未知/需人工核实”。
- SSH 密码、私钥、Token 不进入 Agent 上下文和审计。
- Agent 不能绕过审批直接 terminal write。

### 11.2 性能与资源

- 1,000 / 5,000 条聊天消息虚拟列表通过。
- 连续滚动 P95 帧间隔不超过 16.7ms，最大不超过 50ms。
- 16 MiB PTY 连续输出无丢失、无静默截断。
- 输出期间 Main 事件循环 P95 小于 16.7ms、最大延迟小于 50ms。
- Main + Utility RSS 在索引 fixture 下相对当前样本至少下降 15%。
- DOCX 解析不阻塞 Main。
- 连续运行 4 小时无明显内存单调增长、PTY 丢失或事件监听器累积。

### 11.3 工程质量

- npm test、typecheck、ci、unit、integration 和 desktop-live 分层结果明确。
- 新增测试均可被 Git 跟踪。
- 无未解释的跳过项。
- npm audit 生产依赖 Critical/High 达到第 9 节门槛。
- git diff --check 通过。
- 无意外修改用户已有文件、数据和凭据。
- 所有打包产物来自本轮验证过的构建。

---

## 12. 实施顺序与阶段 Gate

| 顺序 | 工作包 | Gate |
| --- | --- | --- |
| 0 | 基线、工作区保护 | 记录快照，确认测试基线可复现 |
| 1 | Agent SSH 与命令恢复 | 本机 Bash/Zsh + loopback SSH 端到端通过 |
| 2 | 人工接管和重新授权 | 输入分类、撤权、恢复授权测试通过 |
| 3 | 聊天虚拟列表 | 1,000/5,000 消息性能达标 |
| 4 | 索引/DOCX 资源治理 | Main 响应性、总 RSS 和文档回归达标 |
| 5 | 测试 CI 与安全依赖 | 测试可跟踪，生产依赖安全门槛通过 |
| 6 | Universal 打包和安装 | x64/arm64 构建与对应实机验收通过 |

Gate 规则：

- WP0 未完成，不开始大规模修改。
- WP1 未通过，不宣称 Agent SSH 运维能力完成。
- WP2 未通过，不宣称人工/Agent 可安全切换。
- WP3/WP4 未通过，不宣称长会话和后台任务性能优化完成。
- WP5 Critical/High 未处理，不进入正式发布。
- WP6 缺少 Apple Silicon 真机时，明确标记未验收。

若某个 Gate 失败，先修复当前工作包，不得通过降低测试覆盖、删除断言或把测试标记 skip 来放行。

---

## 13. 交付要求

Codex 每个工作包结束后必须提供：

1. 修改文件列表和关键实现说明。
2. 现有架构哪些部分被复用，哪些边界有调整。
3. 自动化测试命令和完整结果。
4. 性能前后对照数据及测试环境。
5. 未完成项、已知限制和风险。
6. 数据库迁移、依赖变化、构建变化说明。
7. git diff --stat、git diff --check 和工作区保护核对。
8. 明确下一 Gate 是否通过。

新增文档放入 Document/new10。不得覆盖 Document/new9 的计划和阶段报告。原始性能数据、日志和截图放入 new10 下独立的 evidence 子目录；避免把敏感凭据或生产输出写入证据。

---

## 14. 给 Codex 的执行原则

- 先理解 new9 主计划和四份阶段报告，再核对当前代码；不从零设计。
- 复审发现是待验证线索，不是无需复核的事实。先复现，再修改。
- 保留 Main 管理 PTY、独立终端窗口、xterm.js、Utility Process、PDF 范围读取和现有审批边界。
- 优先做最小、可回滚、可测试的增量修改。
- 先补测试，再改实现；测试必须能被 Git 跟踪。
- 不把同一 PTY 输出中的 OSC nonce 当作安全授权凭据。
- 对无法证明的 Shell/SSH 场景降级人工模式。
- 不把“Agent 收到工具超时”解释为“命令执行失败”。
- 不自动重发任何结果未知的命令。
- 不保存或回传密码、私钥、Token 等敏感内容。
- 不修改远端机器的持久配置。
- 不使用真实生产主机作为自动化测试靶场。
- 不擅自扩大默认权限；每条命令都必须经过策略和用户审批。
- 不执行 git commit、push、release 或发布动作。
- 任何破坏性操作、不可逆数据迁移、原生依赖大版本升级，都先停下并说明风险，等待用户确认。
- 如果实现方案与当前代码结构冲突，优先适配现有架构；不要为了符合计划中的文件名而制造空壳模块。

---

## 15. 最终完成定义

只有同时满足以下条件，才可以把本轮修复标记为完成：

1. Agent 能在当前可见 SSH Shell 中执行经用户审批的命令，且和人工共享同一个 PTY。
2. Agent 能等待长命令、查询原 commandId、获取最终退出码和有界输出。
3. 超时、断连、人工接管和结果未知均有正确状态，不发生盲目重试。
4. 用户能自然接管终端，并在 Shell 状态重新验证后显式恢复 AI 协作。
5. 1,000/5,000 条消息虚拟列表达到性能门槛。
6. 索引 Main + Utility 总内存和 DOCX 解析达到资源门槛。
7. 新增测试可被 Git 跟踪，CI 分层执行，跳过项有明确原因。
8. 生产依赖安全公告达到发布门槛。
9. macOS x64/arm64 Universal 构建通过，未验证的架构如实标记。
10. 用户原有未提交改动完整保留，没有未经授权的提交或发布。

**本计划的成功标准不是“代码改了多少”，而是日常运维中 Agent 能准确执行、准确报告、不中断人工操作、出错可恢复，且长期运行仍然流畅。**
