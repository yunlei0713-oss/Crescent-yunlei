# 墨巡：终端命令生命周期、Agent 回合队列、项目关联与大文件读取改造计划

日期：2026-11-06
项目版本基线：moxun 1.0.12
项目路径：/Users/xusong.yu/Desktop/moxun-test

## 0. 本轮范围与原则

本计划处理四项已报告问题：多命令执行结果判定不可靠、Agent 回答被下一条消息中断、历史对话项目关联状态不清楚、文件读取和项目索引限制过多。

本轮只改进已有能力，不以新增功能数量为目标。优先复用现有 Main、SQLite、TerminalObserver、ProjectRegistry、LocalDocumentReader、CodeIntelligenceService 和 Pi 工具适配层。

**不可突破的安全边界：**
- Agent 永久不能向 PTY、iTerm、SSH 或其他终端输入、粘贴、执行或中断命令。
- 用户仍在 iTerm 中人工执行命令；墨巡只读取已授权、已脱敏的观察证据。
- 不自动向跳板机、集群节点或其他 SSH 远端安装、注入 Shell Integration，不修改远端 shell 配置。
- 本地文件写入继续走完整 Diff、逐文件人工审批和 Main 端路径/hash/owner 校验。
- 观察授权、项目目录授权和文件读取授权仍由 Main 管理；Renderer 和 Agent 不能自行扩大范围。
- 新能力放在 Main 侧独立领域服务和 typed IPC 契约中；Pi 只作为当前 Agent runtime 的薄适配层，避免未来更换 Agent runtime 时重写核心逻辑。

## 1. 代码审查结论（已核实）

### 1.1 终端观察
- TerminalObserver 已识别 OSC 133 的提示符、命令开始和命令结束标记。
- inputData 遇到多行粘贴会主动标记 uncertain，不拆分为多个独立命令。
- snapshotData 明确把 iTerm 屏幕快照视为普通文本，不解析控制序列、不推断命令边界和退出码。
- EvidenceNotifications 只对可信 prompt-returned 或 structured completed/failed 事件自动通知；普通 snapshot 不会触发自动分析。
- 这些限制是当前安全设计的一部分，不能通过放宽文本正则或静默超时来绕过。

### 1.2 Agent 回合
- useAgentController 在提交新用户回合时会主动 cancel 当前 run，并等待 Main 清理。
- pi-host 对同一个 sessionKey 只允许一个活动 run。
- useAgentController.test.ts 当前明确测试“新输入替换旧输入”，因此需要修改产品语义和测试预期，而不是只改 UI。

### 1.3 项目关联
- conversations.project_id 持久化项目关系；历史会话恢复时会恢复 projectId。
- Agent run 将 projectId 传给 Main；Main 解析项目根目录并验证当前 owner 的读取授权。
- ProjectSidebar 根据 session.projectId 展示项目下的历史会话。
- 截图中 Review tzwjw Directory Contents 已显示在 tzwjw 项目下，按当前筛选逻辑说明它大概率已经关联；“当前项目”状态没有把持久化关系、目录授权和索引状态分开呈现。
- 现有 UI 缺少清晰的解除关联、更换项目和重新验证入口。

### 1.4 文件读取和索引
- LocalDocumentReader 普通文本文件硬限制 20 MiB；单页约 50 KB。
- Agent read 工具单次最多 500 行、offset 最大 1,000,000、query 最长 200 字符；超长单行会被拒绝。
- 附件目前为 5 MiB/文件、最多 8 个、总计 20 MiB；PDF 附件 2 MiB、30 页。
- CodeIntelligenceService 单文件索引预算 512 KiB、项目累计 32 MiB、最多 2,000 个文件、最多访问 20,000 个目录项、目录深度 24；单文件超过 10,000 行也会跳过。
- 索引跳过主要累计 skipped 数量，没有足够的逐文件原因，容易让用户误以为项目索引完整。

### 1.5 定向测试基线
2026-11-06 实际运行 5 个定向测试文件，44/44 通过：
- terminal-observer.test.ts：23
- projects.test.ts：6
- sqlite/conversations.test.ts：3
- local-document-reader.test.ts：10
- useAgentController.test.ts：2

该结果是定向单测基线，不代表完整测试、BrowserWindow 集成测试或 iTerm 真机验收已通过。运行 projects.test.ts 前需要准备 /tmp/opencode 临时目录。

## 2. 命令执行完成判定：从输出猜测改为结构化证据

### 2.1 目标
Agent 必须知道“命令是否开始、是否结束、退出码是否可信、当前是否仍在运行”。不得将输出停止、提示符外观或超时直接解释为成功/失败。

### 2.2 统一事件模型
在 Main 建立独立的 CommandObservation / CommandGroup 服务，不让 Renderer 自己拼装命令状态。

每条命令事件至少包含：
- commandId、可选 commandGroupId。
- terminal identity：owner、chatTabId、iTerm UUID/PTY generation、connectionId、host。
- source：osc133、osc633、iterm-prompt-monitor、snapshot、user-confirmation。
- event：command-start、command-end、prompt-ready、snapshot-update、session-change。
- status：submitted、running、completed、failed、finished-unknown、interrupted、session-lost。
- exitCode（仅在可信来源确实提供时填写）。
- startedAt、finishedAt、confidence、output reference。
- command 文本遵循现有敏感信息过滤；无法安全识别时不保存原始输入。

状态语义：
- completed：收到可信结束事件且 exitCode=0。
- failed：收到可信结束事件且 exitCode 非 0。
- finished-unknown：有可信结束/回到提示符证据，但没有退出码。
- running：有开始事件，尚无结束事件。
- interrupted：有明确人工中断证据；不能等同于命令失败。
- timeout-unconfirmed：观察超时但没有结束证据；不能自动标记 completed、failed 或 interrupted。
- session-lost：终端身份/UUID/连接代次失效；不能把会话消失当作命令成功。

### 2.3 多命令与命令组
- 一次 shell compound command 只能报告 shell 实际提供的整体退出码；不能推断其中每个子命令都成功。
- 若 Shell Integration 对粘贴块中的多条命令分别发出 start/end 事件，逐条记录 commandId，再聚合到 commandGroup。
- commandGroup 的完成必须依据明确的最后结束事件/稳定提示符；短暂静默只用于 UI debounce，不能单独构成完成证据。
- 对无法确认粘贴边界的多行块，不伪造命令数量和子命令退出码；显示“批量命令状态不完整”。
- 增加明确的“我已执行完，分析最新输出”操作，作为没有结构化 Shell Integration 时的可靠人工兜底。该操作只代表用户确认执行阶段结束，不代表退出码为 0。
- Agent 收到的是命令组摘要、每条可验证状态、退出码可信度和新增输出，而不是一段没有状态的终端文本。

### 2.4 数据来源和可复用方案
首选复用 iTerm2 自身能力：
- iTerm2 Python API PromptMonitor 提供 COMMAND_START、COMMAND_END；COMMAND_END 可提供退出码。
- PromptMonitor 需要 Shell Integration 或 prompt-detecting triggers。必须做能力探测，不能假设每个远端 shell 都已安装。
- 仅在当前终端本身已提供可靠事件时启用；不自动安装或修改远端 SSH 主机的 shell 配置。
- 做一个短期技术验证，确认 iTerm UUID 与 Python API session_id 映射、API 启用要求、版本兼容和打包成本。若需额外 Python runtime/常驻 helper，先评估体积和维护成本，不直接引入。
- 共享 PTY 继续使用现有 OSC 133 解析；扩展并验证分段、乱序、缺失退出码和重复事件处理。
- 可参考 VS Code Shell Integration 的 OSC 133 / OSC 633 协议定义。OSC 633 的 E 命令行及 nonce 只有在来源验证通过后才可信，不得把任意终端输出当成命令输入。
- 不引入 xterm.js addon：墨巡当前没有内置 xterm，终端是外置 iTerm。

参考：
- iTerm2 Shell Integration：https://iterm2.com/documentation-shell-integration.html
- iTerm2 Prompt API：https://iterm2.com/python-api/prompt.html
- VS Code Shell Integration：https://code.visualstudio.com/docs/terminal/shell-integration
- VS Code 源码许可证：MIT。

### 2.5 通知和 UI
- EvidenceNotifications 改为按 commandGroup 去重；多条命令不应每完成一条就抢占一次 Agent 回答。
- 只有可信组完成才自动触发分析；无结构化完成证据时提供人工分析入口。
- 正在执行、状态未知、退出码未知、非零退出码要使用不同文案。
- UI 显示“执行中 / 已结束（退出码未知）/ 成功 / 失败 / 状态无法确认”，不把 unknown 隐藏成错误或成功。
- 保留现有证据 TTL、容量限制、敏感提示抑制、host/UUID/generation 绑定和暂停后清空机制。
- 新输出到达时使旧待分析通知失效，避免 Agent 分析过期输出。
## 3. Agent 回合队列：默认排队，不再隐式取消

### 3.1 目标
同一个 conversationId 同时只允许一个 Agent run，但用户在生成期间提交的新消息必须保留，并在当前 run 正常结束后按顺序执行。

### 3.2 行为
- 新消息到达且当前没有 run：立即启动。
- 新消息到达且当前有 run：写入该 conversation 的 FIFO 队列，不取消当前 run。
- 当前 run success/error 后：自动取下一条排队消息。
- 用户主动点击“停止当前回答”：才调用 cancel。
- 用户主动点击“停止并发送”：明确取消当前 run，然后将新消息作为下一条立即执行。
- 每个 conversation 独立队列；不同会话可以按当前 Main 资源策略并行，不建立全局串行队列。
- 队列消息显示排队序号、创建时间和状态，支持删除尚未运行的消息。

### 3.3 必须保存的请求快照
排队时不能只保存文本。应保存：
- input、原始用户文本、references。
- providerId、model、agentStyle、locale。
- conversationId、chatTabId、executionTabId。
- projectId、观察终端 tab IDs。
- activeWikiIds、activeSkillPaths。
- attachments 的授权路径引用及文件身份信息。
- 入队时间、顺序号、状态和失败原因。

启动队列项时重新验证路径授权、附件是否存在、projectId 是否仍有效、终端身份是否仍匹配。无效项必须提示用户，不得偷偷换成其他项目或终端。

### 3.4 持久化与恢复
- 队列状态由 Main/SQLite 管理，Renderer 只展示和发起操作。
- 至少持久化 queued/running/completed/failed/canceled 状态及必要的请求快照。
- 应用重启后，未处理项恢复为“待继续”，展示继续/删除；不静默重复调用模型。
- 当前 run 的 late result 仍通过 runId 和 conversationId 防止覆盖新回合。
- 用户草稿与队列快照分离；排队成功后才能清空对应输入，后续新草稿不能被旧任务覆盖。

### 3.5 代码和测试
重点改造 useAgentController.ts、pi-host.ts 的调用边界、相关 IPC/SQLite 持久化和聊天输入 UI。
- 删除“新 operator turn 自动 cancel previous run”的默认行为。
- 保留 owner destroyed、窗口导航、用户显式停止等必要取消路径。
- Main 仍拒绝同一 sessionKey 的并发 run；由队列确保顺序。
- 修改 useAgentController.test.ts：原有“replacement cancels old run”测试改为“new turn queues and old run completes”。
- 测试 FIFO、连续三条消息、不同 conversation 并行、显式 stop、stop-and-send、应用重启恢复、附件失效、旧 run late result、用户新草稿不被清除。

## 4. 项目关联：持久化关系、目录授权和索引状态分离

### 4.1 状态模型
必须把以下三层状态分别展示，不能用一个“当前项目”概括：

1. 对话关联：unlinked / linked。
2. 目录授权：not-activated / authorized / stale / missing / denied。
3. 项目索引：not-indexed / indexing / ready / partial / failed。

### 4.2 UI 行为
- 项目列表始终提供明确的对话关联入口。
- 未关联：显示“关联当前对话”。
- 已关联到当前项目：显示“已关联到此项目”，并提供“重新验证目录”和“解除关联”。
- 已关联到其他项目：提供“更换项目”，二次确认后切换；不能只显示一个禁用按钮。
- 项目根目录不存在或已移动：显示“目录不可用”，允许用户重新选择根目录并重新绑定。
- 历史对话打开后，在侧栏/对话信息中显示项目名称和目录授权状态；不要求用户猜测是否已关联。
- 索引状态和覆盖范围单独显示；项目关联成功不代表索引已完整。

### 4.3 Main 端一致性
- attach/switch/detach/revalidate 使用 Main-owned typed IPC 操作。
- 按稳定 conversationId 更新关联，不依赖临时 Renderer tabId。
- 关联变更应立即持久化，不能只依赖下一轮 Agent run。
- 更换项目时保留历史对话和 Agent Logs，不复制或删除历史数据。
- 目录授权必须重新经过 Main 的 canonical root、owner、symlink、路径和生命周期校验。
- detach 只解除项目关系，不删除项目、不删除对话、不改变已有终端授权。
- 不同对话的 projectId、root、索引和授权不能串用。

### 4.4 索引状态可解释
- CodeIntelligenceService 记录逐文件 skipped reason：file-too-large、line-budget、unsupported、sensitive、symlink、parse-error、global-budget 等。
- 侧栏展示索引文件数、跳过文件数和主要原因；允许用户定位被跳过的文件。
- 对话已经关联但索引 partial 时，Agent 仍可通过授权 read/search 工具读取文件，不得把“未索引”解释成“不可读取”。

### 4.5 测试
- 历史对话打开后显示原项目；重载后关联仍在。
- A 项目切换到 B，再切回 A；稳定 conversationId 和日志不变。
- 解除关联后对话仍可打开，项目数据不删除。
- 项目目录移动、删除、权限撤销后出现明确恢复入口。
- 同时打开多个项目会话，Agent 不读取其他会话的根目录。
- 项目关联成功但索引 partial 时，Agent 仍能按路径读取大文件。
- 不允许从历史记录恢复旧 owner grant 或旧终端观察授权。

## 5. 文件读取：流式、分页、按需检索，不再整文件塞入上下文

### 5.1 目标
普通文本文件不再因超过 20 MiB 就完全无法读取。单次请求仍保持有界输出，文件总大小不等于模型上下文大小。

### 5.2 统一 DocumentReadService
演进现有 LocalDocumentReader，不另建重复文件访问体系。提供：
- inspect：文件类型、大小、编码、mtime、可读性、行数估计和安全状态。
- read_range：按行或 byte range 读取。
- search：全文检索，返回命中位置和有限上下文。
- tail：读取末尾 N 行/字节，适合日志。
- structure：按格式提取标题、页码、表格、代码符号等结构。
- nextCursor：继续读取下一页。

每次响应包含 path、file identity/hash、offset、line range、hasMore、nextCursor、truncatedReason。cursor 必须绑定文件身份；文件在两次读取间变化时使旧 cursor 失效，避免拼接不同版本。

### 5.3 普通文本
- 使用 Node 文件句柄和流式读取；保持小块 I/O，不将整个文件读入 Buffer/String。
- 移除普通文本 20 MiB 整体硬上限；按单次读取字节预算、耗时和行数控制资源。
- 支持 UTF-8/UTF-16、BOM、跨 chunk 多字节字符、CRLF、超长行和无换行文件。
- 继续限制单次 Agent 工具返回体，例如 50 KB；达到预算返回 cursor，而不是拒绝整个文件。
- 支持 byte offset 和 line offset，避免每次读取第 N 页都从文件头扫描。
- query 上限改为合理的长查询，并支持 literal/regex 两种模式；限制 regex 超时和资源消耗。
- 超长行返回截断片段及可继续读取位置，不因单行超过 50 KB 整体失败。
- 搜索结果只回传命中行及有限上下文；不把整个大日志发给模型。

### 5.4 附件
区分“文件引用”和“完整内容上传”：
- 小图片可继续走模型图片输入，保留尺寸、格式、脱敏和用户可见提示。
- 大型文本、PDF、DOCX 不应因 5 MiB 附件上传门槛而完全不可用；将授权本地路径作为 Document Reference，Agent 通过 read/search 分页读取。
- 初次附件上下文只提供元数据和有限摘要，不自动把完整大文件上传给模型。
- 用户移除附件、路径变化或授权失效时，引用必须失效。
- PDF 不再把 2 MiB/30 页限制作为本地读取能力的硬门槛；通过 pdfjs-dist 按页/页范围读取，单次只提取有界页数和文本。
- DOCX 使用现有 unzipper + sax 做 ZIP entry / XML 流式解析，只读取需要的 document XML；验证压缩/解压大小、条目数、路径和异常压缩比，防止 ZIP bomb。
- 扫描版 PDF 明确标记为无文本层；OCR 作为后续可选能力，不在本轮默认引入重型 OCR runtime。

### 5.5 项目代码索引
- 保留现有 web-tree-sitter / tree-sitter-wasms，不重写 AST 解析器。
- 现有 512 KiB 单文件、32 MiB 项目总量、2,000 文件等限制先转为显式 index budget 和逐文件 skip reason。
- 分级处理：小文件完整 AST；中型文件在时间/内存预算内提取符号与引用；超大文件不强制完整入库，保留 metadata 并允许 ripgrep/search + read_range 按需读取。
- 增量索引优先按 hash/mtime 处理变更文件，避免每次从头读取所有内容。
- 分批写入 SQLite，避免把整个项目所有源码和 AST 一次性堆在内存 rows 数组。
- repo map 只输出相关符号、文件关系和有限预算，不把整个仓库源代码注入上下文。

## 6. 开源方案评估与复用决策

| 项目/方案 | 许可/形态 | 建议 |
|---|---|---|
| iTerm2 Python API PromptMonitor | iTerm2 官方 API | 首选命令事件来源的可行性验证；提供 command start/end/exit status，但依赖 Shell Integration 或 prompt triggers |
| iTerm2 Shell Integration | iTerm2 官方能力 | 仅检测已有安装；不自动向远端 SSH 主机安装或注入 |
| VS Code Shell Integration | MIT | 复用 OSC 133/633 协议语义和状态模型，不引入 VS Code 整个终端实现 |
| @vscode/ripgrep | MIT，Node wrapper + 平台二进制 | 大文件/项目搜索的候选依赖；先 benchmark，再决定是否加入。无运行时网络，但 universal 包约 60 MB，需评估 macOS x64/arm64 打包 |
| Aider repo-map | Apache-2.0 | 复用图排序和 token budget 思路；基于现有 Tree-sitter 实现，不引入整套 Python Aider |
| Microsoft MarkItDown | MIT，Python 包 | 作为未来额外 Office 格式转换候选；当前不作为核心读取依赖，避免引入 Python runtime 和额外包体 |

当前 package.json 已有 node-pty、pdfjs-dist、unzipper、sax、web-tree-sitter、tree-sitter-wasms。优先利用现有依赖。

### 6.1 @vscode/ripgrep
若 Node 流式 search 在大型日志/项目上达不到性能目标，再引入 @vscode/ripgrep。必须：
- 使用 spawn 参数数组，不拼接 shell 命令。
- 只在 Main 侧运行，校验路径仍在授权 root 内。
- 禁止默认跟随 symlink；排除敏感目录和二进制文件。
- 限制超时、结果数量、上下文行和输出字节。
- 所有返回内容经过现有 redactSensitiveText。
- 验证 electron-builder 对 x64/arm64 optional binary 的打包；不使用 universal 包时说明每种构建架构的依赖策略。

### 6.2 Aider repo-map
Aider 的 repo-map 用文件依赖图做相关性排序，并按当前 token budget 选出最相关的符号。将该算法思想适配到现有 code_index.db：符号/引用构图、当前问题相关性、预算裁剪。不要把 Python Aider 作为 runtime 依赖。

### 6.3 MarkItDown
MarkItDown 适合多格式文件转 Markdown，但它是 Python 包。除非本轮确认必须支持现有 JS 解析器覆盖不到的格式，否则只记录为后续候选，不增加 Python runtime。

## 7. 实施顺序

### P0：基线和契约
- [ ] 阅读 ARCHITECTURE、SECURITY_MODEL、EXECUTION_PLANS、EXTERNAL_TERMINALS、TESTING。
- [ ] 核对当前终端身份、观察授权、事件流和所有取消路径。
- [ ] 定义 CommandObservation / CommandGroup 状态和来源可信度。
- [ ] 定义 AgentTurnQueue 持久化结构。
- [ ] 定义 ProjectAssociationState。
- [ ] 定义 DocumentReadCursor 和统一读取响应。
- [ ] 先写测试，再修改实现；不做无关重构。

### P1：命令生命周期
- [ ] 完成 OSC 133/633 parser 和事件乱序、重复、丢失处理。
- [ ] 验证 iTerm2 PromptMonitor 能力；不可用时保留 snapshot unknown。
- [ ] 实现 commandId/groupId 和组完成状态。
- [ ] 实现人工确认“已执行完并分析”入口。
- [ ] 更新 EvidenceNotifications，确保组级去重和过期证据失效。
- [ ] UI 展示运行/结束/失败/未知状态及退出码来源。

### P2：Agent FIFO 回合
- [ ] 移除新消息隐式取消旧 run。
- [ ] 实现 per-conversation FIFO 和队列 UI。
- [ ] 持久化完整请求快照和待处理状态。
- [ ] 实现显式 stop / stop-and-send。
- [ ] 应用重启后恢复待处理项并要求用户继续。
- [ ] 更新所有 latest-wins 测试为 queue semantics。

### P3：项目关联状态
- [ ] 增加 linked / directory authorization / index coverage 三层状态。
- [ ] 增加 attach / switch / detach / revalidate Main IPC。
- [ ] 历史对话显示项目状态和恢复入口。
- [ ] 逐文件记录索引跳过原因。
- [ ] 确保项目切换和解除关联不影响历史记录及其他会话。

### P4：大文件和索引
- [ ] 普通文本读取改为 byte/line cursor 流式读取。
- [ ] 移除普通文本 20 MiB 全文件拒绝逻辑；保留单次输出预算。
- [ ] 实现 inspect/search/tail/read_range/nextCursor。
- [ ] 增加文件身份/hash 变化检测。
- [ ] 大文件附件改为本地 Document Reference。
- [ ] PDF 按页读取；DOCX 流式 ZIP/XML 解析。
- [ ] CodeIntelligence 增加逐文件 skip reason、分级索引和增量写入。
- [ ] 评估 ripgrep 是否达到引入门槛；未达到则不新增依赖。
- [ ] 基于现有 Tree-sitter 适配 repo-map 排序，不引入整套 Aider。

### P5：回归、性能和交付
- [ ] 完成全部单元、IPC、SQLite、BrowserWindow 和 iTerm 本地测试。
- [ ] 运行安全边界检查、typecheck、lint、build。
- [ ] 运行本地大文件压力测试和内存测试。
- [ ] 记录索引耗时、搜索 P50/P95、单次读取耗时、峰值内存和上下文字节数。
- [ ] 输出实施报告，列出已完成、未完成、未验证和环境阻塞项。

## 8. 验收标准

### 8.1 命令生命周期
- 真实 OSC 结束事件能区分 exitCode 0 和非 0。
- 没有退出码时明确显示 finished-unknown，不伪造成功/失败。
- 长时间运行的命令不会因输出停顿被判定完成。
- 多命令粘贴不把第一行冒充整个命令组。
- 一组命令只触发一次组级自动分析；新输出会使旧通知失效。
- 不支持 Shell Integration 的 SSH 主机不会被自动安装或修改；可通过人工确认完成分析。
- 密码、OTP、Token、私钥和敏感提示仍被抑制/脱敏。

### 8.2 Agent 回合
- 第一轮生成期间连续发送 3 条消息，第一轮不被隐式取消，后续严格 FIFO。
- 用户主动停止时才取消当前 run。
- 不同 conversationId 的队列互不影响。
- 重启后 queued 项可恢复；不重复自动调用模型。
- 附件失效、项目切换、终端 UUID 变化时，队列项给出明确错误，不静默改目标。
- 旧 run 的 late result 不覆盖后续回合和用户草稿。

### 8.3 项目关联
- 已关联会话有明确“已关联”状态；历史会话不需要猜测。
- 可解除、更换和重新验证项目。
- SQLite 重载后恢复稳定 conversationId 和 projectId。
- 目录授权失效与项目关系断开显示为不同状态。
- 索引 partial 时能看到跳过原因；Agent 仍可按授权读取未索引文件。
- 多项目并行不会跨项目读取或复用错误 root。

### 8.4 文件读取
至少覆盖以下合成 fixture：
- 25 MiB、100 MiB 普通 UTF-8 文本；支持头部、中部、尾部和全文搜索。
- 超长行、无换行文件、UTF-8 多字节跨 chunk、UTF-16LE/BE。
- 文件读取过程中内容变化，旧 cursor 必须失效。
- 二进制文件、坏编码、路径穿越、symlink、敏感目录和私钥脱敏。
- PDF 大于 2 MiB、超过 30 页，支持按页读取。
- DOCX 大于当前常见限制，验证流式解析和 ZIP bomb 防护。
- 大型源码文件可按需读取；索引跳过必须给出原因。
- 单次返回仍受 50 KB 左右预算控制；不能因为支持大文件就把整个文件发给模型。
- 大文件读取期间 Renderer 不阻塞，Main 内存有界，取消后及时释放句柄。

### 8.5 性能目标
- 单次 read/search 响应只返回请求范围，不因 offset 很大而从文件头重复扫描。
- 100 MiB 文本的 tail 和局部 range 读取应保持可交互；search 允许按文件大小耗时，但必须可取消。
- 项目索引对未变化文件应跳过重复 AST 解析。
- 索引失败或预算耗尽不影响本地 read 工具。
- 不新增必须常驻的后台服务；不为本轮引入大型 Python runtime。

## 9. 主要修改文件范围（以 Codex 复核为准）

终端：main/terminal/observer/terminal-observer.ts、terminal-text-stream.ts、observer/evidence-notifications.ts、external/screen.ts、shared/terminal-observation-types.ts。

Agent 回合：renderer/src/hooks/useAgentController.ts、renderer/src/hooks/useAgentController.test.ts、main/agent/pi-host.ts、Agent IPC、SQLite conversation/queue schema、聊天输入 UI。

项目：renderer/src/components/ProjectSidebar.tsx、AppSidebar.tsx、renderer/src/App.tsx、renderer/src/hooks/useTerminalTabs.ts、main/projects.ts、main/agent/ipc.ts、SQLite 项目关联操作、projects.browser.test.ts。

文件：main/local-document-reader.ts、main/agent/pi-local-files.ts、main/agent/multimodal.ts、shared/local-documents.ts、main/code-intelligence/service.ts、main/code-intelligence/parser.ts、对应测试。

以上是审查定位，不是要求逐个文件全部重写。Codex 必须先追踪实际调用链，复用已有接口和测试 fixture。

## 10. 明确不做

- 不开放 Agent 终端执行、输入、粘贴、Ctrl-C 或 SSH 命令能力。
- 不自动安装/注入远端 Shell Integration，不修改跳板机和业务集群。
- 不以输出静默、提示符正则或固定 timeout 伪造命令成功。
- 不允许同一 conversation 并发执行多个 Agent run。
- 不把项目关联重写成另一套项目管理系统。
- 不把大文件完整内容一次性塞进模型上下文。
- 不简单把 20 MiB 改成数百 MiB 后仍然整文件读入内存。
- 不直接引入完整 Python Aider、LlamaIndex 或 MarkItDown runtime 作为本轮前置依赖。
- 不做与本计划无关的 UI、主题、Agent 架构或终端布局重构。
- 不修改远端主机、不连接真实业务集群做验收、不使用付费模型作为自动化测试前置条件。

**最终原则：终端状态要有证据，用户回合不能被意外丢弃，项目关联必须可解释，文件读取必须有界但不能被小文件预算卡死。**
