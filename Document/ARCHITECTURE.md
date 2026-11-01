# 墨巡（MoXun）Architecture

当前产品是 **聊天优先 + 外部 iTerm 人工操作 + 可选只读观察** 的 Electron 工作台。Pi 是 Main 中的客座模型运行时，不持有终端输入权限。本文以 2026-11-01 工作区实现为准；旧架构资料见 [归档说明](archive/README.md)。

## 进程与依赖方向

| 层 | 职责 | 入口/关键文件 |
| --- | --- | --- |
| Main | OS、窗口、SSH/PTY、授权、文件、DB、密钥、模型生命周期 | `src/main/index.ts`、`src/main/ipc-security.ts` |
| Preload | contextBridge、按领域暴露有限且有类型的 IPC | `src/preload/api.ts`、`src/preload/modules/` |
| Renderer | 聊天、连接操作、设置和审批呈现；不能直接访问 Node/fs | `src/renderer/src/App.tsx`、`src/renderer/src/clients/` |
| Shared | 纯类型、验证策略、主题与目录元数据；不反向依赖其他进程 | `src/shared/` |

Renderer → typed Preload → Main；各层可以使用 Shared。Main IPC 通过 `rendererIpc` 校验 sender、origin、主 frame 及 payload；不向 Renderer 暴露任意 channel。窗口保持 sandbox、contextIsolation、关闭 nodeIntegration。安全决策不能只放在 UI 或提示词。

## Pi Agent 与工具

`src/main/agent/ipc.ts` 接收运行请求，`src/main/agent/pi-host.ts` 管理 hosted session、模型切换、run owner、取消、压缩及会话互斥；`src/main/agent/runtime/types.ts` 是宿主契约，`src/main/agent/runtime/pi/runtime.ts` 实现 Pi 适配。ESM Pi 只能经 `src/main/agent/pi-sdk.ts` / `src/main/agent/runtime/pi/loader.ts` 动态加载，不能静态塞入 CJS Main。

`createAgentSession({ tools })` 是替换默认工具集的 allowlist，custom tools 也必须列入。工具来源及实际注册见 `src/shared/agent-tool-catalog.ts` 和 `pi-host.ts`：授权本地读取、代码索引、memory、观察证据、建议、文件变更提议、只读子任务与知识草稿。生产会话不加载项目 Pi extensions。

- `src/main/security/agent-capability-policy.ts` 与 `src/main/security/capability-enforcement.ts` 在 Main 拒绝 Agent-origin 终端执行、写入和中断。
- `src/main/agent/pi-terminal-bash.ts` 暂保留共享 run/目标上下文与 fail-closed 旧入口；名字不代表 bash 能力。文件审批、捕获与子任务仍读取该上下文。
- `src/main/agent/pi-subagent.ts` 的 child runtime 仅分析，不创建终端、不登录 SSH、不写文件，不再停靠子终端面板。
- `src/main/agent/pi-mcp-tools.ts` 的已审计实现名单为空，Agent MCP 连接/调用禁用。设置侧显式目录发现不等于 Agent 工具授权。
- OpenAPI 配置只作历史兼容，当前 Agent 不注册 OpenAPI 工具。

## 人工连接、Session 与 iTerm

`src/main/terminal/ipc.ts` 保持集中注册入口。`src/main/terminal/session/manager.ts` 是 session Map、连接状态、输出缓存和 waiters 的唯一 owner。`src/main/connections/ipc.ts` 负责 SSH 配置、排序和持久化。

连接卡片 → `src/renderer/src/hooks/useConnectionTerminalChoice.ts` → Main 创建 shared PTY/iTerm → 当前保存连接配置的 SSH 登录流程。独立外置终端入口 → `src/renderer/src/hooks/useExternalTerminals.ts` → 新建本机 shared iTerm 或只读绑定已有 iTerm；不隐式连接集群。

`src/main/terminal/external/shared-session.ts`、`src/main/terminal/external/observed-session.ts` 和 `src/main/terminal/external/iterm.ts` 分别承担人工桥接、已有会话绑定与原生集成。用户在 iTerm 输入命令；已有 iTerm 的解绑不发送 exit/Ctrl+C、不关闭用户 shell。Main 退出仅回收自身桥接/PTY，生命周期见 `src/main/terminal/session/pty-lifetime.ts`。终端协议 `TERM=xterm-256color` 仍必要，与内嵌终端 UI 无关。

## 观察授权与证据

`src/main/terminal/observer/registry.ts` 持有 grants、observer、采样停止回调和证据缓存；`terminal/ipc.ts` 将观察请求绑定 owner/tab/session generation/iTerm UUID/连接/host。默认 `off`，`live` / `context-live` 开启和恢复必须 Main 原生确认。

暂停、撤销、身份变化同步停止采样并清除证据，不能跨会话重用；授权前/暂停期内容不回放。已有 iTerm 提供有限可访问文本快照（不保证全部滚屏、完整输出或退出码）；shared PTY 仅在可靠 OSC 133 边界下形成结构化证据，不为观察向远程 shell 注入命令。证据先脱敏，内存缓存最多 20 events、16K/event、64K total、30 分钟。`observe_terminal` 按需读取；建议复制再次检查目标有效性，永不写终端。

## 本地资料、项目和文件审批

`src/main/projects.ts` 的原生目录选择创建项目授权，激活时再次验证真实路径、非 symlink 和可访问性；不能把侧栏 ready 当安全授权。`src/main/local-document-ipc.ts` / `src/main/local-document-reader.ts` 限制 owner/root、文件类型、大小、secret path 与 symlink。`src/main/code-intelligence/` 持有代码索引及 Worker/WASM 边界。

`src/main/agent/pi-local-files.ts` 的 `read` 与 `request_file_change` 独立于 SSH 目标。后者 → `src/main/agent/file-approval-service.ts` → Renderer `src/renderer/src/components/FileChangeReview.tsx` 完整 Diff/逐文件决定 → Main 原生确认 → 一次性校验 owner/run、路径、内容 hash、时效 → mutation queue 和写后验证。拒绝/失效不改变文件字节，不注册 Pi 内建 write/edit。

## 存储与历史兼容

`src/main/crescent-store.ts` 存储配置并保护密钥；`src/main/crescent-sqlite.ts` 拥有 SQLite schema、migration、事务和会话/知识记录；`src/main/sqlite/rows.ts` 校验投影字段。`src/main/storage/ipc.ts`、`src/main/memory/service.ts`、`src/main/agent/skills.ts` 分别管理历史/知识存储、memory 与 Skill 发现/导入/验证。Renderer 不直接写应用资料树。

`src/main/retired-data-migration.ts` 及历史 session/approval/执行意图解析仍保留兼容；历史 Timeline 的命令与审批只读呈现，不能批准重跑。恢复使用当前连接配置，不恢复旧批准或观察授权。

## Renderer 结构与状态 owner

- `App.tsx` 顶层协调；`hooks/useTerminalTabs.ts` 管理 tab 派生/保存，`hooks/useHistoryController.ts` 管理历史，`hooks/useAgentController.ts` / `hooks/useAgentRuns.ts` 管理运行事件，`hooks/useSessionPersistence.ts` 管理持久化。
- `components/AppSidebar.tsx`、`components/ChatWorkspace.tsx`、`components/AgentLogList.tsx` 组成聊天主布局，Composer 固定，会话详情默认折叠。
- `components/ConnectionManagerModal.tsx`、`components/ConnectionTerminalDialog.tsx`、`components/ExternalTerminalDialog.tsx` 承担不同人工操作入口。
- `hooks/useTerminalCollaborationLifecycle.ts` 与 `hooks/useTerminalObservation.ts` 管理前端协作绑定/订阅；Main 仍是授权 owner。
- Settings、Wiki、Skills、History、MCP、PDF、图表及桌宠按需加载；不增加新全局 Store、不改变桌宠。

## 打包与实验边界

`electron.vite.config.ts` 分别构建 Main/Preload/Renderer；`electron-builder.yml` 仅打包当前输出/资源，排除 Document、experiments 与验收输出。Pi、MCP、Photon WASM、node-pty prebuild、PDF legacy worker/fonts/cmaps 维持 external/asarUnpack 规则；Renderer PDF worker、Mermaid、Tree-sitter 和 XYFlow 不能作为垃圾删掉。

Mac 交付一份 Universal app/DMG/ZIP（x64 + arm64）；历史架构脚本为 alias。签名、公证和 Windows/Linux 真实验收不由源码构建通过推定。`experiments/agent-runtime/` 保留独立 package/lockfile、源码和评估，不进入产品依赖或打包。具体参见 [开发规范](DEVELOPMENT.md)、[安全模型](SECURITY_MODEL.md)、[外部终端](EXTERNAL_TERMINALS.md) 与 [本地测试](TESTING.md)。
