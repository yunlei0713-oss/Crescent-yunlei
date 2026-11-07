# 墨巡 UI / UX 审查与优化实施报告

日期：2026-11-04。任务依据：`CODEX_UI_UX_OPTIMIZATION_PROMPT.md`。本轮以现有产品为基础，实施范围为五个 Renderer 文件，不改变品牌、信息架构或业务能力。

## 审查基线与范围

完整读取任务提示词、AGENTS.md、四份 `.cursor/rules/*.mdc`、项目 `pi-dev` / `electron-development` Skill、现有 UI 设计系统、品牌及水墨主题规范，并参考 new4 的聊天布局、细节、流式导航和品牌/终端操作报告。现有工作区包含用户已修改的 Main、终端菜单、品牌脚本和资源等；原始清单保存在 [baseline-status.txt](ui-ux-validation-20261104/baseline-status.txt)。没有清理或覆盖这些改动。

技术栈为 Electron 41、React 19、Tailwind 4、Radix 和 lucide-react。颜色继续取自 `assets/theme.css` 和共享主题定义；主题机制继续使用 `app-theme`。没有安装依赖，没有触及 Main / Preload / Pi 模块。项目 Electron Skill 的通用示例不覆盖本仓库 Main 管理业务与秘密、Renderer 只负责 UI 的明确规则。

基线使用实际构建产物的 Main / Preload / Renderer，独立 `/tmp/moxun-ui-new5-*` 数据和 Profile，在真实 BrowserWindow 内检查聊天、侧栏、输入区、设置、MCP、Skills、知识库；覆盖两个主题和 1440 / 800 / 560 px 宽度。截图为 Electron `capturePage()` 输出，非静态 HTML。窗口请求高度 900 px，但本机屏幕将实际内容高度限制为 752 px；报告以 JSON 中实际尺寸为准。未用设备模拟伪装原生窗口。

基线 30 张场景截图及一次早期夹具失败截图保留在本轮目录；[before-audit.json](ui-ux-validation-20261104/before-audit.json) 为布局记录。基线早期脚本用 DOM click 打开 Radix 菜单失败，后改用真实鼠标输入；失败不计为产品故障。早期方向键使用 Electron 不支持的 `ArrowRight` 名称，基线键盘记录不能作为方向键验收；最终脚本改为 `Right` / `Left`，配合原代码检查与实际断言验收。

## 问题与取舍

| 优先级 | 证据与影响 | 实施方案 |
| --- | --- | --- |
| P1 | 设置截图中“工作风格”选中值同时显示名称与说明，两行挤进固定高度控件，说明被裁切；`SettingsSheet` 使用默认 `SelectValue` 自动复制整个富文本选项 | 显式显示已选风格名称，完整说明继续保留在下拉选项；不改变选择值、回调或默认值 |
| P1 | `SkillManager.handlePaneKeyDown` 只切换 state，焦点留在旧 Tab；两个 Tab 均进入普通 Tab 顺序 | 方向键同时移动焦点与选择，补齐 Home/End 和 roving tabindex；不触发搜索、安装或保存 |
| P1 | 最终真实截图发现：560 px 窗口且侧栏展开时，错误详情中的长导出文案不换行，消息区 330 px 而 scrollWidth 378 px；证据 `overflow-before-fix.png` 与 `after-first-batch-audit.json` | `RunDiagnostics` 的三项辅助操作允许换行并限制宽度，按钮高度自适应；保留文案、回调和点击路径 |
| P2 | 抽屉标题说明没有普遍预留右上角关闭按钮区域，长中文/英文说明可能进入按钮所在列；11 px 说明在密集 UI 中偏小 | 共享 Header 预留 56 px 右内距、禁止收缩，说明改为 12 px / relaxed 行高，维持标题和正文的清晰层级 |
| P2 | 知识库默认宽度 420 px，标题与选择文件夹/刷新按钮同排，说明被压成窄列；见 `before-wiki-light-800.png` | 标题区域使用 256 px flex basis，空间不足时按钮自然换行；目录仍截断并保留完整 title |
| P2 | Skills 分页与右侧低频操作在单排 flex 中争抢窄窗口宽度 | 允许工具栏换行，保留按钮文案和点击路径 |
| P3 | 通用 Sheet 打开 500 ms、关闭 300 ms，对频繁访问的运维抽屉偏慢，属于节奏优化而非功能缺陷 | 改为打开 200 ms、关闭 150 ms；沿用既有减少动态效果规则 |

已完成且正常的内容保持：760 px 阅读列、784 px 输入区、独立消息滚动、固定输入区、对话定位条、工具和思考折叠、辅助信息悬停、终端危险操作分流、会话归档、空白新对话。没有再添加欢迎图、嵌套卡片、仪表盘或营销式内容。

规则冲突：`.cursor/rules/development-standards.mdc` 仍写强调色 `#13c2c2`，但正式品牌、UI 系统和当前 `theme.css` 实际使用宣纸/夜墨的中性色 primary（浅色 #555D57、深色 #C7CCC3）。本轮遵循正式品牌与当前主题，没有引入青绿装饰，也没有替换成功/警告/错误等语义色；没有修改该历史规则文件。

## Skill 的实际使用与筛选

已检查 Python 3.9.6，并实际调用全局 `/Users/xusong.yu/.agents/skills/ui-ux-pro-max/scripts/search.py`。完整命令和原始输出见 [skill-searches.txt](ui-ux-validation-20261104/skill-searches.txt)。没有 `--persist`，没有创建 MASTER。

| 检索 | 返回结果核验与采用情况 |
| --- | --- |
| `desktop operations workbench density --design-system -p MoXun` | 首次返回 Cyberpunk UI、Operations Landing 和奢华字体，明显偏题；拒绝霓虹、Landing、推荐字体和配色 |
| `productivity tool minimal monochrome --design-system -p MoXun` | 按 Query Contract 缩小后返回 Flat Design，接受无渐变、少阴影、克制反馈；其营销结构、青绿/橙配色及新字体仍不适用，不持久化 |
| `keyboard focus modal --domain ux` | 返回 Focus States / Focus Not Obscured，适用于桌面键盘焦点与关闭控件避让 |
| `accessible form labels --stack react` | 返回 Label form controls；保留现有 label / id 和 Radix 语义，不以 placeholder 替代标签 |
| `design tokens desktop layout --stack html-tailwind` | Semantic colors 与静态类名建议适用；保持现有 Token，不照搬移动端图片排版 |
| `tabs keyboard navigation --domain ux` | 结果围绕焦点可见性，适用作一般焦点指导；没有把它称为精确 Tab 行为规范，具体修复由现有 Tab 语义与实际键盘测试确认 |
| `reduced motion transitions --domain ux` | Reduced Motion 建议适用；继续由既有全局 media query 关闭过渡，不引入动画依赖 |

同时按多文件 TSX 修改要求读取 `vercel:react-best-practices` 并复核：无新增 Effect、订阅、数据请求或依赖；焦点处理留在键盘事件内，简单名称查找不添加 memo；没有引入 Next.js 或服务端约定。手机 safe area、44pt、Dynamic Type 等不适用于本轮 Electron 桌面验收，未机械套用。

## 修改文件

- `src/renderer/src/components/SettingsSheet.tsx`：风格选择值使用既有 `agentStyleTitle`；选项说明与状态流不变。
- `src/renderer/src/components/SkillManager.tsx`：分页方向键/Home/End、焦点与 tabindex；工具栏换行。
- `src/renderer/src/components/WikiSheet.tsx`：头部的可换行布局，保留现有按钮、文案与文件夹选择能力。
- `src/renderer/src/components/timeline/RunDiagnostics.tsx`：展开运行/错误详情时，三项长文案操作在窄列内换行，防止横向溢出。
- `src/renderer/src/components/ui/sheet.tsx`：共享标题区避让、说明字号/行高、短过渡。保留 Radix 焦点圈定、Escape、overlay 机制。

两份既有 gitignored 本地测试的证据输出路径仅改到 `new5/ui-ux-validation-20261104/regression/`，防止本轮运行覆盖 new4 历史证据；测试逻辑未改变，测试文件不提交。

## 验证结果

- `npm run ci`：最终完整门禁通过，包含 ESLint、345 项安全边界检查、Node/Web 类型检查、Main/Preload/Renderer 构建。[最终 CI 日志](ui-ux-validation-20261104/ci.log)。
- 首次 `npm run test:local`：493 通过、12 失败、14 跳过。失败来自测试共享临时父目录 `os.tmpdir()/opencode` 不存在（ENOENT），并伴随失败后的清理钩子错误。补齐父目录后，第一批全量重跑 83 文件通过、9 文件跳过，505 项通过、14 项跳过，153.96 秒。[首次失败日志](ui-ux-validation-20261104/test-local-initial.log)、[第一批通过日志](ui-ux-validation-20261104/test-local-first-batch.log)。窄窗口导出按钮修复后最终全量再次通过：83 文件通过、9 文件跳过，505 项通过、14 项跳过，164.82 秒。[最终全量日志](ui-ux-validation-20261104/test-local.log)。
- 本地测试中的两份定向 Electron 回归也实际执行：终端菜单 32 项内部检查、聊天细节/导航 21 项内部检查；结果分别见 [终端操作](ui-ux-validation-20261104/regression/issue-actions-validation-20261104/results.json)、[聊天回归](ui-ux-validation-20261104/regression/chat-detail-polish-validation-20261103/results.json)。这些内部检查不另加到 Vitest 的 505 项计数。
- 两个主题的主/次文字 Token 在页面与面板背景上的对比度计算均超过 4.5:1：浅色次级文字最低 5.25:1，深色最低 6.64:1。[计算记录](ui-ux-validation-20261104/token-contrast.json)。这是基础 Token 的 WCAG sRGB 计算，不表示对所有透明叠加、禁用控件、图表或终端进行过完整对比度认证。
- 每次打开设置、MCP、Skills、知识库均通过真实鼠标输入，Escape 关闭；Skills 以 Electron 原生按键检查 Right/Left/Home/End 后焦点和 `aria-selected` 一致；Settings 的 Escape 恢复真实设置入口焦点。`prefers-reduced-motion` 用 Chromium media emulation 检查，Sheet transition 为 0s、animation 为 0.00001s，与现有全局规则一致。
- 截图中错误保留图标和“错误”文案，禁用安装日志按钮保持 disabled，空结果可读，长工具输出在独立消息滚动区展开。附件经真实 App 粘贴处理与隔离 Main 存储进入输入区；文件名会带存储生成前缀，这是当前既有行为，本轮未改附件协议。
- 最终主应用验收完成 42 张场景截图；六组原生布局中，1440 / 800 / 560 px 窗口的消息区 scrollWidth 分别等于 clientWidth（1196 / 570 / 330 px），正文底部与输入区顶部均为 542.5 px。修复后的 560 px 消息区从 378 px 收回到 330 px，无横向溢出。最终记录及原生布局断言见 [after-audit.json](ui-ux-validation-20261104/after-audit.json)，脚本遇到页面/消息横向溢出、正文覆盖输入区、焦点错误或减少动态效果异常即失败。早期验收脚本曾因嵌套引号及附件文件名精确匹配失败；属于夹具问题，修正后执行，不能计作产品失败或通过证据。

### 实际截图

| 场景 | 宣纸 | 夜墨 |
| --- | --- | --- |
| 1440 px 聊天/附件 | [浅色](ui-ux-validation-20261104/after-chat-light-1440.png) | [深色](ui-ux-validation-20261104/after-chat-dark-1440.png) |
| 800 px 聊天/附件 | [浅色](ui-ux-validation-20261104/after-chat-light-800.png) | [深色](ui-ux-validation-20261104/after-chat-dark-800.png) |
| 560 px 展开错误详情 | [浅色](ui-ux-validation-20261104/after-details-light-560.png) | [深色](ui-ux-validation-20261104/after-details-dark-560.png) |
| 560 px 展开工具详情 | [浅色](ui-ux-validation-20261104/after-tools-light-560.png) | [深色](ui-ux-validation-20261104/after-tools-dark-560.png) |
| 560 px 设置 | [浅色](ui-ux-validation-20261104/after-settings-light-560.png) | [深色](ui-ux-validation-20261104/after-settings-dark-560.png) |
| 560 px Skills | [浅色](ui-ux-validation-20261104/after-skills-light-560.png) | [深色](ui-ux-validation-20261104/after-skills-dark-560.png) |
| 560 px MCP | [浅色](ui-ux-validation-20261104/after-mcp-light-560.png) | [深色](ui-ux-validation-20261104/after-mcp-dark-560.png) |
| 800 px 知识库 | [浅色](ui-ux-validation-20261104/after-wiki-light-800.png) | [深色](ui-ux-validation-20261104/after-wiki-dark-800.png) |

所有场景的 1440 / 800 / 560 px 原始截图均保存在同一目录，文件名直接包含主题及实际宽度。错误展开修复前的 [溢出截图](ui-ux-validation-20261104/overflow-before-fix.png) 保留用于比较。首次布局数据会如实显示 330 → 378 px 的溢出，不将其作为通过结果。

补充验收 12 张场景截图通过，页面及可见抽屉均无横向溢出。补充检查中英文的记忆中心、本地资料和 Skills，两个主题均在实际 560 px 窗口截图；见 [辅助页结果](ui-ux-validation-20261104/extra-results.json)。独立 Profile 没有配置模型，打开记忆中心会记录 `knowledge:memory-target` 的“请选择已启用的模型”错误；这是本轮保留的无模型环境限制，不代表记忆生成业务通过，未为此修改 Main。辅助截图首次曾截到抽屉过渡中间帧，保留在 `extra-initial/`；最终截图增加 compositor 等待后重新采集。

视觉审查：先检查全部场景的独立截图缩略总览（`review-{light|dark}-{1440|800|560}.png`），再放大核对设置选中值、知识库标题、Skills 说明及窄窗口导出/附件/工具详情。最终相关画面没有发现内容交叠、按钮文案裁切或输入区覆盖正文。主要业务状态仍由原组件呈现。

## 边界与限制

本轮没有修改 Agent、模型调用、SSH、MCP 业务逻辑、终端观察/执行权限、命令/文件审批、数据库结构或持久化协议；没有新增 IPC、Node 能力、Electron EGG、npm 依赖、主题或应用标识。没有提交 Git、push、创建或安装安装包。

真实窗口采用隔离数据与合成消息，不连接业务集群、不调用付费模型。UI 截图不能代替原生 iTerm 自动化授权、真实供应商质量、VoiceOver 人工朗读或正式安装包验收。本轮不改变这些边界。未解决的低优先级项：本地资料页在英文应用语言下仍有既有中文固定文案（见 `extra-en-light-documents.png`），本轮没有扩大成整页本地化重写；记忆中心无模型时的提示也沿用 Main 既有中文错误。品牌、产品信息架构和核心交互均没有需要用户决定的变更。

### 跳过项的实际含义

本地默认门禁保留 14 项 opt-in 跳过，不能计入通过：真实视觉模型 1 项、原生 Dock 图标/最小化 2 项、额外 UI feedback 1 项、真实 bash readline 2 项、重型完整应用质量夹具 1 项、真实业务 SSH 连续性 1 项、真实 iTerm 1 项、Main/Preload/iTerm 集成 1 项、应用退出/窗口/SIGKILL 生命周期 3 项、主动建议真实链路 1 项。它们分别需要对应 `MOXUN_*_LIVE` 环境开关、原生环境或额外授权；混合测试文件中的 2 项 readline 跳过仍归在通过的测试文件内，因此是 9 个整文件跳过、14 个测试跳过。本轮没有为凑验收启用业务连接或付费模型。

复现最终主应用检查：将证据目录的 `electron-audit-runner.cjs.txt` 复制到临时 `.cjs` 文件，在仓库根目录用 `AUDIT_PHASE=after env -u ELECTRON_RUN_AS_NODE node_modules/.bin/electron <临时文件>` 启动。脚本只使用专属临时 Profile、合成历史及附件，不使用日常用户数据。此脚本中的调试器只在测试进程启用，用于减少动态效果检测，不进入生产代码或新增 IPC。
