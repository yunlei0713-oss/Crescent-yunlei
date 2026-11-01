# 墨巡实施记录

需求基线：`CODEX_MOXUN_GUIDED_OPS_REDESIGN_PLAN.md`。开始日期：2026-10-30。

## Phase 0：实际复核

- 工作区已有 App、AgentPanel、AgentLogList、WhaleMonitor、滚动跟随与 i18n 改动，以及执行设置/宠物菜单新文件；继续在这些改动上实施。
- Pi 三包均为 1.0.3；已阅读项目规则、pi-dev、electron-development、已安装 SDK 文档与声明。
- SDK 的 `tools` 替换默认工具集；`customTools` 也须列入；`AgentSession.prompt(text, { images })` 接收真正的 ImageContent。

### 现有调用链与缺口

```text
agent:run → runPiAgent → createPiRuntime → Pi tool calls
  ├─ bash → pi-terminal-bash → terminal/ipc → session.write → PTY
  ├─ subagent → openAgentSubterminal → Renderer SSH 登录/保存的 actions
  │           → child runtime → bash + Pi 默认 read/edit/write
  ├─ submit_change_plan → submitAndExecutePlan → host.execute → bash/PTY
  ├─ MCP → stdio 启动命令 / HTTP → callTool（普通审批不能证明无副作用）
  ├─ read → Main LocalDocumentReader（已有限额、路径与敏感文件控制）
  ├─ edit/write → 通用命令审批 → Pi 文件工具（缺完整 diff、写后校验）
  └─ create-skill/create-sop → 草稿事件 → 用户确认后 Main 存库

xterm.onData → preload terminal.write → rendererIpc 验证窗口/主 frame → PTY
```

- 终端写入口还包括 paste-command、detach 子终端、脚本 runner、中断和 teardown。必须用 Main 内可信调用上下文阻止 Agent，不能相信 payload.actor。
- 本机配置、Skill 安装、知识库/SOP、附件保存由独立用户 IPC 发起，不注册为任意 Agent 写入/进程工具。
- MCP 尚无可核验的实现审计材料：全部默认拒绝，包括连接时的 stdio 启动；配置和发现界面保留。名称、描述、readOnlyHint、普通设置和用户批准都不构成实现审计。
- 主题统一注册在 shared/theme-definitions.ts；现有持久化在 renderer/lib/app-theme.ts。
- 图标链路为 scripts/generate-icons.cjs，批准的新资源位于 new/brand。

### 修改顺序

1. Main 默认拒绝能力策略、可信异步调用域、工具初始化/切换断言；移除执行工具、封锁旧入口与 MCP。
2. 专用文件申请服务：精确快照、完整差异、一次性审批、过期、路径与写后验证。
3. 有限内存的只读观察器：OSC 133、保守输入识别、脱敏、身份绑定、故障隔离。
4. 主进程单步建议及证据状态、复制/追问 UI、全风格指导提示。
5. 附件校验与文本/PDF 提取、原生图片传输、明确模型能力。
6. 墨巡名称、统一图标、宣纸/夜墨主题、工作区与权限状态。
7. 本地安全/集成测试、CI、隔离 Electron 与 Mac 打包验证。

### 修改前测试基线

- `npm run ci`：失败于 new/brand/source/generate-brand-assets.cjs（8 个 CommonJS/返回类型 lint 错误及格式警告）；crescent-store.ts 有既存格式警告。
- `npm run test:local`：40 个文件，38 通过；245 测试，242 通过、3 失败。pi-local-files 首次 SDK 加载超时及后续快照测试失败；WhaleMonitor Electron fixture 未启动。
- 未连接生产环境或调用真实付费模型。

## Phase 1：全局安全底座

- `src/main/security/agent-capability-policy.ts` 为不可由配置扩展的工具白名单；`capability-enforcement.ts` 以 Main 内 `AsyncLocalStorage` 标记 Agent 调用域。
- Runtime 创建、切换工具和每次 prompt 都断言白名单；每个活跃工具必须有审核后的 host 实现，禁止回落 Pi 内建工具。`tools` 和 `customTools` 同时校验。
- 主 Agent 不再注册 bash、Pi edit/write、open_subterminal、submit_change_plan。子 Agent 仅注册 host `read`，证据窗格不会启动 Shell/SSH。
- 旧 bash、审批后执行、Agent 子终端、自动变更计划入口显式拒绝；PTY/pipe 创建、写入、中断再校验可信调用域。取消 Agent 不向人工终端发送 Ctrl+C。
- 所有未审计的 Agent MCP 在连接前拒绝；独立用户配置/发现 UI 保留。完整入口清单见 [SECURITY_AUDIT.md](SECURITY_AUDIT.md)。
- 工具 profile 升级为 `moxun-guided-ops-v1`；旧执行策略和四种回复风格均不能恢复能力。

## Phase 2：本地文件审批

- `request_file_change` → Main 专用服务 → preload 事件 → `FileChangeReview.tsx` → Main 消费审批。
- 支持 create/update/overwrite/delete/move/mkdir/rmdir；所有文件完整 Diff、原始/新内容、理由、有效期、风险和回滚说明均可查看。现有文件变更逐文件强确认。
- 绑定窗口 owner、run、规范路径、操作、原始快照与新内容 SHA-256、完整预览 digest、最长 5 分钟有效期；一次性审批，拒绝伪造与重放。
- 拒绝路径穿越、符号链接、硬链接、敏感文件、非 UTF-8/二进制、重叠变更；授权父路径并核验 inode。使用 Pi `withFileMutationQueue`、`O_NOFOLLOW`、新文件独占创建和写后复读校验。
- 取消、窗口销毁、发送失败和等待时文件变化均拒绝落盘。批量遇错停止，分别报告已验证 `applied` 和可能变更 `touched`，不虚报全量成功。
- 上限：64 KiB/文件、16 项/申请、512 KiB 完整预览；非空目录不递归删除。审批内容不会作为普通工具参数写入聊天记录。

## Phase 3：Terminal Observer

- 在 Main 用户输入/传输观察点旁路接入，模块无终端句柄或执行回调，异常隔离后人工终端继续工作。
- 采用 OSC 133 A/B/C/D 真实边界；无可靠边界、历史/补全、多行粘贴或交互输入保守隐藏，不从提示符推断成功、不注入辅助命令。
- 密码/OTP/私钥与敏感输出脱敏；绑定窗口、tab、connection、host、generation、cwd 和时间。换主机/重连清理旧证据。
- 每终端最多 20 事件、16K 字符/输出、64K 总输入输出、30 分钟内存；上下文预算计入 JSON 元数据及转义，8K–64K 可配，默认 32K。

## Phase 4：Guided Ops

- Main `GuidedOpsService` 保存真实状态、当前建议、30 条历史建议及证据；每个用户回合至多接受一个结构化建议。
- 建议含判断、目标、命令、主机/会话、风险、用途、预期和异常处理；UI 提供复制、追问、跳过、改方向、结束及证据时间线。
- 复制调用 `navigator.clipboard.writeText`；无终端发送按钮。主机身份变化与新回合使旧建议失效。
- 四种风格只改变表达。新方向先取消并等待 Main teardown，保护新草稿，解决取消立即重发的 busy 竞态。
- 人工连接通过连接 UI；聊天不再自动匹配连接/启动 SSH。结果分析由用户点击“分析结果”或发送新消息触发。

## Phase 5：多模态

- 使用已安装 Pi 1.0.3 的真实 `session.prompt(text, { images })`；图片经 Main 授权读取、签名/MIME/尺寸校验、原生解码和缩放后作为 ImageContent 发送。
- 自定义模型明确声明 `imageInput`，编辑列表以 ` | image` 标记；同模型 ID 的能力变化也更新 Runtime。文本模型发送前拒绝图片，不产生模型网络请求。
- 输入区支持拖入/粘贴图片和多个文件、预览、移除、大小/格式提示。发送图片前有原生隐私确认，可取消。
- 文本、日志、配置、代码与 PDF 提取后脱敏。Main 延迟原生导入 PDF.js legacy；打包保留 worker、标准字体和 CMaps，不依赖 native canvas。
- 上限：8 附件、5 MiB/文件、20 MiB/回合；图片 8192px/16MP、发送边长缩至 2048；文本 64K/文件、128K/回合；PDF 2 MiB/30 页。扫描 PDF 提示提供页面图片。

## Phase 6：品牌与主题

- 应用显示名墨巡，窗口 `墨巡 · MoXun`；内部包名、`com.crescent.app`、更新仓库和历史数据目录保留。
- 批准山水主图接入 `scripts/generate-icons.cjs`；旧图标备份在品牌归档，统一生成 build/resources/renderer/favicon。`npm run icons` 已成功。
- 注册“水墨山河·宣纸”和“水墨山河·夜墨”，新用户默认宣纸，旧主题仍可读取。主题切换及持久化沿用原机制。
- 两个主题终端均为高对比纯色深底，代码、Diff 无纹理；去除水墨主题旧彩色输入框光效，审批面板不透底。
- 终端/聊天分隔线支持拖动和键盘调节并保留宽度；固定权限状态，多模态输入与建议/证据已接入工作区。
- 移除 GitHub UI 外链及点击入口；改写欢迎页、设置、工具、历史计划和通知中的旧执行/品牌文案。

## Phase 7：验证与交付

验证分为本地 Vitest、编译后的 Electron Main/preload/IPC/UI、实际 Universal 包三层；使用本地确定性模型端点和隔离目录。

### 已取得的结果

- 改造中间版本完整 `npm run verify:local` 通过：47 文件、271 项；日志 `moxun-verify.log`。后续增加工具记录脱敏测试，最终结果见 [TEST_REPORT.md](TEST_REPORT.md)。
- 第一轮完整 Electron 验收 40 项通过：原生 PTY、主/子 Agent 拒绝执行、文件审批、取消重发、双图真实数据块、文本模型拒绝、PDF 文本提取、配置切换、双主题持久化。
- 扩展轮已实际验证跨窗口代批拒绝、owner 销毁失效、真实聊天建议卡片、复制零终端写入、完整 Diff 及批准按钮。扩展 runner 的关闭断言曾误匹配常驻隐藏 dialog，已收窄为文件审批 dialog。
- 最终 `verify:local` 通过：324 项静态边界检查、48 文件/273 项本地测试；编译 Electron 最终 50 项通过，报告 `moxun-e2e-JfhN3Q/report.json`。
- UI 验收发现并修复 Agent 忙碌时的人工终端输入锁；实际 xterm 键盘输入在推理期间能进入终端 IPC。完整 Diff/原文件内容可选中备份。双主题、审批和紧凑布局运行截图已检查。
- Universal `.app`/DMG/ZIP 已生成于 `dist/moxun-20261030/universal/`；29 项完整性/双架构/资源检查通过，288 个编译文件与冻结输入一致。
- 包内完整 Electron runner 50 项通过；直接启动实际 `墨巡.app/Contents/MacOS/墨巡` 的 16 项检查通过，涵盖 Pi、人工 PTY、文件审批和无 native canvas 的 PDF 文字提取。产物 SHA-256 与证据路径见测试报告。
- 修复验收发现的真实问题：同 ID 模型能力更新、会话重建误判 busy、取消 teardown/新草稿竞态、图片/PDF 处理取消、观察器 JSON 上下文预算、工具记录原文暴露及旧输入框彩色光效。

### 交付文档

- [SECURITY_AUDIT.md](SECURITY_AUDIT.md)：工具权限、终端执行链、文件/MCP 审计及残余边界。
- [USER_GUIDE.md](USER_GUIDE.md)：人工操作、文件审批、多模态、数据保留和迁移说明。
- [TEST_REPORT.md](TEST_REPORT.md)：最终门禁、Electron/UI、Universal 产物、证据路径及未完成真机验收。
- 修改范围为本文各阶段列出的模块及其 shared/preload/i18n/打包/图标资源。工作区原有滚动、桌宠与 UI 改动继续保留；未提交、推送或发布。

### 明确限制

- 未连接生产环境或付费模型；本地端点证明 SDK 传输与工具边界，不证明所有供应商视觉识别质量。
- 图片隐私原生确认在自动验收中使用明确的响应夹具，不能替代真人检查图片内容。
- 无 OSC 133 时只提供脱敏输出与不确定状态；不采集可能是密码的原始输入，不安装或注入 shell integration。
- 文件路径存在外部并发 TOCTOU 的残余边界，未实现 native openat 目录句柄链；批量变更不承诺事务回滚。
- Main 强制单个结构化步骤，但不能保证任意模型自然语言永不输出多条命令；自然语言内容不具备执行通道。
- 实际历史个人数据、生产 SSH/跳板、sudo、数据库交互及 Apple Silicon 真机由后续隔离人工验收补齐；不得将静态架构检查记为真机运行通过。
