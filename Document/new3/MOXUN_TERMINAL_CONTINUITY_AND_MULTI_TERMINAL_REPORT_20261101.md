# 同终端连续观察与同对话多终端补测记录（2026-11-01）

本轮修复 SSH 换主机导致观察中断，并支持同一对话添加多个外置终端。不是全部原生／人工验收完成声明；没有提交、推送、发布或重新打包。

## 1. 产品改动

- **授权绑定终端而非主机**：owner、对话终端 tab、iTerm UUID、connectionId、PTY generation 仍严格校验。SSH 跳转任意主机或退回本地不撤销授权；原生确认等待期间的 host/cwd 变化也不再错误拒绝同一终端。
- **证据分段**：主机变化保留有界、带 host 标签的历史，清除旧 Shell 的部分输入、命令边界和提示符信任。敏感抑制保守延续；提示符主机不算验证过的服务器身份。旧主机建议／通知 token 仍失效，不能误复制。
- **新提示符标签同步**：Main 原始传输解析器确认新的 trailing prompt 后，即使不是已识别的 SSH hop，也同步观察 `promptHost`，本地提示符标为 `local-shell`；不移动 configured/runtime 执行锚点，不把提示符当作登录成功证明。等待输入、alternate-screen 和光标控制过滤保持不变。
- **本机标签规范化**：已识别为本机的短主机名／Bonjour 名和本地 zsh 的裸 `%` 统一成 `local-shell`。同一结果中交替出现这些本机提示符不再假换主机、清掉新输出通知；真实远端标签仍独立分段。
- **同对话多终端**：外置终端选择器默认添加到当前对话，也可新建对话。顶部按钮切换建议目标，保留聊天、草稿和模型选择。每个终端独立授权／撤销；保存连接卡片仍新建独立对话，可从该对话继续添加外置终端。
- **Main-owned 合并**：Renderer 仅传参与 tab ID；Main 校验数组、长度、规范 ID 和 owner，过滤不存在／非外置终端，按各自授权读证据。当前终端加最多 7 个 peers 共用总字符预算；Agent 不能输入、执行或自行授予观察权限。
- **主动建议边界**：所有已授权终端各自持续观察，仅当前选中终端触发主动分析；其分析可读取其他已授权 peers。草稿、附件及用户回合优先，不让后台终端抢占建议目标。
- **手动回合消费旧通知**：Main 在异步模型初始化后读取最新证据时，同步消费当前终端及实际纳入上下文的 peers 的待发／已发通知；保留内容指纹以避免同内容快照重播。该选项不暴露给 Renderer 或模型工具；普通观察读取不消费，后续真正的新输出仍可触发主动建议。

主要实现位于 `src/main/terminal/observer/`、`src/main/terminal/ipc.ts`、`src/main/agent/pi-host.ts` / `pi-guided-ops.ts`、`src/shared/terminal-observation-types.ts` 及 Renderer 的 `ConversationTerminalSelector.tsx` / `useExternalTerminals.ts` / `useAgentController.ts` / `App.tsx`。

## 2. 已完成验证（computer use 补测前的历史轮）

本轮证据根目录：`/Users/xusong.yu/Desktop/test/Crescent-terminal-continuity-20261101/`。`before/`、`before-hashes.json`、`before-status.txt` 保留改前主要文件和原工作区状态；失败日志不会被后续通过覆盖。本地测试文件保持 gitignored，不进入提交。

| 验证 | 结果 | 日志／证据 |
| --- | --- | --- |
| 授权、观察分段、通知、总预算、Guided Ops 及 Main 多终端 owner／输入边界 | 6 files / 64 tests passed | `targeted-02.log` |
| 旧通知消费定向回归 | 6 files / 67 tests passed；待发／已发通知、同内容快照去重、owner／参与者隔离及后续新输出 | `targeted-12.log` |
| 主机标签与旧通知最终定向回归 | 7 files / 82 tests passed；包含未识别 Shell 换主机、本地新标签、执行锚点不迁移及 UUID 过期 | `targeted-18.log` |
| 本机提示符规范化定向回归 | 7 files / 83 tests passed；额外证明裸 `%`／本机 hostname 交替不拆分事件、不丢新通知 | `targeted-21.log` |
| 首轮 CI | lint、335 静态安全检查、Node/Web 类型检查及构建通过；3 条新增测试格式 warning 后已格式化，保留既有构建 import 提示 | `ci-01.log` |
| 已配置真实视觉模型 | 1 file / 1 test passed；Main 验证图片，真实 base64 图片 payload，识别左红圆／右蓝方形，stopReason=stop | `vision-01.log`；`artifacts/moxun-vision-rR8ZMH/result.json` |
| zhangke 真实 SSH + 同对话双终端 + 已配置真实模型 | 1 file / 1 test passed；**观察授权模拟，不算原生验收** | `zhangke-fixture-06.log`；`artifacts/moxun-zhangke-PJpKbb/` |
| 三种 iTerm 入口／loopback SSH、同对话多终端、proactive 及原生图标 | 3 files / 3 tests passed、1 minimize/restore 环境 skipped；launch/running 严格 PNG 一致 | `live-regression-07.log` |
| 旧通知修复后的真实集群与 iTerm/proactive/icon 重复 | 4 files / 4 tests passed、1 minimize/restore 环境 skipped；集群模拟授权，已严格验证单 run、有效建议及输出不变；**此轮早于主机标签修复** | `live-and-zhangke-16.log`；`artifacts/moxun-zhangke-IuQBI2/`、`moxun-proactive-9prsmK/` |
| 主机标签修复后的 20 真实重复轮 | **整体失败：1 failed / 3 passed / 1 skipped**；集群的本地主机标签、双终端、单 run、有效建议和无终端输入断言通过；proactive 新输出跟进失败，不能称整轮全绿 | `final-live-and-zhangke-20.log`；`artifacts/moxun-zhangke-Fl0Cnv/`、`moxun-proactive-Jx6Aqs/`；`live-summary-20.json` |
| 最终 23 真实重复轮 | **4 files / 4 tests passed、1 minimize/restore 环境 skipped**；真实 zhangke/已配置模型、本地标签、双终端、草稿、单 run/有效建议/输出不变、新输出主动跟进及原生图标通过；集群授权仍模拟 | `final-live-and-zhangke-23.log`；`artifacts/moxun-zhangke-MBSyFw/`、`moxun-proactive-9EbbDi/`、`moxun-chat-ui-l3T0pO/`；`live-summary-23.json` |
| 最新 Node/Web 类型检查 | 通过 | `typecheck-08.log` |
| 主机标签及通知修复后的完整本地门禁 | lint 无 warning；335 静态安全、Node/Web 类型检查和构建通过；70 files / 396 tests passed、9 files / 12 tests skipped，保留两条既有 dynamic/static import 提示 | `verify-local-19.log` |
| 本机提示符规范化后的最终完整本地门禁 | lint 无 warning；335 静态安全、Node/Web 类型检查和构建通过；70 files / 397 tests passed、9 files / 12 tests skipped，仍保留两条既有构建 import 提示 | `verify-local-22.log` |
| 最新 Provider native focus | **1 file / 1 test failed**，实际窗口未取得 native focus，未放宽断言 | `provider-native-focus-09.log`；`provider-native-focus-09/capture-focus-failure.json` |
| Provider 提取前归档源码／当前源码严格对照 | 两轮隔离行为回归均通过，DOM／几何／行为／回调完全一致；**严格 PNG 11/12，仍未通过** | `provider-strict-before-10.log`、`provider-strict-after-10.log`、`provider-strict-comparison-10.json` |

真实模型均为已配置的 `yidu` / `bailian/deepseek-v4.1-flash-1017`，不是 loopback 模型。视觉测试仅发送合成图形，图片隐私确认模拟，不算人工隐私确认。集群测试仅在测试自有 UUID 执行 `hostname`、`ssh web2`、`exit` 和 `printf` 合成标记；没有修改业务资源。真实模型分析的是获授权的集群 hostname／终端测试输出，不是业务诊断准确性全面验收。

集群成功轮保留：

1. 保存连接实际完成 zhangke 登录，web1 观察生效；进入 `web2.zhangke.yiducloud.cn` 后观察仍 active。
2. web2 → web1 → 跳板退出 → `local-shell`，iTerm UUID 和 PTY generation=1 不变；本地新输出继续进入证据，web1/web2 历史仍在。
3. 同一 chatId 添加第二个独立本地 iTerm；未授权时不借用第一终端授权，分别授权后两侧标记进入合并证据。
4. 真实模型调用 `observe_terminal` 并读取 `moxun-first-local-ok` 与 `moxun-second-local-ok`；撤销第一终端只清除其证据，第二终端仍 active。

06 成功轮模型第一次 `propose_command` 缺少必填 `onUnexpected` 被 schema 拒绝，之后自行补齐并成功发布建议。最终回合通过不等于模型所有工具调用都无错误；完整 `model-events.json` 保留，未删掉该拒绝。

最终 23 轮严格确认 web1→web2→web1→`op-mon1`→`local-shell`，第一终端 UUID/PTY generation=1 不变；web1/web2/跳板历史分段保留，两个终端的本地标记和当前观察身份均为 `local-shell`。添加／切换终端不丢对话或草稿，独立撤销不影响 peer。真实模型只启动一个 run，`observe_terminal` / `propose_command` 两次调用均成功；静置 8.5 秒后建议仍有效，两侧原始终端输出与分析前一致。proactive 的本地确定性模型另证明：手动回合后旧通知不重播，真正新输出仍可触发三方向建议。23 轮两份 native launch/running PNG 各自严格字节一致；minimize/restore 跳过仍不算通过。以上不构成业务诊断准确性、原生授权或人工辅助技术全面验收。

## 3. 历史失败与当时尚未完成项

- `zhangke-01.log`：本地夹具模板字符串转义错误，Electron／集群尚未启动；改用 raw template 修正。
- `zhangke-02.log` 至 `04.log`：已真实登录 web1，但原生观察授权按钮自动点击超时。诊断轮保存了仅针对测试自有 PID 的 Accessibility 尝试；System Events 的独立只读进程查询也在 15 秒内无响应。不能据此宣称原生授权通过，也不能认定是产品授权逻辑故障。
- `zhangke-fixture-05.log`：模拟授权后已通过 web1→web2，但测试将本地提示符与 `os.hostname()` 做字面比较，错误退出自有 Shell；改用既有 `isLocalMachinePromptHost()`，兼容 `local-shell`／Bonjour 主机名，成功轮仍严格要求原 UUID／代次与本地提示符。
- `zhangke-fixture-final-11.log`：增强版已通过添加／切换终端、草稿保留和双授权，但最终建议有效性断言失败。真实模型成功发布建议，随后旧通知在手动回合结束后启动第二个 run，使建议失效；`model-events.json` 保存两个 run ID，`guided-result.json` 为 `ANALYZING_NEXT`，终端身份未变。已在 Main 加入旧通知同步消费，不放宽有效建议断言；修复后的增强版另行补跑，保留原失败。
- `verify-local-13.log`：CI 部分 lint、335 静态安全、Node/Web 类型检查及构建通过；本地整体 **1 failed / 394 passed / 12 skipped（79 files）**，唯一失败是旧 `ipc-external.test.ts` 仍要求 SSH 换主机后授权过期。该断言与本轮需求冲突，更新为同绑定跨主机持续观察，保留独立 UUID 更换过期用例。
- 更新后的 `targeted-15.log` 又发现本地主机标签仍为旧 web2；其首次夹具直接从嵌套 web2 退出到本地，不模拟中间 web1。随后 `host-label-reproduction-17.log` 严格模拟 web2→web1→本地，仍失败于旧 web1 标签。复核真实 11 轮 `evidence.json` 也发现本地标记事件仍标为 web1（`host-label-reproduction-17.json`）。此前成功轮只证明授权及历史保留，**不能倒算为本地主机标签正确**。据此修复 Main 新提示符元数据与观察身份同步；18 定向及 19 完整门禁已通过，真实最终轮另列。
- `final-live-and-zhangke-20.log` 的 proactive 用例超时于 `next input repeats automatically`：本机 zsh 一个结果中短暂裸 `%` 和 hostname 提示符交替，被错误当成不同 host，反复分段使最新当前 host 事件没有可通知输出。`failure.json` 保存 8 个请求，失败前只完成初始／第一轮主动分析，未发出第二轮主动请求；不是模型没有给建议。已统一本机观察标签，21 定向通过新增复现断言；后续整轮结果独立记录，不延长等待或放宽断言。
- Provider 严格像素、实际 native focus、minimize/restore、VoiceOver 等原有未通过／未人工验收项仍独立记录，不能用默认行为门禁、截图或模拟 consent 冒充通过。原生屏幕工具仍无 Screen Recording 权限，Electron `capturePage()` 不等于完整桌面截图。
  以上是该历史阶段的状态；随后真实 computer use 的授权、焦点及 VoiceOver 补测见第 5 节，不改写此前失败或 skipped。
- 10 严格对照轮的英文浅色 1920 图有 29 个通道差异、最大差值 3（`provider-strict-pixel-diagnostics-10.json`）；没有容差、遮罩或删图。这两轮没有取得／要求实际 native focus，不能把 11/12 的结果倒算成原生视觉验收；底层像素不稳定根因仍未查明。

## 4. 收尾状态

完整本地门禁已通过，最终生产／测试版本的计数见 `verify-local-22.log`（397 passed / 12 opt-in skipped），跳过不倒算通过。最终真实重复轮见 `final-live-and-zhangke-23.log`（4 passed / 1 环境 skipped）。23 轮结束后仅补充归档与审计说明，不改变生产代码或测试断言。所有修改未提交、未推送、未发布、未重新打包；工作区原有大量修改、删除和未跟踪文件全部保留，没有恢复或丢弃用户工作。

`archived-final-and-live-14.json`、`archived-live-16.json`、`archived-live-20.json`、`archived-live-23.json` 归档 11/20 失败及 07/16/23 完成轮的 158 个证据文件并逐个 SHA-256 复核，原始临时文件保留；未归档 data/profile 或 SSH 私钥。`owned-resource-audit-24.json` 只读核对有 provenance 的 32 个 iTerm UUID、33 个 PID，均无记录资源残留；没有向用户原终端输入、关闭会话或发送信号。Socket provenance 不完整，不宣称整机所有资源均已清理。

`final-integrity-audit-24.json` 核对最终 live 的 30 个源码／测试／构建输入 hash 未变化，79 个本地测试全部 gitignored、无 tracked test，已完成集群轮的测试私有配置副本均已删除，用户原配置 hash 与首轮副本一致。`final-files-24/`、`final-files-24.json` 和 `round-incremental-final-24.diff` 保存任务路径最终快照及有真实改前备份的增量差异，不伪造整个工作区基线；`final-evidence-sha256-24.json` 汇总本轮证据 hash。旧失败、旧成功轮的标签缺陷、原生授权／Provider 未通过项均保留，不因最终链路通过而改写。

## 5. 真实 computer use 补测（2026-11-01）

证据根目录：`/Users/xusong.yu/Desktop/test/Crescent-computer-acceptance-20261101/`。本补测没有修改生产代码或原本地测试断言，也没有提交、推送、发布或重新打包。通过外部适配器保留原断言，仅加入 computer 操作交接等待；原 Provider 2 秒焦点／三帧位图一致断言不变，没有容差、遮罩或删除失败图片。历史 397 tests 的完整门禁不自动覆盖后来用户改动，本补测不冒称重跑完整 CI。

| 项目 | 本次结果 | 证据 |
| --- | --- | --- |
| computer 真实权限和输入 | 已授权 `input-helper` 的物理桌面截图、原生鼠标点击可用；键盘最初由 `osascript` 被拒绝，授权后实际 Escape／Tab／Return／Cmd+F5 成功 | `permission-probe-result.json`、`voiceover-before.json`、`desktop-captures/`；早期 smoke 点击失败保留 |
| zhangke 原生授权＋连续观察＋多终端＋真实模型 | **通过**：两次真实原生授权请求均返回 `active`，没有 mock；web1→web2→web1→跳板→本地，同 UUID／generation 持续观察；双终端／草稿保留、单 run、有效建议、两侧无 Agent 输入及独立撤销断言通过 | `cluster-02.log`、`cluster-02-evidence/result.json`、`host-transitions.json`、`evidence.json`、`model-events.json`；`desktop-captures/cluster-consent-1.png` / `cluster-consent-2.png` |
| Provider before／after native focus | **两轮原断言通过**：computer 点击唯一测试窗口的原生标题栏，核对真实 `isFocused=true` 后继续；12 次捕获均有 native/document focus、三帧一致；checks／snapshots（含 DOM 和几何）／eventRuns 完全一致 | `provider-before-02/`、`provider-after/`、`provider-comparison.json` |
| Provider 严格 PNG | **10/12 完全字节一致，整体未通过**；英文浅色 800：6 通道差异，max=2；中文浅色 1920：3 通道差异，max=2。数值小也不放宽通过标准，根因仍未确定 | 两轮全部 24 张 PNG 和 `provider-comparison.json` |
| 原生最小化／恢复 | **两轮失败，未通过**：真实黄灯、Cmd+M／窗口菜单操作后未取得 Main `minimize` 状态或事件，均在交接期限失败；不能把 Stage Manager 后台缩略图或 blur 当作 minimize。两轮 launch/running 原生图标 PNG 各自严格一致，但无 minimized/restored 图标验收 | `product-failure.json`、`product-02/product-failure.json`、两轮日志／状态／launch/running PNG；`desktop-captures/product-minimized-desktop.png` 仅记录尝试后的桌面，不证明已最小化 |
| 真实 VoiceOver 键盘／屏幕 | **限定范围完成**：独立隔离 built app 开启真实旁白，字幕识别测试窗口／打开设置；实际键盘打开 Settings、Tab 到 API Key，字幕识别为“安全文本栏”；Escape 后焦点环回到设置入口。不是听觉验收，也不是所有辅助技术全面通过 | `voiceover/result.json`、`voiceover.log`、`desktop-captures/voiceover-*.png`；开启前／结束后旁白均关闭 |

Provider 的 1920／2560 仍为原测试的 Chromium device-metrics emulation，不能称为物理原生高分辨率桌面验收。物理桌面为 1440×900 logical、scale=2；保存的 desktop PNG 调用与 computer screenshot 相同、已授权的 `mac-use-mcp` `captureScreen()`／`input-helper` 实现，不是 Renderer `capturePage()`、独立 `screencapture` 或权限绕过。

额外失败均保留：`cluster-01.log` 为适配器拼接缺少分号，尚未启动集群；`provider-before/` 首轮是 computer 焦点点击误落面板外侧、关闭面板，随后 `window.__snapshot()` 失败，不算产品行为回归失败；重验只点击原生标题栏。VoiceOver Control-Option 组合间歇触发系统听写询问，均选“以后”，未开启听写或永久修改相关偏好；工具无法听取音频，不宣称人工听觉验收。

临时 `osascript` 辅助功能权限原拟恢复关闭，系统要求用户触控 ID／密码确认；用户随后明确要求“**不用关，以后还要用**”，因此按新决定保留开启，结束截图已核验。`input-helper` 的现有授权保留，VoiceOver 已恢复关闭。未获取或代输系统密码。

收尾只读审计 `integrity-resource-audit.json`：本次明确冻结的 8 个源码／测试／build／package 输入 hash 未变，用户原配置 hash 未变，集群私有配置副本已删除；79 个本地测试全部 ignored、无 tracked test；本轮 2 个自有 iTerm UUID 和记录的 10 个 PID 均无残留。只证明有记录的资源，不宣称整机所有资源清理。4 个 `out/main/computer-acceptance-*.cjs` 先核对生成 hash、归档到 `generated-launchers/` 后清除，外部成功／失败证据全部保留；`evidence-sha256.json` 汇总非私有 data/profile 的证据 hash。其余用户工作区修改、删除和未跟踪文件未恢复或丢弃。
