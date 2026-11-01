# Agent 工具

Pi 只使用 Main 宿主明确注册的 allowlist，不加载项目 Pi extensions，也不使用内建 bash/write/edit。

| 工具/能力 | 当前边界 |
| --- | --- |
| `read`、代码索引与资料读取 | 授权的本地范围；路径、类型、大小及敏感文件校验 |
| `request_file_change` | 提议本地文件变更；完整 Diff、逐文件审批和 Main 一次性授权后才写 |
| `observe_terminal` | 仅读取当前身份上已授权、脱敏、有界的观察证据 |
| 诊断建议 | 分析并呈现文字，用户自行在 iTerm 执行；复制只写剪贴板 |
| `subagent` | 缩小工具集的只读子任务；无终端、SSH 登录或写入 |
| `create-skill` / `create-sop` | 后台草稿，用户确认后 Main 持久化 |

## 流程 {#flow}

<ArchitectureDiagram name="tools-zh" />

Agent 终端执行永久禁用，不能通过工具名、低风险标签、MCP 或旧兼容 API 恢复。OpenAPI 只作历史配置兼容。Agent MCP 已审计实现名单为空，因此连接/调用禁用；设置侧用户显式触发的目录发现是独立操作，不是 Agent 授权。

详见 [观察](/guide/terminal)、[审批](/guide/command-review)、[只读子任务](/guide/subagents) 和 [Skills](/guide/skills)。
