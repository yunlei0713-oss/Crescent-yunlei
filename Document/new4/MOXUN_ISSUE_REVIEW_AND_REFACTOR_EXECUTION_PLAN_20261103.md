# 墨巡（MoXun）问题修复与体验收敛执行计划

> 日期：2026-11-03  
> 项目：/Users/xusong.yu/Desktop/moxun-test  
> 交付对象：Codex  
> 本文状态：待执行计划；不是实施报告，也不代表源码已修改  
> 范围：根据用户提供的六张界面截图、iTerm 窗口关闭行为确认，以及本轮源码审查结果制定

## 0. 本轮目标

本轮不是重新设计墨巡，也不是增加一批新功能，而是把当前已经存在的会话、外置终端、Guided Ops、文件审批和品牌资源整理到一致、可预测的状态。

核心目标：

1. 修复 iTerm 窗口关闭后，墨巡仍保留共享 PTY、会话绑定和观察状态的问题。
2. 让对话本身拥有稳定身份和持久化记录，不再依赖某一个 Terminal Tab 是否存在。
3. 移除 Guided Ops 历史步骤的 30 条硬截断，改为 SQLite 持久化和分页读取。
4. 让主动排查建议支持 1～3 条真实有效的选项，不为凑数量制造建议。
5. 简化文件审批交互，消除用户无法判断按钮为何禁用的问题，同时保留 Main 进程的安全校验。
6. 收敛截图中的面板留白、终端选择器与项目会话重复感、侧栏收起后的顶部空白。
7. 确认 Dock 旧月亮图标的真实来源，修复运行中的开发版或打包版资源不一致。
8. 只对本轮触及的模块做必要拆分，不推翻 new2/new3 已经完成的架构和清理成果。

## 1. 当前基线与执行边界

### 1.1 本轮审查确认的项目事实

- 产品采用聊天优先布局，iTerm 是唯一可见的人工终端。
- Agent 不具备终端执行、输入、发送回车或中断权限；用户自己在 iTerm 中操作。
- 已有 iTerm 绑定属于只读观察；解除已有 iTerm 绑定不得向用户 Shell 发送 exit、Ctrl+C 或其他输入。
- 本地文件修改由 Agent 提出变更，用户审阅 Diff，Main 进程再次校验后执行。
- Main 负责 PTY、iTerm、授权、SQLite 和文件写入；Preload 只暴露有类型的 IPC；Renderer 负责交互呈现。
- 外置终端目前分为 Main-owned shared PTY 和只读绑定 existing iTerm 两种模式。
- 当前 Electron macOS 打包目标、应用 ID、签名/公证策略和 native 模块边界不属于本轮重设计范围。

### 1.2 当前代码中已确认的关键问题

| 问题 | 当前代码事实 | 直接影响 |
|---|---|---|
| iTerm 关闭窗口不结束共享终端 | main/terminal/external/shared-session.ts 的同步尺寸检查失败后仅吞掉错误，注释明确保留内部 PTY 供重新打开 | iTerm 窗口已关闭，但 Main 侧 PTY、Socket 和会话仍可能存在 |
| existing iTerm 关闭后 UI 绑定未清理 | observed-session.ts 检测不到 UUID 时会触发 onExit；Renderer 生命周期回调只清 sessionId、terminalReady、terminalExited，没有同步清 external | 对话仍显示已关闭的 iTerm 绑定 |
| 对话历史可能不可见 | terminal-tabs.ts 的 toStoredSessionTabs() 过滤掉所有 external Tab；session history 查询以 session_tabs 为入口 | agent_logs 已写入但缺少 session_tabs 元数据时，历史列表和详情均查不到 |
| 根 Tab 关闭可能造成历史分裂 | reassignSessionRootOnClose() 只在 Renderer 内把 agentLog 复制给新根 Tab，没有同步迁移 SQLite 记录 | 运行态看似保留，重启后历史可能仍挂在旧 Tab ID |
| Guided Ops 只保留 30 步 | guided-ops.ts 使用 slice(-30) | 第 31 步开始最早记录被永久从该内存快照中移除 |
| Guided Ops 历史不持久化 | GuidedOpsService 使用进程内 Map；有 30 分钟过期和 100 项淘汰 | 应用重启、Map 淘汰或过期后不能依赖内存恢复完整步骤 |
| 主动建议强制三条 | pi-guided-ops.ts alternatives schema 要求恰好 2 条；guided-ops.ts proactive 模式要求总数恰好 3 条 | 只有 1～2 个有效方向时模型仍被迫凑数 |
| 审批按钮有明确禁用条件 | FileChangeReview.tsx 要求所有 strongApproval 路径均在 strongPaths 中；Main 的 FileChangeApprovalService 再次检查 | 用户不勾选逐文件复选框时，批准按钮保持禁用 |
| 品牌资源链路已有实现 | ProductLogo 使用 moxun-mark.png；generate-icons.cjs 从定稿山水母版生成资源；开发启动会 patch Electron Dock 图标 | 截图仍显示旧月亮图标，不能直接认定 Renderer 资源错，必须检查实际运行 Bundle 和 LaunchServices |
| 顶部终端栏与项目会话同名 | ConversationTerminalSelector 显示当前对话外置终端；ProjectSidebar 显示项目下的聊天会话 | 两者语义不同，但标题相似，视觉上像重复会话 |
| 侧栏收起后顶部空白 | App.tsx 使用固定 h-12 的 app-titlebar；品牌区只占侧栏宽度，其余横向区域没有操作内容 | 侧栏收起时主工作区上方仍保留较大的空白标题区域 |

### 1.3 本轮审查时的工作区状态

本轮检查时 Git 工作区没有显示未提交改动，最新提交为 048989a（bug修复）。本轮只创建本计划文档，不修改任何源码、配置、图片、图标、数据库、依赖或构建产物。

Codex 开始执行时必须重新检查 Git 状态；不得假设用户工作区仍与本计划编写时一致。

### 1.4 必须先阅读的现有资料

按以下顺序阅读，避免重复实施或破坏已有边界：

1. Document/ARCHITECTURE.md
2. Document/SECURITY_MODEL.md
3. Document/EXTERNAL_TERMINALS.md
4. Document/TESTING.md
5. Document/new2/MOXUN_FINAL_POLISH_AND_ACCEPTANCE_PLAN_20261101.md
6. Document/new2/MOXUN_FINAL_POLISH_IMPLEMENTATION_REPORT_20261101.md
7. Document/new3/MOXUN_PROJECT_CLEANUP_AND_QUALITY_REFACTOR_PLAN_20261101.md
8. Document/new3/MOXUN_PROJECT_CLEANUP_AND_QUALITY_REFACTOR_IMPLEMENTATION_REPORT_20261101.md
9. Document/new3/MOXUN_TERMINAL_CONTINUITY_AND_MULTI_TERMINAL_REPORT_20261101.md
10. Document/new3/MOXUN_CLEANUP_AUDIT_20261101.md

new2/new3 中已有的清理、Provider UI 提取、Renderer owner 生命周期、历史消息分页、终端恢复、真实 iTerm/SSH 和性能测试结果应作为既有基线引用，不要重新做一遍。历史报告中的失败、跳过和未验收项也必须保留原状，不得用本轮测试倒改历史结论。

## 2. 产品行为不变量

### 2.1 对话、终端、观察授权必须是三个独立对象

本轮需要把以下概念明确分开：

| 对象 | 表示什么 | 生命周期 |
|---|---|---|
| Conversation | 用户与 Agent 的聊天上下文、消息、运行记录、项目归属和历史 | 可以长期保存、关闭后仍可从历史恢复 |
| Terminal session | 某一个 iTerm Session UUID 或 Main-owned PTY 对应的人工终端 | 可以独立于对话存在或结束 |
| Observation grant | 允许 Agent 读取特定终端证据的短时授权 | 默认 off；暂停、撤销、身份变化或终端退出时失效 |

不得继续用一个 Terminal Tab ID 同时充当聊天身份、终端身份、历史记录主键和协作授权归属。

### 2.2 用户确认的 iTerm 关闭行为

用户已进一步明确：**shared-session.ts 当前“关闭 iTerm 窗口后保留 Main 管理的 PTY，允许重新打开”的行为应保留，不应改成窗口关闭即杀死 PTY。** 本轮要补齐的是可见的会话状态和明确的“重新打开终端 / 结束终端会话”操作。

必须区分两类外置终端：

**A. 墨巡创建的 shared PTY（Main-owned）**

- iTerm 窗口关闭只表示终端前端窗口关闭，不表示底层 Shell/PTY 会话结束。
- 关闭对应 iTerm 窗口后，Main-owned PTY、Shell 进程、私有 Socket、临时目录、TerminalSessionManager 中的会话对象及其必要缓冲状态继续保留。
- 不能调用 shared-session.kill()，不能销毁 Socket/临时目录，不能从 TerminalSessionManager 删除该会话，也不能向 Shell 注入 exit/Ctrl+C。
- 以精确 iTerm Session UUID 确认窗口已关闭后，将会话状态转为“窗口已关闭 / 会话仍在运行 / 可重新打开”；清除旧 iTerm 前端绑定，暂停该窗口的尺寸同步和观察，撤销旧 ObservationGrant 并清除实时证据，避免把已关闭窗口当作仍可观察的终端。
- 用户点击“重新打开终端”时，必须复用原来的 Main-owned PTY、Shell 进程和 Socket；恢复原工作目录、Shell 环境、正在运行的前台任务和可用滚动缓冲，不得新建一个空 PTY 来冒充恢复。
- 重新打开时由 iTerm 创建新的窗口/Session UUID；Main 将新 UUID 绑定到原有稳定 shared session ID，并重新启动该窗口的尺寸同步和 liveness 检查。
- 重新打开后 ObservationGrant 默认保持关闭；用户必须主动重新启用观察，不能继承窗口关闭前的授权。
- 只有用户明确点击“结束终端会话”并通过确认，或应用退出时既有的 Main/PTY 清理策略执行，才结束底层 shared PTY。结束操作必须幂等并释放 PTY、Socket、临时目录和 Main 会话状态。
- 如果 Main 进程退出时无法跨进程保留该 PTY，应遵循 new3 已有的 Main/reaper 清理策略；本轮不承诺跨墨巡应用重启恢复 Shell，也不得为了跨重启恢复而引入未经设计的守护进程。

**B. 用户自己创建并由墨巡绑定的 existing iTerm**

- 该 Shell 不归墨巡所有。用户关闭对应 iTerm Session 后，Session UUID 消失，墨巡解除绑定、撤销观察授权、清除实时证据并显示“终端已关闭”。
- 不保留或伪造一个 Main-owned PTY；不能通过“重新打开终端”恢复已经结束的用户 Shell。
- 如需继续操作，用户应重新选择一个仍存在的 iTerm Session，或显式创建新的终端。
- detach 继续只解除墨巡绑定，不向 Shell 发送任何输入。

**共同约束**

- 以 iTerm Session UUID 为唯一匹配依据，不能只按窗口标题、Tab 标题、连接名称或当前焦点判断。
- 关闭一个 iTerm 窗口时，只处理该窗口内已确认关闭的受管 UUID；其他窗口、Tab、分屏和会话不得被停止。
- 不退出整个 iTerm.app，不调用全局 kill，不遍历后批量关闭所有 iTerm 会话。
- iTerm.app 整体退出时，shared PTY 转为“窗口已关闭 / 可重新打开”，不因 iTerm.app 退出而自动结束；existing iTerm 绑定则解除。
- Automation 权限拒绝、iTerm 暂时无响应、脚本执行超时不等同于窗口已关闭；不能把暂时不可观测误判为终端退出。
- 所有共享会话必须在墨巡 UI 中可见，并提供明确的“重新打开终端”和“结束终端会话”入口；不能只在 Main 内存中保留一个用户找不到、无法管理的 PTY。

### 2.3 操作语义必须明确区分

| 操作 | shared PTY（墨巡创建） | existing iTerm（用户创建） |
|---|---|---|
| 暂停观察 | 停止采集证据、撤销当前观察窗口内的可读内容；PTY 和 iTerm 窗口不受影响 | 同左；不关闭 Shell |
| 关闭 iTerm 窗口 | 关闭前端窗口；Main 保留原 PTY、Shell、Socket 和会话状态，标记为可重新打开 | 用户 Shell 随窗口关闭；墨巡清理绑定和观察状态 |
| 重新打开终端 | 重新打开 iTerm 并接回原 shared PTY，不创建新 Shell | 不提供恢复旧 Shell 的能力；用户重新选择或创建终端 |
| 解除关联 | 解除当前 Conversation 与终端的关联；若 PTY 仍运行，Main 继续托管并在 UI 提供管理入口 | 只 detach；不向 Shell 输入任何字符 |
| 结束终端会话 | 用户明确确认后结束 Main-owned PTY/Shell，释放 Socket、临时目录和会话状态 | 不提供代替用户结束 Shell 的能力；只能解除墨巡绑定 |
| 结束对话 | 归档 Conversation；不隐式结束仍运行的 shared PTY，遗留会话必须仍可从墨巡 UI 找到并重新打开/结束 | 解除 Conversation 绑定；不关闭其他 iTerm Shell |

“关闭 iTerm 窗口”“解除关联”“结束终端会话”“结束对话”是四种不同操作。不得用一个“结束协作”按钮同时表达四种语义。

结束 shared PTY 必须有明确确认文案，说明会终止该 Shell 及其前台任务，并释放对应资源。关闭窗口、关闭 Conversation、暂停观察、切换终端均不得隐式触发这一操作。

### 2.4 安全不变量不得改变

- Agent 永远没有终端执行、输入、发送回车、粘贴执行或中断权限。
- Agent 的命令建议只是文本；只能由用户复制并在 iTerm 人工执行。
- 观察授权必须绑定 owner、Conversation、Terminal Tab、Session UUID、session generation 和目标身份。
- 关闭或切换终端后，旧授权、旧证据、旧建议不得复用。
- 文件写入仍必须经过用户审批和 Main 层校验。
- Renderer 的按钮禁用、提示词、复选框都不是 Main 安全边界的替代品。
- 历史记录可以持久化建议和脱敏元数据，但不得持久化原始终端输出、未脱敏凭据或观察授权本身。

## 3. 截图问题映射与工作包总览

| 工作包 | 截图 | 目标 | 优先级 |
|---|---|---|---|
| A. Dock 图标一致性 | image-1 | 找出 Dock 旧月亮图标的实际来源并统一品牌 | P1 |
| B. Guided Ops 面板密度 | image-2 | 消除过高留白，让初始状态按内容自适应 | P1 |
| C. 文件审批交互 | image-3 | 从逐文件勾选改为完整 Diff 后一次批次确认 | P0 |
| D. Guided Ops 建议与历史 | image-2、image-4 | 建议 1～3 条；历史不再丢失，支持分页 | P0 |
| E. Conversation 持久化 | image-4、image-5 | 对话与终端 Tab 解耦，历史不依赖 external Tab 是否被保存 | P0 |
| F. iTerm 生命周期 | image-5、用户确认 | shared PTY 关闭窗口后保留并可重新打开；增加明确的重新打开/结束入口；existing iTerm 关闭后解除绑定 | P0 |
| G. 会话导航和关闭入口 | image-5 | 让项目会话与终端目标的语义清楚，提供可用的结束对话入口 | P1 |
| H. 标题栏空间 | image-6 | 收敛侧栏收起时的顶部空白，同时保留 macOS 窗口拖动/控制区域 | P1 |
| I. 有界结构整理 | 涉及 App、Terminal IPC、SQLite | 只抽离本轮真正需要的生命周期与持久化职责 | P2 |
| J. 文档和回归验收 | 全部 | 更新架构说明、测试矩阵和实施报告 | P0 |

## 4. 工作包 A：修复 Dock 旧月亮图标

### 4.1 当前实现与判断

已确认：

- Renderer 的 ProductLogo.tsx 使用 src/renderer/src/assets/moxun-mark.png。
- scripts/generate-icons.cjs 以 Document/new/brand/source/moxun-mountain-river-master.png 为唯一母版。
- 生成目标包括 build/icon.png、resources/icon.png、Renderer moxun-mark.png、moxun-logo.png、build/icon.icns 和 Windows favicon。
- macOS 开发启动的 prestart/predev 会执行 prepare-development-icons.cjs，先生成资源，再 patch Electron.app 的 Dock 图标。
- scripts/patch-macos-app-icon.cjs 会写入新的哈希图标文件、更新 Info.plist 的 CFBundleIconFile，并在需要时刷新 LaunchServices。
- electron-builder.yml 的 mac.icon 指向 build/icon.icns。
- src/main/app-icons.test.ts 已覆盖资源生成、ICNS 结构、开发 Bundle patch 和幂等行为；其中部分原生测试仅在 macOS 执行。

因此，截图中侧栏已显示山水图标、Dock 仍显示月亮，优先怀疑当前 Dock 对应的运行 Bundle 或 LaunchServices 缓存仍是旧版本，而不是先重画图标。

### 4.2 Codex 执行步骤

1. 检查当前运行的墨巡/Electron 进程路径、Bundle Identifier 和实际 Bundle 路径。
2. 分别检查开发版 Electron.app 和当前打包版 .app 的 Contents/Info.plist。
3. 读取 CFBundleIconFile 指向的真实 ICNS 文件，计算 SHA-256，并与 build/icon.icns 比较。
4. 检查 Contents/Resources/electron.icns、icon.icns 和哈希命名图标是否一致。
5. 检查 build/icon.icns 是否确实由定稿山水母版生成；检查 Renderer moxun-mark.png 与母版是否一致。
6. 核对当前运行实例究竟是旧安装包、旧开发 Bundle、Dock 中固定的旧应用副本，还是 LaunchServices 缓存。
7. 仅修复确认有问题的当前 Bundle/资源生成链。若资源正确而 Dock 缓存过期，针对该 Bundle 执行受控 LaunchServices 刷新并重新启动该应用。
8. 验证开发版与打包版使用正确图标；不要改变 com.crescent.app 正式 Bundle ID 或 com.crescent.moxun.dev 开发 Bundle ID。
9. 不要通过 app.dock.setIcon() 代替 Bundle 图标修复；不要清空全局 LaunchServices 数据库；不要删除用户 Dock 配置。

### 4.3 验收

- Dock 图标显示定稿山水标识，不再显示月亮。
- 窗口缩小/最小化、Dock 固定图标和 Finder 应用图标一致。
- Renderer 侧栏品牌图标仍正确。
- 开发版和打包版的 Bundle ID 不互相覆盖。
- 图标生成脚本可重复运行且结果一致。
- 记录实际运行 Bundle 路径、CFBundleIconFile、图标 SHA-256 和人工截图。仅通过资源单元测试不能宣称 Dock 真机验证通过。

## 5. 工作包 B：压缩下一步排查建议面板

### 5.1 当前问题

截图 image-2 中，下一步排查建议区域占据很大的垂直空间。初始状态实际上只有标题、说明、问题提示和一个开始按钮，按钮下方仍有大量空白。

当前实现位置：

- src/renderer/src/components/GuidedOpsPanel.tsx
- src/renderer/src/components/ChatWorkspace.tsx
- src/renderer/src/components/AgentLogList.tsx
- src/renderer/src/assets/main.css

GuidedOpsPanel 自身使用 mt-6、pt-5，空状态使用 py-5。不要在没有检查父容器布局前，就认定某个固定高度是唯一原因；需检查 AgentLogList 的 primaryContent 插槽、flex 布局、min-height、justify-content 和实际计算高度。

### 5.2 改造要求

1. 初始无建议状态按实际内容高度收缩，不设置大块固定 min-height。
2. 标题、状态说明、问题提示和开始按钮保持清楚的层级，但减少不必要的上下间距。
3. 将“暂停主动建议”放在标题同一行，不占用独立垂直区域。
4. 当前无建议时，状态提示与“描述问题开始排查”按钮应紧凑排列。
5. 有建议时，推荐项和备选项按 1～3 条实际内容渲染，不预留三张空卡片。
6. 终端目标、主机、工作目录等状态信息保留，但移入紧凑的状态行。
7. 证据时间线和历史步骤继续折叠显示；默认不要把长历史撑开主工作区。
8. 观察不可用、观察暂停、建议过期等状态应有短而明确的提示，不用大段说明撑高面板。
9. 窄窗口下允许自然换行，不让按钮挤压标题；桌面宽屏下避免无意义的大面积空白。

### 5.3 验收

- 无建议、单建议、两建议、三建议四种状态分别截图。
- 1920×1080、1440×900 和较窄窗口下均无大块空白或横向溢出。
- 面板高度随实际内容变化，不通过负 margin 或遮挡消息实现。
- Composer 固定位置不受影响；聊天滚动、回到最新和历史加载不回归。
- 不改变观察授权和建议有效性校验。

## 6. 工作包 C：简化文件审批为一次批次确认

### 6.1 当前根因

src/renderer/src/components/FileChangeReview.tsx 为每一个 strongApproval 文件渲染单独复选框。批准按钮禁用条件要求所有 strongApproval 路径均在 strongPaths 中。

src/main/security/file-change-approval.ts 的 FileChangeApprovalService.decide() 也会再次校验这些路径。截图 image-3 中按钮灰色，是因为复选框尚未勾选，不是按钮点击事件没有绑定。

当前 strongApproval 操作包括 update、overwrite、delete、rmdir、move。create/mkdir 的风险规则应继续由 Main 根据真实操作判断，不得为了简化 UI 而错误降低风险等级。

### 6.2 目标交互

将“逐文件勾选”改为“逐项审阅 Diff + 一次确认整个变更批次”。

推荐布局：

1. 顶部显示本次审批数量、Agent 变更目的和影响摘要。
2. 每个文件独立展示操作类型、完整路径、目标路径、Diff。
3. 原始内容/新内容继续支持展开查看。
4. 对覆盖、删除、移动、目录删除等高影响操作，在文件清单中显示风险标记。
5. 在审批区域底部集中显示本次批次涉及的高影响文件和操作类型。
6. 使用一个批次确认复选框，文案明确表示用户已经审阅本次全部 Diff，并允许执行本次列出的全部变更。
7. 只有批次确认完成、审批未过期且不处于 busy 状态时，批准按钮才启用。
8. 拒绝、要求调整、填写调整意见的能力继续保留。
9. 如果变更项很多，批次摘要必须列出全部路径，不能只显示前几个文件后就让用户盲批。
10. 用户展开查看完整文件、滚动审批内容或切换语言时，不得意外清空已经勾选的批次确认；但请求 digest 变化后必须清空确认。

### 6.3 Main 安全校验

- 不删除 FileChangeApprovalService 的 Main 端校验。
- 继续检查 request ID、owner、run、digest、过期时间、待处理状态和请求是否仍然有效。
- 继续校验每个路径、目标路径、父目录、symlink、文件原始身份和内容 hash。
- 继续校验移动目标不存在；覆盖目标必须通过独立审批流程。
- 批次确认时，Renderer 将全部 strongApproval 路径作为 strongPaths 发送；Main 对所需路径做集合校验，不能只信任按钮是否启用。
- 建议对 strongPaths 做去重和精确集合比较，避免重复、缺失或额外路径造成歧义。
- 变更内容或文件原始状态发生变化时，旧审批立即失效，必须重新生成 Diff 并再次确认。
- mutation queue、逐项应用、遇错即停、已应用路径报告和写后验证继续保留。
- 不改变用户对本地文件修改必须批准的既有约束。

### 6.4 测试与验收

- 单个 update、多个 update、update+delete、move、overwrite、mkdir/create 分别验证。
- 无需强确认的批次不出现无意义复选框。
- 存在 strongApproval 的批次必须完成唯一批次确认才可批准。
- 未确认时按钮禁用并明确说明原因。
- 请求过期、digest 变化、文件 hash 变化、owner 不匹配、重复提交均被 Main 拒绝。
- 拒绝/要求调整不会修改文件。
- 批次批准后只应用请求中列出的变更，应用结果和部分失败报告准确。
- UI 测试和 Main 安全测试分别覆盖，不能只测按钮状态。

## 7. 工作包 D：Guided Ops 建议数量与历史持久化

### 7.1 建议数量改为 1～3 条

当前相关位置：

- src/main/agent/pi-guided-ops.ts
- src/main/agent/guided-ops.ts
- src/shared/guided-ops-types.ts
- src/main/agent/guided-ops.test.ts
- src/renderer/src/components/GuidedOpsPanel.tsx

当前工具 schema 要求 alternatives 恰好两项，Main 的 proactive 校验也要求总建议数量恰好三条。

改造要求：

1. 总建议数允许 1～3 条，包含第一条推荐建议。
2. alternatives 允许 0～2 条；不传 alternatives 时即为单条建议。
3. 不允许空建议、重复命令或用措辞变化伪装重复方向。
4. 第一条始终是模型推荐的主方案；其余是可选择的替代方向，不是执行顺序。
5. 有唯一最佳方向时只返回一条；有一个独立备选方向时返回两条；确有三个独立方向时才返回三条。
6. Prompt、TypeBox schema、Main 校验、Shared 类型、Renderer 显示和测试统一改成同一规则。
7. proactive 模式和用户主动提问模式都遵守总数 1～3 条；不能只有 proactive 模式特殊强制三条。
8. UI 不显示占位空卡片，不出现“还差两条建议”之类凑数提示。
9. 风险标签仍是展示分类，不代表命令可执行；保留现有命令文本安全检查、secret redaction 和目标身份校验。

建议调整 pi-guided-ops.ts 的工具描述为“提供一条推荐命令，可选提供最多两条有实质差异的替代方向”。alternatives 的 Type.Array 最大数量为 2，不再设置必须等于 2 的最小数量。

### 7.2 历史步骤的当前问题

src/main/agent/guided-ops.ts：

- GuidedOpsService 使用 Map 保存会话。
- propose() 将历史追加后执行 slice(-30)。
- begin() 在 Map 达到 100 个会话时淘汰最早的会话。
- read() 在 changedAt 超过 30 分钟时删除内存会话。
- 历史步骤只存在内存 snapshot.history，没有 SQLite 表。
- step 编号从内存 history 的最后一项计算；Map 淘汰或重建后无法保证连续。

截图 image-4 中只显示历史步骤 30 条，且最早可见步骤从 16 开始，说明当前 UI 展示的是截断后的历史，不是完整记录。

### 7.3 SQLite 持久化目标

新增独立 Guided Ops 历史表，建议名称 guided_ops_steps。

建议字段：

| 字段 | 类型/用途 |
|---|---|
| proposal_id | TEXT PRIMARY KEY；建议唯一 ID |
| conversation_id | TEXT NOT NULL；稳定对话 ID |
| terminal_tab_id | TEXT NOT NULL；当时建议对应的终端 Tab |
| run_id | TEXT NOT NULL；产生建议的 Agent Run |
| step_number | INTEGER NOT NULL；对话内连续步骤编号 |
| created_at | INTEGER 或 TEXT；创建时间，统一格式 |
| goal | TEXT NOT NULL；脱敏后的当前目标 |
| proposal_json | TEXT NOT NULL；完整脱敏后的 CommandProposal |
| state | TEXT NOT NULL；建议当前状态/最终状态 |
| updated_at | INTEGER 或 TEXT；状态更新时间 |

索引建议：

- conversation_id + created_at + proposal_id
- conversation_id + step_number 唯一约束
- terminal_tab_id + created_at
- run_id

step_number 必须在 SQLite 事务内分配，不能依赖内存数组长度。并发/重复 run 不得产生重复步骤编号。

### 7.4 持久化内容边界

可以保存：

- proposal ID、run ID、conversation ID、terminal Tab ID。
- 步骤编号、时间、目标摘要。
- command、purpose、risk、expectedOutput、onUnexpected。
- judgment、goal、target 的必要非敏感元数据。
- observationRequired、valid 的历史状态，以及状态变化记录。

禁止保存：

- 原始 TerminalEvidence。
- 未脱敏终端输出、密码、Token、私钥、认证提示内容。
- ObservationGrant、授权凭据或可恢复授权的对象。
- 当前 PTY 内存缓存、Socket 数据和 iTerm 原始快照。

保存前继续使用 redactSensitiveText；命令仍需 validateSuggestionCommand 和 suggestionSafety。历史记录只用于查看，不得变成可一键执行的命令队列。

### 7.5 内存与数据库职责拆分

- GuidedOpsService 的 Map 只保存当前正在分析的状态、当前 proposal、当前目标身份和当前 run 状态。
- 历史列表必须从 SQLite 查询，不再依赖 Map 中的 snapshot.history。
- 内存 Map 的 30 分钟 TTL 和 100 项容量可以继续作为运行态缓存治理策略，但不得影响已经持久化的历史。
- begin() 需要读取该 conversation 的最新目标/步骤编号，或从持久化层获取下一步编号。
- propose() 先完成 Main 端验证，再以事务写入历史；持久化成功后才向 Renderer 发布成功状态。
- action() 对 wait、skip、interrupt、complete 等状态变化进行持久化更新；如果只保存初始建议，也必须至少保证历史步骤不会因为状态更新而丢失。
- Map 被淘汰、Main 重启或当前会话超时后，历史查询仍能正常返回。
- 不要将所有历史一次性读入 React state；只按需加载页面。

### 7.6 分页接口与 UI

建议提供独立历史分页 API，不要继续把全部历史塞进 guidedSnapshot。

建议接口语义：

- guidedSnapshot(conversationId, terminalTabId)：当前运行状态、当前建议、当前证据摘要。
- listGuidedOpsHistory({ conversationId, terminalTabId?, beforeCursor?, limit })：按游标返回历史步骤。
- cursor 使用 created_at + proposal_id 作为稳定排序键，避免新增记录后 offset 分页重复或漏项。
- limit 默认 30，允许上限 100；30 只是每页数量，不是总历史上限。
- 返回 totalCount、items、hasMore、nextCursor。

UI 要求：

1. 标题显示真实总数，例如“历史步骤（共 86 条）”，不能把已加载数量误当总数。
2. 首次加载最近一页，支持“加载更早步骤”。
3. 追加历史时保留当前滚动位置，不突然跳到底部。
4. 当前新步骤到来时，不清空已加载的历史页。
5. 长命令默认最多展示合理行数，可展开完整内容；提供复制完整命令。
6. 命令展示优先自然换行；若命令包含需要保持格式的多行内容，可使用代码块并提供横向滚动/换行切换。
7. 复制内容必须使用原始 command，不得复制经过视觉折行或省略号处理的文本。
8. 每一步显示主机、时间、命令、目的和风险；不将不同主机的步骤合并为同一个命令结果。
9. 当前终端关闭后，历史步骤仍可查看，但旧建议的 valid 必须失效。
10. 删除/清理历史不属于本轮新增功能，不要增加自动清理策略。

### 7.7 测试与验收

- 同一 Conversation 生成超过 30 步，历史总数和分页可以读取全部步骤。
- 生成超过 100 个不同活跃 Guided Ops 会话，内存淘汰不影响已保存历史。
- 进程重启后历史仍存在，step_number 连续。
- 同一 run 重复提交不能插入重复 proposal。
- 两个并发提议不会产生相同 step_number。
- 历史分页前后不重复、不遗漏，插入新步骤后旧 cursor 仍稳定。
- 换终端、换 Host、Session UUID 变化、撤销观察后，旧建议不能复制为有效当前建议。
- secret redaction 和风险分类继续通过。
- 测试使用临时 SQLite 数据库，不触碰用户真实数据库。

## 8. 工作包 E：对话持久化与稳定身份

### 8.1 当前问题链路

当前数据模型把 AgentTerminalTab 同时用作终端 Tab 和聊天承载对象。

- terminal-tabs.ts 的 toStoredSessionTabs() 为避免恢复旧外部绑定，直接过滤所有 tab.external。
- useTerminalTabs.ts 将过滤后的 StoredSessionTab 保存到 SQLite。
- useAgentRuns.ts 通过 storageClient.saveAgentLog() 单独写 agent_logs。
- saveAgentLog() 不负责创建 session_tabs 记录。
- listSessionHistory() 从 session_tabs 查询，并要求存在 agent_logs 或 agent_runs。
- readSessionHistoryDetail() 也先查询 session_tabs；没有 session_tabs 行就返回 undefined。

因此 external Tab 作为聊天根节点时，可能出现“日志已写入 agent_logs，但 session_tabs 不存在，历史列表查不到”的情况。

此外，reassignSessionRootOnClose() 会把内存 agentLog 复制给新的根 Tab，但数据库日志仍以旧 tabId 保存。用户关闭根 Tab 后，运行态和 SQLite 的历史身份可能分裂。

### 8.2 目标：Conversation ID 稳定，Terminal Tab ID 独立

引入稳定的 conversationId：

- 每个聊天 Conversation 创建时生成唯一 conversationId。
- 同一聊天下的多个终端 Tab 共享 conversationId。
- 每个终端 Tab 保留自己的 terminalTabId / tab.id。
- sessionGroupId 只承担终端分组/同一对话下的终端组织职责，不再作为唯一历史主键。
- 关闭根 Terminal Tab、切换当前终端、创建 peer terminal，不改变 conversationId。
- Agent Run 的聊天上下文、消息历史、Guided Ops 历史、摘要、项目归属以 conversationId 为准。
- 终端观察授权仍以具体 terminalTabId + sessionGeneration + external Session UUID 为准。
- 终端 Tab 退出或解除关联，不删除 Conversation。

不要把 external iTerm UUID 持久化为可自动恢复的授权或活跃绑定。应用重启后可以恢复聊天记录和终端目标的描述信息，但必须要求用户重新选择/确认 iTerm 会话，不能自动恢复旧观察授权。

### 8.3 建议数据模型

新增 conversations 表：

| 字段 | 说明 |
|---|---|
| conversation_id | 稳定主键 |
| title | 会话标题 |
| summary | 会话摘要 |
| project_id | 关联项目 |
| created_at / updated_at | 创建和更新时间 |
| title_locked | 用户手动改名后锁定自动标题 |
| archived_at | 结束对话后归档时间，可为空 |

现有 session_tabs 保留，用于终端 Tab 元数据；增加 conversation_id 字段，把每个终端 Tab 关联到稳定对话。

agent_logs 增加 conversation_id 或迁移到以 conversation_id 为主键的消息表。agent_runs、ops_history_records、Guided Ops 历史同步使用 conversation_id。保留 terminal_tab_id/tab_id 作为事件来源或兼容字段，不能再让它决定对话是否存在。

目标查询：

- listSessionHistory() 以 conversations 为入口。
- readSessionHistoryDetail(conversationId) 读取该对话的完整消息。
- listAgentRunsForTab 等接口逐步改为 listAgentRunsForConversation。
- 会话摘要按 conversationId 生成和更新。
- 项目侧栏以 conversationId 显示会话，不以当前活动终端 Tab 的标题代替。
- 删除历史必须显式调用删除接口；结束对话只归档，不删除。

Codex 可在核对现有类型和查询后调整具体表结构，但必须实现上述稳定身份语义，不能只在 Renderer 中复制一份 agentLog 来掩盖数据库问题。

### 8.4 迁移要求

采用幂等、可回滚的 SQLite migration；不得直接删除旧表或清空历史。

1. 创建 conversations 表及必要索引。
2. 现有 session_tabs 中每个 tab_id 先迁移为 conversation_id = 原 tab_id，保留原 title、summary、project_id、created/updated 时间和 title_locked。
3. 对 agent_logs、agent_runs 中存在但 session_tabs 不存在的 tab_id，补建最小 Conversation 记录，保证孤立日志可在历史列表中出现。
4. 无法恢复的标题可以从首条用户消息生成短标题；无法恢复的 project_id 保持为空，不得按相似标题猜测。
5. 历史数据如果曾经因根 Tab 转移而分裂，只有存在可靠映射证据时才合并；不得仅按标题相似、时间接近或连接名相同合并。
6. 新建会话使用随机稳定 conversationId；旧会话沿用旧 tabId 作为兼容 conversationId。
7. agent_logs 的历史记录迁移必须保留所有 log_id、kind、text、created_at、updated_at、run_id。
8. agent_runs、ops_history_records 的关联迁移必须保留 run_id、状态、trace、Token 统计和反馈内容。
9. 为迁移前后的表行数、主键、消息内容 hash、run 数量和历史摘要建立校验。
10. migration 在事务中执行；中断后再次启动应可安全重试。
11. 先在临时数据库和真实数据库副本上验证；不得在测试中直接清理用户生产数据。
12. 旧版本字段保留到新版本读写验证通过后再评估清理；本轮不做激进 schema 删除。

### 8.5 根 Tab 关闭与历史连续性

- reassignSessionRootOnClose() 不再负责迁移聊天身份，只负责终端 Tab 的当前选择和运行态承载。
- AgentLog、AgentRun、Conversation Summary、Guided Ops history 都使用稳定 conversationId。
- 关闭根 Terminal Tab 时，将当前聊天 UI 状态交给剩余 peer，但 conversationId 不变。
- 没有 peer 时，结束当前活动 Conversation；消息和运行历史保留在 SQLite。
- 关闭某个 peer terminal 不能关闭整个 Conversation。
- 关闭当前聊天时，所有相关 run 和待处理审批必须正确结束/拒绝；Conversation 进入 archived 状态。
- 重新打开历史 Conversation 时，恢复消息和摘要；不自动恢复旧 iTerm UUID、PTY、观察授权或文件审批。

### 8.6 验收

- external Tab 作为唯一聊天承载时，消息仍能进入历史列表和详情。
- 应用重启后该对话完整恢复。
- 关闭根 Terminal Tab 后，其他 peer 继续显示同一完整聊天。
- SQLite 中消息不再只存在于旧根 tabId。
- 删除或结束某个 Terminal Tab 不会删除 Conversation。
- 结束对话后仍能从历史重新打开。
- 所有旧历史记录行数和内容 hash 通过迁移核对。
- 不恢复旧终端授权、不自动连接 SSH、不自动重新打开 iTerm。

## 9. 工作包 F：iTerm 窗口关闭检测与终端生命周期

### 9.1 当前实现路径

关键文件：

- src/main/terminal/external/iterm.ts
- src/main/terminal/external/observed-session.ts
- src/main/terminal/external/shared-session.ts
- src/main/terminal/ipc.ts
- src/main/terminal/session/manager.ts
- src/main/terminal/session/pty-session.ts
- src/main/terminal/session/pty-lifetime.ts
- src/preload/modules/terminal.ts
- src/renderer/src/hooks/useExternalTerminals.ts
- src/renderer/src/hooks/useTerminalCollaborationLifecycle.ts
- src/renderer/src/hooks/useTerminalObservation.ts
- src/renderer/src/components/ExternalTerminalControls.tsx
- src/renderer/src/lib/terminal-tabs.ts
- src/renderer/src/App.tsx

现状：

- iterm.ts 支持 list、create、read、size、focus，按 Session UUID 查找会话。
- observed-session.ts 在 observation off 时仍会约每 5 秒检查 size/liveness；查不到 Session 时调用 fail() 并发出 onExit。
- observed-session.ts 的 kill() 是 detach only，不会关闭 existing iTerm Shell。
- shared-session.ts 的 syncSize() 在打开后周期性检查 iTerm Session UUID；当前 catch 仅吞掉错误，并明确保留 Main-owned PTY 供重新打开。
- shared-session.ts 的 kill() 会释放 Socket/临时目录并杀掉 Main-owned PTY。
- terminal/ipc.ts 的 createTerminalSession.onExit 会通知 Renderer 并清理当前 session。
- useTerminalCollaborationLifecycle.ts 收到 onExit 后清理 sessionId、terminalReady、terminalExited，但当前没有清理 external 绑定。

### 9.2 Main 端需要改造的行为

#### A. shared PTY 的生命周期：窗口关闭时保留底层会话

本节是本轮 iTerm 改造的核心规则：**iTerm 窗口关闭不能触发 shared PTY 结束。** 必须保留 shared-session.ts 当前的“窗口关闭后仍保留 Main-owned PTY，允许重新打开”产品行为，并把隐式保留改造成显式、可管理的生命周期状态。

建议使用明确的状态机（具体命名可按现有类型风格调整）：

| 状态 | 含义 | PTY / Socket | iTerm 窗口 | 用户可用操作 |
|---|---|---|---|---|
| attached | shared PTY 已连接到一个 iTerm Session UUID | 存活 | 已打开 | 暂停/恢复观察、关闭窗口、结束会话 |
| window-closed | iTerm 窗口/Session UUID 已确认不存在，但 shared PTY 仍存活 | 保留 | 已关闭 | 重新打开终端、结束终端会话 |
| reopening | 正在创建新 iTerm 窗口并重新连接原 PTY | 保留 | 创建中 | 禁止重复打开/结束竞态 |
| ended | 用户明确结束或 Main 既有退出清理已执行 | 已释放 | 不再关联 | 创建新终端；不能恢复旧会话 |
| status-unknown | 暂时无法确认 iTerm 窗口状态 | 保留 | 未知 | 重试检查；不自动结束 |

执行要求：

1. 继续使用精确 Session UUID 的 size/liveness 请求，不新增按标题关闭的逻辑。
2. 对 shared PTY，只有明确的 ITERM_SESSION_MISSING / ITERM_NOT_RUNNING 才能将前端窗口状态转为 window-closed；不能据此调用 PTY kill。
3. 窗口关闭时停止旧 iTerm Session 的尺寸同步，撤销该窗口的 ObservationGrant，清除旧实时证据，移除旧 iTerm UUID 绑定；但保留稳定 shared session ID、PTY、Shell、Socket、临时目录、TerminalSessionManager 对象和必要输出缓冲。
4. 不调用 shared-session.kill()，不删除 Socket/临时目录，不杀 Main-owned PTY，不将该会话从管理器移除。
5. 将 shared session 标记为 window-closed，并通过 typed IPC 通知 Renderer：窗口已关闭、底层会话仍在运行、可重新打开。
6. Main 继续托管该 shared session；不能因关闭窗口而丢失其所有权、资源引用或结束入口。
7. 增加明确的 reopenExternal/reopenSharedSession 语义（名称按当前 IPC 风格确定）。该操作必须通过稳定 shared session ID 找回原 PTY 和 Socket。
8. reopen 流程只新建 iTerm 前端窗口/Session，不新建 PTY、不重新执行 Shell 启动命令、不重新登录 SSH、不重置 cwd、环境变量或前台任务。
9. 新 iTerm Session UUID 创建成功且 Socket 连接确认后，再将 shared session 从 reopening 转为 attached，并绑定新的 UUID；失败时退回 window-closed，保留 PTY，显示可重试错误。
10. 重开操作必须防止重复点击、并发 reopen、旧 UUID 迟到事件和多窗口重复绑定。
11. 重开后 ObservationGrant 默认关闭，实时证据清空；用户重新主动启用观察后才开始新一轮证据采集。
12. 增加显式 endSharedSession 操作，仅在用户确认后调用 shared-session.kill()，然后释放 Socket、临时目录、PTY、manager 状态、waiters 和缓存。
13. 结束事件幂等；并发 PTY onExit、用户结束、iTerm liveness 不得重复清理或重复通知。
14. 结束后该 shared session 不得再被 reopen；UI 必须显示已结束，用户需创建新的终端会话。
15. Main 进程退出时遵循 new3 已有的 PTY/reaper 清理策略。本轮不引入跨 MoXun 应用重启保留 Shell 的承诺，也不改变已有进程退出清理边界。

#### B. transient error 与 closed 状态区分

以下错误不能直接当作窗口关闭：

- ITERM_AUTOMATION_DENIED
- ITERM_UNAVAILABLE
- osascript 暂时超时或 iTerm 正在响应其他脚本
- Socket 暂时不可达、尺寸读取失败或其他尚未确认 Session UUID 不存在的系统错误

这些情况应进入 status-unknown 或保留当前 attached 状态，显示“暂时无法检查 iTerm 状态”，使用有上限的退避重试；不得结束 PTY，也不得直接显示“会话已关闭”。

对于 shared PTY，明确确认 ITERM_SESSION_MISSING / ITERM_NOT_RUNNING 只触发 window-closed，不触发底层 PTY 清理。对于 existing iTerm，确认 Session UUID 不存在才触发绑定清理。

重试次数、退避间隔、状态转换和最终状态必须可测试，不得无限快速轮询。

#### C. existing iTerm 的关闭行为

- 继续使用 Session UUID liveness 检查。
- 确认 UUID 不存在后，结束墨巡自己的 observed session、撤销观察、清除证据并通知 Renderer。
- kill() 继续只 detach；不向 Shell 输入任何字符。
- existing iTerm 不属于 Main，窗口关闭后不提供“恢复原 Shell”的按钮；用户需要重新选择一个现存 Session 或创建新终端。
- 不对同一窗口之外的 iTerm Session 做任何操作。
- 一个窗口包含多个已绑定 Session 时，每个 UUID 分别清理，不将一个 UUID 的退出广播给其他 Tab。

### 9.3 事件协议与 Renderer 状态更新

必须区分“iTerm 前端窗口关闭”和“底层终端会话结束”，不能继续用一个 externalClosed/terminal:exit 事件同时表示二者。

建议增加独立的 window lifecycle 事件，例如：

- terminal:window-closed：只表示 shared PTY 对应的 iTerm 前端窗口已关闭；带稳定 shared session ID、旧 iTerm UUID、generation、reason、reopenable=true。
- terminal:reopened：表示原 shared PTY 已成功接入新的 iTerm Session UUID；带稳定 shared session ID、新 UUID 和 generation。
- terminal:exit：表示底层 PTY/Shell 真正结束；带 sessionId、reason 和 ended=true。

结束原因可包括：

- iterm-window-closed（仅前端窗口关闭，shared PTY 保留）
- iterm-session-missing（existing iTerm 绑定失效）
- shell-exited
- operator-ended
- owner-window-destroyed
- transport-failed

不要将 iterm-window-closed 当成底层 terminal exit。不得仅凭 exitCode=1 推断底层 PTY 已结束。

Renderer 收到匹配 shared session ID + old UUID + generation 的 window-closed 事件时：

- 清空旧 iTerm UUID/窗口绑定；
- 保留稳定 shared session ID 和该会话的 Main-owned 状态；
- 标记 windowOpen=false、reopenable=true、sessionEnded=false；
- 停止该窗口的观察 UI，显示“iTerm 窗口已关闭，会话仍在运行”；
- 显示“重新打开终端”和“结束终端会话”两个明确入口；
- 不清除 Conversation 消息；
- 不删除 Conversation history；
- 不影响其他 Terminal Tab 或其他 shared session。

Renderer 收到真正的 terminal:exit 时才标记 sessionEnded=true，清理 shared session 运行态引用，并隐藏/禁用 reopen。existing iTerm 的 Session 消失事件则清理 external 绑定并显示“原终端已关闭，请重新选择终端”。

迟到的旧 UUID 事件必须被忽略，不能清除新窗口绑定或覆盖新一代状态。

### 9.4 明确区分手动解除关联与结束底层会话

- existing iTerm：只停止观察、撤销授权并解除当前 Conversation 绑定；Shell 继续由用户在 iTerm 中控制。窗口关闭后不提供恢复旧 Shell 的能力。
- shared PTY：解除 Conversation 关联不等于结束 Main-owned PTY。Main 必须继续托管仍存活的会话，并确保用户仍能在墨巡 UI 找到它、重新打开或明确结束它；不能留下不可见的孤儿 PTY。
- 关闭 shared PTY 对应的 iTerm 窗口只关闭前端，不解除 shared session 的 Main 所有权。
- 如果 Conversation 被归档而 shared PTY 仍在运行，应将其保留在现有终端目标/受管会话入口中，显示“未关联对话”的状态，并提供重新关联、重新打开和结束入口；不要为此增加一套庞大的新终端管理系统。
- 不允许把“暂停观察”“解除关联”“关闭 iTerm 窗口”和“结束终端会话”合并成一个按钮。
- 观察 off、pause、revoke、detach、window-close、reopen 和 end 的状态应在类型、IPC、UI 文案和测试中保持一一对应。

### 9.5 iTerm 关闭、重新打开和结束的 UI 入口

ExternalTerminalControls 和相关终端目标 UI 必须区分 shared 与 existing 两种终端类型。

**shared PTY 且 iTerm 窗口已打开：**

- 显示“暂停观察 / 恢复观察”。
- 显示“关闭终端窗口”或沿用用户直接关闭 iTerm 窗口的方式；关闭窗口不结束底层会话。
- 显示“结束终端会话”入口。该操作需要二次确认，明确说明会终止 Shell 和正在运行的任务。

**shared PTY 且 iTerm 窗口已关闭：**

- 显示明确状态：“终端窗口已关闭，会话仍在运行”。
- 提供主操作“重新打开终端”。
- 提供独立危险操作“结束终端会话”。
- 重新打开时复用原 PTY，不创建新 Shell。
- 结束时二次确认；确认文案至少包含目标/会话名称、会结束 Shell 及前台任务、不可通过重新打开恢复。
- 正在 reopening 时显示加载状态，禁止重复触发；失败后保留“重新打开”入口。
- session 已 ended 时不得显示可用的 reopen 按钮。

**existing iTerm：**

- 显示“暂停/恢复观察”和“解除关联”。
- 不显示“恢复原终端”或“结束终端会话”按钮，因为 Shell 由用户拥有。
- Session UUID 消失后显示“原 iTerm 会话已关闭”，允许重新选择其他现存终端或创建新终端。

按钮不得隐藏在无法发现的 hover-only 区域；主要操作在正常状态下可见，危险操作可以放在明确标识的更多菜单中，但不能没有入口。

### 9.6 iTerm 生命周期测试

至少覆盖：

1. shared iTerm 窗口关闭：只将前端状态改为 window-closed；PTY、Shell、Socket、临时目录和 manager 状态仍存活。
2. shared 窗口关闭后点击“重新打开终端”：新 iTerm UUID 接回原 PTY，Shell PID、cwd、环境和前台任务状态保持连续。
3. shared 窗口关闭后点击“结束终端会话”：二次确认后结束 PTY/Shell，清理 Socket 和临时目录，UI 标记 ended。
4. shared 窗口关闭后应用继续运行较长时间：会话仍由 Main 托管，UI 能找到并重新打开或结束，不成为孤儿。
5. shared 会话重复点击 reopen：只创建一个新 iTerm 窗口，不重复创建 PTY。
6. reopen 创建窗口失败或 Socket 连接失败：原 PTY 保留，状态回到 window-closed，可重试。
7. reopen 成功后旧 UUID 的迟到 close/exit 事件不能清除新 UUID 绑定。
8. existing iTerm 窗口关闭：绑定和观察被清理，不尝试恢复已结束 Shell。
9. 两个墨巡 managed iTerm 窗口并存，关闭其中一个，另一个仍能继续输入和观察。
10. 一个 iTerm 窗口包含多个 Tab/分屏，关闭窗口后每个已绑定 UUID 都独立处理。
11. iTerm.app 整体退出：shared PTY 保留为 window-closed，可重新打开；existing iTerm 绑定解除。
12. 暂时拒绝 Automation 权限：不误判窗口关闭，不杀 PTY。
13. iTerm 忙碌/osascript 超时：按退避策略重试，不误判窗口关闭。
14. 同一 Session UUID 关闭后重新创建新 UUID：旧观察授权不得继承。
15. Main 进程退出：遵循 new3 已有 reaper/Socket 清理策略；本轮不要求跨 Main 进程重启恢复 PTY。
16. 用户原有、未由本轮测试创建的 iTerm 会话不得被关闭、输入或发送信号。
17. pause、detach、window-close、reopen、operator-end、shell-exit 和 Main exit 分别验证，不能合并成一个测试用例。

## 10. 工作包 G：项目会话、终端选择器与结束对话入口

### 10.1 截图 image-5 的语义问题

截图顶部的标签来自 ConversationTerminalSelector；App.tsx 传入的是当前 sessionTerminals 中 external 不为空的终端。它代表“本轮对话正在关联的外置终端目标”，不是项目会话列表。

左侧 ProjectSidebar 的会话行代表“项目下的聊天 Conversation”。

两者当前使用相近的标题，视觉上像同一个会话被重复列出。不能简单删除其中一个，因为用户需要：

- 从项目列表切换不同 Conversation；
- 在同一个 Conversation 中切换不同 iTerm/终端目标。

### 10.2 推荐 UI 语义

1. 左侧项目区域继续显示 Conversation 列表，作为聊天导航的唯一主入口。
2. 顶部区域明确标记为“终端目标”，而不是看起来像另一组聊天 Tab。
3. 顶部终端目标显示连接名/主机名/本地终端类型，不重复使用 Conversation 标题作为主要文案。
4. 只有一个外置终端时，使用紧凑的终端状态 Chip/选择器，与 ExternalTerminalControls 合理合并；不要占据一整行制造第二组“会话标签”。
5. 有两个或更多终端目标时，保留可切换列表；每个目标显示独立名称、连接状态和观察状态。
6. “连接其他终端”始终保留为独立入口。
7. 切换终端目标只改变当前观察/建议目标，不切换 Conversation、不丢失聊天消息、不转移观察授权。
8. 切换 Conversation 时，顶部终端目标只显示该 Conversation 关联的终端。
9. 不要把历史 Conversation 和当前 Terminal Tab 混合排序。

### 10.3 结束对话入口

当前 AppSidebar 对非项目最近会话有关闭按钮，但 ProjectSidebar 的项目会话行没有对应关闭入口。截图中项目聊天会话无法直接结束。

改造要求：

- 为项目下每个 Conversation 增加轻量的关闭入口，例如 hover 显示关闭图标或更多菜单。
- 在当前 Conversation 的标题/会话菜单中提供“结束对话”。
- 不要把关闭按钮放在终端目标选择器上，避免用户误以为关闭终端就是结束聊天。
- 结束对话前，如果 Agent 正在运行、存在待处理文件审批或有未保存状态，显示明确的确认/处理中状态。
- 结束对话时停止该 Conversation 的 Agent Run，拒绝/取消其待处理审批，保存最后一批日志和元数据。
- 结束对话是归档/从活动列表移除，不是删除历史。
- 重新打开历史会话后恢复消息、摘要和项目关联，但不恢复旧 iTerm UUID、观察授权或文件审批。
- existing iTerm 不得因为用户关闭聊天而收到 exit/Ctrl+C；解除关联只影响墨巡自己的观察和 UI。
- shared PTY 的处理必须遵循 9.4 的所有权策略，不能因为关闭 Conversation 而留下无人管理的 PTY/Socket。
- 关闭一个 Terminal Tab 与结束 Conversation 是两个不同操作；同一 Conversation 还有其他终端时，关闭一个终端不能结束整个聊天。

### 10.4 验收

- 项目列表中可结束一个 Conversation，其他项目会话不受影响。
- 结束后该会话不再出现在活动列表，但仍在历史列表。
- 重新打开后消息完整、标题/摘要正确。
- 有多个 Terminal Tab 的 Conversation 关闭一个 Tab 后仍可继续聊天。
- 关闭 Conversation 不会影响其他 Conversation 的 Agent Run、审批或终端。
- 顶部终端目标切换不会改变 Conversation。
- 单终端状态不再形成与项目聊天行同名的第二个“聊天标签”。

## 11. 工作包 H：侧栏收起后的顶部空白

### 11.1 当前布局线索

- App.tsx 顶层 app-titlebar 使用固定 h-12。
- app-titlebar-brand 宽度使用 --app-sidebar-width，品牌 Logo 位于左侧品牌区。
- app-titlebar 仍横跨整个窗口，右侧大部分区域没有实际操作内容。
- AppSidebar 另行控制展开/收起，并通过 moxun.sidebar-expanded 保存状态。
- ConversationTerminalSelector 在主工作区另占一行。
- 截图 image-6 中侧栏收起后，主工作区上方仍保留较宽的空白区域。

### 11.2 改造要求

1. 先检查 BrowserWindow 的 titleBarStyle、trafficLightPosition、frame、标题栏拖动区域和 CSS -webkit-app-region。
2. 确认空白高度由原生标题栏、Electron 自定义标题栏、app-titlebar h-12 还是终端选择器间距产生。
3. 保留 macOS 红黄绿窗口控制按钮的可点击区域，不得让可拖动区域覆盖窗口控制按钮。
4. 保留必要的窗口拖动区域；不得为了压缩高度让窗口无法拖动。
5. 评估将 ProductLogo/品牌区直接并入侧栏首行，并把主工作区标题栏缩为最小必要拖动带的方案。
6. 如果品牌仍留在顶部，主工作区右侧应承载有实际价值的内容，或收缩为最小高度；不要只留一个横跨全宽的空白条。
7. 侧栏展开和收起时，品牌 Logo、导航首项、主工作区终端目标行应对齐。
8. 窗口缩放、全屏、最小化/恢复、不同屏幕缩放比例均要回归。
9. 不要把 macOS 原生标题栏与应用自绘标题栏混为一谈；不允许通过设置负高度或绝对定位覆盖原生控件。

### 11.3 验收

- 侧栏展开时品牌区与主工作区顶部对齐。
- 侧栏收起时主工作区上方不再有截图中的大块无意义空白。
- macOS 窗口按钮、拖动、双击标题栏、全屏和缩放仍正常。
- 主工作区终端目标行与聊天内容不会被标题栏遮挡。
- 800×600、1440×900、1920×1080 和 Retina 缩放下均无布局错位。

## 12. 工作包 I：代码职责边界与文档同步

### 12.1 不进行大规模重写

new3 已经将 App.tsx、Terminal IPC 和 Renderer owner 生命周期列入渐进式整理计划。当前 App.tsx 和 terminal/ipc.ts 仍较大，但本轮不以行数下降为目标。

只在实际修复需要时抽取：

- Conversation 生命周期协调；
- External Terminal 关闭/解除关联协调；
- Guided Ops 历史存储和分页；
- Conversation 持久化适配；
- FileChangeReview 的批次审批 UI 状态。

每个模块必须有唯一状态 owner。不得为本轮引入一个新的全局 Store 来承载所有会话状态。

### 12.2 推荐的职责边界

| 模块 | 职责 |
|---|---|
| Conversation service/model | 稳定 conversationId、活动/归档、项目归属 |
| TerminalSessionManager | Main-owned Terminal session、PTY、Socket 和 waiters |
| External iTerm lifecycle | 按 Session UUID 监测、关闭、清理、解绑 |
| Observation registry | 授权、撤销、证据清理和身份校验 |
| GuidedOpsService | 当前运行状态和建议验证 |
| GuidedOpsRepository/SQLite | 历史步骤写入、状态更新、分页查询 |
| FileApprovalService | 变更请求快照、owner/digest/hash/expiry 校验和应用 |
| Renderer hooks/components | 显示状态、收集用户确认、调用 typed Preload |

### 12.3 文档同步

实现完成后同步：

- Document/ARCHITECTURE.md：Conversation 与 Terminal 身份分离；iTerm UUID 关闭后的生命周期。
- Document/SECURITY_MODEL.md：观察授权失效、existing iTerm detach、shared PTY 结束边界。
- Document/EXTERNAL_TERMINALS.md：关闭对应 iTerm 窗口的实际行为；区分 pause、revoke、detach、end。
- Document/TESTING.md：新增 Guided Ops 历史、Conversation migration、iTerm UUID close、批次文件审批回归。
- Shared 类型注释、IPC 类型、UI 文案和相关测试说明。

文档只记录已经实现并验证的行为，不得先把计划写成已完成事实。

## 13. 测试计划与验收矩阵

### 13.1 SQLite / Conversation 历史

- 迁移前后 session_tabs、agent_logs、agent_runs、ops_history_records 行数核对。
- 历史消息内容 hash 和 log_id 保持不变。
- external-only Conversation 能进入历史列表。
- 对话结束后归档但不删除。
- 根 Terminal Tab 关闭后 Conversation ID 不变。
- peer terminal 切换不会创建重复 Conversation。
- 旧数据没有可靠分组证据时不自动合并。
- 历史详情可以按 conversationId 读取完整消息。
- 摘要更新只更新对应 Conversation，不串到其他会话。

### 13.2 Guided Ops

- 总建议数 1、2、3 均通过。
- 0 条、4 条、重复建议、包含凭据、控制字符均拒绝。
- proactive 与普通用户请求使用同一数量规则。
- 超过 30 步全部可查，分页稳定。
- 超过 100 个内存会话淘汰后数据库历史仍完整。
- Main 重启后历史存在，步骤编号连续。
- 同一 Run 不重复插入步骤。
- terminal UUID、generation 或 host 变化后旧建议失效。
- 历史步骤只读展示，不出现自动执行入口。

### 13.3 文件审批

- 批次 checkbox 的 UI 状态正确。
- Main 端仍验证 owner、request ID、digest、expiry、path、beforeHash 和 destination。
- 变更文件后旧请求失效。
- 用户拒绝、要求调整、审批超时均不写文件。
- 多文件批次一次确认后只应用原请求中列出的变更。
- 部分失败时准确列出已应用和未应用文件。
- 不新增 Agent 自动写入绕过路径。

### 13.4 iTerm / PTY

- shared Session UUID 消失后只关闭 iTerm 前端绑定，Main-owned PTY、Shell、Socket 和临时目录继续保留。
- shared 窗口关闭后 UI 明确显示“会话仍在运行”，并提供“重新打开终端”和“结束终端会话”。
- reopen 必须复用原 PTY/Shell，验证 PID、cwd、环境变量和前台任务连续性。
- end 必须二次确认，结束 Main-owned PTY/Shell 并释放 Socket、临时目录和 manager 状态。
- shared reopen 失败时不杀原 PTY，可重试。
- shared 会话在 window-closed 状态下仍能从墨巡 UI 找到并管理。
- existing Session UUID 消失后只清除墨巡绑定，不发送 Shell 输入，也不尝试恢复原 Shell。
- 关闭单个窗口不影响其他窗口。
- iTerm Automation 权限暂时不可用时不误判窗口关闭、不误杀 PTY。
- iTerm.app 退出时 shared PTY 保留为可重新打开状态；existing iTerm 绑定解除。
- Session UUID 重建后不继承旧 grant。
- 旧退出事件不能清除新会话。
- close-window、reopen、end、detach、revoke、pause、shell exit、Main exit 分开测试。
- 不触碰用户真实工作 iTerm 会话；使用本轮创建的 disposable UUID 和临时 Socket。

### 13.5 UI / 视觉

- image-1：Dock 图标、侧栏图标和 Finder 图标统一。
- image-2：Guided Ops 初始空状态紧凑；1/2/3 建议显示自然。
- image-3：文件审批一次批次确认；禁用原因可理解。
- image-4：历史总数真实、分页可加载、长命令可读和复制。
- image-5：项目会话与终端目标语义区分；项目会话可结束。
- image-6：侧栏收起后顶部空白压缩；macOS 拖动和窗口按钮正常。
- 中英文、浅色/深色主题和窗口缩放均需覆盖。
- 键盘焦点、Tab 顺序、Escape 关闭、焦点返回、aria-label 和 VoiceOver 语义不能回归。
- 使用真实 Electron 界面验收；隔离 Renderer 测试不能代替真实 iTerm/native Dock 验收。

### 13.6 工程门禁

先运行项目现有门禁，按 Document/TESTING.md 记录：

- npm run ci
- npm run test:local
- npm run verify:local

如果并行测试出现 new3 中记录过的桌宠/浏览器测试超时，保留失败日志并按既有流程串行复测；不得增加默认超时、跳过测试或修改无关桌宠代码来制造通过。

必要时运行定向测试：

- guided-ops.test.ts 及新增 SQLite/IPC 测试
- shared-session.test.ts
- observed-session.test.ts
- ipc-external.test.ts
- lifecycle-integration.test.ts
- file-change-approval.test.ts
- app-icons.test.ts
- Renderer 对应的 browser/UI tests

测试通过数量必须以真实运行输出为准。既有 skipped 不得计入 passed。

## 14. 分阶段执行顺序

### 阶段 0：保护现场与基线

1. 阅读本计划及第 1.4 节列出的资料。
2. 检查 git status、分支、最新提交和用户改动。
3. 建立本轮实际修改文件清单；不得覆盖用户已有改动。
4. 运行现有基线门禁，保存完整日志。
5. 检查当前运行应用的 Bundle、Dock 图标和 iTerm 状态；不关闭用户正在使用的会话。
6. 为 SQLite migration 建立测试副本和 hash 基线。
7. 将本轮截图 image-1 至 image-6 作为验收参照，不把静态截图当作实现根因。

### 阶段 1：P0 数据与终端生命周期

1. 先完成 Conversation ID 设计与 SQLite 迁移方案。
2. 完成 external-only 对话历史可见性修复。
3. 完成根 Tab 关闭后历史连续性修复。
4. 完成 shared/existing iTerm 的 UUID liveness 事件，并明确区分 window-closed 与 session-ended。
5. 完成 shared PTY 关闭窗口后的保留状态、重新打开原 PTY、显式结束会话三个完整流程；existing iTerm 关闭后只解除绑定。
6. 完成 Conversation 结束/归档与 Terminal Tab 关闭的语义区分；归档后仍运行的 shared PTY 必须可见、可重新打开、可显式结束。
7. 每完成一个步骤先跑定向测试，再进入下一项。

### 阶段 2：P0 Guided Ops 历史

1. 新增 guided_ops_steps 表和 Repository。
2. 持久化每条脱敏 proposal。
3. 改造 step_number 分配和状态更新。
4. 增加 keyset pagination IPC/Preload。
5. 改造 GuidedOpsPanel 历史 UI。
6. 验证超过 30、超过 100、Main 重启和分页场景。

### 阶段 3：P0 文件审批和建议数量

1. 修改 TypeBox alternatives schema 和 Prompt。
2. 修改 Main 端建议数量校验和 Shared 类型。
3. 增加 1/2/3 条建议的测试。
4. 修改 FileChangeReview 为单个批次确认。
5. 保留 Main 强校验并补充绕过测试。

### 阶段 4：P1 UI 收敛

1. 压缩 Guided Ops 初始面板。
2. 终端选择器改为清晰的终端目标语义。
3. 单终端状态紧凑显示，多终端保留选择器。
4. 项目 Conversation 增加结束入口。
5. 侧栏收起时压缩顶部空白，保留 macOS 原生控件和拖动。
6. 修复 Dock 图标的实际运行 Bundle/LaunchServices 来源。
7. 完成六张截图的真实界面对照。

### 阶段 5：文档、完整回归和收尾

1. 更新架构、安全、外置终端和测试文档。
2. 运行完整门禁和定向测试。
3. 运行真实 Electron/iTerm 生命周期验证。
4. 验证 SQLite migration 可重试、可恢复。
5. 记录未完成、跳过、环境受限和需要人工验证的事项。
6. 生成实施报告，禁止把计划完成等同于发布验收。

## 15. 最终验收清单

### P0：必须全部通过

- [ ] 关闭 shared PTY 对应的 iTerm 窗口后，只关闭前端窗口绑定，Main-owned PTY、Shell、Socket、临时目录和 Main session 状态继续保留。
- [ ] shared 窗口关闭后显示“会话仍在运行”，并提供明确的“重新打开终端”和“结束终端会话”按钮。
- [ ] 重新打开必须复用原 PTY/Shell，保持 PID、cwd、环境和前台任务连续，不创建新的空 PTY。
- [ ] 显式结束 shared 会话必须二次确认，结束 PTY/Shell 并释放 Socket、临时目录和 manager 状态。
- [ ] existing iTerm 关闭后只清理墨巡绑定和观察授权，不向用户 Shell 发送命令，也不尝试恢复已结束 Shell。
- [ ] Renderer 清除关闭终端的 external 绑定，不影响 Conversation 消息。
- [ ] 其他 iTerm 窗口和终端不受影响。
- [ ] 暂时 Automation 失败不会误判窗口关闭或误杀仍存活的 PTY。
- [ ] iTerm.app 退出后 shared PTY 仍可从墨巡重新打开；Main 进程退出遵循 new3 既有清理策略。
- [ ] Conversation 有稳定 ID，不再依赖某个 Terminal Tab ID。
- [ ] external-only 对话能进入历史列表、读取详情并在重启后恢复。
- [ ] 关闭根 Terminal Tab 后消息、Agent Runs 和摘要不丢失。
- [ ] 结束 Conversation 只归档，不删除历史。
- [ ] Guided Ops 超过 30 步仍完整保存，SQLite 分页可读。
- [ ] Guided Ops 内存 Map 淘汰/重启不影响持久化历史。
- [ ] AI 建议总数允许 1～3 条，不强制凑三条。
- [ ] 文件审批改为完整 Diff 后一次批次确认，Main 安全校验不减弱。

### P1：必须完成并验证

- [ ] Guided Ops 面板初始状态不再有大块无意义留白。
- [ ] 项目 Conversation 和终端目标选择器视觉语义清楚。
- [ ] 单终端时不再出现同名的第二组“聊天标签”。
- [ ] 项目 Conversation 有明确结束入口。
- [ ] 侧栏收起后顶部空白压缩。
- [ ] macOS 窗口控制、拖动、全屏和缩放正常。
- [ ] Dock、Finder、开发版和打包版图标一致。

### P2：按实际需要完成

- [ ] 只抽离本轮涉及的生命周期/持久化职责，不引入新的全局状态中心。
- [ ] 相关文档和类型注释同步。
- [ ] 所有新测试有明确测试名称和覆盖场景。
- [ ] 没有为了测试通过而改动无关模块或放宽安全门禁。

## 16. Codex 执行约束

1. 先核对当前源码和测试，再动手；本计划中的路径是审查时确认的入口，Codex 必须检查当前文件是否已被后续修改。
2. 不要重新执行 new2/new3 已完成的全仓清理、归档、Provider UI 提取或桌宠改造。
3. 不要修改 Whale/桌宠资源、动画、行为和布局；本轮没有桌宠需求。
4. 不要重新设计水墨主题，不要换品牌母版，不要重新发明图标。
5. 不要修改 Agent 永久禁止终端执行的安全策略。
6. 不要让 Agent 获得 iTerm 输入、命令执行、发送回车或中断权限。
7. 不要把 shared iTerm 窗口关闭当作 shared PTY 结束；必须保留 Main-owned PTY，并提供“重新打开终端”和“结束终端会话”两个明确入口。
8. 不要按窗口标题或主机名批量关闭/结束终端；窗口状态必须按精确 Session UUID 匹配，结束操作必须按稳定 shared session ID 定位。
9. 不要把 Automation 暂时失败当作窗口已关闭；只有明确的 Session UUID missing 才能进入 window-closed，且对 shared PTY 仍不得杀 PTY。
10. 不要为了实现 iTerm 生命周期管理而增加关闭整个 iTerm.app 的能力。
11. 不要自动恢复旧 iTerm UUID、观察授权或文件审批；shared PTY 的重新打开只能通过显式 UI 操作创建新的 iTerm UUID 并重新授权观察。
12. 不要将原始终端证据和敏感信息持久化到 Guided Ops 历史。
13. 不要因为简化文件审批 UI 而删除 Main 端 digest/hash/path/owner/expiry 校验。
14. 不要删除旧历史数据；migration 必须幂等、事务化并在副本上验证。
15. 不要仅在 Renderer 中复制消息来掩盖 SQLite 历史身份错误。
16. 不要将 30 条分页大小误实现成 30 条总上限。
17. 不要引入大型新依赖、全局 Store 或无关功能。
18. 不要为了减少 App.tsx 行数而做无边界拆分；每次只迁移一个职责。
19. 不要修改 package 依赖版本、锁文件、构建架构、签名/公证策略，除非修复图标问题有直接证据且用户另行确认。
20. 不要提交 Git、推送、发布或制作安装包。
21. 不要覆盖用户现有文件；不执行 git reset、git clean、restore 或批量删除。
22. 不要修改默认测试超时、跳过失败测试或减少断言来制造绿色结果。
23. 每个阶段完成后先运行定向测试；出现失败先定位，不继续叠加后续改动。
24. 最终报告必须区分自动化通过、真实 Electron/iTerm 通过、人工验证、跳过和未完成。

## 17. 实施报告要求

Codex 完成后，在 Document/new4 中新增实施报告，至少包括：

- 实际修改文件清单及每个文件的修改目的。
- Conversation ID 和 Terminal Tab ID 的最终关系图。
- SQLite migration 的表结构、迁移行数、hash 对照和回滚方式。
- Guided Ops 历史分页 API、cursor 规则和超过 30 步的实测记录。
- 1/2/3 条建议的 Prompt、Schema、Main 校验和 UI 测试结果。
- 文件批次审批的 UI 流程及 Main 安全测试结果。
- shared iTerm 窗口关闭后 PTY 保留的证据（稳定 session ID、PTY/Shell PID、Socket 和临时目录状态）。
- “重新打开终端”复用原 PTY 的证据（关闭前后 Shell PID、cwd、环境和前台任务对照）。
- “结束终端会话”二次确认及 PTY、Socket、临时目录和 manager 状态释放证据。
- existing iTerm 关闭后的 detach-only 行为证据。
- iTerm.app 退出、Automation denied、其他窗口不受影响的测试记录。
- Main 进程退出时 new3 既有 reaper/Socket 清理策略的回归证据。
- Dock 当前 Bundle 路径、Bundle ID、CFBundleIconFile、图标 hash 和真实 Dock 截图。
- image-1 至 image-6 的改造前后截图和分辨率。
- npm run ci、npm run test:local、npm run verify:local 的完整结果。
- 所有失败、跳过、未完成和环境限制。
- 未提交、未推送、未发布、未打包的确认。

## 18. 最终产品方向

这轮改造的判断标准不是增加了多少按钮或拆出了多少文件，而是：

- 对话真正属于对话，不再被某一个 iTerm Tab 的生死牵连。
- 终端真正属于终端：关闭 shared iTerm 窗口只关闭前端，原 PTY/Shell 保留并可重新打开；只有用户明确结束会话才回收底层资源。
- 观察授权真正属于某一次授权，不会跨会话残留。
- 历史真正写入数据库，不会因为 30 条上限、Map 淘汰或根 Tab 迁移而消失。
- 文件审批清楚但不降低安全性。
- AI 建议按实际价值输出，不为数量凑数。
- UI 保留现有功能，但减少重复表达、空白和理解成本。

**执行原则：先修复数据和生命周期，再收敛交互，最后做视觉打磨。保持现有产品方向，不推倒重写，不以增加功能代替解决问题。**
