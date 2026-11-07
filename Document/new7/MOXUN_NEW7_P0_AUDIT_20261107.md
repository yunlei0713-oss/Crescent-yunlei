# 墨巡 new7 P0 审计

审计日期 2026-11-07。基线为本机 `test` 分支的现有工作树，包含早期版本的未提交修改和删除。实施沿用现有工作树，验收使用隔离数据及合成样本。

| 领域 | 当前调用链和差异 | 实施契约 |
| --- | --- | --- |
| 终端 | 人工 iTerm → shared PTY → terminal IPC → registry → TerminalObserver → EvidenceNotifications。已有 iTerm 走 JXA 快照。授权绑定 owner、conversation、tab、UUID、连接和 generation，同终端换 host 清理活动命令及通知。现有 OSC 133 有 C/D 边界校验，文本提示符可生成低置信度提示。 | 复用受授权观察流。命令及组 ID 与现有证据一起保留，区分协议退出码、结束但退出码未知和证据不足。文本提示符仅供阅读；没有可验证批次终点时转人工确认。 |
| Agent | Composer → useAgentController → typed preload → agent:run → Pi host，后者按 sessionKey 互斥。Renderer 目前在提交时主动取消，另有显式停止、目标关闭、owner 导航/销毁、Guided Ops 结束路径。SQLite agent_runs 记录运行和展示结果，缺少请求队列。 | Main FIFO 以稳定 conversationId 排序。保存请求快照、校验后运行、完成后推进。进程重启后等待操作员继续；显式停止只取消 Agent。 |
| 项目 | conversations.project_id 与 session_tabs.project_id 并存，saveSessionTabs 目前同时更新，存在旧标签覆盖。ProjectRegistry 通过原生目录选择登记，项目激活目前将目录加入窗口共享资料 grants。 | 项目关系由稳定 ID 和 Main 专用 IPC 持久化，独立显示关联、目录可访问性和索引。Agent 项目根目录按回合校验；窗口资料权限与项目关联分开。 |
| 文件 | documents:read 与 Pi read 共用 LocalDocumentReader。普通文本已分块扫描，但 20 MiB 拒绝、重复从头扫描及单行限制仍在。DOCX 当前把 ZIP 和 XML 收集进内存。PDF 的前端预览和模型附件提取是不同入口。代码索引累积完整 rows 再写 SQLite。 | 文件身份绑定游标，有界分块读取和检索。大附件使用本地授权引用。复用 PDF.js、unzipper、sax、Tree-sitter。索引记录覆盖范围和原因，读取不依赖索引。 |

iTerm 3.7.6 已安装。本机 Python 环境没有 `iterm2` 模块，未读取到启用 API server 的设置。官方 PromptMonitor 支持按 session ID 订阅，命令模式依赖版本及 Shell Integration 或提示符触发器。当前 JXA 路径无法验证 Python API 会话映射或命令事件源，产品继续使用有界快照与人工确认。未改变本机 iTerm 配置或远端配置。[iTerm2 Prompt API](https://iterm2.com/python-api/prompt.html) · [VS Code OSC 协议](https://code.visualstudio.com/docs/terminal/shell-integration)

定向基线第一次运行 38 通过、6 失败，原因是项目测试要求 Node 实际临时目录下存在 `opencode`。准备测试目录后重新运行五个计划指定套件，44 通过。


```sh
CRESCENT_LOCAL_TESTS=1 npx vitest run \
  src/main/terminal/observer/terminal-observer.test.ts \
  src/main/projects.test.ts src/main/sqlite/conversations.test.ts \
  src/main/local-document-reader.test.ts \
  src/renderer/src/hooks/useAgentController.test.ts
```
