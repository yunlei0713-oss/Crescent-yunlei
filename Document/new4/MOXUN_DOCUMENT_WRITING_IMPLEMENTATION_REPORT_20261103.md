# 墨巡文档写作 Skill 与命令块主题修复实施记录

日期：2026-11-03。依据同目录 `MOXUN_DOCUMENT_WRITING_SKILL_PLAN_20261103.md` 实施。

## 实现范围

| 文件 | 本次变更 |
| --- | --- |
| `resources/skills/document-writing/SKILL.md` | 唯一内置写作 Skill，包含结构、表达、事实可靠性、排版与完稿检查；完整内容 1056 字符，低于 2000 字符上限 |
| `src/shared/agent-run-prompt.ts` | 中英文文档意图纯函数，以及冷启动时最近用户请求的有界续接判断 |
| `src/main/agent/builtin-document-writing.ts` | Main 读取应用自带资源、合并手动 Skill、避免重复、读取异常记录日志并返回原有 Skill |
| `src/main/agent/pi-host.ts` | Prompt 组装时调用判断和加载器；保留当前会话最近一次用户任务是否为文档任务 |
| `src/renderer/src/assets/chat-workspace.css` | 命令建议明确使用共享代码背景、前景色及边框，保持长命令正常换行和滚动 |
| 本地 `document-writing.test.ts`、`builtin-document-writing.test.ts` | 自动触发、排除、续接、完整注入、手动合并、去重、缺失与超长资源回归；测试文件保持 gitignored |

执行前已有 `Document/TESTING.md`、`pi-guided-ops.ts`、`terminal/ipc.ts`、`GuidedOpsPanel.tsx`、`agent-prompt-discipline.ts`、`terminal-observation-types.ts` 的未提交改动。本次保留这些改动；`Document/TESTING.md` 仅追加本轮验收入口。

## 触发规则与权限

- 当前请求同时包含写作、整理、修改、润色、排版、转换等动作和正式文档产物时加载，支持中文与英文。
- “如何写好 SOP”等方法问答、普通技术问答、代码与脚本任务、终端操作、简短聊天回复不加载。代码围栏及引用行不用于文档意图匹配。
- “继续修改”“再完善一下”“按上面的结构整理”等短请求只续接紧邻的文档任务；普通用户请求会清除续接状态。会话重建时仅检查最近三条带角色标签的用户请求，不匹配助手正文。自动终端跟进不加载内置写作 Skill。
- 轻量规则不等同于语义分类模型；罕见表达可能漏判。含糊且没有文档产物或紧邻文档上下文的请求，保持普通请求行为。
- 只向当轮 `activeSkillDocs` 追加内容，复用 `buildPromptText` 和 `buildActiveSkillGuidance`。用户手动选择的其他 Skill 保留；同名或同路径的写作 Skill 不重复注入。
- Main 使用 `app.getAppPath()/resources/skills/document-writing/SKILL.md`。保持原有工具授权、Diff 审批、终端安全策略、Preload 和进程隔离；没有新增依赖、网络分类、设置项、独立 Agent 或 Skill Manager 改造。
- 资源缺失、空白或超过注入上限时写入可定位的 warning 日志，本轮请求继续使用原有 Skill，不静默截断内置规范。

## 深色命令块修复

原命令块的 `bg-muted` 在深色主题下为 `#202421`，与消息区域背景重合，导致命令块边界不明显。现在在 `.chat-workspace .guided-ops-command` 明确设置 `--app-terminal` 背景、`--foreground` 文字和 `--app-border-strong` 边框；深浅主题均沿用共享 token，无需单独写死一组颜色。

## 验证结果

| 检查 | 实际结果 |
| --- | --- |
| `npm run ci` | 通过；lint 无警告，342 项安全边界检查、Node/Web 类型检查及 Main/Preload/Renderer 构建通过 |
| 新增两组本地测试 | 52 项通过 |
| `npm run test:local` | 最终全量复跑通过；78 个文件通过、9 个跳过，490 项通过、14 项跳过，耗时 127.51 秒 |
| `git diff --check` 与本次源码/Skill 格式检查 | 通过 |
| 开发资源读取 | 本地测试读取仓库内真实 Skill，完整注入，无截断；真实 Electron 目录夹具通过 |
| 资源打包规则 | 检查当前 `files` 包含且未排除 Skill，`asarUnpack` 匹配 Skill；未修改构建规则 |
| Electron ASAR 资源读取 | 真实 Electron 运行隔离 ASAR 夹具，`app.getAppPath()` 返回 `app.asar`，通过虚拟路径读取 `.asar.unpacked` 中的 Skill，1056 字符完整注入 |
| 命令块视觉验证 | 真实 Electron 渲染现有 `GuidedOpsPanel`，使用合成建议数据；浅色→深色→浅色切换通过，两条命令的背景均与消息区区分，边框为 1px，保持 `max-height: none` |
| 命令文字对比度 | 浅色 15.44:1，深色 16.58:1；截图已逐张核对 |

资源与主题证据：

- [目录/ASAR 资源读取结果](document-writing-validation-20261103/resources.json)
- [主题实际颜色与对比度](document-writing-validation-20261103/themes.json)
- [深色命令块截图](document-writing-validation-20261103/ink-wash-dark.png)
- [浅色命令块截图](document-writing-validation-20261103/ink-wash-light.png)
- [最终 CI 输出](document-writing-validation-20261103/ci.log)
- [最终全量本地测试输出](document-writing-validation-20261103/test-local.log)

本地测试文件保持 gitignored，不应提交。原生 iTerm、真实业务连接或付费模型的跳过项不计入通过验收；本轮没有以模拟数据声称这些外部环境已通过。

## 交付边界

未创建正式 macOS 应用、DMG 或 ZIP 安装包，未提交 Git。ASAR 资源夹具验证只证明 Electron 资源寻址与解包读取，不等同于新 macOS 安装包的运行验收。没有调用付费模型，也没有连接业务终端；实际模型生成文档的编辑质量仍需要真实使用反馈。
