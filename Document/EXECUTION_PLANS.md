# 当前执行约定

本文件替代旧 Immediate/Planned 自动命令执行约定；旧原文已保存在桌面 `test/Crescent-cleanup-20261101/workspace-before/Document/EXECUTION_PLANS.md`。旧约定不能作为当前权限依据。

- Agent 永久没有终端执行、PTY/iTerm/SSH 输入或中断权限，审批、工作风格、旧 session executionMode 都不能恢复它。
- 用户在外部 iTerm 自己执行命令；`propose_command` 仅给出目标绑定建议。风险提示及复制不是终端输入。
- 观察默认 `off`，开启/恢复必须 Main 原生确认；暂停/撤销/身份改变清除证据，不恢复旧授权。
- 本地文件修改走完整 Diff、逐文件人工决定与 Main 一次性授权，复核路径/hash/owner/run/时效并写后验证；拒绝不变更。
- 历史命令、计划与审批记录只读展示。兼容 parser/失效策略保留，不提供执行、白名单或重跑控件。
- MCP 已审计实现名单为空；OpenAPI 仅迁移兼容。不能通过其他工具绕过终端禁令。

事实来源：[安全模型](SECURITY_MODEL.md)、[外部终端](EXTERNAL_TERMINALS.md)、[架构](ARCHITECTURE.md)。本地测试遵循 [TESTING.md](TESTING.md)，历史通过数量不作为本轮证据。
