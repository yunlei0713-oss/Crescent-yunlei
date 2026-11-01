# 墨巡聊天优先／iTerm 协作实施与本地验收记录

日期：2026-10-31。对应[实施计划](MOXUN_CHAT_FIRST_ITERM_COLLABORATION_REFACTOR_PLAN_20261031.md)。本报告区分产品实现、真实集成、模拟行为测试和未验收范围；不代表发行验收。

## 1. 交付边界与当前结论

- 已实现聊天唯一主工作区、默认收窄侧栏、外置 iTerm 三入口、逐会话观察授权及两个墨巡主题。
- Agent 终端执行／输入／中断永久拒绝；观察授权不授予执行能力。保留独立文件 Diff 审批、历史、知识与资料、人工 SSH 登录和桌宠。
- 删除命令手册、内置终端画面／布局／子终端 UI、xterm 依赖及无效执行控制。
- 在原有未提交工作区上增量修改；不能将整个 Git diff 归为本次工作。没有提交、推送、打包或发布，没有改动品牌图形、iTerm 全局配置或业务远程主机。
- **最终代码的 CI、完整本地测试及真实 Electron 三入口验收通过。** 登录／断线竞态修复后连续复跑通过，最后一轮还覆盖首页文案与收窄侧栏底部按钮边界。真实底层 iTerm 桥接亦通过；不据此宣称原生授权人工操作或全部 SSH 认证方式通过。
- **18:41 起的补测发现两项真实失败。** `zhangke` 真实登录、四次原生人工确认、真实文件审批和小规模分屏选择通过；共享终端关闭后重开、共享 `context-live` 带入已有缓存当时失败。第 7 节保留失败历史；随后已修复并通过隔离本地 iTerm／Electron 回归，新增主动建议链路，见第 8 节。不扩大为全部发行验收通过。
- **随后使用 `zhangke` 和当前真实模型补验通用查询。** Pod、节点、Deployment 和非 Kubernetes 的磁盘查询四轮完整通过，共 67 条检查；原生观察允许由用户点击，明确目标后的单条指标命令由用户实际执行。部分模型首轮提案被只读校验拒绝后修正，见第 9 节；不宣称所有 Shell 查询或任意复杂管道都能通过。

## 2. 修改模块与保留职责

| 文件／模块                                                                                                                                                                                                                                                                | 本轮职责                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/renderer/src/App.tsx`、`components/ChatWorkspace.tsx`、`components/AppSidebar.tsx`、`assets/chat-workspace.css`                                                                                                                                                      | 纯对话外壳；侧栏 60/244 px、默认收窄并持久化；消息流最大宽度 1040 px，底部输入区独立；思考及用量默认折叠。                                 |
| `components/ConnectionList.tsx`、`ConnectionTerminalDialog.tsx`、`ExternalTerminalDialog.tsx`、`TerminalObservationChoice.tsx`、`ExternalTerminalControls.tsx`；`hooks/useConnectionTerminalChoice.ts`、`useExternalTerminals.ts`、`useTerminalCollaborationLifecycle.ts` | 连接卡片／本地／已有 iTerm 入口；默认 off，暂停、重新授权、结束、聚焦和断线状态。重试重新选择权限，不自动重连。                            |
| `src/main/terminal/ipc.ts`、`observer/registry.ts`、`observer/observation-grants.ts`、`src/shared/terminal-observation-types.ts`                                                                                                                                          | Main 原生确认、身份绑定 grant、证据读取门控；身份变化同步停采并清证据；共享 PTY 创建后沿用原登录链。                                       |
| `src/main/terminal/external/iterm.ts`、`observed-session.ts`、`screen.ts`、`shared-session.ts`                                                                                                                                                                            | JXA 精确 UUID 绑定；生产接口无 write；已有会话低置信度有界快照；串行采样、取消／epoch 防迟到发布；保留 PTY／私有 Socket。                  |
| `src/preload/modules/terminal.ts`、`agent.ts`、`app.ts`、`src/preload/api.ts`                                                                                                                                                                                             | 观察白名单；移除命令手册、布局、终端镜像和子 Agent 状态订阅。                                                                              |
| `src/main/agent/pi-subagent.ts`                                                                                                                                                                                                                                           | 子分析结果返回聊天，不发送 docked UI 状态；仅 host read allowlist，保留只读上下文克隆、取消和释放。                                        |
| `components/timeline/ApprovalStepCard.tsx`、`ToolRows.tsx`、`AgentRunTimeline.tsx`、`AgentLogContent.tsx`、`AgentLogList.tsx`                                                                                                                                             | 遗留命令记录仅只读审计，不能通过历史 started 状态恢复等待／Ctrl+C 控制；文件审批不合并到命令审计。                                         |
| `src/main/retired-data-migration.ts`、`crescent-sqlite.ts`、`crescent-store.ts`、`src/shared/theme-definitions.ts`、Renderer `app-theme.ts`／`ThemeSwitcher.tsx`／`theme.css`                                                                                             | 定向删除命令手册两个文件和旧布局元数据；只保留浅／深主题，旧四套深色主题映射夜墨，未知值默认宣纸。                                         |
| `scripts/check-security-boundaries.cjs`                                                                                                                                                                                                                                   | 新增授权、无终端镜像／命令手册／子 Agent docked 状态、只读子工具、无 xterm 依赖及历史执行控制门禁。                                        |
| `src/renderer/src/lib/connection-attempt.ts`、`App.tsx`                                                                                                                                                                                                                   | 登录开始捕获 transport 身份；完成后复核 Main 存活状态和原 Session／UUID，断线同步失效 pending completion，迟到成功不得覆盖失败／重试状态。 |

删除：`TerminalPane`、`TerminalTabBar`、`SubterminalPanel`、`TerminalIdentity`、`TerminalLockOverlay`、`AgentPanel`，xterm lifecycle／hydrate／input-lock／scroll 辅助；workbench-layout 完整 IPC／hook／数据模型；命令手册 Main／shared／preload／UI 链；handoff/change-plan UI、无调用命令审批弹窗及执行设置辅助。

依赖移除：`@xterm/addon-fit`、`@xterm/xterm`、`xterm`，同步更新 `package.json` 与 lockfile。**保留 `node-pty`**，承担人工 iTerm 共享桥接及原 SSH 登录。

引用审查后保留 `terminal-text.ts` 的控制字符归一化、密码提示和遗留 tab 身份解析；删除子终端宽度／显示和 xterm bootstrap 过滤。Main／preload 部分旧终端兼容 API 保留，不代表 Agent 能力，也没有新的可视终端入口；人工 SSH／密码输入仍需宿主写入路径，最终 Agent-origin 防线不放宽。

## 3. 授权与实际读取范围

| 模式         | 共享 PTY                                                                                                                                                    | 已有 iTerm                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| off（默认）  | 只保留人工连接所需状态；不送 Observer，不暴露 AI 证据                                                                                                       | 不读内容，只约 5 秒一次尺寸／存活检测                                   |
| live         | 仅授权后的流；可靠 OSC 133 才可结构化，否则 uncertain                                                                                                       | 初始可访问文本作为不发布基线；约 750 ms 串行快照，只保守提取新增完整行  |
| context-live | 当前有界 PTY 缓存去控制序列后，以低置信度快照送 Observer；全量保留来源敏感扫描／脱敏后截断，只发布完整行，再收授权后流。18:41 的回填失败已修复，见第 8 节。 | 当前可访问文本快照（保留最多 24K 字符）＋后续快照变化，可能包含部分滚屏 |

观察启用另需 Main `dialog.showMessageBox` 确认。grant 绑定 owner/tab/iTerm UUID/connection/generation/host。Renderer payload、Agent、历史和旧设置不能自行授予或恢复。暂停／结束清证据；恢复重新确认，从新基线开始，不补采暂停内容。初始读屏也进入串行队列，撤销／身份变化后的迟到响应不得发布。

现有内存上限：20 事件、16K 字符／事件、64K 总量、30 分钟；模型上下文默认 32K 字符。敏感扫描在截断前，密码／OTP／私钥／不确定交互保守抑制；不建立永久终端录制库，不逐输出触发模型请求。

**真实范围证据**：iTerm 3.7.6 的 80×25 fixture，`session.text()` 返回 214 行／3703 字符，包含第 1 和第 200 行。说明不是严格只有可见 25 行；不能证明完整或无限滚屏。JXA 响应仍限 1 MiB，保留快照仍限 24K 字符。不保证命令边界、退出码或快照间短暂输出；重写、清屏、无法对齐不猜测。没有安装或注入远端 Shell Integration。

## 4. 本地验证结果

环境：Intel x86_64 Mac，Darwin 25.6.0，Node 24.18.0，Electron 41.10.7，iTerm 3.7.6；安装的 Pi ai／agent-core／coding-agent 均为 1.0.3。读取了项目 skills 和当前安装 SDK 文档／类型。

| 验证                 | 结果与证据范围                                                                                                                                                                                                                                                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run ci`         | 最后竞态、文案和侧栏边界修复后通过：lint 无错误／警告，324 项静态安全检查，node/web 类型检查，electron-vite Main／preload／Renderer 构建。不包括打包；Vite 两处混合 import 提示仍在。                                                                                                                                                    |
| `npm run test:local` | 改造阶段最后一轮 17:19:52 开始，56 文件、301 项通过，2 文件／2 项真实集成默认跳过，总 15.79 秒；包含新增六项登录完成身份／存活回归。补测阶段的后续完整复跑见第 7 节。真实集成另外显式启用运行，不以默认跳过作为通过证据。                                                                                                                |
| 真实底层 iTerm       | 17:02:12 再次运行 `MOXUN_ITERM_LIVE=1` 通过 1 项（测试 14.83 秒／总 15.92 秒）：私有 Socket／PTY 双向交互、已有绑定 off/context-live、暂停/live 恢复不补采、解绑后 fixture 继续操作、快照范围。直接调用 Session 观察方法，不代表原生授权人工验收。                                                                                       |
| 真实 Electron 三入口 | 登录竞态修复后 17:11:58、17:13:26、17:16:30 及最终 17:20:15 均通过 1 项，末轮总 55.40 秒。真实 Main/preload/BrowserWindow、隔离 data/profile、仅 `127.0.0.1` 临时 SSH：卡片取消／默认 off、原登录动作、目标身份、断线重试重新选择 off 并新建 UUID、本地无自动 SSH、已有 UUID 精确接入、解绑后原 Shell 内容仍在；成功 `app.quit()` 退出。 |
| 授权／脱敏／执行拒绝 | 本地行为套件覆盖 off、原生确认取消／授权及竞态、owner／UUID／目标／代次变化、暂停清除、迟到采样、敏感数据、Agent PTY／pipe／MCP／主与子 Runtime 拒绝；原生确认响应在 IPC 测试中模拟。                                                                                                                                                    |
| 聊天滚动／桌宠       | 最后一轮真实 Electron 渲染 fixture 的 36 条检查通过：历史位置保持、流式跟随、异步增长／收缩、回到最新、切换／重挂载、键盘／Escape、桌宠指定动作及错误回退；无未捕获错误。fixture preload 服务模拟，不能代替完整应用业务验收。                                                                                                            |
| 首页／窗口／迁移     | 真实应用通过默认纯对话且不创建 PTY、对话标题／通用输入提示、60 px 侧栏及展开持久化、Tab 导航、旧布局清理、旧深色主题迁移。最终内容尺寸为 800×568、1100×748、1440×748；输入区及侧栏主题／桌宠按钮在边界内，无文档横向溢出。请求 1100×800／1440×900 的窗口被 macOS 可用高度裁剪，不能声称实际 1440×900 内容区通过。                        |
| 文件审批／数据迁移   | 本地服务测试覆盖审批和拒绝、一次性授权、路径／身份／hash 验证、旧布局／主题和命令手册定向清理；未声称真实应用人工 Diff 点击端到端通过。                                                                                                                                                                                                  |
| 干净安装             | 隔离目录 `npm ci --ignore-scripts --offline --no-audit --no-fund` 成功，1049 packages／19 秒；只证明 lockfile 离线依赖安装，不证明 native postinstall／Universal 安装。                                                                                                                                                                  |

失败与修复记录：

- 旧 snapshot “screen” 断言与实际范围文案不符、子 Agent mock 空方法 lint、清理旧执行 props 后未使用参数；更早 Electron runner 选择器引号错误及真实断线状态不更新，均已修复并复跑。
- `PYwQXr` 真实 SSH 及重试通过后，测试用全局 `[role=dialog]` 误判本地选择器未关闭；隐藏主题菜单始终挂载。改用外置选择器专属节点，没有删除主题 UI 来迎合测试。
- 17:06:41 的 `Ws5XT9` 在 Main transport 已退出后，迟到登录成功覆盖恢复状态，缺少重试按钮。增加完成前身份／存活复核和同步断线失效，六项回归及上述四轮真实集成通过。
- 最终截图复核发现首页旧 “Terminal”／`/command` 提示和收窄侧栏主题按钮横向裁切。修正对话文案、将收窄底部按钮纵向排列，并加入真实 DOM 边界断言。
- 早期失败 runner 的强制 `app.exit(1)` 曾触发 native Napi 异常；最后成功路径正常退出不代表异常退出专项已通过。最终结果以最后一轮命令为准，不隐藏失败过程。

## 5. 证据位置

本地测试均 gitignored，未提交。以下原验收证据不含业务集群记录，路径只对当前机器有效；第 7 节补测目录含隔离的加密业务连接配置，禁止整目录分享：

- 最新真实 iTerm 范围：`/private/var/folders/9b/zxdf7gd103xfwmrbskqdgq640000gn/T/moxun-live-iterm-84RQw1/screen-range.json`，与前轮 214 行／3703 字符结果一致。
- 最终聊天／桌宠 CSS fixture：`/private/var/folders/9b/zxdf7gd103xfwmrbskqdgq640000gn/T/opencode/moxun-chat-follow-162smA/`，含 36 条 `browser-checks.json`、`read-only-chat.png`、`chat-and-pet.png`；已复核截图，消息及输入区无终端／执行画面。
- 真实 Electron 最终目录：`/private/var/folders/9b/zxdf7gd103xfwmrbskqdgq640000gn/T/moxun-chat-ui-lViwhG/`，含 `light-800x600.png`、`light-1100x800.png`、`light-1440x900.png`、`dark-expanded.png`、`chat-workspace.png`、`window-metrics.json`；截图文件名是请求窗口尺寸，实际内容尺寸见 JSON。失败历史 `.../T/moxun-chat-ui-PYwQXr/`、`.../T/moxun-chat-ui-Ws5XT9/` 不作为通过证据。目录含临时 SSH fixture 私钥及隔离 profile，不应整目录分享或纳入仓库。
- 干净安装：`.../T/opencode/moxun-clean-install-hagqh9iq/`。

复跑命令（仅测试自身创建的隔离 iTerm Session）：

```sh
npm run ci
npm run test:local
CRESCENT_LOCAL_TESTS=1 MOXUN_ITERM_LIVE=1 npx vitest run src/main/terminal/external/live-iterm.test.ts
CRESCENT_LOCAL_TESTS=1 MOXUN_ELECTRON_LIVE=1 MOXUN_CONNECTION_CARDS_LIVE=1 npx vitest run src/main/terminal/external/electron-iterm.test.ts
```

## 6. 部分支持、未验收及限制

1. 原生 AI 观察确认的真实人工允许／拒绝、暂停及恢复重新确认已在 `zhangke` 通过四次人工点击；共享本地 `context-live` 原生允许也实测，当时当前缓存回填失败。第 8 节修复回归的原生响应模拟；第 9 节又通过真实 `zhangke` 的 live 人工允许、主动建议、暂停和撤销。修复后的本地 `context-live` 人工确认仍未单独重验，不能以 live 补验替代。未测试原生确认窗口打开期间的退出／撤销竞态，不以 IPC mock 替代。
2. 小规模真实分屏／相邻 Tab 与 `zhangke` 保存的密码认证／`sww` 登录链已补测。自动化权限拒绝、iTerm 未安装、大规模 Session 选择、其他认证方式／OTP、关闭整个 iTerm 进程、跨 Profile／版本仍未验收；不能把这些新增通过扩大为全部支持。
3. 远端没有可信 OSC 133 时仅 uncertain／snapshot；现有快照无法稳定提供完整命令历史、退出码、完整滚屏或短暂输出。live 的保守差分和敏感抑制可能少报，不能为提高识别率放宽安全规则。
4. 共享 PTY 由 Main 拥有，停止宿主会话或正常退出墨巡会终止桥接；结束协作仅停观察。关闭共享 iTerm 画面保留后台 PTY；第 7 节重开失败已在第 8 节修复回归。已有 iTerm 解绑不发 exit／Ctrl+C，不影响原 Shell。Renderer 异常终止后的恢复已测；Main 被 SIGKILL、孤儿进程／Socket 清理与更长时间退出压测仍未验收。
5. 文件审批的完整 Diff／原新内容、逐项确认、批准／拒绝／调整／Escape、过期／取消和预览后变化已走真实应用 UI 与 IPC，但点击为自动化，不宣称全部人工或所有文件操作验收。6 秒空闲 CPU／内存采样不等于长期对照压测；大量历史、所有附件、完整键盘可达性与 WCAG 审计仍未完成。
6. 干净安装跳过脚本；本轮未打包、签名、公证、发布，也未做 Apple Silicon 真机或 Windows 验收。保留已有 Vite 混合静态／动态 import 提示，未宣称性能全面优化。

## 7. 用户授权后的真实补测（2026-10-31）

### 7.1 范围与隔离

- 用户追加要求“验证没有验证的功能，集群可选择 zhangke”，并明确配合原生确认。先审查选中连接，只有保存的 `sww zhangke` 登录动作。
- 仅复制该连接到隔离加密配置，不复制模型凭据，不通过产品 Store 读取／迁移原用户配置。使用独立 data/profile；未发送额外远端探测／修复命令，未安装远端组件、修改 iTerm 全局配置或品牌图形。
- 临时 esbuild runner 同时导入真实 Main 和共享 `fileChangeApprovals` 单例，使用正常构建的 preload／Renderer。没有新增生产测试 IPC，没有 mock `dialog.showMessageBox`，没有调用模型。文件写入只发生在新建 fixture 目录。
- 本轮未改产品源码。**发现的两项产品缺陷只记录、未修复**；未提交、推送、打包或发布。

### 7.2 通过、失败与证据范围

| 项目                         | 实际结果                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `zhangke` 实际连接           | 保存认证和原 `sww zhangke` 登录链通过，Main 返回 `pty / ssh-ready / ready=true / aligned`，目标连接 ID 和 shared 绑定正确。off 时 grant 不存在、AI 证据不可用；最后停止连接后仍无证据。仅保存结构化状态，不导出业务终端文本。                                                                                                               |
| 原生观察人工允许／拒绝       | 最后完整一轮 15 条检查通过。用户实际点击取消 → 允许 → 取消 → 允许，验证首次拒绝、首次授权、真实暂停按钮、恢复拒绝不复用旧授权、恢复允许及真实结束协作按钮。结束观察不终止已登录 PTY，随后显式断开。没有在授权后发送业务输出测试命令，因此这轮主要证明授权／撤销链，不宣称业务输出采集全面验收。                                             |
| 真实文件审批                 | 最后一轮 15 条检查通过：完整 Diff 和完整原／新内容；两项现有文件必须全部勾选；真实 preload IPC 经共享服务和 Pi 队列写入后校验；审批不能重放；拒绝／调整意见／键盘 Escape 无写入；过期／取消关闭审批；预览后文件变化拒绝覆盖；新增文件经批准创建。使用真实 DOM 自动化点击，不是人工点击，也不是模型生成提案端到端。                          |
| 分屏／相邻 Tab               | 12 条检查通过，fixture 为同一新建窗口的两个垂直分屏和一个相邻 Tab。真实枚举位置不同；UI 精确 UUID 绑定并聚焦选中分屏；off 不读文本；关闭所绑定 existing 分屏后清绑定且不误选邻居；相邻 fixture 标记未串入；解绑后原 Tab 仍可操作。只证明 3 个 fixture Session，不代表大规模选择。                                                           |
| 共享画面关闭／重开           | **失败**，两轮专门重现及后一轮继续执行生命周期均得到相同结果：关闭本轮新建 iTerm Session 后 Main 的原 PTY／pid 仍存活；`focusITerm` 返回 `ok=false / ITERM_SESSION_MISSING`，未按预期重新打开原 PTY 的新画面。不能沿用“明确重开即可恢复”的实现描述作为通过结果。                                                                            |
| Renderer 异常恢复            | 在隔离本地会话用 `forcefullyCrashRenderer()` 真实触发 `render-process-gone`（`killed / exitCode=2`）；应用自动恢复聊天页面并显示恢复提示，未自动授予观察；显式停止后 Main 变为 none。生命周期一轮为 7 条通过／1 条重开失败；**没有**验收 Main 硬杀或整个 iTerm 进程关闭。                                                                   |
| 共享 `context-live` 当前缓存 | **失败**。用户再实际点击一次原生允许；无害 `context-preexisting` 标记授权前已在 Main output 缓存，授权后 grant 为 active/context-live，但证据事件数为 0，没有带入该标记。随后新 `context-after-authorize` 输出能进入观察；结束协作清证据，人工 fixture 仍可操作。该轮 7 条通过／1 条缓存回填失败，直接纠正第 3 节原先对共享缓存的实现声明。 |
| 短时性能记录                 | 保存 6 次／6 秒空闲采样。Browser CPU 平均 0.03%、最高 0.05%，working set 204916–204996 KiB；Tab CPU 平均 0.01%、最高 0.02%，132188–132200 KiB。该采样处于共享 iTerm 画面已关闭且重开失败的场景，**不是活跃观察性能或长期泄漏证明**。                                                                                                        |
| 完整本地回归                 | 18:46:19 复跑：56 文件／301 项通过、2 文件／2 项真实集成默认跳过，22.60 秒。新增真实补测通过独立 runner 执行，不包含在这 301 项中；该绿色结果不能掩盖补测两项失败。                                                                                                                                                                         |
| 补测收尾 CI                  | 全部交互补测结束后再次 `npm run ci` 通过：lint、324 项静态安全检查、node/web 类型检查及 Main／preload／Renderer 构建；两处既有 Vite 混合 import 提示仍在。未打包，CI 绿色不代表上述真实缺陷已修复。`git diff --check` 与报告 7 个本地文档链接检查通过。                                                                                     |

### 7.3 失败历史与当时未修复问题

1. 审计 runner 首次 safeStorage 解密失败：启动 ready 前设置与产品相同的 `app.setName('crescent')` 后成功，不是 SSH 连接失败，没有输出凭据。
2. 文件 runner 首次生成的 JS 字符串换行转义错误，在首次批准前即停止；修正测试 runner 后两轮通过。早期截图捕获了弹窗动画中间帧，最终截图增加稳定等待并复核，不能将早期半透明帧当作产品最终画面。
3. 原生确认第一轮预期“取消”却收到“允许”，脚本停止并清理连接。用户明确确认自己点击了允许并要求重测；后续完整四次操作通过，保留前轮但不判为产品取消逻辑失败。真实取消时 Electron 记录 `Observation cancelled` IPC reject 是预期拒绝路径。
4. **未修复 A：共享 iTerm 关闭后显式重开失败。** 关联 `src/main/terminal/external/shared-session.ts` 的 client／旧 UUID 存活复核和 `src/main/terminal/ipc.ts` 的 `terminal:focus-iterm`。记录是真实现象，尚未完成根因修复和回归，不贸然断言具体 Socket 原因。
5. **未修复 B：共享 context-live 不带入当前缓存。** 共享 Session 没有 `setObservation` 实现；授权链当前只授予 grant，后续 PTY onData 能观察，但没有将已有缓存安全快照到 Observer。修复须满足授权后低置信度快照、全量敏感扫描、暂停／撤销不迟到发布和身份绑定，不能以补采暂停内容或放宽脱敏替代。

### 7.4 本机补测证据

统一根目录：`/private/var/folders/9b/zxdf7gd103xfwmrbskqdgq640000gn/T/opencode/moxun-extended-oC3e3b/`。**含连接秘密及隔离 profile，禁止整目录分享、提交或发布。** `checks.json`／`connection-result.json` 不包含业务终端正文；下列截图仅为本地 fixture：

- `audit.cjs`、`connection-audit.json`：选中连接登录动作审查；`data/config.json` 含重新加密的连接，不分享。
- `runner.ts`、`build.cjs`：本地专用入口，可重建到 gitignored `out/main/extended-acceptance.cjs`，未覆盖正常 Main entry；正常 CI 重建之后须先重新构建 runner。
- `files-1793443716969/`：最后 15 条检查与稳定 `complete-diff.png`。
- `zhangke-1793443329962/`：最初 off 连接 5 条检查和只含状态的 `connection-result.json`。
- `zhangke-1793443708712/`：最后四次人工确认 15 条检查和状态结果；前轮误点记录保留在同根目录其他 `zhangke-*` 下，不作为完整通过。
- `split-1793443498412/`：12 条检查、fixture 位置与 UUID 元数据。
- `lifecycle-1793443440853/`：7 通过／1 失败、`short-idle-metrics.json`、`recovered-chat.png`。前两轮重开失败证据为 `lifecycle-1793443329961/` 和 `lifecycle-1793443385283/`，后者保存明确的 ITERM_SESSION_MISSING 返回。
- `shared-context-1793444291875/`：7 通过／1 失败，记录授权前缓存存在、授权后 0 事件及后续新输出成功；无业务内容。

相关文档：[外置终端](../EXTERNAL_TERMINALS.md)、[安全模型](../SECURITY_MODEL.md)、[UI 设计系统](../UI_DESIGN_SYSTEM.md)、[用户指南](../new/USER_GUIDE.md)、[安全审计](../new/SECURITY_AUDIT.md)、[测试政策](../TESTING.md)。

## 8. 两处失败修复与主动终端建议（2026-10-31，19 时后）

### 8.1 增量实现与安全边界

本轮只使用隔离本地 fixture，不登录 `zhangke` 或其他业务集群、不读取模型凭据、不修改 iTerm Profile。仍未提交／推送／打包／发布；工作区原有改动保留，本报告不将整个 Git diff 归为本轮工作。

1. **共享画面重开**：`shared-session.ts` 先聚焦并复核原 UUID。仅 `ITERM_SESSION_MISSING` 时销毁陈旧 Socket，为原 PTY 创建新视图；并发打开合并，原 PID 和有界缓存保留。Main `onExternalBinding` 撤销旧 grant 并通知 Renderer；新 UUID 必须重新授权。自动化拒绝／超时不新建替代会话。
2. **共享缓存回填**：共享 `setObservation('context-live')` 使用全部保留的 240K 原始缓存，经 `plainTerminalCache` 去 OSC／CSI 后进入 Observer；先扫描／脱敏再按 16K 事件预算截断，只保留完整行。标为 snapshot/unknown，不重放 OSC，不推断命令或退出码。off/live 不回填，撤销和身份变化清证据。
3. **主动分析链路**：Main `EvidenceNotifications` 只推送身份元数据和一次性 token，不推送原始输出；约 1.5 秒稳定窗口、至少 8 秒间隔、相同快照去重、同一 uncertain stream 一次通知（新人工提交或 OSC 事件可重新触发），敏感／运行中证据抑制。token 绑定当前授权身份，撤销／变更即失效。
4. **Renderer → Pi**：仅当前会话、模型可用且没有用户草稿／引用／待回答问题／忙碌回合时，自动启动聊天分析。显式提交及其取消等待优先；暂停／切换／撤销取消自动回合。Pi 初始化后重新校验 token 并读取授权证据；自动回合工具仅 `observe_terminal`／`propose_command`，无终端输入／执行能力。
5. **三选项／单目标**：一次 `propose_command` 发布推荐项＋两条备选；主动项必须是三个不同的静态只读单行命令。点击方向追问填入目标，发送后给一条确切命令。复制前通过 Main 重新验证建议 ID／目标／授权有效性；只复制、不提交。人工下一命令产生新证据后继续分析，不把选项变成批量执行。
6. **真实集成额外发现并修复**：建议工具已成功，但面板原先监听 `tool_end`／`finish`，与 Host 的实际 `tool`（phase=`finished`）／`done` 不符，导致停在“分析中”。已对齐事件，并合并加载中的刷新请求；不增加空闲轮询。主动回调通过 effect 更新 ref，lint purity 门禁正常。
7. **缓存与后续流分离**：当前缓存仅作为一次 snapshot；后续 PTY 输出另建 uncertain／OSC 流，避免持续输出沿用 snapshot 标记而反复触发模型。敏感缓存的抑制保守延续至可信 prompt；新增 3 项回归覆盖流分离、敏感状态延续及持续流通知去重。

### 8.2 本轮验证与范围

| 验证                 | 实际结果                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run ci`         | 19:42 起、包含最后缓存／后续流分离修复的产品代码门禁通过：lint、326 项静态安全检查、node/web 类型和 Main/preload/Renderer 构建。两处既有 Vite 混合 import 提示仍在；未打包。                                                                                                                                                                                                                                                                                      |
| `npm run test:local` | 19:42:43 全量复跑：58 文件／314 项通过，3 文件／3 项真实集成默认跳过，29.25 秒。含新增陈旧 Socket 重开、缓存扫描／回填及流分离、token 归属／重放／撤销／限频、uncertain stream 不重复触发、三选项与目标漂移回归。测试文件全部 local-only。                                                                                                                                                                                                                        |
| 真实底层 iTerm       | 19:42:43 显式启用，1 项通过，总 27.94 秒。新增断言：共享缓存回填且无控制序列、live 不回填；精确关闭 fixture UUID 后重开新 UUID，原 PTY PID 不变、缓存仍在、双向输入继续工作。另保留已有绑定／暂停恢复／解绑及范围检查。直接 Session 方法不代表原生授权人工验收。                                                                                                                                                                                                  |
| 真实 Electron 三入口 | 19:45:55 使用最终构建显式启用，1 项通过，总 30.29 秒；19:39:07 的前轮亦通过（43.66 秒）。真实 Main/preload/Renderer，隔离 loopback SSH：卡片取消／默认 off、原登录链、断线后新 UUID 重试、本地无自动 SSH、已有会话精确绑定／解绑不影响原 Shell；首页和侧栏边界正常，成功退出。末轮实际内容尺寸为 800×568、1100×752、1440×752，仍受 macOS 可用高度裁剪，不宣称 1440×900 内容区通过。                                                                               |
| 真实主动建议端到端   | 19:44:49 使用最终构建显式启用，1 项通过，总 52.73 秒，14 条检查；此前 19:37:55／19:40:57 亦通过。真实 Main/preload/Renderer/Pi/iTerm：授权前缓存进入 Observer；无聊天输入时三条建议；复制不执行；下一次人工 fixture 命令触发新三选项；草稿阻止自动分析；真实 composer 发送目标后显示单条命令；暂停／撤销无新增自动分析请求；撤销后复制禁用；focus IPC 重开同 PID／新 UUID 且不继承 grant。模型为本地确定性 OpenAI-compatible HTTP fixture，原生观察确认响应模拟。 |

失败历史保留：最初测试 runner 的选择器转义错误；修复 runner 后发现并修复真实面板事件不匹配。随后复制测试因 Electron 文档未聚焦而被 Chromium 拒绝，改为聚焦 fixture 应用和 WebContents 后验证真实剪贴板路径，未放宽产品权限。另将聊天后台摘要请求与终端分析请求分开计数，并等待真实 `done`，避免将摘要误判为草稿期间的主动分析。它们不构成最终通过证据。

### 8.3 证据与复跑

- 最后底层 iTerm 范围证据：`/private/var/folders/9b/zxdf7gd103xfwmrbskqdgq640000gn/T/moxun-live-iterm-xXaTWZ/screen-range.json`。
- 最后三入口证据：`/private/var/folders/9b/zxdf7gd103xfwmrbskqdgq640000gn/T/moxun-chat-ui-49vpcU/`，含窗口截图及 `window-metrics.json`；目录含临时 SSH fixture 私钥和隔离 profile，不整目录分享。前轮 `.../T/moxun-chat-ui-DCKgNC/` 保留。
- 最后主动流程通过证据：`/private/var/folders/9b/zxdf7gd103xfwmrbskqdgq640000gn/T/moxun-proactive-vugn9i/checks.json`，仅结构化 fixture 检查与工具名；已复核 `three-options.png`、`focused-command.png` 和撤销／重开后的 `accepted.png`。三选项面板内可滚动，阶段截图不代表全部选项同时可见。目录含隔离 profile 和本地 fixture key，不整目录分享。前轮 19:40:57 的 14 条检查保留在 `.../T/moxun-proactive-K4NH85/checks.json`，不替代最后构建结果。
- 新增本地测试：`src/main/terminal/external/electron-proactive.test.ts`；复跑须先有最终 `out/preload`／`out/renderer` 构建，不在构建读写时并行运行应用验收。

```sh
npm run ci
npm run test:local
CRESCENT_LOCAL_TESTS=1 MOXUN_ITERM_LIVE=1 npx vitest run src/main/terminal/external/live-iterm.test.ts
CRESCENT_LOCAL_TESTS=1 MOXUN_ELECTRON_LIVE=1 MOXUN_CONNECTION_CARDS_LIVE=1 npx vitest run src/main/terminal/external/electron-iterm.test.ts
CRESCENT_LOCAL_TESTS=1 MOXUN_PROACTIVE_LIVE=1 npx vitest run src/main/terminal/external/electron-proactive.test.ts
```

**限制**：本轮不证明业务集群的真实模型诊断质量、所有命令都能识别或每次输出都会触发；不确定边界／持续输出／敏感抑制可能少报。自动分析会使用用户选定供应商，可能产生费用；证据脱敏不能识别所有业务机密。未重验原生人工授权、Main 硬杀、长期性能、大规模 Session、其他 iTerm 版本／架构和发行安装；第 6 节其他限制仍然有效。

## 9. 真实模型／业务集群通用查询补验（2026-10-31）

### 9.1 用户授权与隔离

- 用户明确选择 `zhangke＋当前模型`，允许只读查询、将脱敏证据送真实模型和原生人工授权；另强调 Pod 只是例子，须验证其他查询语句。
- 当前配置为 `yidu / bailian/deepseek-v4.1-flash-1017`、thinking=`high`。使用配置中的真实供应商接口，不替换 endpoint、不 mock 模型或观察确认。
- 只将所选连接及模型复制到新建隔离加密配置；原配置只读、不迁移／覆盖。隔离 data/profile/workspace，无原用户 MCP／全局技能。登录仅沿用已审查的保存认证和 `sww zhangke`。
- 验收脚本通过真实 Main/preload/Renderer/Pi/iTerm；不新增生产测试 IPC。验收脚本输入只读查询与 Agent 执行严格区分；第一轮资源查询后的下一条容器指标命令由用户实际复制、粘贴并执行。
- 证据根目录：`/private/var/folders/9b/zxdf7gd103xfwmrbskqdgq640000gn/T/opencode/moxun-real-general-tSlNAU/`。**含隔离加密凭据、profile、业务终端证据及截图，禁止整目录分享、提交或发布。** 报告仅记录概括结果，不导出业务输出。

### 9.2 已确认结果与失败历史

1. 第一轮 `pod/attempt-1793448003574/`：原生人工允许和真实 `zhangke` 登录通过。查询 `kubectl get pod -A | grep prometheus` 后，无聊天消息，真实模型发布容器指标／Pod 配置状态／有界日志三个选项；用户实际执行所推荐的容器指标命令后，模型自动再给出资源 requests/limits、日志和 PVC 三个选项。保存的证据包含实际指标输出，两次 `propose_command` 均成功、两次 `done`，没有模型错误。只证明这两轮，不替代明确目标／暂停等剩余验收。
2. 第一轮验收脚本最终误报 `Timeout: real model done`：脚本错误要求 `done` 永远是最后一个事件，而真实供应商在 `done` 后继续发布 `usage`。已改为按提案所属 runId 匹配 `done`，没有修改产品来迎合脚本；保留失败目录，不记为整轮通过。用户执行的推荐命令合法使用 `kubectl -n … top pod …`，后续人工命令安全检查也保留该有效参数顺序。

### 9.3 四类完整运行结果

| 查询与时段                                                           | 检查                       | 真实模型结果与范围                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pod：20:07:28–20:09:06；`kubectl get pod -A \| grep prometheus`      | 22 条通过，3 次正常 `done` | 无聊天消息时，建议 Pod 详情、资源用量和有界日志。真实 composer 明确 CPU／内存目标后只显示一条当前真实 Pod 的 `kubectl top pod`；实际剪贴板复制不改变终端输出。用户手动执行后，证据确实包含该命令及指标输出，模型自动继续建议 requests/limits、分容器指标和 Pod 详情。 |
| 节点：20:05:26–20:06:26；`kubectl get nodes -o wide`                 | 15 条通过，1 次正常 `done` | 根据实际节点 Ready 输出，建议 Pending Pod、`kubectl top nodes` 和 Pod 调度分布，没有沿用 Prometheus 排查目标。                                                                                                                                                        |
| Deployment：20:09:31–20:10:41；`kubectl get deploy -A \| head -n 12` | 15 条通过，1 次正常 `done` | 明确指出已有列表被截断，不能据此判断整个集群健康；建议服务端筛选异常 Pod、完整 Deployment 列表和证据中真实命名空间的 Pod 分布。                                                                                                                                       |
| 磁盘：20:11:04–20:12:14；`df -h /`                                   | 15 条通过，1 次正常 `done` | 在真实 `zhangke` 登录主机查询根文件系统，最终建议 inode 使用率、文件系统类型及全部挂载点容量查询（`df -ih /`、`df -hT /`、`df -h`）；不是 Kubernetes／Pod 固定模板。只执行容量查询，没有遍历或修改业务文件。                                                          |

四轮合计 **67 条检查通过、6 次正常模型回合完成**。每轮均走实际原生人工「允许」，检查自动分析不改 composer、三条不同静态只读命令；随后真实暂停按钮＋新业务查询无新分析，结束协作清证据，重新启用主动偏好后撤销观察仍无新分析，旧建议不可复制。关闭本轮共享 iTerm 画面后，经真实 focus IPC 重开同一 PTY／新 UUID，且不恢复观察授权；新只读查询能继续产生输出。重开检查发生在观察已撤销之后，不扩大为原生窗口竞态专项。

**真实模型恢复记录**：节点／Deployment 各有 1 次、磁盘有 2 次 `propose_command` 提案组被 Main 以 `Proactive suggestions must be statically read-only queries` 拒绝，之后模型修正为最终合法三选项；没有执行被拒绝的命令。提案组中任一选项不满足规则即整组拒绝，日志显示的主命令不一定就是不合格项。Deployment 首轮包含 awk 过滤，磁盘首轮包含重定向／排序管道；不为通过验收放宽静态边界。四轮没有终结性模型 `error` 事件，但不能把最终通过写成「每次模型首提都正确」。

### 9.4 最终证据与未扩大范围

上述证据根目录中的 `summary.json` 保存四轮时间、检查数、正常结束及提案拒绝次数；`proposal-rejections.json` 保存拒绝原因。完整目录：

- `pod/attempt-1793448448791/`：22 条 `checks.json`、3 个真实回合的 `events.json`、`automatic-three.png`／`focused-one.png`／`after-human-next.png`／`revoked.png`／`reopened.png`。
- `node/attempt-1793448326790/`：15 条检查和阶段证据。
- `workload/attempt-1793448571173/`：15 条检查和阶段证据。
- `disk/attempt-1793448664413/`：15 条检查和阶段证据。
- 每轮的 `private-stages.json` 含授权后的业务终端证据和实际模型建议；已复核关键截图及关联性，**这些文件和截图均不整目录分享或入库**。失败第一轮继续保留。

本轮只修改本地专用验收脚本与本报告，没有修改产品源码、原用户配置或远端资源；没有提交／推送／打包／发布。正常退出仅清理本轮创建的 Session，不关闭用户其他 iTerm 会话。收尾移除本轮生成的 `out/main/real-general-acceptance.cjs`，避免混入正常构建；如需复跑，须先使用证据根目录的 `build.cjs` 重建入口，并重新取得当前连接／模型及人工观察授权。

结论只覆盖上述四类实际查询以及一个明确目标／真实人工执行链路，证明建议能随证据变化，而非仅支持 Pod。静态只读策略、未知边界、敏感抑制仍可能少报；尚未验收任意 Shell 语言、持续输出、所有认证方式／命令、长期性能及发行安装。当前模型也可能给出错误推断或不合格提案，未执行的建议不能按执行成功或修复成功记账。第 6 节其他限制仍有效。

## 10. 通用复杂诊断、问题优先入口与主内容布局修订

本节对应用户随后提出的四点要求，以及“读取输入不需要命令白名单，只限制密码等敏感内容”的补充。第 8／9 节保留旧构建验收历史，不能代替本节新构建验证。

### 10.1 修订与安全边界

- **分析／展示与执行权限分离**：读取输入和输出不按命令名称／语法做白名单筛选。取消主动建议的静态只读展示硬门槛及单行限制，支持有界复杂管道、重定向、awk/jq、自定义 CLI、SQL 和多行诊断片段。仍拒绝建议中的凭据、终端控制字符及超过 4000 字符的片段；一次一个当前步骤，三个方向不是批量执行计划。
- **风险标记不是读取门槛**：静态规则只标注建议安全性；未识别的语法不得被模型“只读”标签认定为安全。界面区分静态只读检查通过、未验证需人工核对、高风险；后两类需确认完整命令／脚本风险后才仅复制，复制前仍经 Main 复核提案、目标、代次和观察有效性。Agent 仍无终端写入／执行／中断权限，不放宽 MCP、Shell 或文件审批权限。
- **复杂输出不被命令名称误屏蔽**：不再把 `kubectl top`、`mysql`、`sudo` 等名称当成敏感交互。交互程序可见脱敏输出及运行中稳定输出可供分析，但保留进行中／未知状态，不猜测成功或退出码。可用的部分脱敏证据不会因出现 `[REDACTED]` 而整份拒绝。持续同状态流限频，可信完成后可再跟进。
- **先问题、后人工执行**：外置终端／集群已打开但没有命令或未授权观察时，可直接描述问题并生成正式首条建议。没有输出就明确注明只依据问题和当前会话元数据，不伪造现场结果。开始授权并人工执行后，沿现有自动建议链路跟进；Main 保存本轮诊断目标，仅在同一真实目标身份内沿用，换主机／UUID／代次不沿用旧目标。
- **建议成为主内容**：最新建议与分析／证据处于同一个正常滚动区，取消顶部独立固定面板及 288px 嵌套滚动限制；命令及用途突出，预期／异常说明、元数据和历史可折叠，不必折叠整块建议才能查看其他内容。超出视口的建议组自动跟随／「回到最新」定位推荐命令，不再只露出第三选项和页尾；向上看分析、向下看备选均可暂停跟随。新增直接描述问题的引导和 composer 提示。
- **漏洞修复**：过长 OSC 控制载荷在丢弃状态中持续消费到终止符，不将剩余内容误作输出；分析目标身份和起始观察状态改为 Main 不可变基线，界面读取不能覆盖它们，撤销／换目标后不能发布旧分析提案；Guided action 的取消目标由 Main 按 owner/chat 选定，不信任 Renderer 传来的其他 runId，并复核等待取消期间是否已开始新回合。

### 10.2 验证与限制

新增本地回归覆盖：复杂／多行建议、未知风险降级、高风险标记、凭据／控制字符拒绝、问题优先首轮、目标延续与漂移、撤销后的发布保护、任意命令词汇读取、交互屏幕、正常 password 日志、长 OSC 丢弃、复杂运行中／部分脱敏输出与完成后的新通知。

最终本轮验证（均针对本节新修订；未提交／推送／打包）：

- `npm run ci`：lint、**331 条静态安全检查**、Main／Web 类型检查及 Main／preload／Renderer 构建全部通过。两处既有 Vite 动态／静态混合 import 提示仍在，不影响通过。
- `npm run test:local`：**59 文件、332 项通过；3 项真实集成默认跳过**。完整套件包含真实 Electron 滚动 fixture，不能将其单独的浏览器断言再加算为单元测试项数。
- `scroll-follow.browser.test.ts`：真实 Renderer **42 条浏览器断言通过**，其中 6 条新增检查覆盖推荐锚点、向下阅读备选、回到最新、向上查看分析及移除建议后的普通滚动；证据位于 `/private/var/folders/9b/zxdf7gd103xfwmrbskqdgq640000gn/T/opencode/moxun-chat-follow-nBOQ11/browser-checks.json`。
- `MOXUN_ITERM_LIVE=1 ... live-iterm.test.ts`：底层真实 iTerm／私有 Socket／PTY，以及快照接入、暂停后不补采、同 PTY 新 UUID 重开链路 **1 项通过**；快照范围证据在 `/private/var/folders/9b/zxdf7gd103xfwmrbskqdgq640000gn/T/moxun-live-iterm-h0IUev/screen-range.json`。
- `MOXUN_ELECTRON_LIVE=1 MOXUN_CONNECTION_CARDS_LIVE=1 ... electron-iterm.test.ts`：当前构建的三入口真实 Electron／iTerm 回归 **1 项通过**。连接卡片仅使用本地临时 SSH fixture，覆盖默认 off、取消、登录动作、失败后的重试新选权，以及新建本地 Shell／绑定既有 UUID；证据目录 `/private/var/folders/9b/zxdf7gd103xfwmrbskqdgq640000gn/T/moxun-chat-ui-FCvosH/`。
- `MOXUN_PROACTIVE_LIVE=1 ... electron-proactive.test.ts`：真实 Main／preload／Renderer／Pi／iTerm 加确定性本地模型，**1 项端到端、27 条检查通过**。完成首问、两次自动跟进、明确目标共 **4 个回合**（12 次流式 HTTP 请求、4 次非流式摘要请求，不混算为 16 个诊断回合）。验证未输入任何终端命令且未授权观察时给一条多行建议、上下文授权后的缓存及诊断目标延续、三选项、复杂自定义管道的未验证标签／确认后复制、复制不发终端输入、人工新输出再跟进、草稿优先、暂停／撤销无模型分析及失效建议禁复制、同 PTY 新 UUID 重开不继承授权。
- 布局已复核 `goal-first-800.png`／`goal-first-1100.png`／`goal-first-1440.png`、`three-options.png`、`copy-review.png`、`focused-command.png`：三档内容尺寸 800×568、1100×752、1440×900 的首条多行命令在主滚动视口内；自动推荐项及复制确认可见，不被 composer 或独立面板覆盖。较长内容仍需正常滚动，不宣称任意 4000 字符脚本都能一屏显示。

主动建议最终证据目录：`/private/var/folders/9b/zxdf7gd103xfwmrbskqdgq640000gn/T/opencode/moxun-proactive-Mcxstd/`，`checks.json` 保存 27 条检查、模型请求形态和明确的模拟授权标注。临时 `out/main/proactive-acceptance.cjs` 已在测试结束后移除；本地测试仍被 gitignore，不提交测试／临时凭据／profile／业务证据。文档格式、5 份相关说明中的本地 Markdown 链接及 `git diff --check` 已检查。

**发现与失败保留**：首轮隔离验收 `/var/folders/9b/zxdf7gd103xfwmrbskqdgq640000gn/T/moxun-proactive-50mxNr/` 在「目标延续」断言失败，原因是脚本按字符串读取 Pi 的分块消息；实际请求已含 `Continuing diagnostic goal`。该轮截图同时发现真实界面自动跟随页尾使推荐项不易看到，因此增加推荐锚点，随后修复「回到最新」向上定位被误判成人工滚动的问题。修复后完整本地套件、CI 及上述端到端重新通过；不是隐藏失败或沿用旧构建截图。

**本节 fixture 限制**：隔离模型为本地确定性 HTTP fixture，主动观察的原生确认响应模拟，终端输入由 fixture 仅向自己的测试 UUID 写入；复杂建议只是展示／复制，后续证据使用人工输入路径的本地 `printf`，不执行未知诊断工具或多行建议。不把这些结果写成真实供应商、原生人工 `context-live` 授权专项或业务集群的新版本诊断质量通过。第 9 节真实 `zhangke`／当时所选模型结果仍只对应旧构建；随后新版本的 Computer Use 真实补验见第 11 节。

取消词汇白名单不意味着有限模型能准确理解世界上所有程序或无限长输出。无可信 Shell 标记时仍不把可能是密码的原始按键保存成命令，但会分析已授权的可见脱敏文本；历史补全、多行输入、交互屏幕重绘、截断与未知退出码保持不确定。保留敏感提示、私钥、令牌保护及输出／上下文预算，不以“所有命令”承诺取消隐私边界。

## 11. 新版本 Computer Use 真实界面补验

### 11.1 方法与门禁

- 用户要求“全部由你自行测试”并继续测试。验收助手通过 Computer Use 操作正常应用、原生观察确认和 iTerm 的人工粘贴／Return 路径，用户无需代点。产品 Agent 仍没有终端输入／执行／中断权限。
- 真实连接为 `zhangke`，模型为当前配置 `yidu / bailian/deepseek-v4.1-flash-1017`；没有替换为本地 HTTP 模型、模拟原生确认或以 fixture 结果记为供应商通过。仅沿用正常 GUI 的保存认证／登录链，没有导出或编辑凭据。
- 初次 GUI 显示旧内置终端构建，已排除。重新运行 `npm run ci`：lint、331 条静态安全检查、类型及构建全部通过；两处既有 Vite 混合 import 提示保留。`npm run test:local` 在 21:36:47 开始，59 文件／332 项通过、3 项真实集成默认跳过，总 22.78 秒。以最终正常构建启动，应用验收期间没有重建 `out/`。
- 上一轮真实首问、多行建议、自定义函数＋awk/sort/head 分析和布局证据保留；中断的重开当时未完成，不记为通过或产品失败。本次继续完成该链路，不修改产品源码，不提交／推送／打包／发布。

### 11.2 本次已完成的真实结果

- **未执行命令／未授权时先问问题**：真实模型给出一个多行首步骤 `df -hT /`、`df -iT /`，明确没有现场输出。实际复制按钮将两行写入剪贴板；切到本轮 iTerm 仍只有登录输出，直到验收助手粘贴并按 Return 才执行。
- **首次原生授权**：Computer Use 自行点击真实取消后保持 AI 不参与，显示预期 `Observation cancelled`；再次打开并点击允许后启用观察。没有绕过 Main 确认。
- **执行后自动跟进／目标延续**：两条 df 输出返回后未补发聊天请求，模型自动识别根分区容量 55%、inode 7%，继续容量排查，给出挂载点、目录占用、删除未释放句柄三个方向。界面保留 uncertain／退出码未知说明。后两类建议只查看，没有执行目录遍历或句柄查询。
- **关闭画面后显式重开**：只关闭本轮 iTerm 窗口 3960，再通过产品“在 iTerm 中打开”创建窗口 4079。df 和 PID 标记缓存保留；重新实际执行 `printf`，远端 Shell PID 前后均为 133050，原登录会话继续响应。该 GUI 证据验证远端 Shell 连续性，不冒充独立读取 Main PTY PID／UUID 的结构化断言。用户原窗口 1266 保留。
- **重开后的权限／失效建议**：重开后显示 AI 不参与，旧建议复制禁用；真实点击尝试未改变剪贴板 sentinel。重新授权取消仍 off，允许后正在观察，但旧建议没有恢复可复制。
- **重新授权后的自定义复杂输入**：人工执行有界只读 `moxun_capacity_probe` 函数，内部仅两条 df，经 awk／sort／head 输出。未发送新的聊天分析请求，真实模型自动分析并明确指出 awk 过滤的证据范围有限，不能证明其他分区健康；正确关联根分区容量／inode，给出三个后续方向，并说明 iTerm 身份已变化、结论只基于当前授权输出。
- **暂停／恢复重新确认**：实际暂停后复制禁用，点击尝试保留 clipboard sentinel；新 `printf` 标记＋df 仍能人工执行。随后 GUI 证据数为 0、历史步骤保持 4，没有新增可见分析。恢复的原生取消保留暂停状态，允许后仍证据 0，不补采暂停内容；再人工执行新的 inode 查询后才出现新分析和第 5 步建议。这里只计 GUI 结果，不声称逐 HTTP 请求计数。
- **未验证建议的风险确认／仅复制**：真实模型的一项 `findmnt --real -o …` 建议被标为安全性未验证，仍正常展示。点击复制仅打开内联风险确认，剪贴板不变；取消亦不变。重新打开并点击“已核对风险，仅复制”后，剪贴板为完整 findmnt 命令；切回 iTerm 仍仅有此前人工 df 输出，findmnt 未执行。确认区属于主内容正常滚动流，较低位置需滚动，不是独立固定覆盖层。
- **撤销后的新输出／失效建议**：从正在观察状态点击“结束协作”，AI 不参与、证据数归零，原可复制建议禁用，点击尝试不改变 sentinel。再人工执行新 `printf` 标记＋df，终端正常返回；22:35 GUI 仍证据 0、历史步骤 5，没有新增可见分析，证明结束观察不妨碍人工终端查询。

### 11.3 私密证据与未扩大范围

本次证据目录：`/private/var/folders/9b/zxdf7gd103xfwmrbskqdgq640000gn/T/opencode/moxun-computer-continued-PpKCKo/`，含 `checks.json`、`provenance.json` 和分阶段截图。上一轮目录为同一临时根下 `moxun-computer-real-EhoCl7/`。截图包含业务信息，仅本机保留，禁止整目录分享、提交或发布；报告不导出终端业务正文。

收尾关闭本轮画面 4079，并正常退出本轮启动的 Crescent；启动任务已结束，用户原 iTerm 窗口 1266 仍保留。记录的六项源码／lockfile hash 与验收开始时一致，报告格式、7 个本地 Markdown 链接和 `git diff --check` 通过。退出日志中的三次 `Observation cancelled` 分别对应实际原生取消，是预期拒绝路径，不记为授权失效或模型失败。

真实结果只覆盖上述实际输入和 GUI 场景，不证明任意 Shell／模型建议都正确、不证明建议执行后的修复成功。目录遍历建议、桌宠曾遮挡局部按钮等上一轮观察仍保留，未修改源码，不声称已修复。原生 `context-live` 缓存专项、确认窗口期间的退出竞态、Main 硬杀、长期性能、其他认证方式／架构和发行安装仍未验收。GUI 中没有新分析不能等同于逐 HTTP 请求计数；本轮没有将本地 fixture 的请求断言混算进真实供应商结果。
