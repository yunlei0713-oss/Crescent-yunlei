# iTerm 外置终端

墨巡默认进入纯聊天首页。iTerm 是唯一可见的人工终端，不提供内置 xterm、终端布局或子终端面板。首次使用需允许 macOS 自动化；拒绝后到「系统设置 → 隐私与安全性 → 自动化」允许墨巡控制 iTerm。缺失或打开失败明确报错，不静默降级为本机 Shell。

## 三种入口

| 入口                          | 行为                                                                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 侧栏集群／连接卡片            | 先选择本轮 AI 权限，再在 iTerm 创建共享 PTY，沿用 Host/端口/用户/IdentityFile/SSH Options、认证及登录动作。取消不继续登录，重试重新选择权限。 |
| 顶部外置终端 → 新建本地 iTerm | 打开本地 Shell，不自动 SSH。当前用 Main-owned PTY/私有 Socket 桥接，支持人工交互和可选观察。                                                  |
| 顶部外置终端 → 已有会话       | 打开选择器时枚举窗口、Tab、分屏，以 Session UUID 精确绑定，不重新 SSH，不向原会话输入或中断。                                                 |

## 每个会话独立授权

默认 **不参与（off）**，不继承历史授权。选择观察另有 Main 原生确认；Renderer、Agent 和旧设置不能自行授予权限。

| 模式                             | 实际读取范围                                                                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 不参与                           | 不采集 AI 证据。已有会话只做约 5 秒一次 size/liveness 检查，不读屏幕。必要 SSH 状态检测与 AI 证据分离。                                       |
| 从现在开始（live）               | 共享 PTY 仅收授权后流；已有会话以当前可访问文本作不发布的基线，约 750 ms 串行取快照，仅保守保留新增完整行。重写、清屏和无法对齐的变化不推断。 |
| 当前上下文＋继续（context-live） | 已有会话读取当前可访问文本快照（最多保留 24K 字符，可能含部分滚屏）；共享 PTY 可加入当前有界缓存，再收授权后变化。均不保证完整历史。          |

已有快照不提供可靠命令边界或退出码，也不保证完整滚屏历史；快照间短暂输出可能遗漏，输入、回显和输出不能完全区分。证据标记 snapshot/uncertain，不伪造命令事件。远端 SSH Shell 没有可信 OSC 133 时不作结构化保证，不安装或注入 Shell Integration。

2026-10-31 本机实测：`session.text()` 在 80×25 会话中返回了 214 行，包含 fixture 的 200 行输出；说明可访问文本可能包含部分滚屏，不能将“屏幕快照”理解为严格只有可见行。该一次结果不证明其他 Profile、版本或无限滚屏的完整性。取值仍受 1 MiB JXA 响应上限和 24K 字符快照保留上限约束。

暂停／结束立即停采并清空本轮证据，不影响 iTerm 人工输入。恢复重新确认，不补采暂停数据。UUID、owner、连接或 PTY 代次变化使旧授权失效；**同一终端内 SSH 跳转任意主机、退回跳板机或本地，不退出观察**。读取和分析没有命令名称／语法白名单；密码、OTP、令牌、私钥采用保守脱敏／抑制。交互程序的可见脱敏输出也可分析，但无可靠提示符时不把键盘输入保存成命令，避免采集密码；用户仍需检查业务机密，包括返回本地后出现的内容。

连接卡片中的观察选择经原生确认后，先显示「已授权 · 登录完成后开始观察」。Main 验证该保存连接的登录成功后，才开始观察；登录阶段不采集证据。等待期间更换 owner、连接、PTY 代次或 iTerm UUID，以及主动结束协作，都会使等待授权失效。登录后主机变化保留观察授权和带主机标签的历史，但不继承旧 Shell 的部分输入、命令边界或提示符信任；旧主机的建议及触发 token 失效。主机标签来自提示符，不是服务器身份验证。

AI 上下文分别携带侧栏连接名称、入口主机、当前提示符主机、主机信息来源及登录状态。集群节点可以与入口主机不同；命令边界不确定或 `cd` 没有完成证据，只表示命令结果／目录变化未确认，不代表已知主机也未知。共享 PTY 的本地启动目录不作为远端 cwd 发送；远端目录未知时省略。多个 iTerm 窗口按当前目标的 tabId、Session UUID 和 PTY 代次区分，其他已授权终端仅提供各自带标签的参考证据，最新输出不会替换当前目标。

Agent 永远不能写入、粘贴、执行或中断终端。建议只能复制后在 iTerm 手动执行；文件修改另走完整 Diff 人工审批。

## 同一对话连接多个终端

- 点击侧栏「连接外置终端」或对话顶部「连接其他终端」，默认添加到当前对话；也可明确选择「新建对话」。新建本地 iTerm 和绑定已有 UUID 均支持此入口。保存连接卡片仍默认新建独立对话。
- 顶部终端按钮切换当前建议目标，不清空对话、草稿、模型选择或其他终端的授权。每个终端仍独立授权，撤销一个终端不影响其他终端。
- 手动请求及当前终端的主动分析可读取本对话其他已授权终端的 Main-owned 证据；未授权终端仅提供不可用元数据。最多纳入当前终端及 7 个其他终端，共用设置中的**总字符预算**，不是每个终端独占完整预算。
- 所有已授权终端继续各自观察；主动建议仅由当前选中终端触发，避免后台终端抢占排查目标。切回终端时可处理仍有效的待分析通知；用户草稿／回合优先规则不变。

## 主动下一步建议

打开外置终端或连接集群后，可**直接在聊天输入框描述排查问题**，不用先执行任何命令。Agent 从问题和当前会话元数据给出第一条排查命令／完整诊断片段；观察未开启或没有输出时明确注明，不虚构现场结果。之后授权观察，人工执行产生新证据就进入自动跟进模式。

启用观察且配置了可用模型后，当前会话的输出稳定约 1.5 秒会主动触发分析，不需要每次发送聊天消息。两次通知至少间隔 8 秒；相同快照去重，同一持续输出状态不会反复请求模型。运行中或交互程序的稳定可见输出也能分析，不等于命令完成；可信完成标记到来可再分析一次。敏感提示、全部被屏蔽或没有完整输出的证据不触发；部分内容脱敏不妨碍分析其余证据。

- 一次给出 **1～3 个有效诊断选项**（一条推荐项＋0～2 条实质不同的备选，不为数量凑数），优先不修改资源的查询，不是批量执行计划。支持复杂管道、重定向、awk/jq、SQL、自定义 CLI 和多行诊断片段；没有执行白名单造成的展示门槛。
- 读取不限定 Pod 或任何命令词汇：根据实际问题、命令和输出推理；未知资源名、工具能力和退出码不凭空确定。
- 静态规则仅用于**建议风险标签**：通过静态只读检查、未验证需人工核对、高风险。未验证／高风险建议先显示风险确认，再允许仅复制；模型说“只读”不构成安全证明，也不授予执行权限。
- 点击「按此方向追问」填写目标并发送后，围绕目标给出一条确切命令／诊断片段。人工执行下一步后，再依据新证据继续目标，而不是每轮从通用查询重新开始。
- 最新建议位于主内容区，与分析结果共用正常滚动流；不再固定在顶部挤压或遮挡内容。预期结果、证据和历史默认可折叠，查看输出不必先折叠整个建议。
- 草稿、附件、待回答问题及正在进行的用户回合优先；可单独暂停主动建议而不停止观察。结束排查会暂停主动建议。
- 手动回合读取最新证据时消费已经包含的旧通知，避免回合结束后重复自动分析、立即替换刚发布的建议；同内容快照不会重播，后续新输出仍可自动跟进。
- 复制前重新检查建议和目标有效性；依据已观察证据生成的建议在撤销观察后不可复制，换目标后的旧建议失效。未授权时仅依据问题生成的初始建议不要求读取输出权限。每次自动分析会使用所选模型，可能产生供应商费用；脱敏无法识别所有业务机密。

## 生命周期与实现

- 解除已有绑定只停观察，不关闭原 iTerm，不发送 exit/Ctrl+C。
- 暂停／撤销观察不关闭共享 PTY。解除关联或结束对话只归档聊天并撤销观察；shared PTY 继续由 Main 托管，显示在“独立运行的终端会话”中，可重新打开或明确结束。应用退出和 Renderer owner 销毁仍沿用既有清理策略，不能承诺 SSH 在应用退出后存活。
- 关闭共享 iTerm 画面后，显示“窗口已关闭 · 会话仍在运行”，可点击「重新打开终端」为原 PTY 重建画面，保留 PID 和有界缓存；新 UUID 不继承旧观察授权。只有确认旧 UUID 已消失才重建，自动化拒绝／超时不创建替代会话。
- 只有明确 UUID missing／iTerm 未运行才标记窗口关闭；Automation 拒绝、超时和暂时错误显示“暂时无法检查”，按封顶 30 秒的退避重试，不判定 Shell 退出。existing iTerm 的 UUID 消失只解除绑定。历史恢复仅恢复对话，不自动登录或继承授权。
- Main 位于 `src/main/terminal/external/`，JXA 用 `execFile` 和 stdin 传参；生产自动化没有 write 操作。共享桥接依赖 node-pty、私有 Socket 和系统 bash/stty/nc，无新增守护服务，不修改 iTerm Profile。
- 证据仅在有限内存中按需提供模型，不建立永久录制库。采样有超时、取消与版本检查，缓存严格有界。

“结束终端会话”以稳定 Main session ID 定位，原生确认文案说明将终止 Shell 及前台任务、无法重开恢复；重复结束幂等。所有管理入口验证 sender owner，并拒绝 Agent-origin。

## 本地验收入口

测试保持 gitignored，业务集群／付费模型验收需显式批准。以下 iTerm 回归只创建隔离测试会话并清理自身资源，不连接保存的业务集群：

```sh
CRESCENT_LOCAL_TESTS=1 MOXUN_ITERM_LIVE=1 npx vitest run src/main/terminal/external/live-iterm.test.ts
npm run build
CRESCENT_LOCAL_TESTS=1 MOXUN_ELECTRON_LIVE=1 MOXUN_CONNECTION_CARDS_LIVE=1 npx vitest run src/main/terminal/external/electron-iterm.test.ts
CRESCENT_LOCAL_TESTS=1 MOXUN_PROACTIVE_LIVE=1 npx vitest run src/main/terminal/external/electron-proactive.test.ts
```

Electron 测试使用真实 BrowserWindow/preload、隔离数据目录与 127.0.0.1 临时 SSH fixture。默认 off 流程不 mock 原生观察确认；授权竞态另由本地行为测试验证，不能写成原生授权人工验收通过。当前结果和未通过项见[实施与验收记录](new1/MOXUN_CHAT_FIRST_ITERM_IMPLEMENTATION_REPORT_20261031.md)。

主动建议测试使用真实 Main/preload/Renderer/Pi/iTerm，模型为本地确定性 HTTP fixture，原生观察确认响应模拟。只能证明产品链路，不能替代业务集群上的模型判断质量或本轮人工授权验收。

获批后可用 `MOXUN_ZHANGKE_LIVE=1` 单独运行本地 `zhangke-continuity.browser.test.ts`，仅操作测试自有 UUID，验证真实 SSH 跳转／退回本地和已配置模型的多终端证据读取。默认请求真实原生授权；`MOXUN_ZHANGKE_CONSENT_FIXTURE=1` 明确改为模拟授权，仅验证连续性链路，**不算原生授权通过**。配置和密钥仅由 Main 读取，测试私有配置副本退出后删除。最新结果及保留阻塞见 [2026-11-01 连续观察与多终端补测记录](new3/MOXUN_TERMINAL_CONTINUITY_AND_MULTI_TERMINAL_REPORT_20261101.md)。

2026-11-03 的实现、数据库副本校验、自动化／原生失败与待验收项独立记录在 [new4 实施报告](new4/MOXUN_ISSUE_REFACTOR_IMPLEMENTATION_REPORT_20261103.md)，不倒改上述历史记录。

## new4 persistence / lifecycle regression

Local-only suites cover transactional Conversation migration/rollback, orphan logs,
86-step keyset pagination, cache eviction, restarted service numbering, 1/2/3 choices,
exact batch approval paths, transient iTerm errors and explicit native-confirmed end
with mocked consent. `new4.browser.test.ts` uses real Electron rendering with synthetic
IPC data to exercise batch/digest/expiry states and paginated history; this is not
native iTerm or real consent acceptance. `live-iterm.test.ts` additionally records
PID/cwd/environment/foreground-task/socket continuity when the native environment
is available. Never substitute mock consent or static bundle hashes for that check.

See the [2026-11-03 report](new4/MOXUN_ISSUE_REFACTOR_IMPLEMENTATION_REPORT_20261103.md)
for the actual complete-gate results, retained screenshot-stability failures and
native Automation limitations. Tests remain gitignored and are not committed.

## 内置文档写作 Skill 与命令块主题（2026-11-03）

`src/shared/document-writing.test.ts` 和
`src/main/agent/builtin-document-writing.test.ts` 为本地测试，覆盖中英文自动触发、
普通问答和代码任务排除、相邻任务续接、完整 Prompt 注入、手动 Skill 合并去重及资源失败降级。
运行 `npm run ci` 和 `npm run test:local`；结果与 Electron 目录/ASAR 资源夹具、
深浅主题截图见 [文档写作实施记录](new4/MOXUN_DOCUMENT_WRITING_IMPLEMENTATION_REPORT_20261103.md)。
ASAR 夹具不代表正式 macOS 安装包验收；本轮未创建安装包，未使用付费模型或业务终端。

2026-11-03 对话区布局优化、引用元数据标题修复，以及工具/建议折叠交互的
Electron 视觉验证和完整回归结果，见 [对话区优化记录](new4/MOXUN_CHAT_LAYOUT_OPTIMIZATION_REPORT_20261103.md)。
新增 `src/shared/conversation-title.test.ts` 保持本地 gitignored；视觉夹具使用合成消息，
不代表真实文件变更、业务终端或原生授权验收。

首字断段、Pi 内容块身份和 Codex 风格阅读区/定位条回归见
[流式与导航实施记录](new4/MOXUN_CONVERSATION_STREAM_AND_NAVIGATION_REPORT_20261103.md)。
本地 `agent-stream-steps.test.ts`、`runtime-stream.test.ts` 与
`conversation-refinement.browser.test.ts` 分别检查纯拼接、Pi 订阅身份和真实 Electron 组件链路；
桌面测试使用独立 Profile、合成事件和测试自有窗口，不接业务终端或付费模型。

该组件回归还覆盖定位条贴边及悬停波形、消息角色/时间/复制按钮的悬停显示、
回复用时分割线和行内代码跨行边框；最新视觉与完整回归结果见
[对话区细节打磨记录](new4/MOXUN_CHAT_DETAIL_POLISH_REPORT_20261103.md)。
