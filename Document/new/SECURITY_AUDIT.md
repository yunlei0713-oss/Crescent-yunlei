# 墨巡安全审计

日期：2026-10-31。原 Guided Ops 基线：[改造计划](CODEX_MOXUN_GUIDED_OPS_REDESIGN_PLAN.md)。聊天优先／外置 iTerm 改造与当前测试记录见[实施与验收记录](../new1/MOXUN_CHAT_FIRST_ITERM_IMPLEMENTATION_REPORT_20261031.md)；[TEST_REPORT.md](TEST_REPORT.md) 的前一轮结果不代表当前 UI 验收。

## 信任边界与调用图

```text
用户 iTerm / 人工连接 UI
  → preload 白名单 → rendererIpc（窗口 + 主 frame + origin + payload）
  → Main terminal manager → 用户 PTY / pipe

用户聊天 → agent:run → Main run/owner 作用域
  → Pi Runtime（Main 分配的 Agent AsyncLocalStorage 域）
  → 只读 host 工具 / 单步建议 / 文件审批申请
    ├─ 观察器：Main 原生确认 grant、只读、脱敏、精确绑定终端身份
    ├─ 子 Agent：同 Runtime 断言，仅 host read
    └─ 文件申请 → 完整 Diff → owner 人工审批 → 精确写入与校验

Agent 域 → PTY/pipe 创建、写入或中断 → Main 拒绝
未知工具 / Pi 默认工具 / 未审核 MCP → 默认拒绝
```

Renderer 不持有 Node/文件系统；`contextIsolation`、`sandbox` 开启，`nodeIntegration` 关闭。可信 actor 来自 Main 异步调用域，payload 中的 actor、风格、旧审批设置不授予能力。

## Agent 工具清单

| 工具                                                                  | 可达作用/约束                                                                      |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `read`                                                                | Main LocalDocumentReader 授权范围内有限额读取、列目录/搜索；拒绝敏感路径和 symlink |
| `code_search`、`symbol_lookup`、`dependency_trace`、`impact_analysis` | host 本地代码分析；无 shell 工具                                                   |
| `memory_search`                                                       | 读取工作台本地记忆                                                                 |
| `subagent`                                                            | 只读分析，结果回到聊天；子 Runtime 仅 `read`，无 shell/SSH/递归委派，无终端面板 |
| `observe_terminal`                                                    | 当前 owner 的有效 Session grant 下有限脱敏证据；snapshot 不冒充结构化命令 |
| `propose_command`                                                     | 每回合一个绑定主机/代次的建议；不执行                                              |
| `request_file_change`                                                 | 申请专用一次性审批，不能自行批准                                                   |
| `create-skill`、`create-sop`                                          | 发起 host 草稿流程，最终用户确认后保存                                             |
| bash/edit/write/open_subterminal/submit_change_plan/未知工具          | 不注册；Runtime allowlist 拒绝                                                     |
| Agent MCP                                                             | 当前审核白名单为空，连接前拒绝                                                     |

注册时同时校验 `tools`/`customTools` 和 host 实现来源；创建后、每回合及切换工具时再断言。Pi 项目扩展不能成为执行平面。旧工具记录保留为历史数据，不作为重新注册依据。

## 执行入口审计

| 入口                                 | 处理与证据                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| `pi-host.ts` 主会话                  | 明确 host 工具数组，固定 Guided Ops tool profile                                   |
| `pi-subagent.ts` 子会话              | `tools: ['read']`；不创建命令型子终端                                              |
| `pi-terminal-bash.ts`                | 旧实现仍保留兼容引用，但 bash exec 与 reviewed execute 入口直接 deny；不注册       |
| `pi-open-subterminal.ts`             | 旧 Agent open 入口直接 deny；Renderer 子终端面板及状态订阅已移除 |
| `change-plan.ts`                     | `submitAndExecutePlan` 入口直接 deny，不能自动备份/检查/回滚                       |
| `terminal/ipc.ts`                    | 程序执行、临时子终端和 teardown 校验 Agent 域；用户输入 IPC 仍经可信 renderer 校验 |
| `terminal/session/manager.ts`        | Agent 域不能创建底层终端会话                                                       |
| `pty-session.ts` / `pipe-session.ts` | write/interrupt 最终防线再次校验，覆盖间接包装和异步调用                           |
| `terminal/script-runner.ts`          | 只由用户宿主终端路径使用，最终写入同受底层约束                                     |
| `skills.ts` npx/子进程               | 用户安装/导入功能，未注册为 Agent tool；不把 Skill 文档里的脚本执行能力授予模型    |
| MCP stdio 启动/HTTP call             | Agent 加载连接前拒绝；工具调用前复核；用户手动配置发现仍可连接                     |
| 取消/重试/压缩/新回合                | 同一受限 Runtime；取消等待 settled，不对用户 shell 发送 Ctrl+C                     |
| 原连接自动路由/计划派发 UI           | 聊天自动路由移除；用户通过连接界面亲自连接                                         |

静态检查由 `scripts/check-security-boundaries.cjs` 执行；异步 Agent 域、工具白名单、实际 SDK+Electron/原生 PTY 检查共同验证，不能用“按钮不存在”替代底层权限验收。

## MCP 审计表与后续准入

| 实现类型                           | Agent 状态   | 原因                                             |
| ---------------------------------- | ------------ | ------------------------------------------------ |
| stdio 任意 command/args            | 拒绝         | 启动即可能有任意本地副作用                       |
| HTTP/SSE/Streamable HTTP           | 拒绝         | 未核验服务端实际实现与凭据权限                   |
| 名称包含 read/log/metrics 的工具   | 拒绝         | 名称、描述、readOnlyHint 不证明只读              |
| 数据库写入、部署、重启、上传、远控 | 拒绝         | 与永久能力矩阵冲突                               |
| 用户在设置中列出工具               | 保留用户功能 | 不代表准许 Agent 使用，也不会扩展 host allowlist |

新增只读 MCP 必须同时提交锁定实现/版本、实际调用链和副作用审查、最小只读凭据说明、网络/进程/写入拒绝测试、host 能力映射。不能只把 `isReviewedMcpServer` 改成信任工具名称或设置布尔值。

## 文件写入审计

- 任意 Agent 本地文件变更仅走 `FileChangeApprovalService`；不注册 Pi write/edit，不以 shell 绕过。
- owner/run/有效期/digest 精确绑定；逐文件原始身份与 Hash、新内容 Hash、操作和路径一起审批，批准一次消费。
- 父目录授权、逐组件拒绝 symlink、叶子 `O_NOFOLLOW`、拒绝 hardlink、独占创建、再次读取快照、写后核验。
- 5 分钟过期，最多 32 个 pending；64 KiB/文件、16 项、512 KiB 预览。原始/新内容仅供临时审批；普通工具开始事件省略变更内容。
- 拒绝、改意见、窗口消失、run 取消、队列等待后失效均不继续写入；部分失败如实报告。
- 用户设置、附件保存、知识库/SOP/Skill 确认保存为独立宿主 IPC，不能被模型伪造为人工批准。

## 隐私与已知边界

- Main grant 绑定 owner、tab、iTerm UUID、connectionId、generation、host；Renderer payload 只能请求，观察启用需 Main 原生二次确认。off 不向 Observer 填充或暴露证据，已有 iTerm off 不读屏幕。
- 暂停／结束／目标身份变化同步停采并清证据；恢复重新确认，不补采暂停内容。授权前初始读屏或迟到响应撤销后不得发布。
- 已有 iTerm 使用当前可访问文本与后续快照（实测可能含部分滚屏）；live 仅保守新增完整行，不保证完整历史、命令边界或退出码。无远端 OSC 133 不推断可靠命令事件，未安装或注入远端 integration。
- 生产 JXA 不含 write；已有绑定 write/interrupt 拒绝。解除绑定不关闭用户原会话；共享 PTY 仍属 Main 生命周期。
- 命令手册、执行设置／目标、handoff/change-plan UI 已删除。旧命令审计仅只读展示；遗留请求自动拒绝，文件审批不受影响。

- 终端观察、发送模型的 prompt/文本附件、普通工具参数/结果和操作记录均经过统一脱敏；审批原文不进入安全审计。
- 安全审计仅内存元数据，最多 1000 条、24 小时；不长期记录原始键盘输入。
- 图片像素无法由文本脱敏规则处理，发送前必须检查并遮盖，原生确认可取消。
- 规则脱敏是模式匹配，不能识别所有业务机密；用户仍应只提供分析所需资料。模型自由生成的内容不是可信系统状态。
- 操作系统外部进程恶意并发替换目录存在 TOCTOU 残余风险，当前未实现 native openat 安全链。批量变更不是事务，也不自动执行回滚。
- 信任模型针对模型/工具越权；不宣称抵御已完全控制本地 OS 或 Electron Main 的攻击者。
