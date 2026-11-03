# 墨巡对话区布局优化记录

日期：2026-11-03。根据用户截图调整现有对话区，参考 Codex、Claude 的正文优先布局，保留墨巡深浅主题与运维交互。

## 调整内容

- 用户消息按内容收紧，去掉阴影和左边框；助手回复沿统一阅读宽度展开，去掉贯穿正文的竖线。
- 成功回复直接呈现 Markdown 正文，移除结果卡片、重复的“结果”标题和装饰阴影。错误状态仍保留明确提示和错误详情入口。
- 工具调用默认显示单行状态，文件变更、读取文件、搜索代码等常用工具使用可读名称。展开后仍可查看原始参数、结果、历史命令审计和目标入口。
- 建议选择区默认折叠；展开后保留全选、单选和加入输入框功能，粗体和行内代码按 Markdown 渲染，不再直接显示 `**` 标记。
- 标题栏去掉重复会话标题；输入区上方和侧栏使用统一标题处理。完整引用元数据在生成标题前剥离，已有截断元数据不再显示；当前会话可从用户消息恢复显示标题。历史列表缺少完整内容时使用通用标题，不改写历史记录。
- 增加轮次间距，统一对话区左右留白；保持输入区固定、正文独立滚动，保留复制、导出、错误检查和建议选择能力。

## 修改文件

| 文件 | 职责 |
| --- | --- |
| `src/renderer/src/assets/chat-workspace.css` | 消息布局、阅读留白、工具详情及窄窗口样式 |
| `src/renderer/src/lib/agent-log.ts` | 用户消息尺寸、助手宽度、轮次间距 |
| `src/renderer/src/components/AgentRunTimeline.tsx` | 成功回复去除外层结果卡片，保留错误提示 |
| `src/renderer/src/components/timeline/ToolRows.tsx` | 可展开工具状态行 |
| `src/renderer/src/components/timeline/ResultActions.tsx` | 可展开建议区及行内 Markdown |
| `src/renderer/src/components/timeline/RunDiagnostics.tsx` | 运行详情与正文对齐 |
| `src/renderer/src/App.tsx` | 移除顶部重复会话标题 |
| `src/renderer/src/lib/terminal-tabs.ts` | 当前会话标题显示及异常标题回退 |
| `src/shared/conversation-title.ts` | 纯文本标题处理，剥离引用元数据和引用 token |
| `src/main/crescent-sqlite.ts` | 新标题在截断前清理元数据，历史标题在读取时过滤元数据 |

没有新增依赖，没有修改模型调用、终端授权、Diff 审批、Preload 或数据库结构。本轮保留此前尚未提交的文档 Skill、终端上下文等改动。

## 验证

- `npm run ci`：通过，lint 无警告，342 项安全边界检查、类型检查和构建通过。
- 定向本地测试：6 个文件、22 项通过，覆盖标题处理、Conversation 持久化、历史分页与工具审计等。
- `npm run test:local`：79 个测试文件通过、9 个跳过；493 项通过、14 项跳过，耗时 129.62 秒。包括既有消息滚动、界面布局、历史恢复和工具审计回归；需要外部环境的跳过项不计入通过验收。
- 隔离 Electron 视觉与交互检查：10 项通过，实际使用 `ChatWorkspace`、消息列表和 Timeline 组件；验证默认折叠、详情展开、建议 Markdown、单选加入回调、异常标题过滤和无运行时错误。
- 800×700、1440×900 布局通过：无页面或正文横向溢出，输入区固定在底部，正文不与输入区重叠，用户气泡宽度小于助手正文宽度。
- 深浅主题截图已核对；视觉夹具使用合成消息，不连接真实模型或业务终端，不代表真实文件写入或外部终端验收。

证据：

- [深色效果](chat-layout-validation-20261103/ink-wash-dark.png)
- [浅色效果](chat-layout-validation-20261103/ink-wash-light.png)
- [展开工具和建议](chat-layout-validation-20261103/details-expanded.png)
- [800 像素布局](chat-layout-validation-20261103/layout-800.png)
- [1440 像素布局](chat-layout-validation-20261103/layout-1440.png)
- [交互与布局结果](chat-layout-validation-20261103/results.json)
- [CI 输出](chat-layout-validation-20261103/ci.log)
- [全量本地测试输出](chat-layout-validation-20261103/test-local.log)

未创建安装包，未提交 Git；新增标题回归测试保持本地 gitignored。
