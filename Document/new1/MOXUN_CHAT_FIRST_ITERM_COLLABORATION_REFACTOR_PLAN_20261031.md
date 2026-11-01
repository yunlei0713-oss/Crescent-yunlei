# 墨巡 MoXun：聊天优先工作台与 iTerm AI 协作重构计划

- **项目目录**：/Users/xusong.yu/Desktop/Crescent-test
- **计划目录**：/Users/xusong.yu/Desktop/Crescent-test/Document/new1
- **计划文件**：MOXUN_CHAT_FIRST_ITERM_COLLABORATION_REFACTOR_PLAN_20261031.md
- **制定日期**：2026-10-31
- **执行对象**：Codex
- **本文件性质**：实施计划，不是代码修改记录

---

## 0. 执行总则

本次不是在旧 Crescent 工作台上继续堆叠功能，而是围绕已经定稿的墨巡品牌和新的实际使用习惯，进行一次**聊天优先、外置终端优先、权限清晰、功能收敛**的产品级重构。

Codex 必须先阅读项目根目录 AGENTS.md、.cursor/rules/ 下的全部适用规则，以及 Document/DEVELOPMENT.md、Document/TESTING.md、Document/SECURITY_MODEL.md、Document/new/SECURITY_AUDIT.md。涉及 Pi Agent 或 Electron 进程边界时，按 AGENTS.md 要求先阅读 pi-dev、electron-development 技能和当前安装的 Pi SDK 文档。

### 0.1 不可变更的用户决策

1. **默认首页是纯 AI 对话工作区**，不再默认进入终端页面。
2. 使用**极简、可折叠侧边栏**；默认收窄，用户可展开查看会话和导航。
3. 只保留一套墨巡设计系统，提供浅色和深色两种外观；不再保留多套风格主题。
4. 删除旧命令手册，不再保存、分类、收藏或记忆用户手动输入的特殊命令。
5. **Agent 永久禁止执行终端命令**。不允许通过工具、MCP、子 Agent、IPC、快捷入口或其他间接路径恢复执行能力。
6. 日常终端以外置 iTerm 为主。内置终端的可视化工作区原则上移除；如果底层 PTY 对 SSH 登录、会话桥接或 AI 观察仍有必要，可以保留为不可见的后台能力。
7. 终端入口必须区分：
   - 从集群卡片连接目标集群；
   - 打开一个不连接远程主机的本地 iTerm；
   - 选择并接入已经打开的 iTerm 会话。
8. 每次新建或接入终端，都由用户选择本轮 AI 是否参与，以及允许 AI 读取的内容范围。
9. AI 只能观察、理解、分析和提出建议；命令始终由用户在 iTerm 中亲自输入和执行。
10. 本次重点是**删除冗余、整合现有能力、降低复杂度、提升稳定性和性能**，不得以重构为由新增仪表盘、命令市场、自动化执行器或其他大型模块。

### 0.2 修改边界

- 只修改本机项目代码、配置、文档和应用 UI。
- 不连接生产集群，不修改任何远程主机，不向集群节点安装 Shell Integration、插件或辅助脚本。
- 不安装或引入新的终端守护服务，不为观察功能引入不必要的常驻后台进程。
- 不修改用户的 iTerm 全局配置或配色。外置 iTerm 的颜色由用户自己的 iTerm Profile 管理。
- 不覆盖已经定稿的墨巡品牌图标、Logo 和山水图形，不重新设计品牌符号。
- 不提交 Git、不推送、不打包发布；完成本地代码和验收后汇报。
- 不删除与本次范围无关的历史会话、知识库、文件、用户配置或桌宠资源。

---

## 1. 产品定位与目标信息架构

### 1.1 产品定位

墨巡从“终端与 AI 对话并列的运维工作台”调整为：

**以 AI 对话为主入口，以集群连接和外置 iTerm 为人工操作环境，以 AI 观察授权为可选协作能力的运维工作台。**

核心关系：

- 对话是主工作区。
- 集群连接是工作上下文和外部终端启动入口。
- iTerm 是用户实际操作终端。
- AI 观察是用户按轮次授权的只读能力。
- 文件修改仍走独立的人工审批流程。
- Agent 没有终端命令执行能力。

### 1.2 目标导航结构

采用极简可折叠侧边栏，避免继续把所有功能放在顶部工具栏。

建议结构：

| 位置 | 内容 | 处理方式 |
|---|---|---|
| 侧栏顶部 | 新建对话 | 主入口，始终容易找到 |
| 侧栏主体 | 最近会话 | 保留现有历史会话能力，支持切换 |
| 侧栏主体 | 集群 / 连接 | 复用现有连接管理和集群卡片 |
| 侧栏主体 | 知识与资料 | 汇总现有记忆、Wiki、本地资料入口，不新建第二套知识系统 |
| 侧栏底部 | 设置 | 模型、Agent、MCP、Skills 等低频配置归入设置或二级入口 |
| 侧栏底部 | 外观 | 只切换墨巡浅色 / 深色 |
| 侧栏底部 | 桌宠 | 保留现有开关，不占用主导航位置 |

布局尺寸建议：

- 收窄状态：约 56–68 px，只显示图标和必要状态。
- 展开状态：约 230–260 px，显示导航文字和最近会话。
- 默认使用收窄状态，记住用户最后一次展开/收窄选择。
- 不在侧栏中堆叠大量图标；低频功能放入设置或二级菜单。
- 不增加独立的“插件市场”“自动化中心”“命令中心”等新模块。

### 1.3 顶部栏精简

当前顶部栏有连接、MCP、Skills、历史、记忆、本地资料、命令手册、Wiki、布局切换、语言和设置等多个图标，含义不够直观，也占据视觉注意力。

调整为：

- 左侧：墨巡图标和名称。
- 中间：当前会话标题或简洁的工作区标识。
- 右侧：新建对话、搜索/历史、外置终端入口、设置等少量高频操作。
- 语言切换可以放入设置，不必始终占据顶部空间。
- 删除布局交换按钮和命令手册按钮。
- MCP、Skills、记忆、Wiki、本地资料等入口按使用频率收纳到侧栏或设置，不再全部平铺。
- 所有图标必须有 tooltip、可访问名称和明确的交互反馈。

### 1.4 纯对话主工作区

纯对话界面是本次最高优先级页面，不能仅通过隐藏终端面板得到。

布局要求：

1. 页面主体只呈现当前会话的消息流。
2. 消息阅读区域居中，建议最大宽度约 960–1080 px；窗口变窄时自然缩放。
3. 用户消息、AI 回复、工具过程、分析结果有清晰层级，但不使用大量嵌套卡片。
4. 代码、命令、表格、日志和 Diff 使用独立、可读、可复制的内容组件。
5. 分析结果默认突出结论和关键证据，详细过程按需展开。
6. 思考过程默认隐藏；运行时可查看，结束后折叠，不长期占据消息流。
7. 输入框固定在窗口底部，消息列表独立滚动，避免输入区随消息滚走。
8. 输入框保留模型选择、附件、发送/停止和文件审批状态。
9. 模型、回复风格等常用选择保留；执行模式、终端布局切换等与 Agent 命令执行绑定的控制需要清理。
10. Token 数、缓存命中、上下文占用等诊断数据默认不常驻显示，移入会话详情或状态弹层。
11. 不使用大面积装饰性渐变、荧光描边、无意义状态条或过多边框。
12. 空会话欢迎区保持简洁，不堆叠大量快捷操作卡片。

### 1.5 消息与输入区细节

- 用户消息采用轻量、紧凑的视觉区分，不使用过大的整块灰色背景。
- AI 回复保持良好的段落宽度、行高和代码可读性。
- 结果卡片只用于真正结构化的结果，不要把普通段落再次包进卡片。
- 复制、导出、点赞等操作默认弱化，hover 或聚焦时出现；键盘可访问。
- 长日志、长表格和长代码块限制容器高度，支持内部滚动。
- 输入区附件预览、文件引用和审批状态继续复用现有能力。
- 文件修改审批必须保留完整 Diff、目标路径、变更理由和人工批准流程。
- 不因为移除终端面板而删除 Agent 对话、文件读取、知识库、记忆或文件审批能力。

---

## 2. 当前代码基线与已发现问题

以下是对当前项目源码和文档的实际检查结果，Codex 应以此为起点，不要重复造一套已有机制。

### 2.1 页面结构

- Renderer 主入口集中在 src/renderer/src/App.tsx，当前约 6200 行，承担大量会话、终端、连接、Agent、弹窗和布局状态。
- src/shared/workbench-layout.ts 当前定义 split、chat、terminal 三种布局，默认值为 terminal。
- src/renderer/src/lib/app-shell.ts 的初始布局回退为终端优先。
- App.tsx 中存在“首次打开显示终端、聊天隐藏”的逻辑；终端独占模式通过右侧竖向入口打开对话。
- TerminalPane.tsx 同时承担终端 Tab、连接列表、子终端、恢复状态和外置终端入口等职责。
- AgentPanel.tsx 中仍包含 split/chat/terminal 布局切换、终端选择、执行目标、执行设置和会话使用量等 UI。
- App.tsx 的顶部工具栏和底部 AppUtilityToolbar 分散管理多个低频入口。

### 2.2 主题系统

- 主题定义位于 src/shared/theme-definitions.ts，当前注册六个主题 ID：
  - ink-wash-light
  - ink-wash-dark
  - crescent
  - night-shift
  - route-survey
  - ink-signal
- 当前前两个是墨巡水墨山河浅色/深色，后四个是旧主题。
- src/renderer/src/assets/theme.css 仍包含旧主题 CSS 变量。
- ThemeSwitcher.tsx 仍以多张主题预览卡片展示六个主题。
- Document/UI_DESIGN_SYSTEM.md 仍要求保留四个旧主题 ID，并写有终端表面保持近黑色的旧约束，与本次新方向冲突。
- Document/new/brand/brand-guide.md 和 Document/new/brand/theme/ink-wash-theme-spec.md 已有最终品牌与浅/深主题规范，应复用，不要新建并行主题系统。

### 2.3 外置 iTerm 当前能力

- 外置终端实现位于 src/main/terminal/external/。
- src/main/terminal/external/iterm.ts 使用 JXA/osascript 访问 iTerm 的窗口、Tab、Session，可枚举会话、创建会话、读取屏幕、聚焦会话。
- 已有会话通过 iTerm Session ID 绑定，能区分窗口、Tab 和分屏。
- src/main/terminal/external/observed-session.ts 当前约每 750 ms 读取一次 session.text()，发布变化后的屏幕快照。
- Document/EXTERNAL_TERMINALS.md 已明确说明：已有会话当前是屏幕快照，不是完整滚屏历史；不提供可靠命令边界、退出码和原始控制序列；快照间短暂输出可能遗漏。
- 当前已有会话对象仍暴露 write/interrupt 能力，且 UI 会创建内部终端 Tab 来显示镜像。移除内置终端 UI 后，应重新审查这些写入能力是否仍有必要。
- 新建共享 iTerm 会话通过 src/main/terminal/external/shared-session.ts 创建主进程拥有的 PTY，再用私有 Unix Socket 让 iTerm 连接到同一个 PTY。
- 该共享 PTY 能让主进程观察输入输出；它是可保留的后台桥接候选，不等于必须保留内置终端 UI。
- 共享 PTY 的生命周期、应用退出行为、iTerm 断开和重新挂接行为必须纳入本次验收。

### 2.4 Terminal Observer 当前能力和缺口

- 观察器位于 src/main/terminal/observer/terminal-observer.ts，注册表位于 observer/registry.ts。
- 当前观察器识别 OSC 133 A/B/C/D 标记；对边界不可靠的输入采取保守策略。
- 已有密码、OTP、私钥、交互程序等敏感内容保护和脱敏逻辑。
- 当前默认内存保留上限为 20 个事件、单事件约 16K 字符、总量约 64K 字符、保留 30 分钟；模型上下文默认约 32K 字符，并限制在 8K–64K 范围。
- 这些有限内存和脱敏策略应优先复用，不要新增一套终端历史数据库。
- **必须补齐授权门控**：当前终端事件路径会调用 observeTerminal；本次要确保用户选择“不参与”时，不创建、不填充、不向 Agent 暴露本轮终端观察证据。
- 现有 iTerm 快照不能伪装成命令事件，不能根据屏幕差异推断可靠命令边界或退出码。
- OSC 133 在本地 Shell 与 SSH 远端 Shell 中的覆盖情况不同。不能假定远端 Shell 一定提供 OSC 133；不得通过自动向远程主机注入脚本或安装 Shell Integration 来弥补。

### 2.5 Agent 安全现状

- src/main/security/agent-capability-policy.ts 是 Agent 工具白名单。
- 当前允许的终端相关能力是 terminal.suggest 和 terminal.observe，对应 propose_command、observe_terminal。
- src/main/agent/pi-terminal-bash.ts 中 bash 和 reviewed execute 入口已有显式拒绝逻辑。
- Main Agent 和 Subagent 当前不应注册 bash；scripts/check-security-boundaries.cjs 已有对应静态安全检查。
- Document/new/SECURITY_AUDIT.md 已记录 Agent 只能提出建议和读取脱敏终端证据，不能执行命令。
- 本次必须延续并加固该安全状态，不得因为外置终端接入而把 PTY 写入接口暴露给 Agent。

### 2.6 命令手册当前实现

命令手册不只是一个 UI 弹窗，存在完整调用链：

- src/renderer/src/components/CommandDirectorySheet.tsx
- src/shared/command-directory.ts
- src/shared/command-directory.test.ts
- src/main/command-directory.ts
- src/preload/modules/commands.ts
- src/preload/api.ts 中的 commands 暴露
- src/main/index.ts 中的 registerCommandDirectoryIpc 注册
- App.tsx 中的懒加载、状态、顶部入口和弹窗
- 本地数据文件 command-directory.json 及 command-directory.json.previous

当前命令手册 IPC 有 list/save/undo/preview/execute；其中 execute 路径最终调用已被禁用的 reviewed execution 入口。该功能已经与用户实际操作方式不符，应完整移除，不要只隐藏图标。

---

## 3. 终端工作流重构

### 3.1 三种主要入口

| 入口 | 用户动作 | 结果 |
|---|---|---|
| 连接集群 | 点击集群卡片 | 弹出 AI 协作授权选择，随后在 iTerm 打开该集群 SSH 会话 |
| 打开本地终端 | 点击外置终端入口 | 打开 iTerm 本地 Shell，不自动连接任何远程主机 |
| 连接已有终端 | 选择已打开的 iTerm 会话 | 绑定用户指定的窗口、Tab、分屏，不重新 SSH 登录 |

不要把“内置终端”和“外置终端”继续作为两个平级选择。内置终端可视化页面退出产品主流程。

### 3.2 集群卡片连接流程

推荐交互顺序：

1. 用户打开侧边栏的集群入口或连接管理。
2. 选择目标集群卡片。
3. 弹出“AI 终端协作”授权窗口。
4. 用户选择本轮 AI 参与范围。
5. 用户确认后，墨巡在 iTerm 创建/打开对应终端并执行该连接配置原有的 SSH 登录流程。
6. 墨巡显示简洁的连接状态和 AI 观察状态；不再打开内置 xterm 镜像页面。
7. 用户在 iTerm 中手动操作；墨巡仅在授权范围内收集证据供 AI 分析。

连接卡片只保留清晰的主要操作“在 iTerm 中连接”，以及必要的编辑、复制等管理动作。删除“在内置终端连接”“在子终端连接”等不再使用的入口。

保留现有连接配置、SSH 参数、身份文件、密码引用、登录动作和集群目标校验；不得为了去掉 xterm 而破坏现有连接卡片的登录流程。

### 3.3 打开本地 iTerm

从全局外置终端入口打开菜单：

- 新建本地终端：打开 iTerm 的本地 Shell，不自动拼接 SSH 命令。
- 连接已有终端：列出 iTerm 当前窗口、Tab 和分屏供用户选择。

打开本地终端时同样先询问 AI 是否参与本轮。用户选择“不参与”时，不启用 AI 观察器。用户选择观察时，才启用本轮授权范围内的观察能力。

### 3.4 连接已有 iTerm 会话

保留现有会话枚举能力，选择界面应显示：

- 窗口编号。
- Tab 编号。
- 分屏编号。
- Session 名称。
- 可识别的标题或工作目录（若 API 能安全取得）。
- 会话是否仍然存在。

必须使用 iTerm Session UUID 精确绑定，不能只靠窗口标题或显示名称定位。

用户选择会话后，再选择 AI 参与范围。关闭墨巡中的会话绑定只能停止观察和解除关联，不得向原 iTerm 会话发送 exit、Ctrl+C 或其他命令。

已有会话的观察能力必须诚实展示限制：

- 当前实现通过 JXA 读取 session.text() 屏幕快照，不等同于完整滚动缓冲区历史。
- 约 750 ms 的轮询可能漏掉快照间的短暂输出。
- 无法可靠区分所有用户输入、程序回显和输出。
- 不能凭屏幕快照生成可靠的命令开始/结束事件或退出码。
- “读取已有内容”在技术验证完成前只能定义为“读取当前可获取的屏幕/上下文”，不能宣传为“读取完整终端历史”。

### 3.5 三种 AI 协作授权模式

所有模式按终端 Session 独立授权，每次连接默认不参与，不继承上一次会话授权。

| 模式 | 授权范围 | 说明 |
|---|---|---|
| 不参与 | 不向 AI 采集或提供终端内容 | 默认选项；不创建 AI 观察证据 |
| 从现在开始观察 | 从用户确认授权的时间点开始 | 不回溯授权前内容；后续内容按采集能力和安全规则处理 |
| 加入当前上下文并继续观察 | 读取当前可访问内容，并观察授权后的变化 | 当前可访问内容不保证等于完整滚动历史；UI 必须显示实际读取范围 |

对于新建共享 PTY：

- 可以从 PTY 输入/输出流建立观察。
- 只有检测到可靠边界时，才将输入归类为命令。
- 没有 OSC 133 或其他可信边界时，输入必须标记为不确定并按保守策略处理。
- 远程 SSH Shell 不一定提供 OSC 133；不能把本地 SSH 命令边界误认为远端每条命令的边界。

对于已有 iTerm：

- 当前屏幕上下文可以作为低置信度证据。
- 如果要支持更完整的历史读取，先验证 iTerm 官方脚本接口是否真实提供所需滚动缓冲区范围。
- 技术验证未通过时，保留“当前可访问屏幕 + 后续快照”的降级能力，并在 UI 明确标注。
- 不允许把快照差异伪装成完整命令记录。

### 3.6 AI 协作状态控制

每个已绑定终端都要有明确状态：

- 未授权 / 不参与。
- 正在观察。
- 已暂停。
- 已结束。
- 观察不可用 / 会话断开。

必须支持：

- 暂停观察：不关闭 iTerm，不影响用户操作。
- 恢复观察：恢复时以新时间点作为采集起点，不自动补采暂停期间数据。
- 结束协作：清除本轮观察授权和内存证据，解除 AI 与该 Session 的关联。
- 重新授权：必须由用户重新确认，不能由 Agent 自行恢复。

---

## 4. iTerm 与隐藏终端桥接架构

### 4.1 目标原则

**移除内置终端 UI，不等于无条件删除所有 PTY 后端。**

当前共享会话使用主进程 PTY + 私有 Unix Socket + iTerm 原生窗口。它可以在不显示 xterm 的情况下继续承担连接和观察传输，但必须证明保留它比直接启动 iTerm 更有价值。

建议采用以下原则：

1. iTerm 是唯一可见的终端操作界面。
2. 墨巡不再渲染终端屏幕、终端 Tab、子终端面板或 xterm 输入区。
3. 对新建集群会话，优先复用当前共享 PTY 桥接，保证原有 SSH 登录流程和可信的输入输出传输不被破坏。
4. AI 观察器只有在本轮授权后才接收终端数据。
5. “AI 不参与”时，连接管理所必需的最小状态检测可以继续存在，但不得保留或暴露 AI 终端证据。
6. 对普通本地终端，如果不需要桥接，可以直接通过 iTerm 打开本地 Shell；如果用户授权观察，再使用经过验证的观察桥接。
7. 不为保持隐藏 PTY 而新增长期驻留服务或复杂守护进程。

### 4.2 需要保留的候选后台能力

经引用审查后，可以保留：

- node-pty：若共享 iTerm PTY 桥接仍依赖它。
- 私有 Unix Socket：若它仍是共享 PTY 与 iTerm 的可靠传输方式。
- SSH 登录和连接状态管理：若它仍负责现有卡片登录、认证提示和目标校验。
- TerminalObserver：只在用户授权时启用。
- iTerm Session 枚举、创建、聚焦和必要的屏幕读取能力。

### 4.3 应优先移除的可视化终端能力

确认无其他调用后，移除：

- TerminalPane 的 xterm 可视区域。
- TerminalTabBar。
- SubterminalPanel。
- TerminalIdentity 的终端画布展示职责。
- TerminalLockOverlay 中只服务于内置终端输入的 UI。
- xterm 生命周期、尺寸同步、滚动跟随和内部终端布局组件。
- 主工作区 split/terminal 布局控制。
- 内置终端标签、子终端标签和终端面板拖动分隔线。

如果某个模块还承担连接状态或会话管理职责，先抽离该职责，再删除可视组件；不能因为文件名带 terminal 就一律删除。

### 4.4 iTerm 自动化接口收敛

当前 JXA 接口包含 list/create/read/size/write/focus 等操作。

重构后：

- 保留 list/create/focus，以及后台桥接确实需要的 size/read。
- 对“已有用户会话”的接入模式，移除墨巡写入命令、发送 Ctrl+C、代替用户输入等能力。
- 如果共享 PTY 模式需要用户输入，输入由 iTerm 自身通过 Socket/PTY 传输，不由 Agent 或对话 UI 发送。
- 审查 createObservedITermSession 当前暴露的 write/interrupt；没有明确用户交互需求时删除。
- 所有 JXA 调用继续使用 execFile 和 stdin 传参，禁止将密码、命令或用户输入拼入 shell 命令行。
- iTerm 自动化权限拒绝时，展示明确错误和系统设置路径，不静默回退到内置终端。
- iTerm 不存在时，提示安装/启动，不得把目标连接悄悄降级成本机 Shell。

### 4.5 生命周期和故障处理

必须明确区分：

- iTerm 进程归用户所有。
- 共享 PTY 桥接可能由墨巡主进程持有。
- 已有 iTerm 会话由 iTerm 自己持有，墨巡只绑定和观察。
- 结束 AI 协作不等于关闭 iTerm。
- 关闭已有会话绑定不等于退出远程 Shell。
- 墨巡退出时，主进程拥有的共享 PTY 会受到应用生命周期影响；必须在 UI 或连接说明中明确，不得承诺应用退出后桥接会话仍保持。
- 发生自动化超时、Session UUID 失效、Socket 断开时，显示准确状态并允许用户重新选择。
- 不自动将失效的远程会话替换成本地 Shell。
- 观察器故障不能影响 iTerm 本身的输入输出。

---

## 5. AI 观察授权与上下文管理

### 5.1 增加 Main 进程授权门控

新增或重构一个 Main-only 的 TerminalObservationGrant 管理器，避免只依赖 Renderer 的开关状态。

授权至少绑定：

- BrowserWindow / owner。
- iTerm Session UUID（外置会话）。
- 内部 tab/session ID（若使用共享 PTY）。
- connectionId（若是集群连接）。
- sessionGeneration。
- 授权模式。
- 授权开始时间。
- 当前状态（active/paused/revoked）。
- 观察能力等级（structured stream / screen snapshot / unavailable）。

授权不能从 Agent prompt、工具参数、Renderer 任意 payload 或历史记录中伪造。

### 5.2 “不参与”必须是真正不采集

用户选择“不参与”时：

- 不调用 TerminalObserver.inputData/outputData。
- 不创建或更新该 Session 的 AI 观察记录。
- 不允许 observe_terminal 工具读取该 Session 的旧记录。
- 不把终端原始输出附加到 Agent 对话上下文。
- 不在普通会话日志中保存终端原始输入输出。
- 不得因为已有终端 Tab 或历史授权而自动启用。
- 连接管理器为了确认 SSH 状态所需的最小解析与 AI 观察数据分离，不能将其复用为 Agent 可读取的证据。

这是本次必须补齐的核心安全缺口。

### 5.3 观察数据不自动变成无限模型输入

AI 参与观察不代表每个终端字符都实时发送给模型。

推荐流程：

1. Main 在授权范围内本地收集有限证据。
2. 输入输出先做敏感信息识别和脱敏。
3. 只保留最近且有价值的命令事件、错误输出和必要上下文。
4. 用户向墨巡提问或 Agent 明确需要当前终端证据时，才按上下文预算读取。
5. 生成摘要时保留来源、时间、目标主机、会话代次和可信度。
6. 用户结束协作或目标变化时，清除对应内存证据。

这样既能让 AI 理解本轮操作，又能避免每个终端输出都触发模型请求和 Token 消耗。

### 5.4 敏感信息处理

继续复用现有 redactSensitiveText 和 TerminalObserver 规则，并补充回归测试：

- password、passphrase、OTP、验证码和交互式密码提示。
- 私钥块、Token、Authorization Header、数据库连接凭据。
- SSH 登录、sudo、su、passwd 等敏感交互。
- vim、nano、less、top、mysql、psql 等交互程序。
- 多行粘贴、方向键、Tab 补全、控制字符和不确定输入。
- 超长输出和超长单行。
- 终端清屏、切换 alternate screen、Session 重连和主机变化。

不能为了提高命令识别率而放宽敏感输入保护。无法确认安全边界时宁可不提供原始命令文本。

### 5.5 上下文与持久化边界

- 继续采用有限内存，不新建默认永久终端录制库。
- 保留当前观察器的有限事件、字符数、时间和模型上下文预算，必要时基于实际测试微调。
- 观察原文默认不写入长期知识库、对话历史或运维 SOP。
- 用户主动要求整理本轮运维记录时，生成脱敏草稿，由用户确认后保存。
- 终端观察记录必须标记证据等级：structured、snapshot、uncertain。
- 快照内容不能被描述为“完整命令历史”。

---

## 6. Agent 权限与执行安全

### 6.1 永久禁止命令执行

保留并强化当前 Guided Ops 安全边界：

| 能力 | 最终策略 |
|---|---|
| Agent bash / shell / terminal execute | 永久拒绝 |
| Agent 向 iTerm 写入命令 | 永久拒绝 |
| Agent 向 PTY 写入、粘贴或中断 | 永久拒绝 |
| Agent 自动 SSH 登录或切换主机 | 永久拒绝 |
| Agent 自动创建可执行子终端 | 永久拒绝 |
| Agent 通过 MCP 启动 shell 或执行远程命令 | 拒绝 |
| Agent 读取用户授权的终端证据 | 允许，受 Session grant 约束 |
| Agent 提出命令建议 | 允许，仅展示和复制，不执行 |
| Agent 读取本地文件 | 按现有文件读取策略 |
| Agent 申请修改本地文件 | 继续走独立的人工文件审批 |

### 6.2 必须保留的安全防线

- Main 内 AsyncLocalStorage Agent origin。
- AGENT_CAPABILITIES 白名单和 Runtime 工具断言。
- Main Agent 和 Subagent 均不注册 bash。
- PTY/pipe 创建、写入和中断的 Main 最终防线。
- MCP 工具默认拒绝，不能通过用户配置或工具描述扩展 Agent 能力。
- observe_terminal 只读取当前 owner 和授权 Session 的脱敏证据。
- propose_command 只产生建议；UI 仅提供复制、追问和忽略。
- 文件修改审批与终端观察授权相互独立。
- Agent 取消、切换会话或关闭对话时，不能向用户终端发送 Ctrl+C。

### 6.3 清理误导性执行 UI

检查并移除只服务于 Agent 命令执行的控制项：

- ExecutionSettingsMenu 中执行模式、自动审批、命令变更策略等无效设置。
- ExecutionTargetChip 中暗示 Agent 拥有终端执行目标的展示。
- 与 Agent 命令执行绑定的 approvalPolicy、mutationPolicy、commandTimeouts 和 whitelist UI。
- 已失效的命令审批卡片、命令执行预览和执行结果状态。
- 只服务于 Agent 执行的 handoff / change-plan / 子终端控制入口。

删除前逐项检查引用。若某个能力仍服务于用户手动连接、文件审批或只读分析，则保留其独立职责，不得误删。

文件审批状态必须保留，不能把“Agent 不能执行命令”误解为“Agent 不能申请文件修改”。

---

## 7. 删除命令手册与废弃能力

### 7.1 命令手册完整移除

删除命令手册 UI、数据模型、IPC、存储和相关测试：

- CommandDirectorySheet.tsx。
- shared/command-directory.ts 及专属测试。
- main/command-directory.ts。
- preload/modules/commands.ts。
- preload/api.ts 中的 commands 暴露。
- main/index.ts 中的 registerCommandDirectoryIpc 导入和注册。
- App.tsx 中的 BookMarkedIcon、命令手册状态、懒加载、入口和弹窗。
- 所有命令手册 i18n 文案。
- 所有只为命令手册存在的客户端类型和 API。
- 命令手册 JSON 数据文件及 previous 快照的清理逻辑。

迁移要求：

- 只清理命令手册自己的 command-directory.json 和 command-directory.json.previous。
- 不触碰 Agent 对话历史、Wiki、知识库、连接配置和其他用户数据。
- 全局搜索 commands:list/save/undo/preview/execute，确认没有残留 IPC 通道。
- 删除相关文件后执行 TypeScript、Lint、CI 安全边界检查，确保没有悬空 import。
- 不要把命令手册换个名字重新做回来。

### 7.2 保留“当前回合命令建议”，不保留命令记忆

propose_command 可以继续作为临时建议能力：

- Agent 根据当前问题给出命令。
- 明确目标主机、用途、风险和预期结果。
- 用户可复制到 iTerm，自行判断和执行。
- 不写入命令目录，不自动收藏，不建立命令模板库。
- 不提供“审查后由墨巡执行”按钮。

---

## 8. 统一墨巡设计系统与主题清理

### 8.1 只保留两个主题

只保留同一设计系统下的两个外观：

- **墨巡 · 宣纸（Light）**
- **墨巡 · 夜墨（Dark）**

内部可继续复用 ink-wash-light 和 ink-wash-dark 两个稳定 ID，避免不必要的持久化迁移；展示名称按墨巡品牌规范统一。

删除旧主题：

- crescent
- night-shift
- route-survey
- ink-signal

删除对应主题定义、CSS 变量、预览卡片、i18n 名称、测试快照和旧文档说明。

### 8.2 主题迁移

- 新安装默认宣纸浅色。
- 已使用 ink-wash-light / ink-wash-dark 的用户保持原选择。
- 旧主题 ID 根据原明暗属性迁移到宣纸或夜墨，不保留旧主题视觉。
- 迁移后 ThemeSwitcher 只显示浅色/深色两个选项，不再出现六张预览卡片。
- 主题切换不重启 Electron，不重新创建 PTY 或 iTerm Session。

### 8.3 视觉约束

严格复用 Document/new/brand/brand-guide.md 和 Document/new/brand/theme/ink-wash-theme-spec.md：

- 品牌主色为墨黑、深灰、淡墨灰、宣纸白。
- 不使用蓝紫霓虹、荧光青、彩色科技节点和大面积渐变。
- 留白、细边框、清晰层级优先。
- 山水图只用于品牌、欢迎空状态或极低透明度的非工作内容区域。
- 终端、日志、代码、Diff、表格和输入文字后面不得使用水墨纹理。
- 错误、警告、成功状态保留必要语义色，但不能变成品牌主色。
- 遵循 prefers-reduced-motion 和 WCAG 对比度要求。

### 8.4 终端颜色处理

由于本次原则上移除内置终端 UI：

- 不再为一个即将移除的 xterm 页面投入大量主题美化工作。
- 外置 iTerm 继续使用用户自己的 iTerm Profile，不由墨巡擅自修改其颜色。
- 如果为诊断或兼容性仍保留任何可见的内部终端界面，必须根据墨巡主题自动适配；浅色主题下使用浅灰/暖白终端背景和深色文字，禁止继续使用大面积纯黑背景。
- 隐藏 PTY 后台桥接没有可见终端配色需求。

### 8.5 更新设计文档

同步修订：

- Document/UI_DESIGN_SYSTEM.md
- Document/EXTERNAL_TERMINALS.md
- Document/SECURITY_MODEL.md
- Document/new/USER_GUIDE.md
- Document/new/SECURITY_AUDIT.md

删除过期的“四套旧主题”“终端必须近黑色”“Agent 命令审批后执行”等相互矛盾说明。

---

## 9. App 结构与代码精简

### 9.1 不做一次性推倒重写

App.tsx 当前体量较大，但不应在一次提交中重写全部 Agent、连接和历史状态。

建议按边界渐进拆分：

- AppShell：窗口级外壳、顶部栏、侧栏和主区域。
- AppSidebar：导航、最近会话、集群入口和设置入口。
- ChatWorkspace：消息列表、空状态、输入区。
- TerminalCollaborationController：iTerm 创建、枚举、绑定、授权和生命周期。
- Session/History controllers：继续复用已有 hooks，不把业务逻辑散落到 UI 组件。

拆分原则：

- 业务状态和 IPC 调用留在 hooks/controller 或 Main service。
- 组件只接收 props 和 callbacks。
- 不为每个小按钮建立单独状态管理器。
- 不复制已有历史、知识库、连接管理和审批逻辑。
- 先保证新旧路径行为一致，再删除旧 UI。

### 9.2 删除终端布局状态

移除 split/chat/terminal 三种主工作区模式和相关 UI：

- 删除或简化 shared/workbench-layout.ts。
- 移除 workbench-layout IPC、持久化和 paneOrder。
- 不再在 Settings 或 AgentPanel 中选择 terminal/split/chat。
- 旧持久化值迁移为 chat-only，不因为旧值导致启动空白或回到终端页。
- 删除拖动分隔线、右侧“打开对话”竖条和终端独占布局逻辑。

如果主进程仍需要记录活动 iTerm Session，使用独立的会话状态，不再复用 WorkbenchLayout。

### 9.3 xterm 依赖清理

在删除 TerminalPane 后执行全仓引用分析：

- 检查 @xterm/xterm、@xterm/addon-fit、xterm。
- 如果只用于内置终端 UI，则移除依赖、CSS import、生命周期 hooks、类型和测试。
- node-pty 不要跟随 xterm 一起删除；如果隐藏共享 PTY 仍依赖 node-pty，则保留。
- 不要为了减少依赖而破坏 iTerm 共享 PTY、SSH 登录和观察能力。
- 删除后更新 package.json/package-lock.json 并进行干净安装验证。

### 9.4 清理低价值状态与显示

- 移除终端 Tab、子终端、内置终端活动状态和无效恢复 UI。
- Token 统计和上下文占用默认折叠。
- 将低频功能收纳到侧栏或设置，不再把图标堆在顶部。
- 保留连接错误、Agent 运行、文件审批和 AI 观察状态等真正影响用户决策的信息。
- 不新增常驻状态面板来替代被删除的终端面板。

---

## 10. 实施阶段与顺序

### Phase 0：基线审查与依赖图

目标：避免误删、避免重复实现。

任务：

1. 阅读 AGENTS.md、.cursor/rules、pi-dev、electron-development 和相关文档。
2. 复核本计划列出的代码现状。
3. 建立 TerminalPane、PTY、iTerm、SSH 登录、TerminalObserver、Agent tool、CommandDirectory 的引用图。
4. 搜索所有命令执行入口、terminal write、paste、interrupt、MCP、subagent 和 change-plan 调用。
5. 明确哪些模块是 UI、哪些是连接管理、哪些是 AI 观察、哪些是 Agent 能力。
6. 输出短的实施前检查清单，不修改远程主机和用户 iTerm 配置。

完成条件：Codex 能明确指出每个将删除模块的全部调用方，以及每个保留模块的实际职责。

### Phase 1：终端观察授权和安全门控

目标：先确保 AI 不会在用户选择“不参与”时读取终端数据。

任务：

1. 增加 Main-only TerminalObservationGrant。
2. 将授权与 owner、iTerm Session UUID、connectionId、sessionGeneration 绑定。
3. 对 observeTerminal、terminalEvidence 和 observe_terminal tool 增加授权校验。
4. 用户选择 off 时，观察器不接收数据，不保留证据。
5. 用户暂停或撤销授权时立即停止采集并清除本轮证据。
6. 用户切换连接、Session UUID 或 sessionGeneration 时撤销旧授权。
7. 保留当前脱敏和内存上限。
8. 让 snapshot evidence 和 structured command evidence 使用不同类型/可信度。
9. 增加 Agent 无法写入 iTerm、PTY、pipe 的安全回归测试。

完成条件：不授权时 Agent 无法读取任何本轮终端内容；授权后只能读取精确绑定 Session 的脱敏证据。

### Phase 2：iTerm 工作流技术验证

目标：先验证能力边界，再决定 UI 和实现细节。

必须实际验证：

1. iTerm Session 枚举是否稳定，Session UUID 是否能精确绑定。
2. 新建共享 PTY 会话是否能保持原有 SSH 卡片登录、密码提示和连接状态流程。
3. 共享 PTY 是否能在没有 xterm Renderer 的情况下运行。
4. 新建本地 Shell 的 iTerm 打开流程。
5. 已有 iTerm Session 的屏幕读取范围。
6. iTerm 当前 API 是否能够读取滚动缓冲区历史，若可以，读取范围和上限是什么。
7. 已有 Session 的快照轮询是否存在明显遗漏。
8. SSH 远端 Shell 是否有可信 OSC 133 命令边界；没有时是否只能提供 snapshot/uncertain 级证据。
9. 暂停观察、结束观察和关闭墨巡绑定是否不影响用户 iTerm 会话。
10. 墨巡退出时共享 PTY 的真实生命周期。

验证原则：

- 不安装远端 Shell Integration。
- 不向集群发送探测命令。
- 不把屏幕快照包装成完整历史。
- 不把本地 Shell 的 OSC 133 能力推断为远端 Shell 能力。
- 如果某项能力无法稳定实现，采用明确降级，而不是用猜测补齐。

完成条件：形成真实 iTerm 集成测试记录，标注每种模式的能力和限制，再进入 UI 改造。

### Phase 3：外置终端工作流实现

目标：统一集群卡片、本地终端和已有会话入口。

任务：

1. 集群卡片连接统一改为 iTerm 外置终端。
2. 移除 ConnectionTerminalDialog 中的内置终端选项。
3. 新增本地 iTerm 打开入口，不自动连接远程主机。
4. 保留已有 iTerm Session 列表和精确选择。
5. 连接/打开/接入之前显示 AI 协作授权。
6. 三种授权模式根据 Session 类型显示真实能力说明。
7. 连接成功后只显示简洁状态，不显示内部终端镜像。
8. 用户结束 AI 协作只撤销观察，不关闭用户已有 iTerm。
9. 清理失效 Session、自动化权限拒绝、iTerm 关闭和重新挂接状态。
10. 复用现有连接卡片认证和 SSH 登录逻辑，不重写一套登录器。

完成条件：三个入口均可用，且没有内置 xterm 画面。

### Phase 4：移除内置终端 UI 与布局

目标：让对话成为唯一主工作区。

任务：

1. 新增 ChatWorkspace 和 AppSidebar 基础结构。
2. 把连接卡片从 TerminalPane 中抽离到侧栏的集群入口。
3. 删除 TerminalPane 可视区域和终端 Tab UI。
4. 删除 split/terminal 布局、拖动分隔线、paneOrder 和右侧聊天竖条。
5. 移除子终端 UI 和只为它服务的状态。
6. 只保留真正需要的后台 PTY/SSH/iTerm 桥接。
7. 清理 xterm 依赖和生命周期代码。
8. 默认启动进入纯对话工作区。
9. 旧 workbenchLayout 持久化值安全迁移到 chat-only。
10. 确认连接管理、Agent 对话、历史会话、文件审批和桌宠不受影响。

完成条件：应用启动后没有终端黑色大画布；用户可以从侧栏连接集群或打开 iTerm。

### Phase 5：极简侧栏和聊天 UI 重构

目标：让第三张截图所代表的纯对话模式成为正式产品首页。

任务：

1. 实现默认收窄、可展开的侧栏。
2. 接入新建对话、最近会话、集群、知识与资料、设置。
3. 低频入口收纳到设置或二级菜单。
4. 顶部栏精简为品牌、会话标题和少量高频操作。
5. 重构消息流宽度、用户消息、AI 回复、结果卡片和代码块层级。
6. 输入区固定底部，附件和文件审批状态清楚。
7. 默认折叠思考过程。
8. Token/上下文统计默认隐藏。
9. 统一空状态、加载、错误、断线和权限状态。
10. 键盘导航、焦点、快捷键和 reduced motion 一并验收。

完成条件：纯对话页面在常用窗口尺寸下信息密度合理，阅读宽度舒适，侧栏不抢占主体空间。

### Phase 6：主题和命令手册清理

目标：删除旧视觉和旧功能，不留下幽灵入口。

任务：

1. 只保留墨巡浅色和深色主题。
2. 清理旧四套主题定义、CSS、预览和文案。
3. ThemeSwitcher 改为简单两态选择。
4. 迁移旧主题存储值，保持用户原有明暗偏好。
5. 完整删除命令手册 UI、Main IPC、Preload API、数据模型和存储。
6. 删除 command-directory.json 与 previous 文件的专属迁移清理。
7. 清理无效执行设置和命令审批 UI，但保留文件审批。
8. 更新 UI_DESIGN_SYSTEM、EXTERNAL_TERMINALS、SECURITY_MODEL、USER_GUIDE、SECURITY_AUDIT。
9. 全仓搜索旧主题 ID、命令手册文案和 commands:* IPC，确认无残留。

完成条件：UI 中只有两种墨巡外观，没有命令手册入口或命令模板数据链路。

### Phase 7：性能、可靠性与代码整理

目标：在功能收敛后减少启动和运行负担。

任务：

1. 确认应用启动不初始化 xterm、不创建无用 PTY、不自动轮询 iTerm。
2. iTerm Session 列表仅在用户打开选择器时读取，不做后台高频扫描。
3. AI 观察器只在授权时工作，且按需提供模型上下文。
4. 对快照、PTY 输出、Observer 缓存设置严格上限。
5. 对 JXA 调用设置超时、取消和单 Session 防重入。
6. 对 App.tsx 按职责渐进拆分，不做无边界大重写。
7. 移除不再使用的依赖、CSS、类型、i18n 和测试。
8. 检查内存泄漏、重复轮询、重复事件订阅和会话清理。
9. 检查窗口尺寸变化、最小窗口、长会话和大量历史记录下的表现。

完成条件：无无用终端进程、无隐藏高频轮询、无重复状态来源，启动和聊天滚动性能不低于当前版本。

### Phase 8：完整回归和交付记录

完成所有本地安全、单元、构建和实际 iTerm 集成验证，输出测试记录，不提交 Git。

---

## 11. 重点验收矩阵

### 11.1 首页与布局

- [ ] 新安装默认进入纯对话页面。
- [ ] 已有用户升级后也进入纯对话页面，不恢复终端优先布局。
- [ ] 默认侧栏收窄，可展开和收起。
- [ ] 侧栏状态可持久化。
- [ ] 没有 split/terminal 布局切换按钮。
- [ ] 没有内置终端大画布和右侧竖向聊天入口。
- [ ] 对话区域最大宽度合理，长消息滚动正常。
- [ ] 输入区固定底部，附件和文件审批流程正常。
- [ ] 思考过程默认折叠。
- [ ] Token/上下文统计不再占据常驻大面积空间。
- [ ] 桌宠开关仍可用，不遮挡输入区。

### 11.2 外置终端

- [ ] 从集群卡片连接会启动正确的 iTerm Session。
- [ ] 集群 SSH Host、端口、用户、IdentityFile、SSH Options 和原有登录动作保持正确。
- [ ] 打开本地终端不会自动 SSH。
- [ ] 可以列出并选择已有 iTerm 窗口、Tab 和分屏。
- [ ] Session UUID 绑定准确，不会误接相邻 Tab。
- [ ] 已有会话关闭后能准确显示断开。
- [ ] 墨巡解除绑定不会关闭原有 iTerm 会话。
- [ ] iTerm 自动化权限拒绝时有明确提示。
- [ ] iTerm 未安装时不会降级为本机 Shell 伪装连接成功。
- [ ] 新建共享 PTY 的输入输出与 SSH 登录状态保持正常。
- [ ] 没有内置终端 UI 时，iTerm 仍能独立正常使用。

### 11.3 AI 观察权限

- [ ] 每次新建/接入 Session 都要求用户选择本轮权限。
- [ ] 默认是“不参与”。
- [ ] 不参与时不生成 TerminalObserver 证据。
- [ ] 不参与时 observe_terminal 不可读取该 Session。
- [ ] 从现在开始模式不读取授权前内容。
- [ ] 加入当前上下文模式显示真实读取范围和时间。
- [ ] 已有 iTerm 的历史读取不宣传为完整历史，除非技术验证确实证明。
- [ ] 快照不会生成伪造的命令边界、命令退出码或确定性执行结论。
- [ ] 暂停后不继续收集；恢复后不补采暂停期间内容。
- [ ] 结束协作后撤销授权并清理对应内存证据。
- [ ] 连接目标变化或 Session Generation 变化时旧证据失效。
- [ ] 密码、OTP、私钥和敏感交互内容不会进入 Agent 上下文。
- [ ] AI 只在需要时读取有限上下文，不会每个输出片段都触发模型请求。
- [ ] Agent 无法通过 prompt 或工具参数恢复观察授权。

### 11.4 Agent 执行安全

- [ ] 主 Agent 工具列表没有 bash。
- [ ] Subagent 工具列表没有 bash。
- [ ] 不存在可用的 terminal.execute 工具。
- [ ] Agent 不能向 terminal:write、paste-command、PTY、iTerm write 注入内容。
- [ ] Agent 不能发送 Ctrl+C、中断或关闭用户终端。
- [ ] Agent 不能通过 MCP 或子进程执行命令。
- [ ] Agent 可以提出命令建议，但只能由用户复制并手动执行。
- [ ] 文件修改仍必须经过完整人工 Diff 审批。
- [ ] scripts/check-security-boundaries.cjs 继续覆盖这些边界。

### 11.5 主题和精简

- [ ] 主题列表只有宣纸浅色和夜墨深色。
- [ ] 旧主题 ID 不再出现在 UI、CSS 和配置选项中。
- [ ] 旧用户主题偏好安全映射到新浅/深模式。
- [ ] 浅色模式整体协调，无残留大面积黑色内部终端区域。
- [ ] 深色模式保持墨黑灰层次，不出现旧蓝紫霓虹。
- [ ] 命令手册入口、组件、API、IPC、数据文件和文案均已移除。
- [ ] 不影响会话历史、知识库、Wiki、本地文件、连接配置和桌宠。

---

## 12. 测试要求

遵守 Document/TESTING.md 和 AGENTS.md：测试文件为本地测试资产，不提交 Git；不要绕过安全检查。

### 12.1 静态与构建

至少执行：

~~~bash
npm run lint
npm run test
npm run typecheck
npm run build
npm run test:local
~~~

如果项目本地测试文件尚未恢复，先按 Document/TESTING.md 使用 scripts/restore-local-tests.sh 恢复本地测试；不要把测试文件提交。

### 12.2 iTerm 真实集成

复用并扩展已有测试，不要只用 mock 证明真实 iTerm 能力：

~~~bash
CRESCENT_LOCAL_TESTS=1 MOXUN_ITERM_LIVE=1 npx vitest run src/main/terminal/external/live-iterm.test.ts
~~~

同时按现有测试入口验证 Electron 与连接卡片：

~~~bash
npm run build
CRESCENT_LOCAL_TESTS=1 MOXUN_ELECTRON_LIVE=1 npx vitest run src/main/terminal/external/electron-iterm.test.ts
~~~

如果当前实际测试文件名与上述示例不同，以仓库真实文件为准，不要为了匹配文档而虚构测试文件。

连接卡片验收继续使用项目已有的 MOXUN_CONNECTION_CARDS_LIVE=1 路径，但必须使用隔离的本机回环 SSH fixture，不连接保存的业务集群。

### 12.3 必须新增/更新的本地测试场景

- ObservationGrant：off/live/context+live/pause/resume/revoke。
- Owner、Session UUID、connectionId 和 generation 绑定。
- 未授权时 observe_terminal 拒绝读取。
- 撤销后历史证据不可再读。
- 已有 iTerm 快照不产生伪造命令事件。
- OSC 133 边界不完整时输入不泄漏。
- 私钥、密码、OTP、交互程序输出脱敏。
- iTerm Session 消失、JXA 超时、重复轮询和取消竞态。
- 用户关闭绑定不关闭原 iTerm Session。
- App 退出时共享 PTY 的真实清理行为。
- 旧 workbenchLayout 数据迁移。
- 旧主题 ID 映射。
- 命令手册 IPC 不再注册。
- Agent 主会话和子会话均不能执行命令。
- 文件审批仍能正常工作。
- 侧栏折叠、展开、窗口缩放和键盘导航。
- 长对话滚动、消息流跟随和底部输入区固定。

### 12.4 验收记录

在 Document/new1 中另行生成简短实施记录或测试报告，至少记录：

- 实际修改的文件和模块。
- 删除的旧功能和依赖。
- iTerm 三种入口的真实测试结果。
- 每种 AI 观察模式的实际读取范围。
- 观察器授权和脱敏测试结果。
- Agent 命令执行拒绝证据。
- 主题迁移结果。
- lint、security、typecheck、build、local tests 结果。
- 未通过项、已知限制和后续建议。

不得把 mock 测试结果写成真实 iTerm 集成通过，不得把屏幕快照写成完整终端历史。

---

## 13. 明确不做的事情

本次不新增以下内容：

- 命令手册、命令收藏、命令模板、特殊命令记忆。
- Agent 自动执行命令、自动输入终端或自动确认执行。
- 内置终端多标签、分屏和子终端工作台。
- 终端录制中心、永久终端日志库或云端终端历史。
- 自动安装远程 Shell Integration。
- 自动修改 iTerm Profile 或用户 Shell 配置。
- 新的运维仪表盘、集群监控大屏、任务编排中心。
- 新的插件市场或自动化工作流中心。
- 第三套及更多主题。
- 新品牌图标或重新设计山水图形。
- 与本次目标无关的 Agent Runtime 大规模升级。

如果实施过程中发现额外想法，先记录为后续建议，不要顺手加入本次范围。

---

## 14. Codex 最终执行要求

1. 先完成 Phase 0 依赖图和技术验证，再进入大规模 UI 删除。
2. 先确保授权门控和 Agent 禁止执行命令的安全边界，再接入终端观察。
3. 对 iTerm 历史读取能力保持保守；没有证据就明确降级，不得宣称读取完整历史。
4. 不允许为实现 AI 观察而向远程集群注入命令或安装组件。
5. 不允许因删除 TerminalPane 而删除共享 PTY、SSH 登录或连接状态管理中仍然必要的后端能力。
6. 不允许因保留共享 PTY 而继续显示内置终端 UI。
7. 不允许因删除命令手册而删除普通对话历史、知识库和文件审批。
8. 不允许保留无效的命令执行按钮、执行模式设置或误导性权限文案。
9. 不允许用新增复杂状态管理器替代旧终端状态管理器。
10. 每个阶段完成后运行对应测试，发现回归先修复，不把失败留到最后。
11. 不提交 Git、不推送、不打包；只做本地实现和验收记录。
12. 最终汇报必须区分：已实现、已验证、部分支持、未支持和已知限制。

**最终产品验收标准：打开墨巡后首先看到的是简洁、稳定、协调的 AI 对话工作区；需要操作时，从集群卡片或终端入口打开 iTerm；用户明确授权后，AI 才能读取本轮可访问的终端上下文；Agent 永远不能替用户执行命令。**
