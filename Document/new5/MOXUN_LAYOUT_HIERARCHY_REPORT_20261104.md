# 墨巡布局与入口层级调整

2026-11-04，依据用户五张截图及补充确认：“仅移走证据和历史，建议留在正文”“挪个位置，不是删除”。

## 实施范围

1. 顶部原 32 px 应用栏只有右侧归档按钮，整行占用正文高度。品牌移入侧栏顶部，归档移至输入区上方的会话信息旁；保留原归档回调、禁用态和影响说明。系统原生窗口标题栏不变。
2. 下一步排查建议、命令和复制/追问继续留在正文。终端证据时间线与历史步骤挪至会话旁“排查记录”入口，按需打开右侧抽屉。原证据、历史分页、复制历史文本、分析结果入口全部保留，没有删除任何记录。使用现有 Radix Sheet 和 React Portal，仅改变 Renderer 呈现位置；快照订阅仍由原 GuidedOpsPanel 管理。
3. “Agent 工作区”是默认本地文件目录，不是第三种主工作区。核对 `src/main/agent/ipc.ts` 后确认：关联项目时会用项目 root 覆盖当前请求的 workspaceCwd；未关联项目才使用全局默认目录。故将配置收进“高级：默认本地目录”，更名“无项目对话的默认目录”，明确不代表远程终端 cwd；保留原输入、保存和兜底逻辑。
4. 侧栏优先级调整为：新建对话 → 连接外置终端 → 项目与最近会话。会话历史、连接管理、知识资料放在下方固定辅助区，仍为直接入口，不增加菜单层数。设置继续在底部。
5. 记忆中心的代码、配置、知识和学习行为均未修改；原入口保留。

## 项目 / 本地资料 / 知识库的职责与重叠

| 功能 | 当前真实职责 | 本轮处理 |
| --- | --- | --- |
| 项目 | 持久绑定本地目录、组织项目对话，作为 Agent 本地文件根目录 | 保留，优先展示 |
| 本地资料 | 人工授权目录、分片浏览/搜索文件，明确插入引用后才随聊天发送 | 保留，置于辅助入口；未来可考虑成为对话“引用文件”的入口 |
| 知识库 | 选择 Markdown 资料目录，供文档查看和 Agent 检索复用 | 保留，不擅自迁移为项目文件或记忆 |
| 默认本地目录 | 无项目对话的 Agent 文件范围兜底 | 保留，作为高级设置降级呈现 |
| 记忆中心 | 历史知识整理、审核、召回 | 按用户要求暂不改变 |

项目与本地资料都有“访问本地目录”的入口，概念确实重叠，但授权、绑定期限及发送模型时机不同。直接合并会涉及产品信息架构、文件授权和数据迁移，超出本轮位置调整；没有通过删除入口掩盖差异。推荐后续讨论以“项目=持续上下文、文件引用=本次输入、知识库=复用资料”收敛名称和入口，记忆中心方案待用户决定。

## 设计判断与 Skill

继续实际调用全局 ui-ux-pro-max 检索脚本：`desktop navigation hierarchy --domain ux` 返回面包屑/标题层级/固定导航，采用固定导航不遮挡内容这一适用原则，未增加面包屑；`progressive disclosure secondary actions --domain ux` 返回无关排版/反馈结果，缩小为 `Progressive Disclosure --domain ux` 仍偏题，未把它当作已核验的渐进披露建议。原始重试结果见验证目录 `skill-search.txt`。本轮抽屉位置以用户明确选择、实际截图和现有组件约定为依据，没有生成或持久化另一套设计系统。

沿用水墨主题、760 px 阅读宽度、784 px 输入区、原有消息滚动与减少动态效果规则。同步 `Document/UI_DESIGN_SYSTEM.md` 中旧的标题栏/归档位置约定。没有引入 UI 框架、图标库或新依赖。

## 文件与边界

调整 `App.tsx`、`AppSidebar.tsx`、`ChatWorkspace.tsx`、`GuidedOpsPanel.tsx`、`SettingsSheet.tsx`、中英文文案及品牌容器宽度；新增展示组件 `ConversationRecords.tsx`。前几轮既有未提交修改全部保留，起始状态见验证目录 `baseline-status.txt`。没有修改 Main/Preload、Pi、终端授权/执行、MCP 业务、数据库或持久化协议；没有新增 IPC；没有修改记忆中心、删除功能或删除用户数据。未提交 Git、未 push、未打包。

## 验证

- `npm run ci` 通过，包含 lint、346 项安全边界检查、类型检查及实际 Electron 构建；见 `layout-hierarchy-validation-20261104/ci.log`。
- 新增本地 gitignored `hierarchy.browser.test.ts`，实际运行 ChatWorkspace、GuidedOpsPanel 和 Sheet，合成 IPC 提供建议、终端证据和历史数据。在双主题及 1440 / 800 / 560 px 下进行 36 项内部检查：建议仍在正文、记录移出阅读流、证据和历史保留、原始输出可查看、Escape 返回入口、消息无横向溢出且不被输入区覆盖。截图和结果见 `component/`。内部检查不另计为 Vitest 测试数。
- 初次定向夹具因模块在 API stub 前导入导致启动超时，随后因合成证据缺失 identity 而失败；修正夹具后定向通过，没有为此放宽产品边界。初始日志保留为 `targeted-initial.log`。
- 实际构建应用验收 `AUDIT_OK`：双主题、1440 / 800 / 560 px 原生宽度下 42 张场景截图；实际内容高度受本机窗口系统限制为 755 px。消息区 clientWidth / scrollWidth 分别为 1196/1196、570/570、330/330，正文底部与输入区顶部均为 538 px。覆盖长消息、多工具、展开错误、附件及辅助页。减少动态效果时 transition 为 0s、animation 为 0.00001s。见 `after-audit.json` 与 `electron-runtime.log`。
- 补查 `EXTRA_OK`：560 px 双主题侧栏折叠、品牌边界、默认目录初始折叠/展开及设置 Escape 返回入口通过；见 `extra-results.json`、`extra-fallback-*.png`。补查夹具最初的 summary 键盘合成输入未触发浏览器默认动作，后使用真实鼠标展开验证，未计作键盘验收。
- 首次全量：505 项通过、1 项失败、14 项跳过。失败来自既有 `new4-app.browser.test.ts` 硬性要求旧 32 px 顶栏并直接查找 header；按用户此次调整，改为断言无全宽顶栏、侧栏品牌高 32 px、归档位于会话信息中，保留其原有 Conversation 恢复/归档/SQLite 历史检查，没有跳过测试。旧断言失败日志见 `test-local-previous-layout-assertion.log`。最终 `npm run test:local` 通过：84 个文件通过、9 个跳过；506 项通过、14 项跳过，170.67 秒。见 `test-local.log`。14 项跳过来自既有显式 opt-in 的真实 iTerm/SSH/模型、原生图标、生命周期等集成项，不计为通过。

### 关键截图

| 场景 | 宣纸 | 夜墨 |
| --- | --- | --- |
| 完整应用 / 1440 px | [浅色](layout-hierarchy-validation-20261104/after-chat-light-1440.png) | [深色](layout-hierarchy-validation-20261104/after-chat-dark-1440.png) |
| 完整应用 / 560 px | [浅色](layout-hierarchy-validation-20261104/after-chat-light-560.png) | [深色](layout-hierarchy-validation-20261104/after-chat-dark-560.png) |
| 建议留在正文 | [浅色](layout-hierarchy-validation-20261104/component/chat-false-1440.png) | [深色](layout-hierarchy-validation-20261104/component/chat-true-1440.png) |
| 证据与历史抽屉 / 560 px | [浅色](layout-hierarchy-validation-20261104/component/records-false-560.png) | [深色](layout-hierarchy-validation-20261104/component/records-true-560.png) |
| 原默认目录仍可使用 | [浅色](layout-hierarchy-validation-20261104/extra-fallback-light.png) | [深色](layout-hierarchy-validation-20261104/extra-fallback-dark.png) |

已检查 42 张应用截图的总览，并放大核对正文/输入区、归档、记录抽屉、侧栏折叠与高级目录。没有发现本轮新增横向溢出、重叠或按钮丢失。证据抽屉验证使用真实组件及合成 IPC；不把它写成业务终端原生授权验收。

运行证据目录：[layout-hierarchy-validation-20261104](layout-hierarchy-validation-20261104/)。使用隔离 Profile、合成历史与附件，不连接用户业务终端，不调用付费模型；不代表真实 iTerm 原生授权或自进化 Agent 能力验收。
