# Codex 执行提示词

请以当前仓库为准，执行本目录中的：

- MOXUN_FOUR_PHASE_REVIEW_REPAIR_PLAN_20261107.md

这是对 Document/new9 四阶段改造的后续修复计划，不是重新设计项目，也不是推倒重构。

## 执行要求

1. 先完整阅读 Document/new9 主计划和四份阶段报告，再阅读 new10 修复计划。
2. 先重新检查 git status、分支、HEAD、暂存区、未提交 diff 和未跟踪文件。此前工作区约有 155 个修改/新增路径，所有现存改动都是用户资产。
3. 严禁 git reset、git clean、强制 checkout、批量 restore、覆盖式格式化、删除用户已有文件、git commit、push 或 release。
4. 先复现计划中的问题和性能基线，再提出最小增量改动；不要仅凭复审结论盲目修改。
5. 保留当前独立 Chat/Terminal BrowserWindow、Main 管理 node-pty、xterm.js、Session Manager、输出缓冲、Utility Process、PDF 范围读取和审批安全边界。
6. 严格按 WP0 → WP1 → WP2 → WP3 → WP4 → WP5 → WP6 执行，并遵循每个工作包的 Gate。不要用降低断言、删除测试或标记 skip 的方式让 Gate 通过。
7. 首要完成 Agent 在当前可见 SSH Shell 中的协作执行。用户和 Agent 必须共享同一个 PTY、Shell、SSH 会话、cwd 和环境；禁止另开后台 Shell 或第二条不可见 SSH 通道。
8. Agent 命令必须由 Main 侧审批和 Command Executor 控制。Shell Integration/OSC nonce 只用于状态关联，不是授权凭据；无法可靠识别的场景降级人工模式。
9. 完成 wait/query/output/cancel/interrupt/reconcile 等命令状态恢复能力。超时、断连或证据缺失时不得自动重发；保留原 commandId 并返回 unknown，直到有证据或人工核实。
10. 完成人工接管、输入来源分类和显式重新授权。终端协议自动响应不能误触发人工接管。
11. 实现真正的聊天虚拟列表，并优化索引 Main+Utility 总 RSS、DOCX Utility Process 解析。
12. 修复测试忽略规则与 CI 分层；新增测试必须可被 Git 跟踪。逐项核实生产依赖 Critical/High 公告，不执行 npm audit fix --force。
13. 完成 macOS x64/arm64 Universal 构建与 smoke test。没有 Apple Silicon 真机时必须明确标记 arm64 真机验收未完成。
14. 所有自动化测试优先使用临时目录、回环 SSH、合成数据和隔离 Profile；未经我明确同意，不要连接生产主机或执行生产写操作。
15. 不修改远端主机的持久 Shell 配置，不保存或回传密码、私钥、Token、Cookie。
16. 每个 WP 完成后，输出改动文件、关键实现、测试命令及完整结果、性能前后数据、风险/未完成项、工作区差异，并判断 Gate 是否通过。
17. 新增计划执行记录、测试报告和性能证据放入 Document/new10；不要修改 Document/new9 的历史计划和报告。
18. 如果需要不可逆数据迁移、破坏性操作、Electron 主版本升级或无法安全确认的方案，先暂停并说明原因，等待我确认。

## 执行策略

不要只给我第二份计划或泛泛建议。完成基线复核后，直接开始实施当前 Gate 允许的工作包；每个工作包先测试、再修改、再完整回归。遇到一个工作包未通过时，优先修复该 Gate，不要跳到后续功能并宣称整体完成。

最终目标是让墨巡在真实日常运维中做到：Agent 与人工共用可见终端、命令执行状态准确、长命令可恢复、SSH 连接可控、人工接管自然、聊天和索引长期运行流畅，并且所有高风险操作始终处于明确审批边界内。
