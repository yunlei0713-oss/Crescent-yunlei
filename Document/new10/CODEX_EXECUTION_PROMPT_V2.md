# Codex 执行提示词（对应后续修复总计划）

请先完整阅读：

1. `Document/new10/MOXUN_POST_REVIEW_REMEDIATION_PLAN_20261107.md`（本轮最新、执行优先的总计划）
2. `Document/new10/MOXUN_FOUR_PHASE_REVIEW_REPAIR_PLAN_20261107.md`（已有复审补充计划，作为背景参考）
3. `Document/new9/MOXUN_RELIABLE_TERMINAL_AGENT_EXECUTION_AND_PERFORMANCE_PLAN_20261107.md`
4. `Document/new9/MOXUN_RELIABLE_TERMINAL_PHASE1_REPORT_20261107.md`
5. `Document/new9/MOXUN_RELIABLE_TERMINAL_PHASE2_REPORT_20261107.md`
6. `Document/new9/MOXUN_RELIABLE_TERMINAL_PHASE3_REPORT_20261107.md`
7. `Document/new9/MOXUN_RELIABLE_TERMINAL_PHASE4_REPORT_20261107.md`

然后以当前仓库为准重新复核所有源码、测试、构建配置和 Git 状态。不要把任何历史报告中的行号、测试数量或性能值当成当前实时事实。

## 执行目标

这是 new9 四阶段改造后的增量修复，不是推倒重构。保留双窗口 Electron、Main-owned node-pty、xterm.js、Session Manager、输出缓冲、索引 Utility Process、PDF 范围读取、审批和 IPC 安全边界。

严格按最新总计划的 Gate 顺序实施：

- P0：当前可见 SSH PTY 内的安全 Agent 协作、Shell Adapter、逐条审批、命令 ID 生命周期、wait/get-result/cancel、超时/断连/Unknown 和持久化审计。
- P1：人工接管/重新授权、测试文件 Git 纳管和 CI、聊天虚拟滚动、索引总内存预算、DOCX Utility Process 与可恢复分页、生产依赖安全修复。
- P2：macOS x64/arm64/Universal 构建、安装升级、数据迁移和长时稳定性验收。

## 不可违反的约束

1. 先记录 `git status --short --branch`、`git diff --stat`、`git diff --check`、暂存区和未跟踪文件。所有现有未提交改动都是用户资产。
2. 严禁 `git reset`、`git clean`、强制 checkout、批量 restore、覆盖式格式化或删除已有改动。
3. 不擅自 commit、push、打 tag、release 或发布。
4. 用户和 Agent 必须共享同一个可见 PTY、Shell 和 SSH 会话；禁止隐藏 Shell、第二条不可见 SSH 通道或后台 child_process 执行。
5. SSH 是传输层，不是绕过审批的授权。每条 Agent 命令都必须逐条审批，Main 侧验证 commandHash、approvalId、sessionId、generation、host、cwd、conversation 和窗口可见性。
6. 不修改远端持久 Shell 配置，不要求远端安装 Agent/daemon，不读取或回传密码、私钥、Token、Cookie。
7. Shell Integration/OSC nonce 仅用于命令状态关联，不是安全认证凭据。无法可靠确认命令边界时降级 manual-only。
8. 超时不等于失败；软超时不 kill、不 retry、不释放执行锁。后续 wait/query 必须沿用原 commandId。没有结束证据时返回 unknown。
9. 人工输入优先于 Agent；区分键盘/粘贴、终端协议自动响应、Agent command 和 system control。重新授权必须重新探测 Shell/SSH 状态并由用户明确确认。
10. 新增测试必须纳入 Git，CI 默认测试必须可在隔离环境复现。不得删除测试、降低断言或标记 skip 来通过 Gate。
11. 性能优化必须有同设备、同 fixture、同测量边界的前后数据。
12. 生产依赖 Critical/High 漏洞逐项核实；禁止未经兼容性评估执行 `npm audit fix --force`。
13. 真实公司 SSH/生产环境验证需要用户单独明确同意；自动化优先使用 loopback SSH、临时密钥和隔离数据。
14. 需要不可逆迁移、破坏性操作、Electron 主版本升级或超出计划的架构变化时，暂停并说明原因，等待确认。

## 执行方式

先完成基线复核并报告，再从当前 Gate 开始真正实施，不要只返回另一份泛泛计划。每个工作包必须遵循“测试 → 最小修改 → 完整回归 → 性能/安全证据 → Gate 判断”。

每阶段报告放入 `Document/new10`，包含改动文件、接口变化、测试命令及完整结果、性能数据、风险、回滚方案、Git diff 检查和下一 Gate 是否通过。

如果现有实现已经满足某项要求，应提供代码和测试证据后标记复用，不要重复实现。若计划与真实代码冲突，以保护现有稳定行为为前提先报告冲突，不要自行覆盖。
