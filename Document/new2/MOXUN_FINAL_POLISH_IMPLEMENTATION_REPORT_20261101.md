# 墨巡收尾优化、项目工作区与 Universal 交付记录

日期：2026-11-01。对应 [收尾计划](MOXUN_FINAL_POLISH_AND_ACCEPTANCE_PLAN_20261101.md)，并包含用户补充的品牌文字精简、DeepSeek 图片输入、侧边栏项目及 macOS 打包要求。

## 1. 实施结果

- 左上角只保留图标；结果底部整排操作移除。运行记录、Markdown／Trace 导出和原始错误收纳到默认折叠的“运行详情”。
- 图片能力以 **Provider + Model 显式配置** 为准。模型选择器显示视觉／纯文本，附件说明随模型变化；选择、移除、切换模型、按钮发送、Enter 和 Controller 都重新校验。可提取文本的 PDF 不因纯文本模型而禁用。
- 指定模型 `yidu / bailian/deepseek-v4.1-flash-1017` 的用户配置已启用 `imageInput`，其他模型配置保持原值。真实供应商请求已包含图片并识别成功。
- 本地代码索引移入侧边栏“项目”：原生选目录、Main 注册、关联当前对话、项目中新建对话、文件与索引、项目历史恢复。Agent 每轮通过 `projectId` 在 Main 解析项目 cwd；文档修改走原有逐次审批。
- 错误只保留一个主要展示入口；已知类别给中英文说明，脱敏后的 Provider 原始错误仍可查看／复制。内部路由和未知状态保留在诊断中。临时故障不自动重放可能已产生副作用的运行。
- 长会话根据测量增加历史消息整行 memo 和稳定回调；未引入虚拟列表。应用启动加载持久化历史，修复项目侧栏必须先打开历史弹窗才显示旧会话的问题。
- PTY 增加私有 EOF 清理辅助进程：Main 被 SIGKILL 后仍清理本轮 PTY 进程组和私有 socket 目录；正常退出可撤销该辅助进程。

完整本地测试已通过 352 项，4 项真实集成默认跳过且有独立运行记录；最终打包门禁和产物验收结果见第 6、8 节。

## 2. 主要修改文件与职责

工作区进入本轮时已有品牌、聊天优先、终端和桌宠等大量未提交改动；`git diff` 全量清单不等于本轮清单。以下列出本轮实际涉及的职责文件：

| 职责                 | 文件                                                                                                                                                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 项目注册／授权／存储 | `src/main/projects.ts`、`src/main/local-document-ipc.ts`、`src/main/crescent-sqlite.ts`、`src/main/sqlite/rows.ts`、`src/shared/projects.ts`                                                                                                       |
| 项目 IPC 与装配      | `src/main/index.ts`、`src/preload/api.ts`、`src/preload/modules/projects.ts`、`src/shared/agent-types.ts`、`src/main/agent/ipc.ts`                                                                                                                 |
| 项目 UI／历史／发送  | `src/renderer/src/App.tsx`、`components/AppSidebar.tsx`、`components/ProjectSidebar.tsx`、`components/CodeIntelligenceSettings.tsx`、`hooks/useHistoryController.ts`、`hooks/useAgentController.ts`                                                |
| 多模态能力           | `src/shared/model-capabilities.ts`、`src/main/agent/multimodal.ts`、`src/renderer/src/lib/agent-config.ts`、`components/SettingsSheet.tsx`、`components/ChatWorkspace.tsx`、`components/ComposerAttachments.tsx`                                   |
| 错误／诊断           | `src/shared/agent-errors.ts`、`src/main/agent/pi-host.ts`、`src/main/agent/pi-event-bridge.ts`、`src/renderer/src/hooks/useAgentRuns.ts`、`lib/agent-run-document.ts`、`components/AgentRunTimeline.tsx`、`components/timeline/RunDiagnostics.tsx` |
| 历史性能             | `src/renderer/src/components/AgentLogList.tsx`、`components/AgentLogMessage.tsx`、`components/AgentLogContent.tsx`、`hooks/useStableCallback.ts`                                                                                                   |
| 终端边界／生命周期   | `src/main/agent/pi-terminal-bash.ts`、`src/main/terminal/session/pty-lifetime.ts`、`pty-session.ts`、相关 Session manager／共享终端接入                                                                                                            |
| 局部视觉             | `src/renderer/src/components/ProductLogo.tsx`、`components/SessionUsageBar.tsx`、`src/renderer/src/assets/chat-workspace.css`                                                                                                                      |

表内省略前缀的 Renderer 路径均位于 `src/renderer/src/`。本轮没有修改桌宠实现。测试文件只保留本地、受 Git ignore 约束。

## 3. Main／Pi 权限调用链

```text
Renderer Composer
  → preload 白名单 agent.run
  → Main sender/frame 校验
  → projectId → Main 项目注册表 → 目录重新验证 → 本窗口文件授权
  → Pi host（显式 cwd、受控 resourceLoader、工具 allowlist）
      ├─ read／代码索引 → LocalDocumentReader → 授权范围／符号链接／敏感路径校验
      ├─ request_file_change → Main 完整 Diff → Renderer 逐文件确认
      │   → Main 一次性审批／内容摘要与时效校验 → 写入队列 → 写后校验
      ├─ observe_terminal → owner + tab + generation + UUID + 观察 grant
      ├─ propose_command → 建议文本，不派发终端命令
      └─ subagent → 同样的工具边界与 Main 来源标记

Main withAgentCapabilities (AsyncLocalStorage，来源不取自模型/IPC)
  → 主／子 Agent tool allowlist：无 bash/write/edit/terminal_input
  → assertOperatorTerminalAccess：Agent 来源的终端操作默认拒绝
  → 旧 executeReviewedPtyCommand / bash compatibility trap：直接调用也拒绝
  → MCP 不向 Agent 开放终端执行旁路

人工 iTerm 键盘 → 私有桥接 socket → 宿主 PTY
  → 正常的人工作业与 SSH 登录链
  → 观察只有显式授权后的有界证据，不反向赋予 Agent 输入权限
```

`pi-terminal-bash.ts` 原执行体删除前核对调用方；保留的 `PtyBashExecContext` 仍服务于文件审批、观察、捕获和子任务上下文，并不授予终端输入。未以删除行数为理由删除这些共享调用。

原生选目录及文件授权用 `withDocumentOwner` 捕获发起文档，跨异步等待检查关闭／导航；授权清理同时取消文件读取。Agent run 在导航／Renderer 异常结束时取消，避免迟到的审批继续工作。图片仍由 Main 校验真实头部、MIME、大小、尺寸、路径和隐私确认；Renderer 预检不能绕过这些校验。

## 4. 性能测量

环境：本机 Intel macOS、Electron 41.10.7、Pi 三个直接依赖均为 1.0.3；真实 Electron 加载 Vite 开发渲染夹具，混合 Markdown、代码、表格、长日志、Timeline。每个规模 15 次滚动采样、10 次流式更新；同一数据生成器。以下是优化前与完整消息行 memo 后的成对记录，单位 ms。

| 消息数 | 首开：前 → 后   | 流式更新平均：前 → 后 | 滚动最大帧间隔：前 → 后 | DOM 节点数 |
| ------ | --------------- | --------------------- | ----------------------- | ---------- |
| 100    | 241.1 → 296.1   | 114.86 → 42.93        | 172.2 → 32.7            | 2,296      |
| 500    | 593.6 → 696.3   | 259.97 → 48.86        | 428.2 → 40.6            | 11,172     |
| 1000   | 1480.0 → 1185.7 | 441.30 → 54.18        | 585.4 → 65.3            | 22,246     |

1000 条流式更新平均下降约 **87.7%**。100／500 条首开并未改善，不把该优化描述成所有指标提升。1000 条 JS heap 约从 49.3 MB 降至 35.7 MB；反复切换／清空后约 18.5 MB（十进制）。这不是进程 RSS、生产压测或长期泄漏证明。

只 memo 内容仍会重复重排完整消息行，最终增加 `AgentLogMessage` memo 与 `useStableCallback`。另有回归检查回调使用最新已提交状态，避免旧闭包。现有首开成本和 DOM 数量仍随消息量增长；当前数据支持先采用该轻量优化，保留完整历史和审计内容。

证据根目录记为 `T=/private/var/folders/9b/zxdf7gd103xfwmrbskqdgq640000gn/T/opencode`：

- 基线：`T/moxun-polish-7wIqps/results.json`。
- 中间仅内容 memo：`T/moxun-polish-o283vc/results.json`。
- 成对优化后：`T/moxun-polish-RqFGAN/results.json`，同目录有 2560×1440、1920×1080、800×600 截图。

尺寸夹具检查文档／日志无横向溢出，Composer 底部和消息区边界相接。独立滚动测试覆盖人工历史位置、流式跟随、回到最新、异步布局、切换和重挂载。

## 5. 真实运行与生命周期

| 场景                 | 本轮证据与结论                                                                                                                                                                                                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DeepSeek 真图片      | `vision-live.test.ts` 显式启用，通过 Main 校验、Pi image content 和真实供应商。返回 `A red circle is on the left, and a blue square is on the right.`；`T/moxun-vision-PSgbNh/result.json` 记录确实发送 `data:image/png;base64,`。合成图片的原生隐私对话框响应由夹具模拟，不记为人工点击验收。 |
| 项目读写             | 真实 Main/preload/Renderer/Pi，模型为 loopback SSE 夹具；检查实际 read 工具使用项目 cwd，拒绝后字节不变、批准后字节精确变化、SQLite 和侧栏恢复。原生目录选择结果由夹具提供，批准／拒绝通过真实 UI。最终结果见第 6 节。                                                                         |
| 三种 PTY 退出        | `lifecycle.browser.test.ts`：正常停止、直接 SIGKILL Main、Shell 忽略 HUP 后 SIGKILL Main。断言 PTY、其子进程、清理辅助进程及私有 socket 目录均消失。`T/moxun-perf-lifecycle-final.log` 中 2 文件／4 测试通过（含 UI 性能项）。                                                                 |
| 真实 iTerm           | `live-iterm.test.ts` 显式启用：双向人工输入、观察暂停／恢复与缓存边界、关闭共享画面后同 PTY PID／新 UUID 重开通过。`T/moxun-iterm-live.log`。                                                                                                                                                  |
| Electron 三入口＋SSH | `MOXUN_ELECTRON_LIVE=1 MOXUN_CONNECTION_CARDS_LIVE=1`：连接卡片、临时 loopback 私钥 SSH、登录动作、断线重试、新建本地、已有 UUID 绑定通过。`T/moxun-electron-iterm-acceptance.log`。                                                                                                           |
| 主动建议             | 修复夹具 JXA 的空 window/tab/session 枚举后，`MOXUN_PROACTIVE_LIVE=1` 真实 Main/preload/Renderer/Pi/iTerm 测试通过；`T/moxun-project-proactive5.log` 中主动建议通过，项目当时仍失败，不能将该联合运行记为全绿。                                                                                |

上述成功的集成夹具只清理本轮创建的 PID／UUID；完整单测中曾发生假 PID 引起的越界清理事件，影响和修复见第 6 节。SSH **本轮只证明临时私钥认证**；密码、SSH Agent 转发、OTP、其他 iTerm 版本和 Apple Silicon 真机不在本轮新通过记录中。此前报告的真实密码登录不冒充本轮测试。

## 6. 测试门禁与失败处理

基线 `T/moxun-baseline.log`：CI 的 331 条静态安全检查通过；本地 331 通过、1 失败、3 跳过。滚动失败定位为测试 Vite 文件监听导致热重载打断，关闭夹具 watch 后恢复；保留原行为断言。

本轮新增／补充的本地覆盖包括：模型能力与 Provider 区分、Main 多模态限制及 PDF 提取、项目注册与目录迁移／符号链接、导航／关闭授权竞态、文件审批拒绝与精确批准、主／子 Agent／MCP／IPC 权限、quota 原始诊断、UI 预检与稳定回调、真实三种 PTY 退出。

失败经过保留：

1. 项目夹具路径 `/var` 与 `/private/var` 先统一 realpath；全局 `form` 选择器误选隐藏索引表单，改为 `.chat-workspace form`；插入文本使用真实 Electron `insertText`。
2. 项目路径嵌入 CSS 字符串时引号转义错误，改为按 button.title 查找并在执行前校验 JavaScript 语法。
3. 随后确实发现侧栏未启动加载历史，修复 `useHistoryController` 的异步初始读取；未通过打开历史弹窗来绕过该验收。
4. 主动建议 JXA 空枚举为夹具问题，按空数组处理，原断言保留。
5. 最早 SIGKILL 夹具误杀 npm 的 Electron Node launcher，该轮不能作为 Main 孤儿进程基线；后续直接使用 `electron` 包给出的真实可执行文件。
6. 首次真实模型尝试误把磁盘加密封装当成 API Key，收到 401。成功夹具通过隔离配置及生产 `readAgentConfig()` 解密，未将凭据写入报告或产物。
7. 三次完整本地测试在服务重启时中断，不能记为通过。排查发现旧单元测试的假 node-pty PID 为 `1`，却调用了新真实清理进程；`kill(-1)` 有向其他可访问进程发送信号的语义。已在 Main 拒绝非整数／PID ≤ 1／超出 pid_t 范围，并在 Shell 再拒绝 0／1；假 PTY 单测同时 mock 系统清理进程，真实生命周期夹具仍使用实际 PID。新增 8 个边界用例断言错误 PID 不会启动子进程。修复后完整测试正常结束；不能将中断前各进程未受影响写成已证明事实。
8. 实际包 inspector 前五次夹具在 Node／Electron 初始化过早时注入，出现 `mainModule`／`resourcesPath`／`app` 尚未就绪、timer 初始化错误和 promise 被回收。改为测试进程检查实际 Main 已加载且 `app.isReady()` 后同步安装夹具，第六次实际包验收通过。新增 MCP 检查时，第七次夹具自行把逻辑 ASAR 路径替换为 unpacked 物理路径，破坏依赖解析，报 `zod/v3` 不存在；改为真实 preload IPC 调用产品 MCP loader，与 loopback HTTP 服务完成握手和工具列举。最终第八次完整包内验收通过，包含退出资源检查。产品源码和包内容未为这些夹具问题改动，失败日志保留在 `T/moxun-packaged-runtime*.log`。

`npm run ci`（`T/moxun-ci-history2.log`）：lint、**338 条静态安全检查**、类型和构建通过。PID 边界修复后，最终打包入口再次执行完整 CI，通过相同 338 条检查、lint、类型和构建；日志为 `T/moxun-universal-build.log`。

`npm run test:local -- --maxWorkers=2`（`T/moxun-local-final4.log`）：**64 文件通过、4 文件跳过；352 项通过、4 项跳过，0 失败**，47.99 秒。包含项目从读写审批到侧栏历史恢复的完整真实 Electron 夹具。默认跳过为 `vision-live.test.ts`、`live-iterm.test.ts`、`electron-iterm.test.ts`、`electron-proactive.test.ts`，其显式运行结果见第 5 节。

本地打包入口包含 `verify:local`（CI＋本地测试），最终再次通过 **64 文件／352 项，4 文件／4 项跳过，0 失败**，测试阶段 31.77 秒。重复运行不累计为新增覆盖；不会把每个浏览器内部断言重复计为 Vitest 测试数。

实际包专项：`T/moxun-packaged-runtime8.log`，**1 文件／1 项通过**，15.12 秒；内部 15 项运行检查及 1 项退出检查见第 8.2 节，不累加为 16 个 Vitest 测试。

测试中断影响：旧墨巡及 iTerm 窗口曾退出，不能宣称用户原有会话不受影响。已重新打开原墨巡应用及 iTerm；恢复后 JXA 枚举为 2 个窗口、1 个 session，这不代表全部原会话恢复。修复后完整门禁正常结束。

## 7. 已知边界

- 性能数据是短时开发夹具，未覆盖任意消息规模、数小时观察或全量无障碍审计。
- 项目选择和部分原生确认使用受控返回值；Main 校验、真实 IPC、文件审批 UI 和磁盘读写均实际执行。不能据此宣称所有原生人工权限路径通过。
- 目录搬迁／变为符号链接会在 Main 被拒绝，需重新打开目录；项目注册上限 64。
- 本地 macOS 包按项目规范禁用签名／公证／发布；Universal 静态架构检查不等于 Apple Silicon 真机运行。

## 8. Universal 交付与验收

执行入口：

```sh
CRESCENT_LOCAL_BUILD_DIR=dist/moxun-20261101 npm run build:mac:local
```

### 8.1 产物与完整性

入口执行成功，交付根目录为 `dist/moxun-20261101/universal/`：

| 产物           | 相对交付根目录路径              |      字节数 |
| -------------- | ------------------------------- | ----------: |
| Universal 应用 | `mac-universal/墨巡.app`        |           — |
| DMG            | `crescent-1.0.12-universal.dmg` | 353,575,630 |
| ZIP            | `墨巡-1.0.12-universal-mac.zip` | 355,857,273 |

SHA-256（同时保存在 `SHA256SUMS.txt`）：

```text
8a6917466a3af185a9a693d3cea7486c10c44bb2f364bbd61256b495bc442ab2  crescent-1.0.12-universal.dmg
e463f96be2a0ba407a8e026e24022a75ce958c181ed51614a611e1dd39e7970c  墨巡-1.0.12-universal-mac.zip
```

- `hdiutil verify` 和 `unzip -tq` 均通过。DMG 只读挂载后已卸载。
- DMG／ZIP 内主程序、ASAR、esbuild 三项 SHA-256 与交付 `.app` 完全一致，详见 `container-consistency.json`。这是关键文件一致性检查，不冒充逐文件容器比较。
- ASAR SHA-256：`9c9e867d2a728cfe581b43a9514189b0eb62d8d5593f8e70d6411e0db37b4c2e`。
- 主程序、Electron Framework、esbuild 为 `x86_64 + arm64`；node-pty 的 `pty.node`／`spawn-helper` 和 Pi native prebuilds 两架构齐全。
- 包内 Pi 三个直接依赖均为 1.0.3，MCP SDK 为 1.30.0，位于 unpacked 依赖路径；PDF lazy chunk、Renderer worker、Main legacy 模块和 worker 齐全；没有 optional native canvas。
- 包内 **287 个构建文件**与冻结的 `out/` 一致，**546 个源码／资源输入**未变。打包后仅继续调整本地验收夹具和交付文档。静态验收见 `acceptance.json`。

### 8.2 实际包运行

直接启动交付 `.app/Contents/MacOS/墨巡 --inspect=0`，以 loopback inspector 驱动原包；`CRESCENT_DATA_DIR`、`CRESCENT_USER_DATA_DIR`、`TMPDIR` 均隔离。未用开发版 Electron 替代交付应用。包内 `app.isPackaged`、`app.getAppPath()`、真实 executable 和 `contextIsolation=true / nodeIntegration=false / sandbox=true` 均有检查。

环境：Intel x64，Electron 41.10.7。证据为 `T/moxun-project-KJMdyH/`；交付目录保留 `runtime-evidence/` 摘要与截图。

| 场景              | 实际结果                                                                                                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 项目注册／授权    | 原生 chooser 返回受控临时目录，Main 注册项目并关联真实对话                                                                                                                                     |
| Pi 读取与文件审批 | 真正调用 read，返回项目 README；拒绝写入后字节不变，逐文件确认批准后精确写入                                                                                                                   |
| 历史恢复          | SQLite 保留 projectId；重载 Renderer 后重新授权项目，侧栏恢复原对话                                                                                                                            |
| MCP 加载          | 真实 `agent.validateConfig` IPC → 包内 MCP loader，loopback HTTP `initialize`、`tools/list` 成功，列出合成只读工具；未连接生产 MCP                                                             |
| 图片 Main 边界    | 纯文本模型拒绝且没有请求；隐私拒绝不发送像素；明确同意后 Pi payload 包含图片 data URL                                                                                                          |
| PDF               | 真实 PDF 经包内 legacy 模块和 worker 提取预设文本，纯文本模型收到内容；optional canvas 未安装。日志有 canvas／DOMMatrix／Path2D 渲染提示，文本提取断言通过，不把此项冒充 Main PDF 图像渲染验收 |
| Agent 执行拒绝    | SSE 夹具故意请求未注册的 bash，工具返回拒绝／未知信息，目标文件不存在                                                                                                                          |
| iTerm／PTY        | 测试经 JXA 向本轮 iTerm UUID 注入键盘文本，走人工输入通道；真实 node-pty 返回标记，默认关闭观察且无观察授权。这是自动化驱动，不是人工手点记录                                                  |
| 显式停止          | 本轮 PTY、清理辅助进程、私有 socket 目录全部消失                                                                                                                                               |
| 应用正常退出      | 另建活跃 PTY 后调用真实 `app.quit()`；测试进程确认 Main、PTY、辅助进程均消失，隔离临时目录无 `mx-*`。只按记录的本轮 UUID 关闭剩余 iTerm 画面                                                   |

模型响应由本机 SSE 服务控制，Main／preload／Renderer／Pi 与文件系统均为实际实现。DeepSeek 真供应商识图结果另见第 5 节。强制 SIGKILL 及忽略 HUP 场景使用第 5 节的真实 Electron 组件夹具，不宣称在交付 `.app` 中再次跑过。

运行后再次核验产物 hash、287 个构建文件和 546 个冻结源码／资源输入，仍全部一致；日志 `T/moxun-package-final-integrity.log`。最终 Markdown 格式检查与 `git diff --check` 均通过，交付报告副本与源码目录中的报告一致。

未执行 Git commit、push 或远程发布。用户配置、密钥、测试临时 SSH 私钥及测试 profile 不纳入交付。
