# 墨巡双窗口终端、可靠 Agent 执行环境与全方位性能优化计划

- 日期：2026-11-07
- 项目：`/Users/xusong.yu/Desktop/moxun-test`
- 交付目录：`Document/new9`
- 文档性质：Codex 分阶段实施计划；本次仅制定计划，不修改源代码
- 总体原则：**优先保证使用过程流畅、响应及时、状态准确和长期稳定；不考虑安装包体积，不设置 bundle size 硬门槛**

---

## 0. 执行摘要

本计划把前期项目 Review 的四个优化阶段，与最新确认的双窗口终端和可靠 Agent 命令执行目标合并为一套可执行路线。

最终产品形态：

1. 墨巡仍然是聊天优先的桌面运维助手。
2. 聊天窗口与终端窗口是两个独立的 Electron 窗口，彼此分离，可放在不同显示器上。
3. 终端窗口由墨巡自身创建和管理，不再依赖启动真正的 iTerm2，也不把终端嵌入聊天页面。
4. 终端显示层使用 xterm.js，真实 Shell/PTY 继续由 Main 进程中的 node-pty 管理。
5. 用户和 Agent 操作的是同一个 PTY、同一个 Shell、同一个 SSH 会话，不允许 Agent 在后台另开一个不可见 Shell。
6. Agent 可以在明确授权和审批策略下执行命令；命令开始、结束、退出码、超时、等待输入、SSH 断连等状态必须可验证。
7. 终端输出、索引、文档解析、历史消息渲染等重负载不得阻塞聊天输入、终端键盘响应和窗口交互。
8. 保留当前已有的项目索引、文件读取、记忆、会话队列、审批和安全能力；在其基础上治理性能和架构，不推倒重建。

本计划保留前期确定的四个阶段：

- 阶段一：稳定性与安全。
- 阶段二：性能与交互体验。
- 阶段三：架构治理与可靠 Agent 执行环境。
- 阶段四：工程化、自动化测试与发布验收。

双窗口终端是阶段一、二的基础设施；Agent 命令执行是阶段一建立安全边界、阶段三正式恢复能力的专项工作流。

## 1. 目标、边界与明确不做的事情

### 1.1 必须实现

- 两个独立窗口：Chat Window 和 Terminal Window。
- Terminal Window 使用墨巡自身的 Electron BrowserWindow。
- xterm.js 负责终端渲染和键盘交互；node-pty 负责真实 PTY。
- Main 进程是 PTY、会话状态、命令执行、审批和安全策略的唯一权威。
- 终端窗口关闭只代表 detach，不等于结束 PTY；提供明确的“结束会话”操作。
- 聊天窗口崩溃、刷新或重建，不应无故杀死仍然有效的终端会话。
- Agent 执行的命令必须显示在用户可见的终端窗口中。
- Agent 命令与人工命令共享一个 Shell，严格串行化写入，不能互相覆盖输入。
- 通过 Shell Integration 和命令级执行封装识别命令开始、结束、退出码。
- 对无法可靠识别的 Shell、SSH 会话或交互式程序，明确降级为人工接管或“结果未知”，禁止伪造成功。
- 对项目索引、消息列表、PDF/DOCX、大型终端输出和数据库操作进行性能治理。

### 1.2 明确不做

- 不在聊天窗口中增加内嵌终端 Tab 或左右分栏终端。
- 不再通过 AppleScript/JXA 把真正的 iTerm2 作为正式终端 UI。
- 不让 Agent 使用 child_process.exec / spawn 在后台创建第二个命令执行环境。
- 不给 Agent 无限制的 Shell 权限，不以“自动执行成功率”为理由绕过审批。
- 不修改跳板机、集群节点或远端服务器的 .bashrc、.zshrc、profile 等持久配置。
- 不把超时等同于失败，不在结果未知时盲目重试。
- 不为了减小安装包而删除有用依赖、功能或资源。
- 不设置 Renderer bundle、安装包、压缩包体积门槛；允许合理增大包体积。
- 不为了拆分文件而制造大量无意义的小模块。
- 不在本次实施中更换 Pi Agent 底层；先建立 Runtime 边界，确保未来可替换。

## 2. 当前项目基线与需要保护的现有成果

以下基于本轮对当前项目源码和文档的检查。Codex 实施前必须重新读取实际工作区，不得把本节当作永远不变的代码快照。

### 2.1 当前已有、应优先复用的能力

- Main 进程已有 node-pty 和终端 Session 管理基础。
- 当前已有 iTerm 外部终端适配、PTY 保留和重新打开能力。
- 已有终端观察、证据缓存、授权和证据失效机制。
- 已有 Agent Turn Queue、SQLite 持久化、会话恢复和请求身份校验。
- 已有 Agent Capability Policy、Capability Enforcement、Diff 审批和工具白名单。
- 已有 LocalDocumentReader、分页 Cursor、文件变更检测、敏感信息脱敏和路径保护。
- 已有 Tree-sitter / WASM 代码索引、增量索引和符号数据。
- 已有长期记忆、上下文压缩、检查点和项目关联机制。
- Renderer 已有多个重型面板的动态加载，不能为了重构而退回启动时全部加载。

### 2.2 本轮检查中确认的关键改造点

1. 当前终端会话身份部分依赖 WebContents ID + tabId。独立 Terminal Window 后，不能继续让 PTY 的所有权绑定某一个 Renderer。
2. 当前终端 Owner 生命周期会在 Renderer 销毁、崩溃或导航时清理对应会话。需要改成稳定 Session ID + 多窗口 Attach/Detach。
3. 当前主窗口生命周期中存在窗口全部关闭时清理终端会话的逻辑。应区分“关闭窗口”和“退出应用”，只有明确退出应用时才执行最终 PTY 清理。
4. 当前 Agent 终端 Bash 工具和执行入口存在明确拒绝逻辑。恢复执行能力必须同时恢复工具定义、Main 侧执行路径、能力策略和审批链，不能只打开一个开关。
5. 当前项目没有完整的 xterm.js UI 依赖，需要评估并引入官方维护的 @xterm/xterm 及必要插件。
6. 当前代码索引解析主要在 Main 进程同步执行，之前性能检查观察到大型索引任务有约 1.27～1.29 GiB 的 RSS 峰值。需要重新基准测试，并把解析隔离到 Worker 或 Utility Process。
7. 当前 App.tsx、terminal/ipc.ts、pi-host.ts、crescent-sqlite.ts 等文件职责过多，应按领域拆分，但必须渐进迁移。
8. 当前测试目录存在未被 Git 跟踪的测试文件，部分测试会读取真实 Desktop 文件或向固定 Desktop 路径写入证据；必须先隔离副作用，再纳入 CI。
9. 当前 Document/TESTING.md 内容与文件名表达的测试规范不一致，需要纠正文档职责。
10. 当前打包流程存在重复构建的迹象；应先验证，再消除重复构建，不允许打包旧产物。

### 2.3 之前测量过的性能基线

此前 Review 记录的样本包括：

- 大型代码索引任务 RSS 峰值约 1.27～1.29 GiB。
- 展开约 1,000 条历史消息时，滚动帧间隔样本最高约 139ms。
- Pi 冷启动样本约 1.88 秒。
- ESLint 有约 149 条 warning，未观察到 lint error。
- TypeScript 类型检查通过；安全边界静态检查曾有 366 项通过。
- 完整本地测试没有全部执行，因为部分测试存在真实文件读写副作用。

这些数字是历史样本，不是最终验收阈值。实施前先在同一台设备、同一组数据和相同操作流程下重新采样，建立可比较的基线。

### 2.4 工作区保护要求

此前检查时工作区存在大量未提交改动。Codex 必须：

- 第一条操作先执行 git status、git diff --stat、git diff --check。
- 将现有未提交修改视为用户资产，不得覆盖、回滚、清理或格式化无关文件。
- 不得执行 git reset、git clean、强制 checkout、批量还原等破坏性操作。
- 不得擅自提交 Git。
- 每个阶段结束时再次检查工作区差异，明确本阶段新增和修改了哪些文件。
- 遇到已有改动与本计划冲突时，先保留现状并报告冲突，不得自行覆盖。

## 3. 目标架构

### 3.1 双窗口结构

- Chat Window：继续负责对话、历史、项目、记忆、文件、审批卡片和任务结果。
- Terminal Window：独立 BrowserWindow，负责 xterm.js、终端标签、会话状态、滚屏、输入、搜索和人工接管。
- 两个窗口由同一个 Electron Main 管理；可分别移动、缩放、最小化和关闭。
- 终端窗口关闭后，Main 保留 PTY 和有限滚屏缓存；重新打开时重新 Attach。
- 终端窗口重新加载时，应恢复当前 Session，而不是创建重复 PTY。
- 应用真正退出时，Main 统一结束 PTY、关闭 Socket、清理临时资源。
- macOS Dock 激活、窗口全部关闭、应用退出、系统关机等生命周期必须分别处理。

### 3.2 Main 侧是唯一会话所有者

建议引入或整理以下领域模块：

- TerminalSessionManager：创建、恢复、结束、列举和切换 Session。
- TerminalWindowManager：创建、聚焦、隐藏、恢复和销毁 Terminal Window。
- TerminalIpcRouter：鉴权、输入输出路由、事件订阅和取消。
- TerminalOutputBuffer：有限滚屏、输出截断、按需快照。
- TerminalCommandExecutor：Agent 命令串行执行和状态跟踪。
- ShellIntegrationManager：Shell 类型识别、OSC 事件和 Shell Adapter。
- CommandApprovalService：命令风险判断、审批令牌和审计。
- TerminalPerformanceMonitor：PTY 延迟、输出积压、CPU 和内存指标。

具体文件名可按现有结构调整，但职责边界必须保留。

### 3.3 稳定 Session 身份

Session 不得再以 WebContents ID 作为主身份。

建议 Session 元数据至少包含：

- terminalSessionId：稳定且不可猜测的会话 ID。
- sessionGeneration：每次 Shell/PTY 重建递增，防止旧事件污染新会话。
- shellType、shellVersion、platform。
- cwd、host、sshTarget、connectionIdentity。
- createdAt、lastActivityAt。
- ptyState、shellState、windowAttached。
- conversationId：可选关联对话，不作为 PTY 唯一身份。
- executionOwner：当前是否由 Agent 占用命令执行权。
- commandQueueState：当前命令及等待队列状态。

WebContents 只作为短期 Attach 身份。每次 Attach 都验证来源窗口、Session 权限和 generation；窗口销毁只 Detach，不自动销毁 Session。

### 3.4 xterm.js 终端窗口

建议依赖：

- @xterm/xterm：终端渲染和输入。
- @xterm/addon-fit：窗口尺寸变化时调整 cols/rows。
- @xterm/addon-search：滚屏搜索。
- @xterm/addon-web-links：URL 识别。
- @xterm/addon-unicode11：按需解决 CJK / Emoji 宽度问题。
- @xterm/addon-webgl：可选 GPU 渲染，必须实测后启用，并提供回退。
- @xterm/headless：Main 侧 ANSI / OSC 解析与终端状态观察，是否引入由原型测试确认。

保持官方 @xterm 命名空间和版本兼容性。不要混用旧的 xterm 包与 @xterm/xterm。

终端窗口必须具备：

- 当前终端标签和会话标识。
- 本地 Shell / SSH 会话的明确区分。
- 连接目标、当前目录、Shell 状态。
- Agent 执行中、等待输入、成功、失败、中断、未知等状态提示。
- 搜索、清屏、复制、粘贴、滚屏、字体大小和自动适配。
- 明确的“关闭窗口”“重新打开”“结束会话”操作。
- 终端输出大量涌入时仍能输入、滚动和切换窗口。

### 3.5 IPC 和安全边界

- Renderer 不得直接获得 node-pty、child_process 或 Node.js 原生能力。
- Preload 暴露最小化、类型化的终端 API。
- Main 校验每个 IPC 的 sender、窗口类型、Session ID、generation 和操作权限。
- Terminal Window 只能 Attach 已授权 Session；不能自行创建任意 Shell，除非通过 Main 的显式创建流程。
- Chat Window 负责发起 Agent 任务和审批，不得伪造终端执行结果。
- Agent 只能调用受审核的 command execution API，不能直接调用 terminal:write 原始输入接口。
- 用户的键盘输入与 Agent 命令输入通过同一个 Main 写入仲裁器，保证同一时刻只有一个写入者。
- Ctrl+C / 紧急停止 / 人工接管是独立高优先级控制通道，但仍需校验 Session 身份。

## 4. 可靠 Agent 命令执行环境（核心专项）

本专项是本次改造的核心，不得把“命令显示在 xterm.js 中”误认为“命令执行状态已经可靠”。

### 4.1 三层职责

- xterm.js：负责显示、输入和终端模拟，不负责判断命令是否成功。
- node-pty：负责创建真实 Shell、输入输出和 PTY 进程退出事件。
- Shell Integration / Command Executor：负责识别命令边界、退出码、等待输入和执行结果。

Agent 必须通过 Main 的 Command Executor 向当前 PTY 发起执行请求。xterm.js 只是同一个 PTY 的可视化界面，不是 Agent 的执行后端。

禁止出现“用户看见一个 PTY，Agent 在另一个 child_process 或后台 Shell 执行”的双执行环境。

### 4.2 双重命令状态识别

**A. Shell Integration：识别人工命令和通用 Shell 活动**

优先参考 VS Code Shell Integration：

- OSC 133：命令提示符、命令输入、执行开始、命令结束。
- OSC 633：VS Code 扩展 Shell Integration 的增强事件，作为可选兼容参考。
- 使用终端解析器的 OSC Handler / parser event，不得只用正则表达式扫描已经渲染的纯文本。
- 支持事件被拆分到多个 PTY data chunk 的情况。
- 识别 Prompt、Command Start、Command Finish、Exit Code、CWD 等可用信息。
- Shell Integration 不可用时，显示能力降级，不伪造命令边界。

**B. Agent Command Envelope：精确识别 Agent 自己发出的命令**

每条 Agent 命令必须具有独立执行信封：

- commandId：全局唯一。
- nonce：每条命令随机生成，避免输出中的普通文本误匹配。
- terminalSessionId 和 sessionGeneration。
- conversationId、approvalId、目标主机和 cwd 快照。
- commandHash：审批时的命令内容哈希。
- startedAt、finishedAt、duration。
- exitCode、resultState、outputReference。

执行前由 Main 生成开始/结束控制标记，Shell Adapter 在当前 Shell 中执行命令，并在命令结束时回传退出码。解析器必须同时匹配 commandId、nonce、Session ID 和 generation。

命令输出可能包含 ANSI、OSC、换行、中文、Emoji 或与标记相似的文本。必须使用结构化控制标记和解析器，不得依赖简单的字符串包含判断。

对于无法建立可靠 Envelope 的 Shell，不允许静默退化为“等待一段时间没输出就算结束”。

### 4.3 Shell Adapter 设计

第一批优先支持：

- macOS 本地 zsh。
- macOS / Linux Bash。
- Linux POSIX sh 的有限兼容路径。
- SSH 连接后的远端 Bash / Zsh 会话。

要求：

1. Shell 类型识别必须有可靠证据；不能识别时显示 unsupported / manual-only。
2. 对 Agent 命令使用当前活动 Shell 的临时包装器，尽可能保留 cwd、环境变量和当前 SSH 会话。
3. 不修改远端服务器的持久配置文件，不安装远端 Agent，不要求管理员权限。
4. 可在当前交互会话内临时定义函数或使用单次命令包装；关闭会话后自动消失。
5. 必须处理 set -e、trap、子 Shell、命令组合、管道、here-document、换行、引号和退出码传播。
6. 对 exit、exec、改变 Shell 生命周期、修改关键 trap / shell option、交互式程序等命令进行风险识别；不支持可靠封装时要求人工执行。
7. 对命令执行前后的 cwd、host、SSH 身份和 Session generation 做快照校验。
8. 不得把本地 Shell 的退出码误当作远端业务命令的退出码。
9. 进入交互式 SSH 后，Agent 命令必须在远端当前 Shell 中执行并获得远端包装器返回的结果；不能只观察本地 ssh 进程。
10. 如果远端 Shell 无法支持可靠的临时包装，则降级为只读观察和人工操作，不修改远端机器以换取兼容性。

Shell Integration 和 Agent Envelope 的实现要避免相互重复报告。一个命令只产生一个权威 Agent Execution Result；Shell Integration 作为辅助证据和人工命令跟踪来源。

### 4.4 命令状态机

必须采用显式状态机，禁止用布尔值或单一 timeout 表示所有状态。

- Queued：等待执行权。
- ApprovalPending：等待用户审批。
- Approved：已审批，尚未发送。
- Dispatched：命令已写入 PTY，尚未确认开始。
- Running：收到匹配的开始标记。
- AwaitingInput：需要密码、确认、TUI 输入或人工交互。
- CompletedSuccess：收到结束标记，退出码为 0。
- CompletedFailure：收到结束标记，退出码非 0。
- Interrupted：用户中断且确认 Shell 已恢复可用。
- TimedOutRunning：达到软超时阈值，但没有结束证据；命令仍可能运行。
- Unknown：连接断开、标记缺失、generation 不一致或执行结果无法证明。
- ShellExited：PTY / Shell 进程退出。

核心规则：

- “完成”必须有匹配结束标记和退出码。
- “成功”必须有明确退出码 0。
- 软超时只触发状态提示和 Agent 等待策略，不等于命令失败，也不自动杀进程。
- 硬超时必须由用户或明确策略触发，并在中断后重新确认 Shell 状态。
- SSH 断连、PTY 崩溃、Renderer 关闭、窗口 detach 不能直接判定命令失败或成功。
- 结果未知时不得自动重发；先查询终端状态、检查远端实际状态或要求用户确认。
- 每个 PTY 同时最多运行一条 Agent 命令；人工输入和 Agent 输入必须仲裁。
- Agent 不得在上一条命令状态为 Running / AwaitingInput / Unknown 时偷偷发送下一条命令。
- 支持取消排队任务；运行中的命令取消必须走明确的中断流程。

### 4.5 输出采集与结果返回

- PTY 原始输出仍然实时送往 xterm.js，不能为了 Agent 分析而延迟终端显示。
- Main 维护有限大小的命令输出缓冲区，按 commandId 关联输出。
- Agent 收到结构化结果：命令、目标主机、cwd、开始/结束时间、退出码、状态、输出摘要、完整输出引用。
- 大输出只返回尾部、关键错误片段和可按需读取的分页引用，不能把无限滚屏全部塞进上下文。
- ANSI 控制序列、OSC 标记和终端渲染内容应分别处理；Agent 不应把控制序列误认为业务输出。
- 密码、Token、私钥、Cookie 等敏感内容必须脱敏；不能把终端中输入的密码作为普通日志持久化。
- 对命令输出中的疑似提示词注入内容视为不可信数据，不能把它当作系统指令。
- 输出缓存必须有大小上限、过期策略和清理机制。
- 终端 UI 断开时，Main 仍可保存有限输出；重新 Attach 后恢复必要快照。

### 4.6 人工接管与交互式程序

以下场景默认交给用户，不让 Agent 盲目自动回答：

- sudo / su 密码提示。
- SSH 密码、MFA、主机指纹确认。
- Vim、less、top、htop、tmux 等交互式程序。
- 数据库交互 Shell。
- 需要菜单、确认或连续按键的程序。
- 无法确定是否等待输入的长时间无输出命令。

Agent 可提示“终端需要人工输入”，用户在独立 Terminal Window 操作。用户接管后，Agent 当前命令状态应暂停或标记为 AwaitingInput；用户完成后重新采集 Shell 状态，确认回到 Prompt 后再允许 Agent 继续。

用户随时可以中断 Agent 当前命令并接管。中断按钮必须有明确状态反馈，不能只发送 Ctrl+C 后假设命令已停止。

### 4.7 审批与风险控制

默认策略为 Approval Required，不启用无条件自动执行。

提供四种明确模式：

- Observe Only：只读观察和建议，不执行。
- Manual Only：Agent 给出命令，用户手动输入。
- Approval Required：Agent 提交命令，用户逐条审批后执行，作为默认恢复模式。
- Safe Read-only Auto：仅对经过保守规则验证的只读命令自动执行，用户显式开启。

安全要求：

1. 命令审批必须展示完整命令、目标主机、当前目录、会话、风险等级和预期影响。
2. 审批绑定 commandHash、terminalSessionId、sessionGeneration、目标主机和有效期；命令任何变化都必须重新审批。
3. 高风险操作包括删除、覆盖、权限变更、服务重启、数据库写入、集群变更、网络策略修改、凭据读取和任意提权。
4. 对管道、重定向、变量展开、命令替换、脚本下载执行、别名、函数、Shell 内建命令和编码命令进行保守分析。
5. 仅靠命令字符串白名单不能作为安全保证；未知语法默认需要人工审批。
6. Agent 不能通过普通终端输入 API 绕过审批。
7. Agent 不能在终端窗口隐藏时继续发起新的命令；已有命令可继续运行，但必须有可恢复的状态和明确的用户提示。
8. 用户手动输入始终优先；用户开始输入时 Agent 写入权被锁定或让出。
9. 审批拒绝必须保证 PTY 没有收到命令内容。
10. 审计日志记录审批人、命令哈希、目标、风险、结果和退出码；敏感参数必须脱敏。

### 4.8 业务成功与命令成功必须分开

Shell 退出码 0 只代表命令进程按 Shell 约定成功返回，不代表运维目标已经达到。

例如：

- kubectl apply 返回 0，不代表 Pod 已 Ready。
- systemctl restart 返回 0，不代表服务健康。
- mongosh 写入命令返回 0，不代表复制集状态满足目标。
- SSH 连接成功，不代表目标主机上的业务服务正常。

Agent 必须根据任务目标追加独立验证步骤，并分别报告：

- Command Result：命令执行结果。
- Task Verification：业务目标验证结果。
- Overall Result：任务是否真正完成。

不得把三者混成一个“成功”标签。

## 5. 阶段一：稳定性与安全（P0）

目标：先建立可恢复、可审计、不会丢失用户会话的底层基础。

### 5.1 工作区和测试基线

- 重新采集 Git 状态、TypeScript、ESLint、安全检查、单元测试和构建结果。
- 找出所有被 .gitignore 忽略的测试文件，逐一确认是否是有效测试或本地证据文件。
- 测试使用临时目录和合成数据，不得读取真实 Desktop 文件。
- 测试产物写入 os.tmpdir() 或测试专用临时目录。
- 将真正的测试规范恢复到 Document/TESTING.md；外置终端说明放回正确文档。
- 为终端、Agent、索引、文件读取、SQLite 建立可重复测试基线。

### 5.2 Main 侧 Session 所有权重构

- 建立稳定 terminalSessionId 和 sessionGeneration。
- 从 WebContents ID 主键迁移到 Main Session Manager。
- 增加 Attach / Detach / Reattach / Close Window / End Session / App Quit 的独立操作。
- Chat Window 和 Terminal Window 都只能通过 Main Attach 已授权会话。
- 终端窗口崩溃、聊天窗口崩溃、Renderer reload、窗口导航分别测试。
- 只有明确结束 Session 或应用真正退出时才清理 PTY。
- 旧 iTerm Adapter 先作为迁移对照保留，确认新窗口完整后再移除正式路径。
- 迁移期间不允许新旧两套执行器同时操作同一个 PTY。

### 5.3 PTY 和 IPC 安全

- 审查 node-pty 创建参数、环境变量、cwd、Shell 参数和退出处理。
- 校验 IPC sender、窗口类型、Session ID、generation 和权限。
- 输入写入集中由 Main 的单写入仲裁器管理。
- 对重复创建、重复 Attach、重复结束、窗口关闭竞态进行幂等处理。
- PTY 输出、输入和状态事件增加 requestId / commandId 关联。
- 对过期事件、旧窗口事件和旧 generation 事件直接拒绝。
- 增加进程退出、SIGINT、SIGTERM、PTY resize、Socket 断开和重连测试。

### 5.4 命令执行安全原型

- 暂不全面开放 Agent 执行。
- 先实现 Bash / Zsh Shell Adapter 的最小原型。
- 验证 OSC 133 / 633 事件识别。
- 验证 Agent Command Envelope 的开始标记、结束标记和退出码。
- 验证普通输出伪造标记、分块输出、ANSI、中文、Emoji、超长输出和无输出命令。
- 验证 SSH 远端临时包装器，不修改远端持久文件。
- 无法可靠识别时必须返回 Unknown / Manual Only。
- 通过安全评审后再进入阶段三的正式 Agent 执行接入。

阶段一完成门槛：Session 生命周期与窗口生命周期解耦；没有跨窗口会话误杀；没有未授权输入路径；Shell 状态识别原型通过边界测试。

## 6. 阶段二：性能与交互体验（P0/P1）

目标：保证双窗口和大量终端输出下，墨巡仍然响应及时、操作丝滑。

### 6.1 独立 Terminal Window

- 新增独立 BrowserWindow 和独立 Renderer 入口。
- 终端 UI 使用 xterm.js。
- 使用现有 node-pty，不重复创建第二套 PTY 后端。
- 终端窗口默认按需创建，不影响聊天窗口冷启动。
- 提供打开、聚焦、隐藏、恢复、关闭窗口、结束会话等明确操作。
- 记忆窗口位置、尺寸、显示器和缩放比例；显示器不存在时回退到可见默认位置。
- 支持两个窗口分别最大化、最小化和跨屏移动。
- Chat Window 只显示终端状态摘要和审批，不嵌入终端内容视图。
- Terminal Window 只承担终端显示和人工交互，不承担 Agent 业务编排。
- xterm.js 通过 ResizeObserver + requestAnimationFrame 合并尺寸更新，避免频繁 PTY resize。
- 终端字体、行高、IME、中文输入法、复制粘贴、快捷键、滚屏和选区必须完整测试。

### 6.2 终端输出流性能

- PTY 输出按块处理，避免每个字符单独触发 IPC。
- 实施自适应批量传输：低延迟交互优先，小块快速刷新；大量输出时批量合并并实施背压。
- 不得为追求吞吐量引入明显键盘回显延迟。
- 终端 UI 和 Main 输出缓冲使用有限内存。
- 滚屏上限可配置，默认选择经过压测的合理值。
- Agent 输出摘要与终端完整滚屏分离，避免重复保存大文本。
- 对高频 resize、输出爆发、ANSI 大量控制序列和长时间 tail -f 做压力测试。
- WebGL 只在实际改善目标设备体验时启用；GPU 失败自动回退到 Canvas。
- xterm.js 不得在 React 每次状态更新时重新创建 Terminal 实例。

### 6.3 聊天与历史消息流畅性

- 对长会话实现虚拟列表或动态高度虚拟化。
- 保留当前滚动锚点，流式输出期间不反复跳动。
- 消息组件、Markdown、代码块和工具结果按需渲染。
- 对大型代码块、日志、JSON 和长终端输出采用折叠与分页。
- 流式消息更新使用节流/批处理，避免每个 token 导致整页重渲染。
- 对历史消息图片、文档预览和重型组件延迟加载。
- 优先修复 1,000 条消息场景下的滚动卡顿；不为了 bundle size 删除组件。

### 6.4 代码索引性能

- 将 Tree-sitter 解析和大型 AST 遍历移出 Electron Main 主线程。
- 优先评估 Electron Utility Process；Worker Thread 作为对照方案。
- Utility Process 崩溃不应影响聊天、终端或数据库。
- 索引全局并发先保守限制为 1，基准测试后再决定是否增加。
- 文件解析增加大小、耗时、内存和语法复杂度预算。
- 支持暂停、取消、恢复和低优先级调度。
- 大文件和二进制文件快速跳过并记录原因。
- 保留增量索引、文件变更检测和数据库事务。
- 搜索结果分页，避免把全项目符号和引用一次性读入内存。
- 索引期间终端输入和聊天输入优先，不允许索引占满 CPU。
- 对项目规模、文件数量、语言、文件大小和内存峰值建立基准数据集。

### 6.5 文件读取与预览性能

- 保留 LocalDocumentReader 的分页、Cursor、路径保护、变更检测和脱敏能力。
- PDF Agent 阅读与 UI 预览统一采用分页接口。
- 禁止通过 IPC 一次传输整份 PDF 的 Base64。
- PDF 页面按需读取、按需渲染，缓存有上限。
- DOCX 解析增加耗时、内存和取消控制。
- 大文件解析放入 Utility Process 或可中断 Worker。
- 文档解析失败必须返回明确原因，不允许卡住整个 Main。
- 文件读取、代码索引和 Agent 上下文读取共用资源预算，但不能互相饿死。

### 6.6 SQLite 与记忆性能

- 审查 SQLite 查询计划、索引、事务、WAL、checkpoint 和长期增长。
- 避免每次 Agent 请求读取全部记忆再在 JS 中计算。
- 评估 FTS5 / 预计算关键词索引 / 增量索引。
- 记忆按全局、项目、集群、会话作用域分层检索。
- 项目上下文不得简单屏蔽所有通用长期记忆；也不得把其他项目的私有知识混入当前项目。
- 对记忆召回设置候选数量、文本长度和时间预算。
- 长期记忆检索不能阻塞终端和聊天主交互。

### 6.7 性能指标

不使用包体积或 bundle size 作为门槛。重点记录：

- 聊天输入到界面显示的延迟。
- 首个模型 token 到达时间。
- 终端键盘输入到本地回显的延迟。
- PTY 输出到 Terminal Window 可见的延迟。
- Terminal resize 完成时间。
- 终端输出爆发时的 CPU、内存和 IPC backlog。
- 1,000 / 5,000 条消息滚动帧时间。
- 代码索引耗时、CPU、RSS 峰值和聊天/终端交互延迟。
- PDF / DOCX 首屏时间和取消响应时间。
- SQLite 查询 P50/P95。
- Main 进程事件循环阻塞时间、长任务数量。
- Renderer FPS、长帧和长任务。
- 连续运行 4～8 小时的内存增长趋势。

建议初始体验目标，最终根据当前设备基线校准：

- 本地终端按键回显 P95 尽量低于 50ms。
- 终端输出可见延迟 P95 尽量低于 100ms。
- 普通 UI 操作保持接近 60 FPS，避免持续超过 50ms 的主线程长任务。
- 大型索引期间仍可正常输入、滚动和切换窗口。
- 终端输出高峰不能造成聊天窗口冻结。
- 同一基准数据下，代码索引 RSS 峰值较此前样本明显下降；目标至少降低 30%，但不得以漏索引或降低正确性换取。
- 所有性能指标必须记录测试数据集、设备、版本和测试步骤，不允许只报告“感觉更快”。

## 7. 阶段三：架构治理与可靠 Agent 执行环境（P1）

目标：恢复 Agent 受控命令执行，完成 Runtime 边界，并降低长期维护成本。

### 7.1 正式接入 Agent Command Executor

- 复用阶段一通过验证的 Shell Adapter 和命令 Envelope。
- 恢复 Agent Bash 工具定义和 Main 侧执行路径。
- 移除当前直接拒绝执行的占位逻辑，但不能删除能力策略和执行拦截。
- Agent 工具只接收结构化命令请求，不允许直接传入任意 PTY 原始字节。
- Agent 执行必须绑定当前 terminalSessionId、generation、host 和 conversationId。
- 一个 PTY 同时只能有一条 Agent 命令运行。
- 每条命令先审批，再发送，再等开始标记，再等结束标记和退出码。
- Agent 收到结果后再决定下一条命令，形成闭环，而不是一次性把多条命令快速写入终端。
- 支持一组多步骤任务，但每一步都必须有独立 commandId、结果和必要的审批。
- 失败后由 Agent 分析结果决定修正，不允许执行器自动重发。
- 如果 Agent 等待命令时会话变化、SSH 目标变化、Shell generation 变化，立即使当前执行请求失效。

### 7.2 超时与重试策略

区分：

- 首次开始等待超时。
- 命令运行软超时。
- 命令运行硬超时。
- Agent 工具调用等待超时。
- SSH 连接超时。
- PTY 进程退出。
- 用户取消。
- Shell 状态无法确认。

软超时只提示“仍在运行/等待状态确认”，不自动中断。硬超时由明确策略或用户确认触发。任何状态未知都不得盲目重试。

命令是否可重试由任务语义决定，而不是仅根据退出码。删除、创建、写入、重启、数据库变更、集群变更等默认不可自动重试。重试前必须先核验目标状态。

### 7.3 终端与 Agent 的并发仲裁

- 用户正在输入时，Agent 命令不能插入。
- Agent 命令运行期间，终端显示明确执行标识。
- 用户输入 Ctrl+C、点击接管或明确开始人工输入时，Agent 让出控制权。
- 如果命令处于 TUI / password / confirmation 状态，Agent 进入 AwaitingInput。
- Agent 不能在一个命令尚未结束时发送下一条命令。
- 终端窗口关闭后，正在执行的命令可继续，但不能发起下一条 Agent 命令；用户重新打开后恢复状态。
- Chat Window 关闭但应用未退出时，Terminal Window 和 PTY 仍然工作。
- 应用退出时必须先停止 Agent 调度，再按顺序结束 PTY。

### 7.4 Agent Runtime 抽象

- 完善现有 src/main/agent/runtime 边界。
- 业务层只依赖统一的 Agent Runtime Interface。
- Pi SDK 类型、Session、Event 和配置不向业务模块扩散。
- 将模型调用、流式事件、工具注册、取消、上下文压缩和会话恢复收敛到 Adapter。
- 为 Pi Adapter 建立 Conformance Test。
- 不在本次计划中更换 Pi；只确保未来可替换。
- Agent 命令工具通过独立的受控工具接口接入，不依赖某个 Agent SDK 的私有 Bash 实现。

### 7.5 大模块渐进拆分

优先处理：

- renderer/src/App.tsx：应用壳、页面组合、弹窗和业务状态分离。
- main/terminal/ipc.ts：IPC 路由、Session 管理、观察、iTerm 迁移、Command Executor 分离。
- main/agent/pi-host.ts：Runtime 生命周期、工具组装、事件桥接分离。
- main/agent/ipc.ts：按会话、工具、队列、审批拆分。
- main/crescent-sqlite.ts：迁移、Repository、数据库生命周期分离。
- main/agent/skills.ts：Skill 安装、更新、校验、索引分离。
- renderer/components/WhaleMonitor.tsx：动画资源、状态和视图分离。

拆分要求：

- 先补测试，再移动代码。
- 每次只拆一个职责域。
- 对外接口保持兼容，避免一次性重写。
- 不引入无价值的抽象层。
- 不以文件行数作为唯一质量指标。

### 7.6 项目、记忆与索引边界

- 项目关联状态必须可见、可重新关联、可解除。
- 项目索引状态与对话关联状态分开存储。
- 对话恢复时重新校验项目路径、身份和索引状态。
- 记忆按 global / project / cluster / conversation 分层。
- 项目记忆必须有来源、置信度、更新时间和失效策略。
- 代码索引、项目知识和长期记忆不能互相覆盖。
- 对索引失效、目录移动、权限变化和文件删除提供可恢复状态。
- 保留人工确认与用户可见的关联状态。

## 8. 阶段四：工程化、测试与发布验收（P1）

目标：每次迭代可复现、可回归、可交付。

### 8.1 测试体系

建立明确脚本分类：

- unit：纯单元测试。
- integration：Main / SQLite / PTY / IPC 集成测试。
- security：安全边界与权限静态检查。
- e2e：真实 Electron 双窗口流程。
- performance：性能基准和压力测试。
- packaging：安装包和原生依赖验证。

CI 必须真正执行可提交的单元测试和安全检查，不能把只运行静态脚本的 npm run test 误称为完整测试。

测试隔离要求：

- 不访问用户真实 Desktop、Documents、SSH 配置和业务目录。
- 默认使用临时目录、伪造主机和合成数据。
- 真实 iTerm、真实 SSH、真实多显示器测试单独标记为本地手动验收。
- 测试不能依赖某台开发机上的固定绝对路径。
- 修正 .gitignore 中误屏蔽所有测试文件的规则；只忽略真正的本地测试产物。
- 测试失败要保留最小复现和日志，不覆盖用户文件。

### 8.2 关键自动化测试

- Session Manager 生命周期和并发测试。
- Chat / Terminal 双窗口 Attach / Detach。
- Renderer crash / reload / navigation。
- PTY 输出分块、背压、resize 和进程退出。
- Shell Integration OSC 事件解析。
- Agent Envelope 匹配和 nonce 校验。
- 退出码 0 / 非 0 / signal / Shell exit。
- 超时、未知、断连、用户中断和重新连接。
- SSH 远端临时包装器。
- 命令审批、审批过期、命令哈希变化和拒绝执行。
- 交互式程序人工接管。
- 用户输入与 Agent 输入并发仲裁。
- 终端输出包含伪造标记、控制字符、ANSI、中文、Emoji。
- 大型日志和长时间 tail -f。
- 代码索引压力和取消。
- PDF / DOCX 大文件分页。
- SQLite 迁移和旧数据兼容。
- 长会话虚拟滚动。
- 多显示器窗口恢复。

### 8.3 发布和构建

- 消除重复构建，但保证每次打包使用当前最新构建产物。
- node-pty 等原生模块必须与目标 Electron ABI 正确 rebuild。
- 验证 macOS x64 / arm64 目标架构。
- 验证 DMG、ZIP、ASAR 和资源完整性。
- 验证独立用户数据目录启动。
- 验证无 iTerm2 安装时，墨巡双窗口终端仍能正常使用。
- 验证应用退出时 PTY、Utility Process、Socket 和临时文件正确清理。
- 验证升级后旧会话数据、配置和数据库迁移。
- 不以安装包大小、Renderer bundle 大小作为失败条件。
- 可以增加有助于启动响应的懒加载，但不能为减小包体积而延迟用户正在等待的功能。

### 8.4 文档更新

至少更新：

- Document/ARCHITECTURE.md：双窗口、Main Session Owner、Agent Command Executor。
- Document/SECURITY_MODEL.md：命令审批、Shell Adapter、PTY 权限和人工接管。
- Document/TESTING.md：真实测试规范。
- Document/EXTERNAL_TERMINALS.md：说明 iTerm 迁移和旧兼容路径。
- Document/RELEASE_OPERATIONS.md：原生模块、双架构和安装包验收。
- 新增终端用户操作说明和 Agent 命令执行状态说明。

## 9. 开源组件和参考项目

只复用经过许可证、维护状态、Electron ABI 和安全审查的组件；不要因为项目相似就整仓复制。

| 项目 / 组件 | 许可证 / 定位 | 计划中的用途 |
|---|---|---|
| node-pty | MIT；当前项目已有 | 保留作为唯一 PTY 后端 |
| @xterm/xterm | MIT；终端模拟器 | 新增终端 UI |
| @xterm/addon-fit | MIT | 自动适配窗口尺寸 |
| @xterm/addon-search | MIT | 终端搜索 |
| @xterm/addon-web-links | MIT | URL 识别 |
| @xterm/addon-unicode11 | MIT | CJK / Emoji 宽度兼容 |
| @xterm/addon-webgl | MIT | 可选 GPU 渲染，性能验证后启用 |
| @xterm/headless | MIT | Main 侧终端解析和 Shell Integration 事件处理，先做原型 |
| VS Code Shell Integration | MIT 项目参考；OSC 133 / 633 协议 | 命令开始、结束、退出码、Prompt 事件设计 |
| CanvasTTY | MIT | Electron + PTY + xterm + Agent 会话架构参考，不照搬画布 UI |
| terminal-use | MIT | headless xterm、命令等待和 Agent 终端状态参考；默认权限不能照搬 |
| Tabby | MIT | 终端会话、渲染和扩展架构参考 |
| OpenHands | MIT | Agent 控制面与执行环境隔离思想参考 |
| Crescent-yunlei/main | 必须先核验仓库 LICENSE 和具体文件版权 | 优先参考命令审批、命令状态、PTY 传输和 Agent 工具实现 |

参考链接：

- https://github.com/xtermjs/xterm.js
- https://github.com/microsoft/node-pty
- https://github.com/microsoft/vscode
- https://github.com/howdeploy/CanvasTTY
- https://github.com/computer-agent-labs/terminal-use
- https://github.com/Eugeny/tabby
- https://github.com/OpenHands/OpenHands
- https://github.com/yunlei0713-oss/Crescent-yunlei/tree/main

许可证要求：

- 先核验每个实际引入的包版本、LICENSE、NOTICE、依赖许可证和 Electron 支持情况。
- Crescent-yunlei 仓库的具体代码在确认许可证前只作为设计参考，不直接复制。
- 不复制 VS Code、Tabby 或其他项目的大段实现而不做许可证审查。
- 依赖采用官方维护包，锁定兼容版本；不要引入多个功能重复的终端模拟器。

## 10. 验收矩阵

### 10.1 双窗口与会话

- [ ] 启动墨巡只打开聊天窗口。
- [ ] 点击终端操作后打开独立 Terminal Window。
- [ ] 两个窗口可分别移动到不同显示器。
- [ ] 终端窗口关闭后 PTY 不退出。
- [ ] 重新打开终端后恢复同一个 Session。
- [ ] 结束会话后 PTY 真正退出。
- [ ] 聊天窗口 Renderer 崩溃不误杀终端。
- [ ] 终端窗口 Renderer 崩溃后可重新 Attach。
- [ ] 应用退出时所有 PTY 被安全清理。
- [ ] 不安装 iTerm2 也能完成全部核心终端操作。

### 10.2 命令识别与结果

- [ ] echo / pwd / cd / export 等基础命令能识别开始和结束。
- [ ] 退出码 0 被识别为 CompletedSuccess。
- [ ] 非 0 退出码被识别为 CompletedFailure。
- [ ] 无输出命令仍能获得明确结束标记。
- [ ] 长时间运行命令持续保持 Running。
- [ ] 软超时不会错误标记失败或成功。
- [ ] SSH 断连标记 Unknown / Interrupted，而不是 Success。
- [ ] Shell 退出与单条命令结束正确区分。
- [ ] 命令输出伪造普通标记不能误判。
- [ ] PTY 分块、ANSI、OSC、中文、Emoji 不破坏解析。
- [ ] 命令结束标记丢失时进入 Unknown。
- [ ] 结果未知时绝不自动重发。

### 10.3 SSH 和交互

- [ ] 本地 Bash / Zsh 支持状态识别。
- [ ] 远端 Bash / Zsh 支持临时包装器时可返回远端退出码。
- [ ] 不修改远端持久配置。
- [ ] sudo / SSH 密码 / MFA 提示转人工接管。
- [ ] Vim / less / top / 数据库交互 Shell 不被错误判定完成。
- [ ] 用户可随时接管和中断。
- [ ] SSH 目标变化后旧审批失效。
- [ ] 不能把本地 Shell 的退出码当作远端命令退出码。

### 10.4 安全

- [ ] 默认 Approval Required。
- [ ] 拒绝审批后 PTY 未收到命令。
- [ ] 修改命令内容后旧审批失效。
- [ ] Agent 不能绕过 Command Executor 写入任意 PTY 字节。
- [ ] Agent 不能创建隐藏的第二 Shell。
- [ ] 终端窗口隐藏时不能启动新的 Agent 命令。
- [ ] 用户输入优先于 Agent。
- [ ] 敏感内容不写入普通日志和长期记忆。

### 10.5 性能与稳定性

- [ ] 本地终端按键回显达到校准后的 P95 目标。
- [ ] 高吞吐输出时聊天输入不冻结。
- [ ] 长会话滚动无明显持续掉帧。
- [ ] 大型索引期间终端输入保持响应。
- [ ] PDF / DOCX 读取可以取消，不阻塞 Main。
- [ ] 连续运行 4～8 小时无持续非预期内存增长。
- [ ] 多窗口反复开关、切换、恢复不泄漏 PTY、IPC Listener 和 Timer。
- [ ] CPU、RSS、事件循环延迟和 Renderer 长任务均有可复现报告。

## 11. 实施顺序与阶段交付物

| 阶段 | 主要交付物 | 通过条件 |
|---|---|---|
| 阶段一：稳定性与安全 | Session Manager 重构、IPC 安全、测试隔离、Shell 状态识别原型 | 会话不误杀，权限不可绕过，状态识别边界测试通过 |
| 阶段二：性能与交互 | 独立 xterm.js Terminal Window、输出背压、历史虚拟滚动、索引/文档性能优化 | 双窗口流畅，主交互不被重负载阻塞 |
| 阶段三：架构与 Agent | Command Executor、审批、Shell Adapter、可靠状态机、Runtime Adapter、模块拆分 | Agent 与用户共用 PTY，真实退出码可验证，未知不重试 |
| 阶段四：工程与发布 | 完整测试、CI、性能报告、macOS 安装包验收、文档 | 回归和发布门禁通过，旧 iTerm 依赖退出正式路径 |

每个阶段都必须形成：

- 实施记录。
- 修改文件清单。
- 测试命令和真实输出。
- 性能对比数据。
- 已知限制。
- 下一阶段风险。
- 回滚方式。

## 12. 给 Codex 的执行约束

1. 先通读本计划和相关现有文档，再检查当前真实代码。
2. 不得把本计划当作允许一次性大规模重写的授权。
3. 严格按阶段执行，每阶段先给出短实施方案，再完成代码和测试。
4. 优先复用 node-pty、现有 Session、观察、审批、队列和 SQLite 能力。
5. 新增 xterm.js 时先完成最小可运行双窗口原型，再迁移完整功能。
6. Agent 执行能力必须先完成安全评审和状态机测试，不能先开放权限再补测试。
7. 任何 Shell 无法确认命令状态时必须 fail closed，转人工接管或 Unknown。
8. 不得在远端服务器写入 Shell 配置或安装常驻脚本。
9. 不得为了“提高成功率”自动重试结果未知的命令。
10. 不得以包体积为由删减依赖、组件或资源；只优化运行时性能和用户等待时间。
11. 不得删除已有功能、测试证据、用户文档或未提交改动。
12. 不得擅自 git commit、push 或发布。
13. 如果参考仓库或组件许可证不明确，先报告并寻找兼容替代，不得直接复制。
14. 每次改动后运行与改动范围对应的测试；阶段结束运行完整回归。
15. 如果性能优化与正确性冲突，优先保证正确性，再通过架构和调度优化性能。

## 13. 最终产品判断标准

改造完成后，用户应当感觉到：

- 打开墨巡后聊天窗口响应迅速。
- 需要终端时，一键打开独立终端窗口。
- 终端就像一个原生终端应用一样顺滑，但完全属于墨巡。
- 用户和 Agent 看到的是同一个 Shell、同一个 SSH 会话和同一份输出。
- Agent 每次执行命令都有明确开始、结束和退出码。
- Agent 不会因为“几秒没输出”就误判命令完成。
- Agent 不会因为超时就偷偷重复执行危险命令。
- 命令需要密码、确认或交互时，用户可以自然接管。
- 大型项目索引、长对话、长日志和文件解析不会拖慢终端和聊天。
- 运行数小时后仍然稳定，窗口关闭和恢复不会丢失会话。

**本次改造的成功标准不是“终端能显示命令”，而是“墨巡能够在同一个真实终端会话中，安全、准确、可观察、可中断地与 Agent 协作，并且整个应用始终保持流畅响应”。**
