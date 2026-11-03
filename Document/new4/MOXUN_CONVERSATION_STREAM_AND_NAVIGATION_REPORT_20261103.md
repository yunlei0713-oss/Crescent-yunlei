# 对话断段修复、阅读区收窄与定位条实施记录

日期：2026-11-03。继续处理用户截图中的首字断段，并按提供的 Codex 参考图调整阅读区和输入框，增加对话定位条。

## 首字断段

只读核对本机已有记录后，确认“终”“文档”“按”被保存为独立的 message step；同一句的后续内容位于另一个 step，序号之间存在被省略的思考事件。原实现把文本和思考视为严格交替的阶段：思考事件会关闭正文，下一次文本事件只检查最后一个 step，因而把正文拆开。最终结果去重只移除最后一段，又会留下首字。

本次修改：

- Pi Runtime 为每次订阅中的消息分配身份；事件桥结合 `contentIndex` 标记正文与思考内容块，传递给 Renderer。
- Renderer 按内容块身份累积 delta，保留空格与原始文本。正文和思考交错时各自追加；不同消息、不同内容块仍然独立。
- 没有内容块身份的兼容事件只在连续文本/思考区域寻找正文，不跨工具或状态边界合并。
- 旧记录显示时，仅对有序号缺口、无内容块身份的相邻短前缀进行保守合并，再做最终结果去重。原始数据库与导出记录不改写，不通过丢弃首字掩盖问题。
- 去除已有思考/工具状态行时重复出现的活动提示。

## 布局和定位条

- 阅读区从 1040 px 收窄到最多 760 px；输入区外壳最多 784 px，正文和输入区域对齐。
- 输入框初始编辑区域高度缩短为 52 px，圆角改为 16 px，去掉工具栏分隔线；附件格式和大小说明默认折叠，附件错误仍直接可见。
- 阅读区左侧增加短横线定位条，按当前已加载的用户轮次生成标记；当前阅读轮次高亮。
- 鼠标悬停或键盘聚焦显示该轮问题与回复摘要；点击或 Enter 跳转，方向键切换焦点，Home/End 到首尾，Esc 关闭预览。
- 主动跳转立即取消待执行的跟随滚动；后续流式输出不会把读者拉离历史位置。“回到最新”恢复跟随。
- 定位条留在正文外侧；聊天区域宽度不超过 600 px 时隐藏。切换会话时重置预览，避免显示另一会话内容。
- 标记数量只覆盖当前已加载的历史，较早历史仍通过原有分页入口加载；本轮不增加持久化书签功能。

## 主要文件

| 文件 | 修改 |
| --- | --- |
| `src/main/agent/runtime/pi/runtime.ts` | Pi 消息身份分配 |
| `src/main/agent/pi-event-bridge.ts` | 按 `contentIndex` 传递内容块身份 |
| `src/shared/agent-types.ts` | 正文/思考事件的可选 `streamId` |
| `src/renderer/src/lib/agent-stream-steps.ts` | 独立内容块拼接与旧短前缀显示兼容 |
| `src/renderer/src/hooks/useAgentRuns.ts` | 接入流式拼接，保持工具/审批边界 |
| `src/renderer/src/lib/terminal-tabs.ts` | Step 的可选内容块身份 |
| `src/renderer/src/components/AgentRunTimeline.tsx` | 旧片段合并后去重，减少重复活动提示 |
| `src/renderer/src/components/ConversationNavigator.tsx` | 定位条、预览、键盘操作和跳转 |
| `src/renderer/src/components/ChatWorkspace.tsx` | 接入会话级定位条 |
| `src/renderer/src/hooks/useScrollFollow.ts`、`lib/scroll-follow.ts` | 显式历史跳转暂停跟随 |
| `src/renderer/src/assets/chat-workspace.css` | 阅读宽度、紧凑输入框、定位条及响应式样式 |
| `src/renderer/src/components/ComposerAttachments.tsx` | 附件说明折叠，错误保持可见 |
| `Document/UI_DESIGN_SYSTEM.md` | 同步新的宽度和导航规范 |

未扩大文件权限，未增加终端执行或 IPC 通道，未改变 Diff 审批。保留前几轮尚未提交的改动。

## 验证记录

- `npm run ci`：通过；344 项安全边界检查，lint、Node/Web 类型检查及构建通过。
- 流式相关定向测试：3 个文件、13 项通过，覆盖 Pi 消息/内容块身份、交错 delta、不同消息隔离、无身份兼容边界和旧片段恢复。
- 真实 Electron 组件集成：13 项交互检查通过，使用实际 `useAgentRuns`、`useScrollFollow` 与 `ChatWorkspace`，输入为合成 Main 事件；确认正文完整、表格完整、最终结果只显示一次、预览可读、历史跳转暂停跟随、键盘导航及 Esc。
- 1440、800、560 px 窗口宽度检查通过：阅读区不超过 760 px、输入区不超过 784 px、无横向溢出或输入区域重叠，窄窗口隐藏定位条。实际窗口尺寸见 JSON，不将操作系统限制下的请求高度写成实测高度。
- 深浅主题截图已逐张核对。
- 全量 `npm run test:local`：82 个文件通过、9 个跳过；504 项通过、14 项跳过，耗时 140.63 秒。外部环境相关跳过项不计为通过验收。

证据目录：`conversation-refinement-validation-20261103/`。

- [深色定位条预览](conversation-refinement-validation-20261103/navigator-ink-wash-dark.png)
- [浅色定位条预览](conversation-refinement-validation-20261103/navigator-ink-wash-light.png)
- [紧凑对话区及完整正文](conversation-refinement-validation-20261103/compact-conversation.png)
- [560 px 布局](conversation-refinement-validation-20261103/layout-560.png)
- [集成交互和实际布局结果](conversation-refinement-validation-20261103/results.json)
- [最终 CI 输出](conversation-refinement-validation-20261103/ci.log)
- [全量本地测试输出](conversation-refinement-validation-20261103/test-local.log)

测试保持本地 gitignored。集成使用独立 Electron Profile 和合成事件，没有调用付费模型或连接业务终端；不代表真实供应商与原生审批环境验收。本轮未创建安装包、未提交 Git。
