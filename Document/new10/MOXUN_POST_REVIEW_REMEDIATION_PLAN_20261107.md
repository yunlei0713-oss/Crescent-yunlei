# 墨巡四阶段改造后续修复与验收计划

- 日期：2026-11-07
- 项目：`/Users/xusong.yu/Desktop/moxun-test`
- 计划目录：`Document/new10`
- 前置基线：`Document/new9` 四阶段改造计划及阶段报告
- 文档性质：Codex 后续实施计划；必须先审查当前工作区，再按阶段实施
- 本轮原则：**保留已完成的有效架构，针对 Review 发现的缺口做增量修复，不推倒重建，不以新增功能数量作为目标。**

---

## 0. 执行摘要

本计划不是重新执行 new9，也不是另起一套终端架构。new9 已建立的 Electron 双窗口、Main 管理 PTY、xterm.js、独立索引 Utility Process、PDF 范围读取和本机逐条审批执行均应作为现有成果保留。

本轮目标是把“本机受限执行原型”推进为“可安全参与真实 SSH 运维的协作终端”，并补齐长命令恢复、人工接管、长会话性能、文档解析隔离、测试纳管、依赖安全与正式发布验收。

### 0.1 Review 结论基线

独立 Review 对当前工作区的验证结果：

- `git diff --check` 通过；工作区有大量未提交改动，必须视为用户资产。
- `npm run typecheck` 通过。
- `npm test` 通过：576 项静态安全边界检查、4 项命令协议测试。
- 本地回归：556 通过、19 跳过、0 失败；95 个测试文件通过、14 个文件跳过。
- 四项真实 Electron 夹具通过：双窗口/PTY 生命周期、Agent 本机审批协作、索引 Utility Process、PDF 分页预览。
- 真实终端夹具验证过关闭终端窗口后恢复 Shell、关闭聊天窗口不杀 PTY、16 MiB 输出无缓冲截断、审批拒绝不写入 PTY、退出码 0/1 可识别。
- 当前 Agent 工具仍限制在本机 Bash 的少量命令；SSH 目标明确不在 Agent 可执行范围内。
- 软超时后 Agent 缺少 wait/get-result/cancel 的完整续接 API。
- 人工输入与终端协议自动响应的区分、人工接管后的安全重新授权仍不完整。
- 聊天消息列表尚非真正虚拟列表；1,000 条消息展开约 2.6 秒，滚动最大帧间隔样本约 128.7ms。
- 索引 Main RSS 下降，但 Main + Utility 总 RSS 样本从 254.3 MiB 上升到 302.5 MiB。
- DOCX 解析仍在 Main 进程，分页存在重复解析风险。
- 测试文件被全局 ignore 规则排除，测试虽在本地通过，但版本管理和 CI 覆盖不可靠。
- `npm audit --omit=dev` 的本轮样本报告 2 项 Critical、6 项 High；必须重新审计并逐项确认可达性、影响和修复版本。
- 尚未完成正式 DMG/ZIP、ARM64/Universal、安装升级、长时稳定性验收。

上述数据是本轮设备和测试夹具的实测快照，不是对所有用户设备的性能承诺。Codex 开始实施前必须重新采样并保存原始证据。

### 0.2 最终交付目标

1. Agent 能在用户当前可见、Main 管理的同一个 SSH PTY 中，经逐条审批执行可支持的命令。
2. Shell/SSH 环境无法可靠识别命令边界时必须明确降级，不得伪造成功或盲目重试。
3. 长命令拥有稳定 commandId，可等待、查询、受控取消；超时后仍能取得最终退出码或明确 Unknown。
4. 人工输入、粘贴、TUI 交互和 xterm 协议响应不会相互误判；人工接管可安全恢复 Agent 权限。
5. 聊天长会话、索引、DOCX/PDF、终端输出均有可量化的性能和资源上限。
6. 测试进入 Git 与 CI，安全依赖可追踪，macOS x64/arm64/Universal 发布路径有真实验收。
7. 保留可替换 Agent Runtime 的边界；本轮不绑定新的 Agent 框架，不借机重构 Pi 接入。

---

## 1. 实施前强制保护

### 1.1 工作区与 Git 保护

第一步只读执行：

```bash
git status --short --branch
git diff --stat
git diff --check
git diff --cached --stat
git ls-files -o --exclude-standard
```

必须遵守：

- 不执行 `git reset`、`git clean`、强制 checkout、批量 restore、rebase 或自动 stash。
- 不覆盖、格式化、删除或回滚已有未提交改动。
- 不擅自提交、推送或切换分支。
- 不擅自删除 new9 的阶段报告、测试证据和已有计划。
- 对当前已有改动先建立文件清单和哈希/差异基线；后续只修改本计划明确涉及的文件。
- 如果新10任务与当前工作区改动冲突，暂停该文件的修改，记录冲突并请求确认，不自行取舍。
- 每阶段结束再次执行 Git 状态和差异检查，区分本阶段新增、修改和既有变更。

### 1.2 基线重采样

在任何性能优化前，固定设备、构建类型、窗口尺寸、缩放比例、测试数据和采样方式，重新采集：

- Chat Renderer、Terminal Renderer、Main、索引 Utility Process 的 RSS。
- CPU、Main event-loop delay、Renderer long task、终端输入延迟、PTY 输出积压。
- 1,000 / 5,000 条聊天消息的初次显示、展开、滚动和搜索耗时。
- 代码索引全量/增量时间及 Main + Utility 总峰值 RSS。
- DOCX 大文件首屏/连续翻页耗时、重复解析字节量和峰值内存。
- 终端 16 MiB / 64 MiB 输出时输入延迟、事件循环延迟和内存增长。
- 应用连续运行 4 小时、8 小时的资源趋势。

保存原始 JSON、日志、测试命令、环境版本和测量边界。禁止拿不同夹具或不同进程模型的数据直接比较。

---

## 2. 必须保留的架构不变量

以下是本轮不可破坏的设计约束，优先级高于实现便利：

1. **Main 是唯一 PTY/Session 权威。** Renderer 不得直接创建 PTY、child_process 或独立后台 Shell。
2. **Agent 与用户共享同一可见 PTY。** Agent 命令必须在终端窗口可见的当前 Shell/SSH 会话中执行，禁止隐藏的第二执行环境。
3. **SSH 是传输层，不是绕过审批的授权凭证。** SSH 已连接不等于 Agent 获得执行权；每条 Agent 命令仍需独立审批和审计。
4. **逐条审批、最小权限、默认拒绝。** 不新增无人值守任意远程 Shell，不允许用“只读模式”名义放开通用 Shell。
5. **命令状态必须由证据驱动。** 只有匹配的开始/结束标记、Session generation、commandId/nonce 和有效退出码，才可报告确定完成。
6. **超时不等于失败。** 不自动 kill、不自动 retry；结果未知时必须先查询原命令。
7. **Agent 不可直接调用 PTY 原始 write。** Agent 只能调用 Main 的 Command Executor；用户输入通过独立的人类输入通道。
8. **终端窗口关闭只 Detach。** PTY 的创建、销毁仍由 Main 和显式结束/应用退出策略管理。
9. **不修改远端持久环境。** 不要求改远端 bashrc/zshrc/profile、不安装远端 Agent、不上传常驻脚本、不要求 sudo。
10. **保留现有安全检查与审批链。** 不为了 SSH 兼容关闭 IPC sender 校验、能力校验、命令哈希、过期检查或人工可见审批。
11. **Agent Runtime 可替换。** 新能力以 provider-neutral 的接口接入，不把 Pi 专属类型泄漏到 Terminal Domain。
12. **旧能力持续可用。** 普通人工 Shell、旧 iTerm/保存连接/观察功能、文件读取、索引、记忆、项目关联不能因新实现回归。

### 2.1 SSH 方案的明确边界

本轮支持的是“在用户已建立并可见的 SSH 交互会话内，安全请求执行一条命令”，不是自动管理任意 SSH 凭据或自动登录所有主机。

优先支持：
- 本地 zsh/bash 创建的交互式 SSH 会话。
- 远端 Bash/Zsh 且能通过临时、非持久 Shell Adapter 建立可靠命令边界的会话。
- 用户通过现有 SSH 配置、密钥、跳板机和 ProxyJump 建立的连接。
- 当前用户可见、可人工接管的交互终端。

默认不支持或仅人工操作：
- 远端 shell 类型/版本无法识别。
- SSH 强制命令、受限 shell、无 PTY、非交互式命令通道。
- sudo 密码、MFA、键盘交互认证、TUI、vim/top 等持续交互程序。
- shell 被替换（exec）、退出、崩溃或控制标记被过滤/改写。
- 多层 SSH、tmux/screen、容器内嵌 Shell 等无法可靠定位当前命令执行层的情况。
- 命令会修改 shell 关键 trap、prompt、环境或 Shell Integration 自身的情况。

遇到不支持的环境，Agent 应解释原因、提供命令建议，由用户在可见终端手动执行。不能为了覆盖率篡改远端配置或把普通文本输出推断成退出码。

---

## 3. P0 阶段：安全 SSH Agent 协作（最高优先级）

### 3.1 目标

让 Agent 在用户已经建立的可见 SSH PTY 内逐条执行经审批的命令，结果与人工观察的终端一致；不引入第二个 SSH 连接或隐藏 Shell。

### 3.2 先做能力盘点，不直接放开现有 allowlist

重点调查：
- `src/main/agent/pi-managed-terminal-tool.ts`：当前命令 allowlist、SSH 拒绝逻辑和输入校验。
- `src/main/agent/pi-host.ts`：Agent tool availability、session/tab/connection 绑定。
- `src/main/terminal/managed/command-executor.ts`：Envelope、状态机、超时与输出关联。
- `src/main/terminal/managed/session-manager.ts`：PTY identity、attachment、输入仲裁。
- `src/main/terminal/managed/window.ts`：可见性、conversation scope 和审批生命周期。
- `src/main/terminal/managed/ipc.ts`、`src/preload/terminal.ts`、`src/shared/managed-terminal.ts`：IPC 契约。
- `src/main/terminal/terminal-text-stream.ts`：ANSI/OSC 解析边界。
- 现有旧 iTerm/SSH observation 逻辑：只复用已经验证的 host/session 识别和观察信息，不把旧执行入口绕过新 Executor。

先画出一条端到端调用链：Agent tool → Runtime adapter → Main authorization → approval → command executor → current PTY → shell adapter → structured result → audit → Agent response。

### 3.3 Provider-neutral 命令执行接口

定义共享领域接口，不暴露 Pi 特定对象：

```ts
interface CommandRequest {
  commandId: string
  terminalSessionId: string
  sessionGeneration: number
  conversationId: string
  command: string
  commandHash: string
  approvalId: string
  requestedAt: number
}

type CommandState =
  | 'queued' | 'approval-pending' | 'approved' | 'dispatched'
  | 'running' | 'awaiting-input' | 'timed-out-running'
  | 'completed-success' | 'completed-failure'
  | 'interrupted' | 'unknown' | 'shell-exited'

interface CommandResult {
  commandId: string
  state: CommandState
  exitCode?: number
  startedAt?: number
  finishedAt?: number
  outputSummary: string
  outputReference?: string
  hostSnapshot: string
  cwdSnapshot: string
}
```

以上是语义示例，Codex 必须先检查已有类型，尽量扩展现有 `ManagedCommandResult` / shared contract，不得复制出第二套状态定义。所有状态转换只能由 Main 执行器产生。

### 3.4 SSH Shell Adapter

建立独立 Shell Adapter 层，职责包括：
- 识别本地 Shell 与当前 SSH 远端 Shell 的边界。
- 识别当前远端 host、user、cwd、shell family/version 的证据来源。
- 对当前 SSH Shell 做一次性能力探测，不执行破坏性命令。
- 在当前交互 Shell 内临时包装单条命令并产生 Envelope。
- 保证命令确实在当前远端执行，而非本地 SSH 客户端 Shell。
- 维护本地 SSH 进程退出码与远端业务命令退出码的区别。
- Shell Adapter 不支持时明确返回 `manual-only`，禁止 fallback 到后台 spawn/exec。

实现顺序：
1. 本地 Bash/Zsh 兼容性回归，确保现有本机审批用例不退化。
2. 本机 loopback SSH fixture：临时 sshd、临时密钥、临时 known_hosts、隔离端口和临时目录。
3. 远端 Bash 交互 PTY。
4. 远端 Zsh 交互 PTY。
5. 用户现有 SSH config / ProxyJump / 跳板链路验证（仅在隔离测试环境或用户明确指定测试目标时）。
6. 不支持场景与降级提示。

不要在真实公司跳板机/集群节点上写入任何配置或安装文件。Loopback fixture 必须自动清理临时密钥和进程。

### 3.5 命令 Envelope 与伪造风险

new9 使用流内 nonce/OSC 标记作为原型证据，但报告已明确：已知 nonce 的 Shell 内任意代码仍可能伪造同格式控制帧。因此不能把它视为对任意 Shell 程序的密码学可信证明。

要求：
- 每次审批生成 commandId、nonce、commandHash、approvalId。
- 每次 PTY/Shell 重建生成新的 sessionGeneration。
- 开始/结束事件绑定 commandId、nonce、session ID、generation。
- 在 Main 端校验当前 owner、当前 attachment、窗口可见性、对话、host/cwd 快照和审批有效期。
- 终端文本中普通字符串、错误 nonce、旧 generation、重复结束帧、先结束后开始都不得改变状态。
- Agent 执行期间如检测到人工输入、SSH 重连、Shell 替换、提示符状态异常，立即失去执行权并转入明确状态。
- 对于执行过任意用户代码、可能伪造 OSC 控制帧的 shell，必须评估威胁模型：若无法建立足够可靠的控制通道，限制 Agent 支持的命令范围，或要求专用受控子会话；不能宣称对恶意命令具备防伪保证。
- 不要通过修改远端启动配置、安装后台守护程序或引入不可见 SSH channel 来“解决”信任问题。

### 3.6 SSH 命令风险审批

每条命令审批弹窗至少显示：
- 完整命令（可展开查看，不截断后审批）。
- 当前 host、user、连接目标、cwd。
- 当前会话 ID / generation。
- 变更风险分类及分类依据。
- 命令哈希和一次性审批 ID。
- 输出将返回给当前 Agent 的范围与脱敏说明。
- 审批有效期和“仅本次执行”。

风险分类建议：
- Read-only candidate：明确白名单工具和只读参数，仍需逐条审批。
- Mutating：文件修改、服务重启、数据库写入、集群变更，需高风险确认或默认仅人工执行。
- Privilege escalation：sudo/su/提权，默认 manual-only。
- Interactive / opaque：需要人工输入或无法验证边界，manual-only。
- Shell control：exit、exec、修改 trap/prompt/关键选项，manual-only。

不要用简单关键字黑名单假装完整 shell 安全。命令风险分类必须是审批辅助，真正的安全边界仍是用户逐条批准、Main 身份验证、执行会话绑定和明确的可见性约束。

### 3.7 Agent 终端工具语义

给 Agent 暴露的工具应是结构化操作，而不是通用原始 PTY write：
- `request_terminal_command`：提交一条命令请求并等待初始状态。
- `wait_terminal_command`：按 commandId 等待已有命令。
- `get_terminal_command_result`：查询已有命令，不触发新执行。
- `cancel_terminal_command`：请求取消/中断已有命令。
- `get_terminal_session_status`：查询当前可见会话、host、cwd、shell 能力和人工接管状态。

如果 Pi Runtime 的工具协议不能支持后台等待，先通过 Runtime adapter 做工具语义适配；不要让 Pi 专属字段进入 Terminal Domain。其他 Agent Runtime 将来可以实现相同接口。

Agent 工具的 availability 必须按当前 chat、当前 conversation、当前 terminal session、host capability、窗口可见性和授权状态动态计算。跨对话、隐藏窗口、过期 Session 和 SSH 重连后都不能继续沿用旧授权。

### 3.8 P0 验收

必须全部通过：
- 远端 Bash 命令在当前可见 SSH PTY 执行，用户能看到同一条命令和输出。
- 远端命令退出码 0/1/127 可准确区分；本地 ssh 退出码不得冒充远端业务退出码。
- 错误 nonce、普通输出伪造标记、旧 generation、重复标记、分块标记均不能错误完成命令。
- SSH 断连、远端 Shell exit、提示符缺失、Agent/聊天窗口关闭均进入准确状态。
- 未审批、拒绝、过期、隐藏窗口、跨对话、人工接管后，候选命令均不得写入 PTY。
- Agent 执行过程中不创建第二个 SSH 连接或隐藏 Shell。
- loopback SSH 的 Bash/Zsh 通过；不支持场景明确降级。
- 真实公司目标验证必须单独审批，不得把 loopback 结果宣传成生产网络验收。

---

## 4. P0 阶段：长命令生命周期、超时恢复与结果持久化

### 4.1 当前问题

`src/main/terminal/managed/command-executor.ts` 当前有固定的开始等待、运行软超时和 Prompt 等待超时。软超时会保留运行状态和会话锁，这是正确的安全方向；但 Agent 端缺少完整的续接工具，超时返回后无法可靠地继续等待同一命令并取得最终退出码。

### 4.2 统一命令生命周期

每个 commandId 必须在提交时生成，之后任何等待、查询、取消、审计和 UI 更新都引用同一个 ID。严禁 wait/get-result 内部创建新命令。

建议状态机：

```text
queued
  -> approval-pending
  -> approved
  -> dispatched
  -> running
  -> completed-success | completed-failure

running
  -> awaiting-input
  -> timed-out-running
  -> interrupted
  -> unknown
  -> shell-exited

timed-out-running
  -> running (仍收到原命令进度证据)
  -> completed-success | completed-failure (收到原命令结束证据)
  -> interrupted | unknown | shell-exited
```

状态只能单向或按明确恢复边转换。终态不可被旧事件覆盖。重复结束帧幂等处理。

### 4.3 API 契约

复用现有 Main Executor 和共享类型，按需要补充：
- `request_terminal_command(request)`：创建 commandId，进入审批/排队/执行状态。
- `wait_terminal_command(commandId, waitMs)`：等待该 ID 的状态变化；waitMs 只是本次等待窗口，不是命令运行时限。
- `get_terminal_command_result(commandId, cursor?)`：读取当前状态、最终退出码、输出摘要和输出分页游标。
- `cancel_terminal_command(commandId, reason)`：取消排队/待审批请求，或对运行命令发起受控 Ctrl+C；不能把“取消请求已发出”误报为“进程已结束”。
- `list_active_terminal_commands(sessionId)`：恢复 Agent 对话后查询仍运行或结果未知的命令。
- `get_terminal_session_status(sessionId)`：确认 Shell 是否恢复 ready、是否被人工接管、当前 generation 和 host/cwd。

所有接口都要验证 sender、sessionId、generation、conversationId、command owner 和 commandId 所属关系。

### 4.4 软超时、硬超时与未知状态

- 软超时：通知 Agent 当前仍运行，返回 commandId 和下一次建议查询时间；PT​​Y 不自动中断。
- 硬超时：只有用户显式中断，或产品中明确配置且经过审批的超时策略，才发送 Ctrl+C/终止请求。
- 中断后：必须等待 Shell Integration 确认提示符恢复，才能标记 interrupted；如果没有恢复证据，状态为 unknown。
- SSH 断开：保留命令记录，标记 unknown/transport-lost；不能猜测远端命令是否继续执行。
- 应用崩溃/重启：恢复持久化 commandId、最后已知状态和审计信息；如果无法恢复 PTY，则状态为 unknown，提供人工核验提示。
- 禁止超时自动 retry；禁止因 Agent 工具调用结束而创建新命令。
- 对网络恢复后同一 SSH Session 是否还存在必须重新确认，不能仅凭旧 host 字符串恢复授权。

### 4.5 输出和审计存储

- 小输出可以保存在有界内存；大输出存储在项目受控的本地临时/会话记录中，并提供分页读取。
- 审计至少记录 commandId、commandHash、approvalId、actor、host snapshot、cwd snapshot、session ID/generation、状态转换、时间、exit code、输出引用。
- 默认不将完整命令输出无限写入长期记忆；敏感输出应脱敏或只保存引用。
- 审计记录必须与对话正文分离，不能被普通会话清理误删。
- 进程退出/窗口关闭/应用退出后，命令状态和审计记录仍能解释“最后确认到了哪一步”。
- 存储层遵循现有 SQLite schema migration 规范；迁移可重复执行、有版本号、备份/回滚说明。
- 不持久化 SSH 私钥、口令、Agent token、MFA、环境变量密钥或原始凭据。

### 4.6 P0 验收

- 运行 30 秒、2 分钟、10 分钟命令；Agent 在多次 wait/get-result 后取得同一 commandId 的最终退出码。
- 运行期间软超时，确认没有自动 Ctrl+C、没有重复执行、没有创建第二个 PTY。
- 人工 Ctrl+C 后，只有 Shell 提示符确认恢复才返回 interrupted。
- 断开 loopback SSH、杀死远端 Shell、关闭聊天窗口、关闭终端窗口、退出应用分别测试。
- 重启应用后可查到原 commandId 的最后状态和审计记录；无法证明完成时必须是 unknown。
- 1 MiB、10 MiB 输出分页可读，Agent 默认只收到有界摘要。
- commandId 不存在、属于其他 Session/对话、旧 generation、重复取消、重复 wait 等请求必须安全拒绝或幂等返回。

---

## 5. P1 阶段：人工接管、终端输入来源与重新授权

### 5.1 当前问题

`src/renderer/src/terminal/main.ts` 中 xterm `onData` 会把终端输入和 xterm 可能产生的协议应答统一送回 PTY；`session-manager.ts` 对任何非空写入撤销 Agent authority。这个默认保守，但可能把终端协议响应误判为人工接管。

同时，当前人工接管后要结束会话再创建新会话才能恢复 Agent 权限，体验不够自然，也容易导致用户误以为当前 SSH Session 已丢失。

### 5.2 输入通道分类

在 Main 中引入明确的输入来源和仲裁：
- `human-keyboard`：真实用户键盘输入。
- `human-paste`：用户明确粘贴。
- `terminal-protocol`：xterm/终端模拟器自动生成的设备响应。
- `agent-command`：通过 Command Executor 发送的单条审批命令。
- `system-control`：Ctrl+C、resize、终端尺寸和生命周期控制。

约束：
- Agent 不得调用 human write API。
- xterm 协议响应必须与人工输入来源区分；优先使用 xterm parser response handler / 经过验证的适配层，不得依赖猜测字符串前缀。
- 回放期间产生的终端应答不得写回 PTY，保留现有 `initialReplay` 防护。
- 终端程序真实要求用户输入时（密码、确认、TUI），必须进入 awaiting-input，暂停 Agent 自动命令。
- 用户输入与 Agent command 同时发生时，以用户为最高优先级；撤销 Agent authority 并标记当前 command 状态，不允许输入插入正在写入的命令中间。
- 所有写入仍通过 Main SessionManager，保持单一 PTY 写入仲裁点。

### 5.3 人工接管后的恢复流程

目标交互：
1. Agent 正在等待审批或执行时，用户按键/粘贴/中断。
2. Main 立即暂停新的 Agent command dispatch，撤销当前一次性执行权。
3. 如果已有命令运行，记录 interrupted/unknown/awaiting-input 的准确状态，不伪造结束。
4. 终端显示“人工接管”状态和当前 host/cwd。
5. 用户完成操作后，点击“恢复 Agent 协作”。
6. Main 重新探测当前 Shell/SSH 状态、Prompt、host、cwd、generation 和 adapter capability。
7. 用户确认恢复当前 Session 的协作能力；必要时重新打开逐条审批。
8. 重新授权仅作用于当前 terminalSessionId + generation + 当前 conversation，不继承旧命令审批。
9. 如果 SSH 断连或 Shell 已替换，要求用户先重新建立可验证会话；不得自动连接或重建远端身份。

### 5.4 P1 验收

- 人工键入、粘贴、Ctrl+C 均能即时撤销 Agent command authority。
- xterm 自动设备响应不会误触发人工接管。
- TUI/密码提示会进入 awaiting-input，不自动输入或暴露秘密。
- 人工接管后可以安全恢复同一个 PTY 的 Agent 协作，不需要杀掉 SSH Session。
- Shell generation 改变、host/cwd 变化或 SSH 重连后旧授权失效。
- 两个窗口同时输入时写入顺序可验证，不出现命令拼接/覆盖。
- 终端窗口 detach/reattach 不会意外恢复已撤销的 Agent 权限。

---

## 6. P1 阶段：测试文件纳管与 CI 可靠性

### 6.1 当前问题

本轮 Review 发现仓库 ignore 规则对 `*.test.ts`、`*.browser.test.ts` 等测试文件存在全局排除。测试在本地能够运行，但大量测试可能未纳入 Git 追踪。另有阶段四报告中使用 Vitest `--exclude` 的命令，实际运行未按预期排除指定文件，说明脚本参数透传/项目配置需要明确。

### 6.2 整理策略

- 检查 `.gitignore`、`.git/info/exclude`、全局 Git excludes 和 Vitest config。
- 明确测试目录策略：生产源码同目录测试、unit、browser、desktop fixture 分别如何纳管。
- 对应该入库的测试文件使用明确的 negation allowlist，避免一条宽泛 ignore 规则吞掉全部测试。
- 不要把临时证据、截图、用户数据、密钥或本机真实目录夹具纳入 Git。
- 通过 `git ls-files`、`git check-ignore -v`、`git status --short` 证明纳管情况。
- 重新梳理 `npm test`、`npm run test:local`、Vitest project 与 CI 命令之间的边界。
- 为每个 test script 添加 --help/实际参数透传验证，不能仅看 package.json 声明。
- 桌面测试使用独立 profile、临时目录、临时凭据和回环服务；禁止访问用户真实钥匙串或写入固定 Desktop 路径。
- 本地 live tests 可保留，但 CI 默认只运行确定、隔离、可重复的 fixture。
- 把 SSH loopback、PTY、Shell Adapter 和 Electron 生命周期测试加入自动化门禁；真实公司 SSH 环境测试不得成为 CI 必需项。

### 6.3 CI 分层

建议至少分为：
1. fast: lint、typecheck、静态安全边界、协议单测。
2. unit: Main/Shared/Renderer 单元测试。
3. integration: SQLite、PTY、loopback SSH、索引 Utility、DOCX/PDF fixtures。
4. desktop: 真实 Electron 夹具，可在专用 macOS runner 或本地 release gate 执行。
5. release-smoke: 安装包内容、原生模块架构、窗口加载、终端/Agent 核心路径。

### 6.4 P1 验收

- 关键测试文件由 Git 正常跟踪，且无测试证据/个人数据误纳入。
- 新机器 clone 后无需本地私有文件即可运行 CI 默认测试。
- 参数透传测试证明指定测试确实被包含/排除。
- CI 至少覆盖 P0 所有状态机和安全边界用例。
- 失败用例输出明确 fixture、日志和复现命令。
- 运行两次结果稳定，不依赖上次运行遗留的数据库、端口、profile 或进程。

---

## 7. P1 阶段：聊天长会话真正虚拟滚动

### 7.1 当前问题

`src/renderer/src/components/AgentLogList.tsx` 仍遍历已加载的全部消息创建组件；CSS `content-visibility` 可以减少部分离屏绘制，但不等于虚拟列表。当前 1,000 条消息样本展开约 2.6 秒，滚动最大帧间隔约 128.7ms；5,000 条消息尚未验收。

### 7.2 实施要求

先评估当前消息结构和高度变化，再选择兼容的虚拟列表方案（优先使用维护活跃、许可证合适、与现有 React 版本兼容的方案；若现有依赖已有能力，优先复用）。

必须支持：
- 1,000 / 5,000 条消息的窗口化渲染，只挂载视口附近和合理 overscan 的项目。
- 动态高度：Markdown、代码块、图片、工具调用、审批卡片、思考区折叠/展开。
- 流式消息高度持续变化时不抖动、不跳到错误位置。
- 用户停留在底部时自动跟随新消息；用户向上查看历史时不强制拉回底部。
- 图片加载、代码高亮、字体加载、窗口 resize 后正确修正高度。
- 历史分页加载时维持可见锚点。
- 思考内容折叠、展开和会话切换不丢失状态。
- 正在流式生成的消息不能因虚拟卸载丢失订阅或状态。
- 复制消息、查找、引用、滚动到指定消息、错误定位等现有交互保持正常。
- 键盘可访问性、焦点管理和屏幕阅读语义不能退化。

禁止只把 CSS `content-visibility` 改个值就宣称完成；必须证明 DOM 节点数量随 viewport 而不是消息总量增长。

### 7.3 性能门槛

在同一台基准设备、同一组混合消息 fixture：
- 1,000 条初次可交互时间 P95 ≤ 500ms。
- 5,000 条初次可交互时间 P95 ≤ 800ms。
- 1,000 / 5,000 条消息滚动采样的 95th percentile frame interval ≤ 20ms；最大帧间隔目标 ≤ 50ms，单次长任务不得超过 100ms。
- 底部持续接收流式消息 10 分钟，不出现明显跳动、内存持续线性增长或重复订阅。
- 视口 DOM 消息节点数建议不超过可视数量 + 2 倍 overscan；记录实际数量。
- 这些阈值若受测试硬件影响，必须先记录设备基线并解释，不得降低标准而不报告。

### 7.4 验收用例

- 1k/5k 混合文本、代码、图片、工具消息。
- 5k 历史中间位置加载下一页。
- 底部流式输出、用户滚动上翻、点击“回到底部”。
- 展开/折叠思考、代码块、长工具结果。
- 图片加载前后高度变化、窗口缩放、不同 DPI/缩放。
- 频繁切换会话和关闭窗口，检查 listener、timer、observer 和 DOM 泄漏。

---

## 8. P1 阶段：索引总内存预算与 DOCX 解析隔离

### 8.1 代码索引总资源治理

重点文件：
- `src/main/code-intelligence/service.ts`
- `src/main/code-intelligence/utility-parser.ts`
- `src/main/code-intelligence/worker.ts`
- `src/main/code-intelligence/parser-protocol.ts`

当前 Utility Process 已把 WASM 解析从 Main 移出，Main 峰值下降；但同一夹具 Main + Utility 总峰值 RSS 仍从 254.3 MiB 上升至 302.5 MiB。不能只看 Main RSS 就宣布内存优化完成。

要求：
- Main 与所有 Utility Process 的 RSS 统一采样，建立总预算。
- 限制并发索引任务、单文件大小、单项目字节数、解析队列长度和 IPC 批次。
- 尽量流式读取和分批传递；避免同时保留 raw text、parsed AST、symbols JSON、references JSON 多份大对象。
- Utility Process 只负责解析，不持有 SQLite 写连接；Main 继续负责路径授权和事务提交。
- 取消/崩溃时回收解析进程和临时数据，旧索引保持完整。
- 大文件/不支持语言应按明确策略降级（symbol-only / skipped），记录原因，不发生 OOM。
- 为 Main + Utility 总 RSS、索引耗时、event-loop delay 建立可重复基准。
- 不以缩小索引覆盖率换取表面内存下降；报告被跳过文件、字节、语言和原因。

建议目标（先在当前设备基线验证可行性）：
- 同一 150 文件 fixture 的 Main + Utility 峰值 RSS 不高于改造前 254.3 MiB 的 1.1 倍；若解析能力/数据规模变化，必须按每文件/每 MiB 归一化比较。
- Main event-loop P95 ≤ 16ms、最大延迟目标 ≤ 50ms。
- 增量索引不能重新解析所有未变化文件。
- Utility 异常退出后旧索引可查询、可恢复，不出现部分提交。

### 8.2 DOCX 解析迁移到 Utility Process

当前 `src/main/local-docx-reader.ts` 的 ZIP/XML/SAX 解析仍在 Main 进程。应把 CPU/内存重负载解析隔离到 Utility Process，Main 仅负责：
- 文件路径授权和文件身份校验。
- 打开文件/范围读取。
- 解析任务生命周期、取消和资源预算。
- 输出结果校验、脱敏、分页游标和 Renderer IPC。

Utility Process 负责：
- ZIP 中央目录与 entry 校验。
- 解压大小、压缩比、entry 数、单 XML 大小限制。
- XML/SAX 流式解析、段落/表格抽取。
- 分页状态维护或可恢复 cursor 生成。
- 对图片、drawing、shape、SVG 等非文本元素输出安全引用，不把二进制/噪声塞进文本。

安全要求：
- 防 ZIP bomb、路径穿越、重复 entry、超大 XML、异常压缩比、XML entity expansion。
- 解析前后验证文件身份（dev/ino/size/mtime/ctime）；文件在读取期间变化则取消或重新开始。
- 取消任务能终止/回收 Utility Process，不阻塞 Main。
- 不加载或执行 DOCX 中的宏、外部链接、嵌入脚本或 ActiveX。
- 错误时返回结构化 parse error，不崩溃整个应用。

### 8.3 DOCX 分页避免重复解析

当前分页实现可能每次从 XML 开头解析并跳过已读段落。改为可恢复分页状态：
- 首次解析按段落/表格边界生成分页索引或轻量游标。
- 后续翻页从游标恢复，不重复解压/解析完整前缀。
- 缓存按文件身份 + parser version + reader options 关联。
- 缓存有明确大小/TTL/淘汰策略，不能无限增长。
- 文件身份改变、版本升级、取消、解析异常时使对应缓存失效。
- 大文档可按需读取，禁止把全文一次性复制到 Main 和 Renderer。
- 保留现有脱敏、目录权限和分页 API 的兼容行为。

### 8.4 P1 验收

- 典型 DOCX、小型 DOCX、超大 DOCX、包含大量表格/图片/特殊 XML 的 fixture。
- 连续读取 20 页，记录解压字节、解析字节、重复工作量；后续分页不得反复解析完整文档。
- 取消、切换文件、文件被替换、Utility 崩溃，旧页面和 Main event loop 保持可用。
- DOCX 解析期间持续输入聊天和终端，Main event-loop P95 ≤ 16ms。
- 索引和 DOCX 同时执行时总 RSS 仍在预算内；内存压力时有序排队/暂停，而不是同时 OOM。
- 证明旧索引、已有文件权限、PDF 范围读取和文档脱敏没有回归。

---

## 9. P1 阶段：生产依赖安全审计与升级

### 9.1 当前风险快照

Review 当天执行 `npm audit --omit=dev` 的本地样本报告：
- 2 项 Critical。
- 6 项 High。
- 涉及 DOMPurify、proxy-addr、Electron、MCP SDK、body-parser、follow-redirects、undici、zod 等直接或传递依赖链。

该列表是当时 lockfile 的审计结果，不可直接当作“每个包均可被利用”或“升级到最新版即可修复”。Codex 必须在实施开始时重新执行 audit，保存完整 JSON、lockfile 版本、漏洞 advisory、受影响范围、修复版本和依赖路径。

### 9.2 修复流程

1. 生成生产依赖和开发依赖两份审计报告；同时查看 `npm ls` 依赖树。
2. 对每条 advisory 记录：
   - 直接/间接依赖。
   - 受影响版本区间和修复版本。
   - 实际被应用引用的模块/API。
   - Electron Main、Preload、Renderer 或 Utility Process 中的调用位置。
   - 是否处理不可信输入、网络重定向、HTML、IPC、文件路径或外部内容。
   - 触发条件、利用前提和当前缓解措施。
3. 优先通过最小兼容版本升级修复，不要一开始执行全量 `npm audit fix --force`。
4. 对 Electron、Pi/MCP SDK、DOMPurify、undici 等核心依赖先阅读 breaking changes，验证 Electron ABI、Node 版本、Vite、原生模块和类型兼容。
5. 更新 lockfile 时确保可重复安装；不得手工改 lockfile 版本号伪造升级。
6. 每次升级一组相关依赖后执行对应单测、类型检查、构建、桌面夹具和安全边界检查。
7. 若没有可用修复版本，记录风险接受理由、可达性分析、缓解措施、责任项和复查日期，不得静默忽略。
8. 保留依赖许可证、NOTICE 和第三方许可文件；尤其 xterm 相关许可继续随应用分发。

### 9.3 特别注意

- DOMPurify：审查实际 sanitize 配置、Trusted Types/模板使用、是否允许 SVG/MathML、是否把 sanitized HTML 再次拼接。升级后补充 XSS fixture。
- proxy-addr / body-parser / follow-redirects：审查是否实际进入服务端/本地服务网络边界、代理头信任、请求体限制和重定向策略。
- Electron：检查官方安全公告、当前版本支持周期、Chromium 修复、Node ABI、macOS 最低版本和打包兼容。
- MCP SDK / Pi Agent SDK：检查工具调用 schema、取消语义、流式事件、工具审批、session API 的兼容变化。
- undici / zod：检查实际传递依赖来源，避免多个版本造成修复不完整。

### 9.4 验收

- 重新运行 `npm audit --omit=dev` 和完整 `npm audit`。
- 所有 Critical/High 必须修复或形成经确认的风险接受记录。
- 依赖树中无意外重复旧版本；无未经解释的强制 override。
- 安全边界、XSS、HTTP 重定向、文件读取、Agent 工具协议测试通过。
- clean install、typecheck、CI、Electron build、macOS smoke 均通过。
- 输出依赖变更表：旧版本→新版本、原因、风险、兼容性测试、回滚方式。

---

## 10. P2 阶段：macOS x64 / arm64 / Universal 正式交付验收

### 10.1 目标

new9 阶段四只验证了 ASAR 内容夹具和 Intel 二进制检查，没有完成正式安装包、ARM64/Universal、安装启动、升级和长时稳定性。本阶段补齐真实发布链路。

### 10.2 构建策略

- 保留本地开发验证和不提交 Git 的约束；除非用户另行要求，不自动 commit/push。
- 明确 x64、arm64、Universal 三种产物的构建命令和输出目录。
- 检查 Electron、node-pty helper、所有 native addon、Utility Process、Preload、xterm 资源和许可证的架构。
- Universal 必须验证可执行文件 Mach-O universal slices；不能只根据文件名或构建参数宣称支持双架构。
- 对原生模块验证 x64 和 arm64 slice、签名状态、加载路径和运行时可用性。
- 无 Apple Developer ID 证书时，按用户既有约束生成本地可运行包；明确 Gatekeeper 可能提示，不能宣称已公证。
- 如果需要签名/公证，作为独立可选流程，不在没有证书时伪造成功。
- 安装包生成前执行完整 CI 和 release-smoke；打包必须使用刚构建的产物，不能重复构建旧目录。

### 10.3 安装和升级验收

在 x64 和 arm64 设备/环境分别验证：
- 首次安装、首次启动、退出、再次启动。
- 聊天窗口和独立终端窗口打开/关闭/重开。
- PTY 生命周期、SSH 人工连接、Agent 本机审批和 loopback SSH 协作。
- 用户数据、SQLite、项目索引、会话、长期记忆升级后保留。
- 旧版本数据迁移可重复、可中断恢复；升级失败有备份和回滚方案。
- 原生 node-pty helper 正确加载，无架构错误。
- 关闭窗口、Dock 激活、系统休眠/唤醒、多显示器切换。
- 应用卸载/覆盖安装不会删除用户数据（除非用户明确选择清除）。

### 10.4 长时稳定性

至少执行 4 小时连续运行，目标设备条件允许时执行 8 小时：
- 终端持续输出与间歇命令。
- SSH 连接/断连/重连人工操作。
- Agent 审批、等待长命令、取消、人工接管。
- 聊天持续流式输出、历史滚动、项目索引、DOCX/PDF 读取。
- 窗口 detach/reattach、隐藏/显示、切换会话。
- 监控 Main/Renderer/Utility RSS、CPU、event-loop delay、PTY buffer、listener/timer 数量。
- 检查内存是否持续线性增长、进程是否残留、PTY 是否泄漏、命令是否重复执行。

### 10.5 P2 验收

- x64、arm64、Universal 产物文件和 Mach-O 架构证据齐全。
- 对应架构至少有一轮真实安装启动 smoke；Universal 在两种架构设备/环境均启动。
- ASAR 检查、原生模块加载、许可证检查通过。
- 数据升级前后用户数据一致，失败路径可回滚。
- 4 小时稳定性测试通过，无持续资源泄漏、窗口崩溃、PTY 残留或命令状态错误。
- 明确说明签名、公证、Gatekeeper 的实际状态，不夸大交付级别。

---

## 11. 建议实施顺序与阶段门槛

### 阶段 A：P0 SSH Agent 协作 + 长命令恢复

依次完成：
1. 当前代码和 new9 文档复核。
2. provider-neutral command contract。
3. Main command lifecycle API 和持久化记录。
4. Shell Adapter 本地 Bash/Zsh 回归。
5. loopback SSH Bash。
6. loopback SSH Zsh。
7. 审批/风险策略和结果脱敏。
8. Agent Runtime 接入。
9. 断连、超时、恢复、未知状态和无重试验证。

**退出门槛：** P0 的 SSH、状态机、超时和安全验收全部通过。未通过不得把 SSH Agent 功能开放给真实用户，也不得转入默认启用状态。

### 阶段 B：P1 人工接管 + 测试纳管

依次完成：
1. 输入来源区分与 Main 写入仲裁。
2. 人工接管 UI 和安全恢复流程。
3. 测试 ignore 规则与 Git 纳管。
4. Vitest project/CLI 参数透传。
5. CI 分层和 loopback SSH 自动化。

**退出门槛：** 人工输入不被协议响应误判；恢复权限必须重新探测和确认；关键测试可从干净 clone 运行。

### 阶段 C：P1 性能与文档治理

依次完成：
1. AgentLogList 虚拟列表原型和动态高度。
2. 1k/5k 长会话压力测试。
3. 索引 Main + Utility 总 RSS 预算。
4. DOCX Utility Process。
5. DOCX 可恢复分页和缓存。
6. 终端/聊天/索引/DOCX 混合负载测试。

**退出门槛：** 性能阈值有原始证据；Main event loop 不因重型任务阻塞；旧索引、PDF、文件权限和 UI 交互不回归。

### 阶段 D：P1 依赖安全

完成生产依赖审计、分批升级、许可证和安全回归。

**退出门槛：** Critical/High 已修复或风险接受；完整 CI、桌面夹具和 clean install 通过。

### 阶段 E：P2 发布验收

完成 x64/arm64/Universal 构建、安装、升级、长时稳定性和 Gatekeeper 状态说明。

**退出门槛：** 有可复现产物、架构证据、安装记录、数据迁移验证和稳定性报告。

---

## 12. 文件级调查清单（以实施时实际代码为准）

以下路径来自本轮 Review 的当前实现定位，Codex 必须重新打开并核对，不得假定行号永久不变。

| 文件 | 当前观察 / 本轮任务 |
|---|---|
| `src/main/agent/pi-managed-terminal-tool.ts` | 本机命令白名单和 SSH 拒绝逻辑；扩展到结构化 Shell Adapter 能力判定，禁止直接放开任意 Shell |
| `src/main/agent/pi-host.ts` | 当前 Agent tool availability 与 session/conversation 绑定；接入 provider-neutral command API |
| `src/main/terminal/managed/command-executor.ts` | 固定开始/运行/Prompt timeout；补充 wait/get/cancel、状态持久化和长命令恢复 |
| `src/main/terminal/managed/session-manager.ts` | 当前任意非空写入会失去 Agent authority；区分 human/protocol/agent/system 来源 |
| `src/main/terminal/managed/window.ts` | 审批、可见性、conversation scope；补充安全重新授权和 host/generation 快照 |
| `src/main/terminal/managed/ipc.ts` | 扩展类型化命令查询/等待/取消 IPC，严格 sender 与 session 授权 |
| `src/preload/terminal.ts` | 保持最小 API，不暴露 node-pty 或任意 PTY write 给 Agent |
| `src/shared/managed-terminal.ts` | 统一 command state、request/result、input source、capability contract |
| `src/renderer/src/terminal/main.ts` | xterm onData、协议响应回写、人工接管和终端 UI |
| `src/main/terminal/terminal-text-stream.ts` | OSC/ANSI 分块解析、命令输出分离、协议事件防误识别 |
| `src/main/code-intelligence/service.ts` | 当前 RSS 预算偏 Main 进程；补充 Main+Utility 统一预算 |
| `src/main/code-intelligence/utility-parser.ts` | Utility Process 生命周期、内存测量、解析批次和取消 |
| `src/main/local-docx-reader.ts` | ZIP/XML/SAX 解析仍在 Main；迁移重负载解析、恢复分页 |
| `src/renderer/src/components/AgentLogList.tsx` | 当前遍历全部消息；真正虚拟滚动和动态高度 |
| `src/renderer/src/assets/chat-workspace.css` | content-visibility 等现有样式只作辅助，不可代替虚拟列表 |
| `.gitignore` | 测试文件 ignore/allowlist；保留临时证据和用户数据排除 |
| `vitest.config.ts` | project 配置、desktop/unit 隔离和参数透传 |
| `package.json` / `package-lock.json` | 测试脚本、依赖审计和兼容升级 |
| `scripts/check-security-boundaries.cjs` | 保留并扩展静态边界断言 |
| `scripts/verify-managed-terminal.cjs` | 保留协议测试并纳入明确 CI 入口 |
| `scripts/build-macos-local.cjs` | x64/arm64/Universal 构建与重复构建治理 |
| `scripts/smoke-macos-app.cjs` | 扩展多架构、原生模块和安装包 smoke |

---

## 13. 明确非目标与禁止事项

本轮不做：
- 更换 Pi Agent、引入新 Agent 框架或重写 Agent Runtime。
- 重新设计整个终端窗口、品牌、主题或聊天 UI；只做支持本计划验收所需的最小交互调整。
- 新增后台无人值守 Agent、自动 SSH 登录、自动跳板机凭据管理。
- 绕过逐条审批，增加“信任此主机后任意命令自动执行”。
- 为兼容 Agent 修改公司远端主机配置、安装远端程序、上传持久化脚本。
- 重新引入 iTerm2 作为新终端 UI；旧 iTerm 兼容功能按现状保留。
- 为追求虚拟滚动性能删掉 Markdown、代码块、图片、工具消息、审批卡片或思考折叠。
- 为降低 RSS 无条件缩小索引范围或拒绝读取大文件。
- 执行未经审计的 `npm audit fix --force`。
- 清理历史资源、无关模块、未使用文件或用户现有工作区改动。
- 自动 commit/push、打 tag、发布或上传安装包。

---

## 14. 数据迁移、回滚和故障处置

### 14.1 命令审计迁移

如果新增 SQLite 表/列：
- 先检查当前数据库版本和迁移体系。
- 迁移必须具备 schema version、事务、幂等性和备份说明。
- 旧数据不要求伪造 commandId；历史记录可标记 legacy/unknown。
- 不把敏感输出或凭据写入新表。
- 提供升级前后查询验证和回滚策略。
- 应用降级时保留未知字段，不得直接清空用户数据库。

### 14.2 Terminal Session 回滚

- 先关闭 Agent 新命令入口，再回滚 Shell Adapter。
- 普通人工终端、PTY 生命周期、窗口 detach/reattach 不应因 Agent SSH 回滚而被删除。
- 新增持久化命令记录只做兼容读取；不可因代码回滚而删除审计数据。
- SSH Adapter 失败时可降级为人工终端，不得阻止用户手动 SSH。

### 14.3 性能模块回滚

- 虚拟列表可保留现有消息组件，回滚时只切回旧列表容器；不要复制/重写消息业务组件。
- Utility Process 崩溃时保留旧索引，索引任务可排队重试，但不得自动重放用户 Agent 命令。
- DOCX Utility Process 失败时显示明确解析错误；若回退 Main 解析，必须受限并且可取消，不能无上限同步执行。
- 任何缓存都可以清空重建，但不能删除原始用户文档、项目文件或已有索引数据库。

### 14.4 依赖回滚

- 每个依赖升级批次记录 lockfile diff、版本、advisory 和测试结果。
- 优先单批次回滚，不得整体覆盖 lockfile。
- 如果升级导致 Electron ABI 或原生模块失败，回滚该依赖批次并保留安全风险说明。
- 不回滚到已确认存在 Critical 漏洞的版本，除非有短期风险缓解和明确批准。

### 14.5 发布回滚

- 发布前备份用户数据迁移前状态。
- 保留上一版可安装包和构建 manifest。
- 新版启动失败时提供可恢复的旧版本启动路径。
- 不自动删除用户数据库、索引和会话。
- 无签名/公证条件时明确告知 Gatekeeper 处理方式，不伪装发布已完成。

---

## 15. 总体验收清单（必须逐项勾选并附证据）

### P0：SSH Agent 协作与命令可靠性
- [ ] 当前可见 SSH PTY 是唯一执行环境。
- [ ] Bash/Zsh loopback SSH 命令开始/结束/退出码正确。
- [ ] 不支持 Shell/交互式命令安全降级。
- [ ] commandId 在多轮 wait/get/cancel 中保持不变。
- [ ] 软超时不杀进程、不重发。
- [ ] SSH 断连、Shell exit、窗口关闭、应用退出状态准确。
- [ ] 审批拒绝/过期/隐藏/跨对话/人工接管不写入 PTY。
- [ ] 输出分页、脱敏和持久化审计正确。
- [ ] 没有第二个隐藏 Shell 或 SSH 连接。

### P1：人工接管、测试和性能
- [ ] human keyboard/paste 与 terminal protocol response 可区分。
- [ ] 人工接管后同一 Session 可安全重新授权。
- [ ] 测试文件进入 Git，临时证据仍被排除。
- [ ] Vitest CLI include/exclude 真实生效。
- [ ] CI 默认任务可在干净 clone 运行。
- [ ] 1k/5k 聊天虚拟滚动达到性能阈值。
- [ ] 索引 Main+Utility RSS 有统一预算和报告。
- [ ] DOCX 解析隔离、可取消、分页无重复全量解析。
- [ ] 混合负载下聊天与终端保持响应。

### P1：依赖安全
- [ ] Critical/High 漏洞全部修复或有明确风险接受记录。
- [ ] 许可证和 NOTICE 完整。
- [ ] clean install、CI、构建和 Electron smoke 通过。

### P2：发布
- [ ] x64/arm64/Universal 架构证据。
- [ ] 安装、启动、升级、数据迁移和回滚测试。
- [ ] 多显示器、Dock、休眠/唤醒和窗口恢复测试。
- [ ] 4 小时以上长时稳定性证据。
- [ ] 签名、公证和 Gatekeeper 状态如实记录。

任何一项未完成都不得标记整个计划“全部完成”。允许阶段性交付，但必须标注未验收范围和风险。

---

## 16. Codex 执行提示词

将以下提示词交给 Codex，并要求它先读取本计划和 new9 全部阶段记录：

```text
请严格按照 Document/new10/MOXUN_POST_REVIEW_REMEDIATION_PLAN_20261107.md 实施。

这是对 new9 四阶段改造的后续修复，不是重新架构。先只读检查 git status、diff、当前源码、new9 计划和四份阶段报告，建立现有未提交改动基线。绝对不要 reset、clean、restore、覆盖或提交用户已有改动。

执行顺序：
1. 先完成 P0：当前可见 SSH PTY 内的安全 Agent 协作、Shell Adapter、逐条审批、命令 ID 生命周期、wait/get-result/cancel、超时/断连/Unknown 和持久化审计。
2. 再完成 P1：输入来源区分、人工接管和重新授权、测试文件 Git 纳管/CI、聊天真正虚拟滚动、索引总内存预算、DOCX Utility Process 与可恢复分页、生产依赖漏洞修复。
3. 最后完成 P2：macOS x64/arm64/Universal、安装升级、数据迁移和长时稳定性验收。

必须保留 Main 管理 PTY、用户与 Agent 共用可见 PTY、窗口 detach/reattach、现有审批和 IPC 安全边界。SSH 只是当前 Shell 的传输层，不是放开任意远程执行的理由。每条 Agent 命令都必须逐条审批；不得创建隐藏 Shell/第二 SSH 连接；不得修改远端持久配置；不支持的 Shell/交互式程序必须 manual-only。软超时不等于失败，不自动杀进程，不自动重试；所有后续查询都必须使用原 commandId。

不要只做静态代码修改。每阶段都要有可重复的自动化测试、真实 Electron/PTY/loopback SSH 夹具和性能数据。真实公司环境测试必须单独征求确认。性能对比必须使用同一设备、同一夹具和相同测量边界。不要通过删功能、缩小索引覆盖、降低安全检查或跳过失败测试来“通过”验收。

每阶段结束时输出：改动文件清单、关键设计、测试命令与原始结果、性能对比、剩余风险、回滚步骤、Git diff 检查。遇到架构冲突或需要破坏既有行为时先停下说明，不自行扩大范围。除非我明确要求，不要 commit、push、发布或清理项目。
```

---

## 17. 交付记录模板

每阶段完成后在 `Document/new10` 新增独立报告，建议命名：
- `PHASE_A_SSH_AGENT_AND_COMMAND_LIFECYCLE_REPORT.md`
- `PHASE_B_HANDOFF_AND_TEST_GOVERNANCE_REPORT.md`
- `PHASE_C_PERFORMANCE_AND_DOCUMENT_PARSER_REPORT.md`
- `PHASE_D_DEPENDENCY_SECURITY_REPORT.md`
- `PHASE_E_MACOS_RELEASE_ACCEPTANCE_REPORT.md`

报告必须包括：
1. 实施范围与未实施项。
2. 改动文件与关键接口。
3. 自动化测试命令、通过/失败/跳过数。
4. 真实 Electron、PTY、SSH fixture 的证据。
5. 性能原始数据和测量边界。
6. 安全威胁模型与已知限制。
7. 数据迁移、回滚和兼容性。
8. Git 状态与 diff 检查。
9. 未解决风险和下一阶段进入条件。

**最终原则：先保证 Agent 在同一个真实终端中可靠、安全地工作，再保证长会话、索引和文档负载下依然流畅，最后完成正式 macOS 交付。不要为了“全部做完”牺牲现有稳定能力。**
