# Codex 执行提示词

请先完整阅读：

- Document/new7/MOXUN_TERMINAL_TURN_QUEUE_PROJECT_LINK_AND_LARGE_FILE_READING_PLAN_20261106.md
- Document/ARCHITECTURE.md
- Document/SECURITY_MODEL.md
- Document/EXECUTION_PLANS.md
- Document/EXTERNAL_TERMINALS.md
- Document/TESTING.md

按计划实施墨巡四项底层优化：终端命令生命周期与多命令组判定、Agent 每会话 FIFO 回合队列、历史对话项目关联/重新绑定状态、流式大文件读取与项目索引分级。

执行要求：

1. 先做 P0 审计，核对真实调用链、SQLite schema、IPC、测试和当前实现；发现计划与代码不一致时先说明并修订，不要硬套。
2. 按 P1 到 P5 分阶段实施；每阶段先补测试，再改代码，再运行对应测试。
3. Agent 永久不能向终端输入、粘贴、执行或中断命令。用户仍在 iTerm 人工执行。
4. 不得自动向任何 SSH 远端安装/注入 Shell Integration，不修改跳板机或集群节点。没有可信事件时必须保留 unknown，并提供人工确认分析入口。
5. 新用户消息默认排队，不取消当前回答；只有用户明确点击停止/停止并发送时才取消。队列按 conversationId 隔离并可恢复。
6. 项目关联、目录授权、索引状态必须分开；历史会话可以解除、更换和重新验证项目，不得跨项目泄漏上下文。
7. 大文件读取必须采用流式、分页、cursor 和按需检索；不得简单提高上限后整文件载入内存或把全文发送给模型。
8. 优先复用现有 node-pty、pdfjs-dist、unzipper、sax、web-tree-sitter、tree-sitter-wasms。新增依赖前必须提供替代方案、许可证、包体、维护成本和基准测试。
9. 核心领域逻辑放在 Main 独立服务和 typed IPC；Pi 仅作为适配层，不把业务能力绑定到 Pi 专属实现。
10. 不做无关 UI/主题重构，不开放任何额外远程操作能力，不连接真实业务集群或调用付费模型做自动化验收。

完成后运行安全边界检查、定向测试、完整本地测试、typecheck、lint 和 build。最终提供逐项验收表、实际测试命令和结果、性能数据、未完成项、风险及修改文件清单。不得把启动测试写成测试通过，也不得把 unknown 写成成功。
