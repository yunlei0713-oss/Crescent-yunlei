# 当前架构

墨巡是 Electron、React、TypeScript 的聊天优先桌面工作台。Pi 是 Main 中的客座运行时；用户在外部 iTerm 操作，Agent 只分析授权资料和证据、给出建议。

## 使用关系

<ArchitectureDiagram name="usage-zh" />

## 系统架构 {#system}

<ArchitectureDiagram name="system-zh" />

Renderer 无 Node/文件权限，只经 Preload 的有类型白名单访问 Main。Main 校验 sender、frame、payload，拥有 SSH/PTY、观察授权、文件审批、密钥及存储。Pi 使用宿主 allowlist，不加载项目 extensions，不注册终端执行工具。

SQLite、配置、Memory、Skills 和知识数据由 Main 管理，应用资料保留在原 `~/.crescent` 数据树；授权项目文件不限定在该数据树。文件修改须完整 Diff、逐文件审批、原生确认、一次性校验及写后验证。

## 主工作流 {#workflow}

<ArchitectureDiagram name="workflow-zh" />

问题与目标 → 分析/文字建议 → 用户在 iTerm 核对并执行 → 可选原生确认的脱敏证据 → 继续分析。观察默认关闭，暂停/撤销/身份变化清除证据，恢复需重新授权。Agent 永久不能执行、输入或中断终端。

OpenAPI 是历史配置；Agent MCP 已审计实现名单为空，禁用连接/调用。设置侧显式目录发现不等于 Agent 授权。子任务只读、不创建终端。

完整路径、资源/Worker/native 边界见仓库 [ARCHITECTURE.md](https://github.com/aide-family/Crescent/blob/main/Document/ARCHITECTURE.md) 与 [SECURITY_MODEL.md](https://github.com/aide-family/Crescent/blob/main/Document/SECURITY_MODEL.md)。
