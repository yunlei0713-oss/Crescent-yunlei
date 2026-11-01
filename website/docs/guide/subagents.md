# 只读子任务

`subagent` 用于独立的只读分析，不创建终端、不登录 SSH、不执行命令、不写文件，也不再停靠子终端面板。旧 `open_subterminal` Agent 工具已退出当前工具集。

## 流程 {#flow}

<ArchitectureDiagram name="subagents-zh" />

主会话决定是否分出独立资料分析，再汇总子任务结论。角色包括 `scout`、`researcher`、`reviewer`、`oracle`；`worker` 与 `delegate` 被拒绝。子任务不能派生子任务或调用沉淀工具。

子任务只使用宿主缩小后的只读工具列表。共享上下文不代表终端权限；文件修改仍由主会话提议并经人工审批。若要操作另一台主机，由用户从 [SSH 连接](/guide/ssh) 打开 iTerm，不通过子任务执行。
