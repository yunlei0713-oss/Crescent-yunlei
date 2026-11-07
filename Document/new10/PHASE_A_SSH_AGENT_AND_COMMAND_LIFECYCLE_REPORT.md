# Phase A · SSH 协作与命令生命周期 · 2026-11-07

**阶段交付，P0 尚未通过。** Bash/Zsh 回环 SSH 可在当前可见 PTY 协作。SSH 入口默认关闭，通过 `MOXUN_EXPERIMENTAL_SSH_COLLABORATION=1` 启用隔离预览。P1 和 P2 等待 P0 通过。

## 已交付

- 沿用 Main-owned node-pty、Session Manager、独立终端窗口及附件鉴权。预览从当前对话的协作终端开始，由操作者在同一 PTY 建立 SSH。Main 核对 SSH 在前台，专用终端界面复制短时探测命令。操作者在可信远端 Bash/Zsh 提示符粘贴并回车，再核对原生确认框中的用户、主机、Shell 和目录。探测只调整该进程的临时 Shell 变量和提示符，无持久配置变更。
- 每次派发仍经原生逐条审批，展示完整命令、目标、目录、命令哈希和审批 ID。Main 重验活跃对话、可见窗口、原附件、PTY generation、有效期和命令哈希。远端命令前置条件还核对当前 Shell PID、协作 nonce、SSH TTY、用户、主机和物理目录。已验证适配器限定在受支持的 Shell 及命令语法。
- `request_terminal_command`、`wait_terminal_command`、`get_terminal_command_result` 和 `cancel_terminal_command` 共用原 commandId。另提供 `get_terminal_session_status` 和 `list_active_terminal_commands`。wait 窗口最多 30 秒，等待结束不打断 PTY。运行取消要求操作者批准一次 Ctrl+C，并保留执行状态直到有匹配结束证据和提示符。人工接管、丢失传输或缺失协议证据时保守报告 Unknown。
- SQLite 增量建立 `managed_command_audit_v1`，按对话和命令保存状态迁移、审批标识、目标及退出码。恢复时查询未完结命令返回 Unknown，并记录恢复事件。审计写入失败时阻止派发。输出在内存中保留有界脱敏尾部，当前每条最多 4,096 个 UTF-16 代码单元，并标注缓存截断。
- 保持旧 iTerm、保存连接和普通人工终端路径。沿用项目的 CJS 默认协议测试入口，新增两个独立 macOS 集成脚本。Git 暂存范围为三个测试脚本，已有 `*.test.ts` 继续本地运行。

## 文件与接口

| 范围 | 文件 |
| --- | --- |
| Shell 与命令域 | `src/main/terminal/managed/{shell-adapter,command-executor,session-manager,window,ipc}.ts`、`src/shared/managed-terminal.ts`、`src/main/terminal/session/{types,pty-session}.ts` |
| 专用终端界面 | `src/preload/terminal.ts`、`src/renderer/terminal.html`、`src/renderer/src/terminal/main.ts` |
| Pi 宿主适配和安全策略 | `src/main/agent/{pi-managed-terminal-tool,pi-host}.ts`、`src/main/security/agent-capability-policy.ts`、`src/shared/{agent-tool-catalog,agent-prompt-discipline,agent-run-prompt}.ts` |
| 审计 | `src/main/sqlite/managed-command-audit.ts`、`src/main/crescent-sqlite.ts` |
| 可复测夹具 | `scripts/check-security-boundaries.cjs`、`scripts/verify-managed-terminal.cjs`、`scripts/verify-managed-ssh.cjs`、`scripts/verify-managed-ssh-electron.cjs` |

新增终端 IPC 仅限专用 preload，`managed-terminal:ssh-probe` 写剪贴板，`managed-terminal:ssh-confirm` 走原生确认。Agent 续接接口留在 Main，沿用 Pi 宿主工具白名单。

## 验证和测量

- 新增 wait/query 测试在修改前复现缺口。恢复和安全用例覆盖旧 generation、错误 nonce、先结束后开始、重复结束帧、127、审批过期、人工接管、软超时、取消幂等和 SQLite 重开。 [修改前失败](evidence-20261107/p0-red.txt) · [当前 CI](evidence-20261107/p0-ci.txt)
- `node --test scripts/verify-managed-ssh.cjs` 覆盖真实 PTY 中的 Bash/Zsh SSH、拒绝零写入、目标目录、退出码 0/1 和独立终止回环客户端后的 Unknown。[回环结果](evidence-20261107/p0-ssh-fixture.txt)
- `node --test scripts/verify-managed-ssh-electron.cjs` 覆盖构建版 Electron、专用 preload、原生对话框的隔离替身、回环 Pi 模型和真实 SSH。一次 Shell 确认、一次命令审批，模型在软超时后等待并查询同一个 ID，拿到退出码 0。[Electron SSH](evidence-20261107/p0-ssh-electron.txt)
- 四项原有桌面夹具重新通过。[桌面输出](evidence-20261107/p0-desktop.txt) · [本机 Pi 样本](evidence-20261107/p0-pi.json) · [本地单元回归](evidence-20261107/p0-unit.txt)

同一设备、同一构建类型和夹具的单次采样如下。阶段 A 的目标是执行正确性，样本差异不用于声明性能优化。

| 样本 | 基线 | 阶段 A |
| --- | ---: | ---: |
| xterm 粘贴至回显 P95 | 42.97 ms | 41.32 ms |
| 16 MiB 到可见末尾标记 | 2,945.17 ms | 2,498.61 ms |
| 同期 Main event-loop P95 | 5.78 ms | 6.08 ms |
| 同一 150 文件索引 Main + Utility 同时采样峰值 | 305.95 MiB | 306.49 MiB |

[基线 PTY](evidence-20261107/baseline-pty.json) · [阶段 A PTY](evidence-20261107/p0-pty.json) · [基线索引](evidence-20261107/baseline-index.json) · [阶段 A 索引](evidence-20261107/p0-index.json)

## Gate、风险及回滚

- OSC nonce 只关联状态。任意远端代码或被篡改的 Shell profile 能伪造流内证据。该入口仍限隔离预览。多跳、命令输出大页、真实远端 127、应用被杀后由 Electron 整应用恢复、交互式等待输入、同一 PTY 下重新授权及系统级边界仍有待实现或验收。命令记录按原 ID 查询，活动列表当前从活跃执行器提供。SSH 首次适配获得独立 Shell generation，绑定审批和 Envelope。原 PTY attachment generation 继续标识同一个 PTY。
- 当前输出只提供有界尾部，1 MiB / 10 MiB 分页与可恢复输出引用未交付。两个可能弹出钥匙串的旧桌面夹具通过显式文件范围隔离，缺少完整默认桌面回归证据。真实公司 SSH 未连接。
- 普通终端可继续按原方式使用。回滚代码时可保持 SSH 预览开关关闭，按本报告的文件范围回退 P0 增量并保留审计表。SQLite 表为新增结构，旧版本可继续读取其原有表。升级或回滚试验应在数据目录副本上执行。

## 回归统计与 Git

- `npm run ci` 包含 ESLint、静态安全边界、Node 协议、Main 和 Renderer 类型检查及 Electron 构建。现有 ESLint 基线为 150 警告、0 错误。[CI 完整日志](evidence-20261107/p0-ci.txt)
- `npm run test:local -- --project unit` 为 540 通过、3 跳过、0 失败。跳过项保留原有环境开关，包含性能和终端编辑探针。[单元回归](evidence-20261107/p0-unit.txt)
- `npm run test:local -- --project desktop <显式文件列表>` 选取 27 个文件中的 25 个，18 通过、12 跳过、0 失败。四项整应用开关已开启，其余跳过仍由既有环境开关控制。两项钥匙串夹具未列入此次命令。[桌面回归](evidence-20261107/p0-desktop-regression.txt)
- 协议虚拟时钟连续续等 10 分钟，整个过程维持同一 ID 和一次派发。真实 10 分钟运行仍属未验收。跨行私钥用例验证了脱敏发生在缓存裁切之前，后续正文可读。[协议用例](evidence-20261107/p0-protocol.txt)
- 暂存及工作区 diff check 均通过。基线哈希差异只出现在报告列出的 P0 路径，已有删除和其他工作区改动继续保留。仅三个协议及集成测试脚本纳入 Git 暂存区。[基线哈希](evidence-20261107/baseline-hashes.json) · [原路径变动清单](evidence-20261107/p0-original-paths-changed.txt)

## 最终 SSH 样本

同一阶段构建的 Electron/Pi 回环 SSH 中，6 秒、30 秒和 120 秒均返回退出码 0。120 秒样本经过四次 wait，最终 query 返回原 ID，Shell 确认和命令审批各一次。第一轮两分钟夹具误用固定结果索引，已改为核对最终结果。并行启动三个桌面实例时，6 秒和 30 秒两项曾在确认探测 UI 前超时。短用例改为串行启动，夹具禁用后台节流后通过。上述设置和原生焦点、剪贴板、审批替身均只存在于测试进程。

[6 秒](evidence-20261107/p0-ssh-electron-6s.txt) · [30 秒](evidence-20261107/p0-ssh-electron-30s.txt) · [120 秒](evidence-20261107/p0-ssh-electron-120s.txt) · [两分钟夹具首轮](evidence-20261107/p0-ssh-electron-120s-fixture-failure.txt) · [并行 6 秒故障](evidence-20261107/p0-ssh-electron-6s-concurrent-failure.txt) · [并行 30 秒故障](evidence-20261107/p0-ssh-electron-30s-concurrent-failure.txt)

最终 CI 为 580 项静态边界检查、12 项协议用例通过，ESLint 0 错误、150 警告，类型检查和三个 Electron 构建入口通过。P0 仍需补齐大输出分页、真实 10 分钟、持久化恢复整应用测试及其余未覆盖的 SSH 边界。阶段 B 尚未启动。
