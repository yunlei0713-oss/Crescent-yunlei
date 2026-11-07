# 墨巡 Review 后续修复计划（new10）

本目录承接 `Document/new9` 四阶段终端改造。独立 Review 认为基础架构和本机 Agent 审批原型已有真实测试证据，但 SSH Agent 协作、长命令恢复、人工接管、长会话性能、DOCX 隔离、测试纳管、依赖安全和正式 macOS 发布仍需补齐。

## 文件与使用顺序

1. **[最新后续修复总计划](./MOXUN_POST_REVIEW_REMEDIATION_PLAN_20261107.md)** — 本轮最新整理的执行基准，包含架构不变量、P0/P1/P2 任务、文件定位、威胁模型、验收阈值、回滚和完整 Codex 提示词。
2. **[Codex 执行提示词 V2](./CODEX_EXECUTION_PROMPT_V2.md)** — 直接复制给 Codex 的短提示词，明确以上述最新总计划为准。
3. **[已有四阶段复审修复计划](./MOXUN_FOUR_PHASE_REVIEW_REPAIR_PLAN_20261107.md)** — 本目录原有的补充计划，保留作参考，不覆盖。
4. **[原有 Codex 执行提示词](./CODEX_EXECUTION_PROMPT.md)** — 早期提示词，仍指向第 3 项；如开始执行，请使用 V2。

## 执行顺序

1. **P0**：安全 SSH Agent 协作 + commandId 生命周期（wait/get-result/cancel）+ 超时/断连/Unknown 恢复。
2. **P1**：人工接管与重新授权、测试 Git 纳管和 CI、聊天虚拟滚动、索引总内存治理、DOCX Utility Process 与可恢复分页、生产依赖安全修复。
3. **P2**：macOS x64/arm64/Universal、安装升级、数据迁移、长时稳定性。

## 重要约束

- 增量修复，不推倒 new9 已完成的双窗口、Main-owned PTY、xterm、索引 Utility、PDF 范围读取和审批架构。
- Agent 与用户必须共用同一个可见 PTY；SSH 是传输层，不是绕过审批的许可。
- 每条 Agent 命令逐条审批；不支持的 Shell/TUI/认证场景降级为人工执行。
- 软超时不等于失败，不自动 kill，不自动 retry；后续查询沿用原 commandId。
- 不修改远端持久配置，不创建隐藏 Shell，不自动管理远端凭据。
- 保留所有现有未提交改动，不 reset/clean/restore，不擅自 commit/push。
- 先完成 P0 并通过门槛，再推进后续阶段；真实公司环境验证需单独确认。

**建议交给 Codex 的文件：** `CODEX_EXECUTION_PROMPT_V2.md`。它会要求 Codex 先读最新总计划和 new9 原始记录，再从基线复核开始实施。
