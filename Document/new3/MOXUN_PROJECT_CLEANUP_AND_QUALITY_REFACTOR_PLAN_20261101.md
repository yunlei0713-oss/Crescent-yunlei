# 墨巡（MoXun）项目清理与质量收敛执行计划

> **交付对象：Codex**
>
> **项目路径：** `/Users/xusong.yu/Desktop/Crescent-test`
>
> **计划位置：** `Document/new3/MOXUN_PROJECT_CLEANUP_AND_QUALITY_REFACTOR_PLAN_20261101.md`
>
> **计划日期：** 2026-11-01
>
> **本轮性质：** 现有能力优化、历史代码清理、架构收敛、UI/交互打磨、工程目录治理。
>
> **重要约束：** 本轮不以新增功能为目标，不推翻现有产品方向，不进行大爆炸式重写。优先删除已经确认失效的旧实现和重复实现，让当前项目保持简洁、清晰、可维护。

---

## 0. 执行目标与最终结果

本轮不是普通 UI 美化，也不是单纯拆分几个大文件，而是对墨巡做一次有边界的工程清理和产品质量收敛。

最终希望达到：

1. 当前产品只保留一套清晰、真实、可维护的架构，不再让旧架构、旧组件、旧说明和新实现并存造成误导。
2. 彻底核查已废弃模块、重复实现、失效样式、无用导入、废弃类型、过时 IPC、过时配置和未使用依赖；确认无引用后再删除。
3. 将 App、Terminal IPC、Settings 等大模块按职责渐进式整理，明确状态所有权，避免继续堆积。
4. UI 保持现有墨巡水墨品牌和聊天优先布局，重点改善弹窗、菜单、连接操作、说明密度、键盘操作和视觉一致性。
5. 清理项目目录中的过期计划、历史报告和构建垃圾，保留必要文档、品牌源文件、可复用实验和用户仍需要的交付产物。
6. 修正文档与代码不一致的问题，尤其是 Agent 终端执行权限、iTerm 工作方式、MCP/OpenAPI 能力和旧 xterm 架构描述。
7. 保持安全边界和当前功能不退化，所有删除和重构都有测试与验收证据。

**最终判断标准不是删除了多少行代码，而是：没有失效实现、没有重复职责、没有误导性文档、没有不必要的构建垃圾，且现有功能和安全策略全部正常。**

## 1. 当前项目基线与必须保护的工作区

以下是本次只读盘点时看到的状态。Codex 开始执行时必须重新检查，因为工作区可能继续变化。

### 1.1 Git 工作区状态

盘点时 `git status --short --untracked-files=all` 约为：

| 状态 | 数量 | 说明 |
|---|---:|---|
| 已删除（D） | 33 | 当前工作区已删除、但 Git 仍跟踪的旧文件 |
| 已修改（M） | 101 | 当前已有修改，不能覆盖 |
| 未跟踪（??） | 170 | 当前新增文件和资源，不能误删 |

这些变更涉及 Agent 安全边界、Pi runtime、终端生命周期、主题、品牌图标、Preload、Renderer、文档及资源等，不是可以随意清理的临时垃圾。

**硬性要求：**

- 不执行 `git reset --hard`、`git checkout -- .`、`git restore .`、`git clean -fd`、`git stash` 等可能破坏用户现有修改的命令。
- 不为了得到干净的 Git 状态而恢复已删除文件。
- 不覆盖、重建或批量格式化当前未提交文件。
- 不擅自提交、推送或发布。
- 每阶段开始和结束都保存 `git status --short` 与 `git diff --stat`，核对本轮新增变更。
- 对当前已有的 33 项删除，先理解其用途和调用关系。它们已经是当前工作区的一部分，不能再当作 Codex 本轮新发现的垃圾重复处理。

当前工作区已删除的旧实现大致包括：

- 旧命令目录：`src/main/command-directory.ts`、`src/preload/modules/commands.ts`、`src/shared/command-directory.ts`。
- 旧工作区布局：`src/main/workbench-layout-ipc.ts`、`src/shared/workbench-layout.ts`、`src/renderer/src/hooks/useWorkbenchLayout.ts`。
- 旧内嵌终端和面板：`TerminalPane.tsx`、`TerminalTabBar.tsx`、`SubterminalPanel.tsx`、`TerminalIdentity.tsx`、`TerminalLockOverlay.tsx`、`useXtermLifecycle.ts`、`pipe-terminal.ts` 及相关 xterm helper。
- 旧 Agent/命令审批 UI：`AgentPanel.tsx`、`ChangePlanReview.tsx`、`CommandDirectorySheet.tsx`、`ExecutionTargetChip.tsx`、`HandoffDialog.tsx` 等。
- 旧 Crescent 品牌图：`crescent-logo`、`crescent-mark` 和旧 build icon。

以上路径只代表当前工作区已经删除的文件，不代表可以直接删除所有同名类型或相关基础能力。必须检查残余引用，并保留仍被新架构使用的通用能力。

### 1.2 目录体积与产物现状

盘点时看到：

| 路径 | 约占用空间 | 当前属性 | 处理原则 |
|---|---:|---|---|
| `dist/` | 17GB | 被 Git 忽略的历史构建/打包产物 | 重点治理，先盘点、校验、保留当前交付，再清理过期产物 |
| `out/` | 671MB | 编译输出 | 可重建，但打包期间必须冻结 |
| `node_modules/` | 依赖目录 | 被 Git 忽略 | 不纳入源码仓库，不为“目录干净”而盲目删除 |
| `experiments/` | 263MB | Git 跟踪的实验源码 | 保留实验源码和必要锁文件，只清理确认无用的实验构建缓存 |
| `Document/new/brand/archive/` | 4.3MB | 品牌历史归档 | 保留，不是垃圾目录 |
| `.eslintcache`、`.DS_Store` | 小 | 本机缓存/元数据 | 可按忽略规则清理，不影响源码 |

当前 `dist/` 包含多个历史目录，例如 `local-20261001`、`local-20261005`、`local-20261010`、`local-20261011-evolution`、`local-20261023`、`local-macos`、`moxun-20261030`、`moxun-20261101`。不能直接把整个 `dist/` 删除。

当前 `experiments/agent-runtime` 是单独隔离的 Agent Runtime 实验目录，已在架构文档中说明其不进入产品依赖和打包。**不能因为它体积较大就删除整个 experiments。**

### 1.3 当前目录中的重要文件

以下文件不能仅凭名字判断为废弃：

- `plan.json`：内容更新时间为 2026-07-31，仍描述旧 TerminalPane/AgentPanel 规划，当前仓库搜索只看到文件自身的检查描述，没有发现运行时代码引用。列为“历史规划归档候选”，仍需检查外部 Codex/IDE 工作流是否依赖。
- `dev-app-update.yml`：Updater 开发配置，`electron-builder.yml` 明确将它排除在发行包之外。不要误删。
- `scripts/patch-electron-dock-icon.cjs`：开发 Electron 原生 Bundle 图标准备脚本，不能因为它不属于产品功能而删除。
- `scripts/prepare-development-icons.cjs`、`scripts/prepare-macos-native.cjs`、`scripts/generate-icons.cjs`：构建/开发流程脚本，需按调用关系保留。
- `Document/new/brand/`：正式品牌母版、图标、主题和旧品牌归档。保留正式母版及归档，不允许恢复旧 Crescent 图标到活跃构建路径。
- `Document/new1/`、`Document/new2/`：之前的专项计划和实施报告，保留。
- `Document/new3/`：本计划所在目录，后续报告也放这里，不要把它合并或覆盖到其他目录。
- `website/`：独立文档站点，保留其源码、依赖锁文件和内容；需要与产品事实同步，不是可删除的构建垃圾。

## 2. 产品方向与不可破坏的安全不变量

当前墨巡已经从旧的“Agent 在内嵌终端中执行命令”方向转为“聊天优先 + 外部 iTerm 人工操作 + 可选观察协作”。

本轮必须以当前安全模型为准，不能按照旧 README、旧计划或历史实现恢复旧能力。

### 2.1 Agent 终端能力

- Agent 永久没有终端命令执行能力。
- Agent 不得向 PTY、iTerm、SSH shell 或其他终端写入命令。
- Agent 不得代替用户按回车、发送控制字符或中断用户命令。
- 不得通过 bash、MCP、Subagent、IPC、恢复流程、旧兼容 API 或其他旁路恢复终端执行能力。
- 用户本人仍可以在本地终端和 SSH 终端中正常输入、执行命令。
- Agent 可以在权限允许时读取经过授权、脱敏、有限时长的终端观察证据，并据此分析和给出建议。
- 观察授权默认关闭，开启必须经过 Main 层原生确认；暂停、撤销、身份变化和会话切换必须正确停止采样和清理证据。

### 2.2 本地文件修改审批

- 本地文件可以修改，但必须经过用户明确批准。
- Main 是文件写入和审批的权威边界。
- 必须保留完整 Diff、逐文件审批、一次性授权、内容摘要/时效校验、写后验证和拒绝后的无变更行为。
- 不得为了简化 Agent 工具或删除旧模块而绕过审批。

### 2.3 Electron 进程边界

- Main 持有 OS、SSH、文件、数据、密钥和终端生命周期能力。
- Preload 只暴露类型明确、范围受限的 IPC。
- Renderer 不直接访问 Node、文件系统或 Electron 特权 API。
- Shared 不反向依赖 Renderer。
- 不得将安全逻辑仅放在 UI、提示词或模型工具描述中。

### 2.4 产品体验

- 保留墨巡品牌图标、现有水墨主题和当前聊天优先布局。
- iTerm 是用户实际操作终端的外部界面，不重新引入内嵌 xterm 主工作区。
- 保留当前连接卡片连接集群、独立打开外置终端不连接、按轮选择 AI 是否观察等已建立的操作模型。
- 不增加新的一级导航、复杂面板、重复卡片、营销装饰或大型功能模块。
- 桌宠遮挡问题已解决，本轮不修改桌宠布局、行为、资源和动画。

---

## 3. 阶段 A：建立基线与依赖关系清单（必须先做）

### A1. 固化当前状态

执行并保存：

```bash
git status --short --untracked-files=all
git diff --stat
git diff --check
git branch --show-current
```

不要执行任何会改变工作区的 Git 清理命令。

将当前变更分为：

1. 用户已有修改；
2. 用户已有删除；
3. 用户已有新增；
4. Codex 本轮新增修改；
5. 本轮新建文档。

最终报告必须能区分这些类别。

### A2. 建立当前真实文件清单

分别盘点：

- `src/main/`
- `src/preload/`
- `src/renderer/src/`
- `src/shared/`
- `scripts/`
- `build/`
- `resources/`
- `Document/`
- `website/docs/`
- `experiments/`

生成文件清单时排除 `node_modules`、`.git`、`dist`、`out` 等大目录；这些目录单独统计。

### A3. 建立“删除前引用检查表”

对每个疑似废弃文件/目录，至少检查：

1. 静态 import/export；
2. 动态 import、require、glob、lazy import；
3. IPC channel 名称及 Main/Preload/Renderer 三端调用；
4. 配置文件、构建脚本、electron-builder 打包白名单；
5. 测试、浏览器测试、测试夹具；
6. 数据库迁移、历史配置兼容和用户数据读取；
7. 插件、Skill、MCP、Updater 等运行时动态发现；
8. 文档链接和外部脚本调用；
9. 运行时资源路径、Worker、WASM、native prebuild。

建立表格：

| 候选路径 | 当前是否存在 | 引用方 | 动态引用 | 配置/构建引用 | 测试覆盖 | 处理结论 |
|---|---|---|---|---|---|---|

结论只能是：

- **保留**：仍有实际用途；
- **重构后保留**：职责混杂，但仍被使用；
- **可删除**：已证明没有运行时、构建、迁移、测试或外部工作流依赖；
- **待确认**：存在动态引用或用途不明，不得删除。

**禁止仅因为“grep 没搜到 import”就删除模块。**

### A4. 建立基线测试

按当前项目规则执行：

```bash
npm run lint
npm run test
npm run typecheck
npm run build
npm run test:local
```

或执行 `npm run verify:local`，但要注意它已经包含 CI 和本地测试，不要重复累计测试数量。

测试失败时：

- 先记录失败命令、日志和失败用例。
- 区分已有失败、环境问题和本轮回归。
- 不得删除断言、扩大跳过范围或降低安全检查。
- 不得将历史报告中的 352 passed 当作本轮基线；必须在当前代码状态重新运行。

**阶段 A 交付：** 基线记录、当前文件清单、删除候选清单、依赖关系检查表、基线测试结果。

---

## 4. 阶段 B：旧代码、模块残留和重复实现清理

这是本轮核心工作之一，但必须分批实施。

### B1. 处理已经删除的旧架构模块

当前工作区已经删除了旧内嵌终端、旧工作区布局和旧命令目录模块。Codex 不要恢复它们。

需要完成：

1. 扫描当前源码中是否仍有旧模块路径引用。
2. 扫描文档、注释、测试夹具、构建配置中的旧路径。
3. 检查是否仍有旧 IPC channel、旧 preload API、旧类型或旧配置字段。
4. 检查旧的 terminal tab、xterm、workbench layout 状态是否仍被序列化到用户数据。
5. 如果存在历史数据迁移需求，保留迁移读取逻辑；不能因 UI 删除而直接删除用户数据兼容代码。
6. 清理失效的 import、类型、翻译 key、CSS selector、图标引用和测试 fixture。
7. 删除已无引用的旧代码后，运行安全边界测试、类型检查和构建。

特别检查的旧路径包括：

```text
src/main/command-directory.ts
src/main/workbench-layout-ipc.ts
src/preload/modules/commands.ts
src/shared/command-directory.ts
src/shared/workbench-layout.ts

src/renderer/src/components/AgentPanel.tsx
src/renderer/src/components/TerminalPane.tsx
src/renderer/src/components/TerminalTabBar.tsx
src/renderer/src/components/SubterminalPanel.tsx
src/renderer/src/components/TerminalIdentity.tsx
src/renderer/src/components/TerminalLockOverlay.tsx
src/renderer/src/components/CommandDirectorySheet.tsx
src/renderer/src/components/ChangePlanReview.tsx
src/renderer/src/components/ExecutionTargetChip.tsx
src/renderer/src/components/HandoffDialog.tsx

src/renderer/src/hooks/useHandoff.ts
src/renderer/src/hooks/useTerminalSessions.ts
src/renderer/src/hooks/useTerminalOutputRing.ts
src/renderer/src/hooks/useWorkbenchLayout.ts
src/renderer/src/hooks/useXtermLifecycle.ts

src/renderer/src/lib/design-system.ts
src/renderer/src/lib/ensure-local-terminal.ts
src/renderer/src/lib/pipe-terminal.ts
src/renderer/src/lib/terminal-lock.ts
src/renderer/src/lib/xterm-hydrate.ts
src/renderer/src/lib/xterm-input-lock.ts
src/renderer/src/lib/xterm-scroll-follow.ts
```

以上路径当前已在工作区删除，列出它们是为了清理残余引用和文档，不是要求再次删除或恢复。

### B2. 特别审查 Agent 终端执行遗留代码

重点文件：

- `src/main/agent/pi-terminal-bash.ts`
- `src/main/agent/pi-host.ts`
- `src/main/agent/pi-host-policy.ts`
- `src/main/agent/pi-subagent.ts`
- `src/main/agent/pi-event-bridge.ts`
- `src/main/agent/pi-mcp-tools.ts`
- `src/main/terminal/`
- `src/main/security/`
- `scripts/check-security-boundaries.cjs`

处理步骤：

1. 画出主 Agent、Subagent、MCP、IPC、PTY、人工 iTerm 的真实调用关系。
2. 区分 Agent 执行路径、人工终端路径、观察证据路径、文件审批路径。
3. 删除已禁用 Agent 终端执行能力的旧注册、旧工具 schema、旧提示词、旧 UI 和旧配置残留。
4. 检查旧执行 API 是否还保留 fail-closed compatibility trap；如有直接调用，必须明确拒绝，而不是悄悄恢复执行。
5. 清理只为旧执行 UI 服务且不再被使用的状态和翻译。
6. 保留人工终端写入、PTY 生命周期、SSH 登录、观察授权和审批所需的基础能力。

**特别注意：** `pi-terminal-bash.ts` 中仍可能存在被文件审批、观察、捕获和子任务上下文使用的 `PtyBashExecContext` 等共享上下文。不能按文件名或旧功能名称直接删除。先检查调用方；可以拆分、改名或缩小职责，但不得误删仍被使用的安全上下文。

### B3. 清理重复逻辑和重复组件

优先检查：

- 连接创建、连接重试、登录动作、连接状态；
- Agent Run 状态、错误呈现、Timeline 步骤；
- 历史会话恢复与 Session 持久化；
- 主题读取、主题订阅和图表主题刷新；
- Markdown 渲染、代码块复制、表格处理；
- 错误文案与中英文映射；
- 弹窗 Escape/遮罩/焦点处理；
- 菜单点击外部关闭、键盘导航；
- 文件选择、附件预检、文件类型校验；
- 终端观察授权状态轮询与生命周期清理。

执行规则：

- 找到真正重复的职责，而不是仅仅长得相似的 JSX。
- 抽取共享逻辑时必须有明确输入、输出和状态 owner。
- 不能为减少重复而建立巨型万能组件或万能 Hook。
- 不要为每个几十行的 JSX 都创建一个单独文件。
- 合并后删除旧实现和旧导出，避免新旧两套代码长期共存。

### B4. CSS、导入和资源清理

当前已确认的清理线索：

1. `src/renderer/src/App.tsx` 的 `FileChangeReview` import 位于文件末尾、`export default App` 之后，应移到顶部正常 import 区域。
2. `src/renderer/src/assets/main.css` 中 `.app-titlebar .app-commandbar` 位于窄窗口媒体查询内，但当前 `app-commandbar` 实际挂在底部 `AppUtilityToolbar`，不再是 titlebar 子元素。确认无其他匹配 DOM 后删除这个失效嵌套规则。
3. 保留 `.app-commandbar` 的通用按钮样式，不要因为删除失效嵌套规则而删除仍在使用的基础样式。
4. 检查旧 Crescent 图标在活跃资源、构建脚本、网站 favicon 和默认窗口图标中的残留；正式品牌源文件和 `Document/new/brand/archive/` 中的历史归档必须保留。
5. 检查未使用的 CSS class、重复 token、重复媒体查询、失效 keyframes、无引用 SVG/PNG。
6. 清理无用 import、未使用导出、未使用类型、死分支和过时注释。
7. 检查中英文 i18n 中已无对应 UI 的旧 key；只有在确认无动态 key 和测试依赖后才能删除。

不要执行全项目自动 CSS 重写或全仓库 Prettier 格式化；只改本轮涉及的文件，避免产生大规模无关 diff。

### B5. 脚本和构建配置清理

检查 `scripts/` 中每个脚本的调用方：

- package.json scripts；
- package lifecycle hooks；
- electron-builder hooks；
- GitHub Actions；
- 本地开发文档；
- release/packaging 脚本。

重点确认：

- `patch-electron-dock-icon.cjs` 是否仍被开发图标准备脚本调用；
- `prepare-development-icons.cjs` 是否仍被 predev/prestart/postinstall 调用；
- `prepare-macos-native.cjs` 是否仍被 electron-builder afterPack 调用；
- `generate-icons.cjs` 是否仍被构建入口调用；
- `restore-local-tests.sh` 是否仍是本地测试恢复流程的一部分；
- `run-agent-runtime-experiments.cjs` 是否仍服务于独立实验目录。

没有调用方的脚本先检查是否由外部手动使用。只有确认无人使用且无文档/CI 引用，才能删除。

**阶段 B 交付：** 旧模块引用清单、删除/保留清单、死代码清理记录、CSS/资源清理记录、相关测试结果。

---

## 5. 阶段 C：项目目录和历史文档治理

目标是让根目录、Document 和源码目录都容易理解，不能只把文件从一个目录搬到另一个目录制造“整洁假象”。

### C1. 根目录规范

根目录只保留：

- 应用源码目录：`src/`；
- 构建资源：`build/`、`resources/`；
- 产品文档：`Document/`；
- 网站文档：`website/`；
- 必要脚本：`scripts/`；
- 实验源码：`experiments/`；
- Git/IDE/构建配置；
- README、CHANGELOG、ROADMAP、SECURITY 等项目入口文档；
- package.json 与锁文件。

不应把临时日志、截图、测试输出、手工备份、下载包和临时脚本散落在根目录。

根目录现有 `plan.json` 是旧计划候选：

- 当前更新时间 2026-07-31；
- 内容仍把 TerminalPane、AgentPanel 当作待完成架构任务；
- 当前仓库文本搜索未发现产品代码或构建脚本依赖它。
- 先检查 Cursor/Codex 规则、外部工作流和文档引用；如果确认仅为历史计划，将其移动到 `Document/archive/plan-legacy-202607.json`，不要直接销毁历史记录。
- 如果仍有自动化消费它，则保留并更新格式/内容，不能擅自移动。

### C2. Document 文档分层

建议最终结构：

```text
Document/
├── ARCHITECTURE.md             # 当前架构事实
├── SECURITY_MODEL.md           # 当前安全模型
├── UI_DESIGN_SYSTEM.md         # 当前 UI/交互规范
├── EXTERNAL_TERMINALS.md       # 当前外部终端工作方式
├── DEVELOPMENT.md              # 开发与构建规范
├── TESTING.md                  # 测试规则
├── RELEASE_OPERATIONS.md       # 发布操作
├── CODE_SIGNING.md              # 签名/公证
├── EXECUTION_PLANS.md           # 当前有效执行约定
├── INDEX.md                     # 文档导航（如确有需要则新增）
├── new/                         # 品牌母版和既有项目材料，保留
├── new1/                        # 之前的专项计划/报告，保留
├── new2/                        # 上一轮收尾计划/报告，保留
├── new3/                        # 本轮计划与本轮实施报告
└── archive/                     # 已完成/被新版本替代的历史材料
```

执行要求：

1. 当前有效规范文档继续放在 Document 根目录，避免开发者找不到。
2. `new`、`new1`、`new2`、`new3` 是用户已明确建立的工作目录，不合并、不重命名、不删除。
3. `Document/new/brand/` 是正式品牌资料目录，保留母版、正式图标、主题规格和 archive。
4. `fix-v1.md` 至 `fix-v5.md`、旧版本专项计划和旧实施记录属于历史资料候选。先检查是否被其他 Markdown、README、网站或脚本引用，再移动到 `Document/archive/`，保留原文件内容和日期。
5. 旧报告不得直接删除。归档时保持文件名可识别，必要时在旧位置留一个简短链接说明，但不要同时保留两份大段重复正文。
6. `new1` 和 `new2` 是最近的专项设计/验收证据，不应因为“历史”而归档。
7. 新建 `Document/INDEX.md` 时只列出当前规范和历史归档入口，不要复制其他文档正文。
8. 每次移动 Markdown 文件后更新相对链接，并用脚本检查不存在的本地链接。

### C3. 修复架构文档（高优先级）

当前 `Document/ARCHITECTURE.md` 明显落后于实现，仍然描述：

- Agent 与内嵌 xterm 绑定；
- TerminalAgentCore / AgentToolRuntime 旧运行时名称；
- Agent 命令审批和直接终端执行；
- TerminalPane、AgentPanel、useXtermLifecycle、pipe-terminal 等已经移除的模块；
- 旧的 renderer state machine 和文件路径。

必须以当前真实代码重写，而不是简单删除旧段落。

新的架构文档至少覆盖：

1. Electron Main / Preload / Renderer / Shared 的职责和依赖方向。
2. Pi Agent runtime 的实际加载和 Main 端工具 allowlist。
3. Agent 终端执行永久禁止的安全边界。
4. 用户手动操作 iTerm 的连接方式。
5. iTerm 观察授权、证据缓存、暂停/撤销和身份绑定。
6. 本地文件读取、代码索引、文件修改审批和写后验证。
7. SSH Connection 配置、连接状态和 Session 生命周期。
8. SQLite、历史会话、知识、Memory、Skill、项目数据的存储边界。
9. Renderer 当前实际页面和组件结构。
10. 打包资源、Worker、WASM、native modules 和实验目录的边界。

文档必须引用真实存在的文件路径。写入后逐条检查路径存在性，禁止保留已经删除的路径。

### C4. 修正文档中的产品事实冲突

当前 `README.md` 存在严重过时描述：

- 声称 Agent 可以在可见终端执行命令；
- 声称产品包含集成的本地 xterm 终端；
- 声称 Agent 具备 read/write/edit/bash/open_subterminal 工具；
- 声称命令审批后可由 Agent 执行；
- 对 MCP/OpenAPI 能力的描述与当前 Security Model 不一致。

这与当前 `Document/SECURITY_MODEL.md` 冲突，必须修复。

同步检查：

- `README.md`
- `README.zh-CN.md`
- `website/docs/` 中的中英文页面
- `ROADMAP.md`
- `CHANGELOG.md`
- `Document/ARCHITECTURE.md`
- `Document/EXTERNAL_TERMINALS.md`
- `Document/SECURITY_MODEL.md`
- `Document/DEVELOPMENT.md`
- `Document/TESTING.md`
- `Document/RELEASE_OPERATIONS.md`

修订原则：

- 以当前代码和 Security Model 为准。
- 明确 Agent 只做分析、读取允许范围内的资料、给出建议；用户本人在 iTerm 执行命令。
- 明确终端观察是可选授权，不等于 Agent 获得输入权限。
- 明确本地文件修改需要用户批准。
- 明确 MCP 当前实际允许的工具范围，不能把配置入口等同于已经开放执行能力。
- OpenAPI 如果仅用于旧设置迁移，应明确为历史兼容，不写成当前 Agent 工具能力。
- 不要夸大未完成的平台支持、签名、公证和发布状态。
- README 的安装包架构说明必须与当前实际 Release workflow 和 Universal 交付规则一致。

### C5. 根目录配置文件的保留判断

- `dev-app-update.yml`：保留，除非证明 updater 开发流程完全不再需要。
- `plan.json`：确认无外部消费者后归档，不直接删除。
- `experiments/agent-runtime/`：保留实验源码、独立 package/lockfile、评估记录；只清理其内部确认可重建的缓存和输出。
- `website/`：保留。
- `build/`、`resources/`：保留当前正式图标和构建资源。
- `Document/new/brand/archive/`：保留历史品牌资产，不得复制回活跃资源目录。
- `node_modules/`：属于本机依赖目录，不纳入 Git；不需要为了目录视觉整洁而删除。
- `out/`：属于编译输出，确认无构建/打包进程后才可重建。
- `dist/`：按下一节单独治理。

---

## 6. 阶段 D：dist/out 和生成文件清理

本阶段可能释放大量磁盘空间，但必须保护用户实际需要的安装包和验收证据。

### D1. dist 产物盘点

执行：

```bash
du -sh dist
find dist -maxdepth 3 -type f -print
find dist -maxdepth 2 -type d -print
```

为每个目录生成清单：

| 目录 | 创建时间/版本 | 是否含 app | 是否含 DMG/ZIP | SHA-256 | 是否仍需要 | 结论 |
|---|---|---|---|---|---|---|

必须识别：

- 当前最新的 `dist/moxun-20261101/`；
- 历史 `moxun-20261030`；
- 之前的 `local-*`；
- `local-macos`；
- 用户可能仍需要的历史安装包、截图和验收记录。

### D2. dist 清理规则

默认策略：

1. 当前最新交付目录 `dist/moxun-20261101/` 暂时保留。
2. 对所有历史目录先生成 SHA-256 清单和文件清单。
3. 已确认过期、可重新生成、没有用户交付价值的历史构建输出，可以列入清理。
4. 有验收报告引用、用户明确要求保留或无法判断用途的产物，先保留。
5. 不允许 `rm -rf dist`。
6. 不允许删除整个 `dist/local-macos` 或其他目录而不检查内部内容。
7. 清理前再次确认没有 electron-builder、npm build 或打包任务正在运行。
8. 如果无法确认历史产物是否仍需要，先报告给用户，不要擅自删除。

完成后记录释放空间和保留目录。

### D3. out 清理规则

- `out/` 是编译产物，不能作为源码。
- 确认无打包进程后可删除并通过 `npm run build` 重新生成。
- 打包期间必须冻结 `out/`，不能让另一个 build 同时覆盖。
- `out/implementation/`、旧日志和调试文件先确认不被脚本或验收流程引用，再清理。
- 重新构建后检查 Main、Preload、Renderer 输出和 lazy chunks 完整。

### D4. 缓存与临时文件

可以清理：

- `.eslintcache`；
- 根目录及文档目录中的无用 `.DS_Store`；
- 已确认无引用的临时日志、截图和调试输出；
- 实验目录中可重建的 cache、coverage、临时 bundle。

不得清理：

- package-lock；
- 实验源码；
- 正式品牌母版；
- 用户需要的截图和验收证据；
- 用户数据目录；
- 任何不属于本项目、但被放在本机目录中的文件。

**阶段 D 交付：** dist/out 清单、保留/删除决定、删除前 SHA-256 记录、磁盘空间变化、重新构建结果。

---

## 7. 阶段 E：核心架构渐进式整理

本阶段不以文件大小为唯一目标。每次只处理一个职责，完成测试后再继续。

### E1. App.tsx

当前审查时约 4,570 行，是 Renderer 最值得继续治理的文件。

目标：让 App 主要负责顶层组装和协调，不再承载过多具体业务流程。

优先拆分：

1. 会话生命周期协调：创建、切换、关闭、恢复、激活。
2. SSH 连接工作流：连接选择、连接尝试、重试、登录动作、失败恢复。
3. Agent Run 协调：运行状态、停止、取消、事件桥接和当前会话绑定。
4. 弹窗/Sheet 状态：保持集中、明确的 modal owner。
5. 页面装配：App 只组合 Sidebar、ChatWorkspace、必要的全局 Dialog/Sheet。

执行方式：

- 先识别当前已有 Hook 是否已经负责该状态。
- 避免重复创建新的 Hook。
- 先明确状态唯一 owner，再提取代码。
- 不要把几十个 setter/ref 原样传入新模块。
- 不要创建新的全局 Store，除非已有状态模型无法合理承担。
- 每次只迁移一个流程，并保留原有事件时序和竞态保护。
- 不允许为了减少 App 行数而把业务逻辑移入新的 2000 行 hook。

### E2. terminal/ipc.ts

当前审查时约 3,010 行，IPC 注册和终端流程集中度偏高。

按职责评估拆分：

- Session IPC：创建、关闭、恢复、状态和 resize。
- External Terminal IPC：iTerm 列表、连接、聚焦和 handoff。
- Observation IPC：授权、状态、暂停、撤销和证据生命周期。
- Command/PTY IPC：人工输入、粘贴、interrupt、临时子终端等实际保留能力。

拆分要求：

1. 先明确 session Map、connection state、observation grant、command controller 等共享状态的唯一 owner。
2. 通过显式依赖注入或受控 service 传递，不要创建循环 import。
3. `registerTerminalIpc()` 保留为集中注册入口，方便检查全部 IPC 暴露面。
4. 不改变 IPC channel 名称和 payload，除非有明确迁移计划。
5. 每个 IPC handler 继续执行 sender/frame、tab/session owner、payload 和能力校验。
6. 任何拆分都不能绕过 Agent 来源识别和 Main 层拒绝策略。

### E3. 其他大模块

审查时较大的文件还包括：

| 文件 | 审查时约行数 | 处理方向 |
|---|---:|---|
| `src/main/crescent-sqlite.ts` | 1,338 | 检查 schema/migration/query/transaction 是否混杂 |
| `src/main/agent/skills.ts` | 1,314 | 检查 Skill 发现、导入、安装、验证、存储职责 |
| `src/renderer/src/components/SettingsSheet.tsx` | 983 | 按设置领域拆分编辑器和表单 |
| `src/renderer/src/components/ChatWorkspace.tsx` | 约 700 | 检查消息区、Composer、附件菜单职责 |
| `src/renderer/src/assets/main.css` | 约 1,000 | 整理失效选择器、重复规则和组件样式边界 |

这些数字是审查时的快照，执行时重新统计。

拆分原则：

- 只拆真实的业务边界，不按行数平均拆文件。
- 保持数据访问层、领域逻辑层和 UI 层边界清晰。
- 数据库 schema、迁移、事务和历史兼容逻辑必须有明确 owner。
- Skill 安装涉及文件系统和外部来源，安全校验必须留在 Main。
- SettingsSheet 按 Provider、Agent、终端、Skill、MCP、知识等现有领域拆分，不增加新的设置项。
- ChatWorkspace 的状态由当前上层 Controller/Tab owner 管理，子组件只接收必要 props/callbacks。
- 不为了组件拆分而引入新的状态管理依赖。

### E4. Renderer/Shared 依赖方向

检查并保持：

```text
Main
  ├── Shared
  └── Preload IPC implementation

Preload
  └── Shared types

Renderer
  ├── Preload typed clients
  └── Shared types/utilities

Shared
  └── 不依赖 Main / Preload / Renderer
```

禁止：

- Shared import Renderer；
- Renderer 直接 import Electron Main 实现；
- Renderer 通过 Node/fs/path 绕过 Preload；
- Preload 暴露通用 ipcRenderer 或任意 channel；
- Main 把安全决策交给 Renderer。

**阶段 E 交付：** 新的模块职责图、拆分前后行为对照、变更文件清单和定向测试结果。

---

## 8. 阶段 F：UI、视觉一致性与操作便利性优化

总体原则：保留当前主布局和品牌，重点修复不一致、冗余和操作成本。

### F1. 主工作区

保留：

- 左侧导航；
- 中间 Chat-first 工作区；
- 固定 Composer；
- 外部 iTerm；
- 低频会话详情折叠；
- 现有墨巡浅/深水墨主题。

不做：

- 重新引入三栏工作台；
- 重新引入内嵌 xterm；
- 增加新的一级导航；
- 新增大型 Dashboard；
- 新增装饰性统计卡片；
- 改造桌宠布局。

检查：

- 消息最大阅读宽度；
- 代码块/表格/长日志宽度；
- Composer 固定位置和高度；
- 会话标题与会话详情开关的层级；
- 低频信息是否仍默认折叠；
- 窄窗口下模型选择、附件和发送按钮是否溢出；
- 中英文文案是否造成不同高度或布局跳动。

### F2. ConnectionManagerModal

文件：`src/renderer/src/components/ConnectionManagerModal.tsx`

当前使用自定义 `role="dialog"` 结构，而项目已在其他弹窗使用 Radix Dialog。

优化：

1. 评估改用项目现有 Dialog 组件。
2. 补齐焦点陷阱、打开时焦点定位、关闭后焦点恢复。
3. Escape、遮罩点击、关闭按钮行为统一。
4. 键盘 Tab 不应跳出弹窗。
5. 保持当前连接列表、搜索、收藏、排序、编辑、导入和删除能力。
6. 不改变连接数据格式和保存语义。
7. 保持用户正在编辑的内容不因焦点/弹窗改造丢失。

### F3. ChatWorkspace 附件菜单

文件：`src/renderer/src/components/ChatWorkspace.tsx`

当前菜单有自定义外部点击关闭和 Escape 逻辑。

优化：

- 优先检查项目已有 DropdownMenu/Popover 组件。
- 若已有成熟组件，复用其键盘导航、焦点管理和关闭行为。
- 不要重复造菜单系统。
- 保留附件添加、路径引用、文件选择和权限提示。
- 不改变 Main 端文件授权、图片隐私确认和文件审批逻辑。
- 菜单按钮、菜单项有正确 aria-label 和快捷键焦点反馈。

### F4. ConnectionTerminalDialog 精简

文件：`src/renderer/src/components/ConnectionTerminalDialog.tsx`

当前 `ConnectionTerminalMode` 实际只有 `iterm` 一个选项，却仍以“选择终端”的形式呈现一个卡片。

建议：

- 将唯一的 iTerm 选项改成清晰的主操作按钮“打开 iTerm 并连接”。
- 保留连接目标信息。
- 保留 AI 协作模式选择。
- 保留连接中、错误和取消反馈。
- 不删除 `ExternalTerminalDialog` 中“新建共享 iTerm / 绑定已有 iTerm”这两种确实不同的接入路径。
- 不改变默认 AI 观察关闭的安全策略。

### F5. TerminalObservationChoice 说明密度

文件：`src/renderer/src/components/TerminalObservationChoice.tsx`

保留三个模式：

- 不参与（默认）；
- 从现在开始观察；
- 加入当前上下文并继续观察。

优化：

- 每个选项展示一句简短、可理解的说明。
- 将快照不完整、滚屏范围、退出码不可验证、授权前内容不回放等详细限制放到可展开说明。
- 不删安全告知，不模糊观察与命令执行的区别。
- 默认仍为 off。
- 观察开启仍必须经过 Main 原生确认。

### F6. 语言判断统一

当前部分组件通过翻译文案中是否含中文字符来推断语言，例如：

```typescript
/[\u3400-\u9fff]/.test(t.app.chat)
```

优化：

- 显式使用 `locale` 或统一的 locale helper。
- 禁止通过业务翻译文本推断语言。
- 统一错误、tooltip、aria-label、空状态、菜单项等中英文。
- 检查动态错误文本是否保留技术细节和本地化说明。
- 不在本轮重写整个 i18n 系统。

### F7. ProjectSidebar 激活请求

文件：`src/renderer/src/components/ProjectSidebar.tsx`

当前项目激活 effect 依赖 `opened` 与 `expanded`，展开/收起侧栏可能触发重新激活请求。

优化前先确认产品语义：

- 项目切换时是否必须重新 activate；
- 侧栏单纯展开是否需要重新 activate；
- 项目路径是否可能在侧栏折叠期间被外部修改；
- 当前是否已有 Main 注册表/ready 状态可避免重复请求。

如果只是展开侧栏造成无必要的重复请求，增加稳定的激活状态和幂等保护；如果重新验证是必要的，保留行为并记录理由。

### F8. 视觉一致性

只使用当前 `theme.css`、`main.css` 和 shared theme definitions 的既有设计体系。

统一检查：

- 标题、正文、说明文字字号；
- 控件高度、按钮尺寸、圆角；
- 列表行 hover/selected 状态；
- 弹窗 header/footer；
- 输入框和搜索框；
- 空状态、错误状态、加载状态；
- focus ring；
- 图标尺寸和视觉重量；
- 深浅主题对比度；
- reduced-motion；
- 1440p、1080p、窄窗口和窗口缩放。

禁止新增第三套主题、渐变色体系、霓虹装饰或大面积卡片。

**阶段 F 交付：** UI 前后截图、交互回归结果、键盘/焦点验收记录、中英文检查结果。

---

## 9. 阶段 G：依赖、构建和工程门禁治理

### G1. 清理重复构建检查

当前 `package.json`：

```json
"ci": "npm run lint && npm run test && npm run typecheck && npm run build",
"build": "npm run typecheck && electron-vite build"
```

`npm run ci` 会执行两次 typecheck。

建议改成：

```json
"ci": "npm run lint && npm run test && npm run build"
```

保留 `build` 自身的类型检查，避免重复运行。

修改后检查 GitHub Actions、pre-commit、verify:local、packaging scripts 的调用关系，保证类型检查没有被遗漏。

### G2. 测试门禁文档统一

当前规则：

- `AGENTS.md` 要求提交前运行 CI，并在本地测试存在时运行 `test:local`；
- `Document/TESTING.md` 说明本地单测 gitignored，不提交；
- `.githooks/pre-commit` 当前执行 `npm run ci`；
- `npm run ci` 不包含 `test:local`；
- `npm run verify:local` 已包含 CI + 本地测试。

这不一定是代码错误，但必须让自动门禁和人工门禁说法一致。

方案：

1. 明确 `npm run ci` 是 lint + 静态安全检查 + typecheck + build。
2. 明确 `npm run test:local` 是本地行为测试，测试文件按项目既有策略保持 gitignored。
3. 明确 pre-commit 是自动执行 CI，还是也执行本地单测。
4. 如果将本地测试加入 pre-commit，先测量耗时，避免每次提交不可接受。
5. 如果不加入，文档明确写“提交前必须人工运行”，不能声称 hook 自动执行。
6. `verify:local` 作为完整本地门禁，避免把它和单独步骤重复计算。

不要擅自修改“测试文件不提交”的现有项目策略；如果认为该策略需要改变，单独提出理由，不在本轮顺手调整。

### G3. 依赖清理

审查 `package.json` 和 `package-lock.json`：

- 生产 dependencies 是否有只在开发脚本中使用的依赖；
- devDependencies 是否有运行时代码实际需要的包；
- 是否存在已移除 UI/终端模块留下的包；
- Radix 单独包和 umbrella 包是否存在真实重复；
- Mermaid、PDF.js、Tree-sitter、Photon、XYFlow、MCP SDK、Pi、node-pty 等是否仍被代码/打包/Worker 使用；
- native 模块是否被正确打包；
- optional dependencies 是否真的可移除；
- 根项目和 website 的依赖锁是否分别完整。

执行：

1. 生成依赖使用清单。
2. 区分静态 import、动态 import、脚本 require、配置引用、构建时依赖、运行时依赖。
3. 检查 electron-builder asarUnpack、worker、WASM、native prebuilds。
4. 只有证明依赖无使用、无动态加载、无构建用途后才能卸载。
5. 每次删除一组依赖后执行 `npm install --package-lock-only` 或项目认可的锁文件更新方式，再执行 `npm ci` 验证。
6. 不升级大版本，不做顺手的依赖升级，不替换 Pi Agent。
7. 不允许通过删除 native 资源来缩小包体。

### G4. package scripts 清理

当前存在兼容性 alias，例如 Mac x64/arm64 命令最终也走 Universal 构建。

处理原则：

- 检查 README、Document、GitHub Actions、脚本和用户操作文档引用。
- 对仍被用户或 CI 使用的兼容命令，保留并注明 alias。
- 对确定无人使用的重复脚本，可以删除。
- 不删除当前正式 Mac Universal 交付入口。
- 不删除 updater、icon、native prebuild、security check 脚本。
- 不把 Windows/Linux 目标脚本仅因当前 Mac 开发重点而擅自删除；先确认项目实际支持范围和 CI 矩阵。

### G5. ESLint / TypeScript 规则

- 检查是否启用未使用变量、未使用 import、未使用参数检查。
- 可以在不制造大量历史告警的前提下加强新代码规则。
- 不允许通过关闭规则、增加全局 eslint-disable 来清理告警。
- 不要为了通过 lint 批量改动无关文件。
- 对确实需要保留的兼容入口写明用途。

**阶段 G 交付：** 依赖使用清单、package scripts 清单、锁文件变更说明、CI 和本地测试门禁说明。

---

## 10. 阶段 H：性能和生命周期检查

上一轮已经做过长会话优化，但历史报告显示首次打开 100/500 条消息场景不一定变快，因此本轮先测量，不直接引入虚拟列表。

### H1. 长会话性能基准

数据集至少包含：

- 100 条消息；
- 500 条消息；
- 1000 条消息；
- Markdown、代码块、表格、长日志、Timeline 混合内容。

记录：

- 首次打开会话耗时；
- 历史消息解析和渲染耗时；
- 流式更新耗时；
- 滚动最大帧间隔；
- DOM 节点数；
- Renderer heap；
- 切换会话后的内存变化；
- 多次展开/折叠 Timeline 的成本。

优化顺序：

1. 排查重复渲染；
2. 排查 Markdown 重复解析；
3. 排查无关状态更新；
4. 排查不必要的 callback/object 变化；
5. 排查滚动测量和 ResizeObserver；
6. 再决定是否需要分段渲染或虚拟列表。

如果普通列表在当前 1000 条消息范围内已经可接受，不增加虚拟列表依赖。

### H2. 终端和观察生命周期

检查：

- iTerm 绑定和解绑；
- Shared PTY 创建/关闭；
- 用户已有 iTerm session；
- 窗口关闭；
- Main 正常退出；
- Main 异常退出；
- Renderer 崩溃恢复；
- 观察授权开启/暂停/撤销；
- 终端重开后新 UUID；
- 连接切换和 tab 关闭。

验收：

- 只清理本轮测试创建的 PTY、Socket、iTerm UUID。
- 不关闭用户原有 iTerm 窗口。
- 不向用户原有终端发送退出、Ctrl+C 或其他输入。
- 不遗留本轮创建的 PTY、子进程和 Socket。
- 旧观察证据不能跨身份/会话复用。
- 退出和恢复流程不能恢复 Agent 终端执行能力。

### H3. 错误处理和日志

- 错误日志不泄漏 API key、密码、Token、SSH 私钥或敏感终端输出。
- Main/Renderer 错误区分可恢复和不可恢复状态。
- 同一个错误不应在 Timeline、结果卡片和 Toast 中无意义重复。
- 未知错误保留可复制技术详情。
- 终端观察和文件审批失败应说明原因，但不能泄露敏感内容。

---

## 11. 阶段 I：最终目录验收与清理报告

最终项目结构应达到以下原则：

### I1. 源码目录

```text
src/
├── main/
│   ├── agent/
│   ├── connections/
│   ├── memory/
│   ├── security/
│   ├── sqlite/
│   ├── storage/
│   ├── terminal/
│   └── update/
├── preload/
│   └── modules/
├── renderer/
│   └── src/
│       ├── assets/
│       ├── clients/
│       ├── components/
│       ├── hooks/
│       ├── i18n/
│       └── lib/
└── shared/
```

这是职责参考，不要求机械移动所有文件。当前已经存在的合理分层优先保留。

### I2. 根目录

- 不存在临时测试脚本、临时截图和手工日志。
- 不存在已确认废弃的旧配置。
- 不存在无说明的历史源码副本。
- 不存在重复的 package lock。
- 保留正式构建、网站文档和独立实验所需的文件。
- 构建输出和依赖缓存保持 Git 忽略，不进入提交。

### I3. Document

- 根目录只放当前有效的规范文档。
- 历史专项计划和旧报告有明确归档入口。
- new/new1/new2/new3 保留。
- new3 放本计划和本轮实施报告。
- 品牌母版、正式资源和历史品牌 archive 保留。
- 所有本地 Markdown 链接有效。

### I4. 资源和构建

- 活跃构建路径不再引用旧 Crescent 品牌图。
- 正式图标只从品牌母版生成。
- 没有无用的旧 xterm bundle、旧 worker 或失效资源引用。
- 不能为了减少文件而破坏 PDF worker、Mermaid、Tree-sitter、Pi WASM、node-pty、MCP 等实际运行资源。
- dist 只保留明确需要的历史交付物和当前产物。

---

## 12. 分阶段执行顺序与建议优先级

| 阶段 | 内容 | 优先级 | 是否允许删除文件 |
|---|---|---|---|
| A | 基线、Git 状态、引用关系、测试基线 | P0 | 否 |
| B1 | 旧模块残余引用和旧 IPC/类型清理 | P1 | 仅确认无用项 |
| B2 | Agent 终端执行遗留审查 | P0 | 仅确认无用项 |
| B3 | 重复逻辑、失效 CSS/import/资源 | P1 | 是，逐项核验 |
| C | 文档同步、历史文档归档、目录治理 | P1 | 归档优先 |
| D | dist/out/缓存治理 | P1 | 仅经过清单和校验 |
| E | App/Terminal IPC/Settings 职责拆分 | P2 | 以重构为主 |
| F | Dialog/Menu/连接选择/观察说明/UI 一致性 | P1 | 不删除功能 |
| G | 依赖、脚本、CI 门禁治理 | P2 | 仅确认无用项 |
| H | 长会话性能、终端生命周期和异常恢复 | P2 | 不盲目增加依赖 |
| I | 全量回归、目录验收、实施报告 | P0 | 仅清理已批准项 |

建议分多个 Codex 执行批次，不要一次性执行所有阶段。

推荐顺序：

1. A + B1：建立基线并清除旧架构残余引用；
2. B2 + B3：安全遗留代码和死代码清理；
3. C：文档与目录治理；
4. D：磁盘和构建产物治理；
5. F：UI 交互优化；
6. E：渐进式架构重构；
7. G + H：工程门禁和性能/生命周期验证；
8. I：全量验收。

如果某个阶段失败，停止推进后续依赖阶段，先修复和重新验收。

---

## 13. Codex 执行时必须遵守的约束

### 13.1 禁止事项

- 禁止大规模重写 App.tsx、terminal/ipc.ts 或 Agent runtime。
- 禁止恢复旧内嵌 xterm 工作区。
- 禁止恢复 Agent 终端执行、bash、PTY 写入、自动按回车或自动中断能力。
- 禁止通过 MCP、Subagent、IPC、恢复流程或其他旁路恢复终端执行。
- 禁止绕过本地文件修改审批。
- 禁止移除用户人工使用的 iTerm/SSH/PTY 能力。
- 禁止修改桌宠布局、资源和动画。
- 禁止重新设计墨巡品牌或新增主题体系。
- 禁止新增没有明确必要性的依赖。
- 禁止为了缩小包体而删除实际运行需要的 Worker、WASM、native 模块。
- 禁止删除用户数据、历史记录、正式品牌源文件和用户仍需要的打包产物。
- 禁止使用 `git clean`、`git reset`、`git restore` 清理工作区。
- 禁止自动 commit、push、release 或上传构建产物。

### 13.2 删除文件的必要条件

每个删除项必须满足：

1. 已检查所有静态和动态引用；
2. 已检查 IPC、Preload、构建和打包引用；
3. 已检查数据迁移和历史兼容；
4. 已检查测试、文档和外部脚本；
5. 已确认功能被新实现替代或彻底废弃；
6. 已运行相关测试；
7. 删除后没有遗留导入、类型、配置、CSS、i18n 和文档引用；
8. 删除记录进入实施报告。

如果其中任一项无法确认，标记“待确认”，保留文件，不要冒险删除。

### 13.3 每个阶段的交付格式

每个阶段完成后向用户汇报：

- 做了什么；
- 修改/新增/删除哪些文件；
- 哪些删除项经过了引用检查；
- 哪些代码被保留以及保留原因；
- 测试命令和结果；
- 是否影响现有未提交修改；
- 是否存在未解决问题；
- 是否允许进入下一阶段。

---

## 14. 最终验收标准

以下项目全部满足才算完成。

### 14.1 架构和代码清理

- [ ] 旧 TerminalPane/AgentPanel/xterm/workbench layout 的残余引用已处理。
- [ ] 不再有失效 import、export、类型、IPC、配置、翻译 key 和 CSS selector。
- [ ] 旧 Agent 执行工具、执行 UI 和相关兼容路径已清理或 fail-closed。
- [ ] 人工终端、PTY、SSH、iTerm 和观察链路完整保留。
- [ ] App.tsx 的业务职责比基线更清晰，状态 owner 明确。
- [ ] terminal/ipc.ts 的注册与业务职责边界明确。
- [ ] Settings/ChatWorkspace 没有为拆分而产生过度组件化。
- [ ] 无明显重复实现和无用途脚本。
- [ ] 无新增循环依赖和跨进程反向依赖。

### 14.2 UI 和操作

- [ ] ConnectionManagerModal 焦点管理、Escape、关闭后焦点恢复正常。
- [ ] 附件菜单键盘操作和焦点行为一致。
- [ ] 连接弹窗不再展示只有一个选项的伪选择器。
- [ ] AI 观察三种模式完整保留，默认 off，详细安全说明仍可访问。
- [ ] 项目侧栏无不必要的重复激活请求。
- [ ] 中英文文案、tooltip、aria-label 一致。
- [ ] 1440p、1080p、窄窗口和缩放场景没有明显布局问题。
- [ ] 现有水墨主题和品牌资源没有回归。
- [ ] 桌宠没有被修改。

### 14.3 安全

- [ ] 主 Agent 工具列表没有终端执行能力。
- [ ] Subagent 工具列表没有终端执行能力。
- [ ] Main 层拒绝 Agent 来源的 PTY/iTerm/SSH 写入和执行请求。
- [ ] MCP 和其他工具没有终端执行旁路。
- [ ] 用户人工终端输入、SSH 登录和命令执行正常。
- [ ] 观察授权默认关闭，开启必须 Main 原生确认。
- [ ] 暂停、撤销、切换身份后证据不继续采样、不被旧会话复用。
- [ ] 本地文件修改必须人工批准，拒绝后文件字节不变。
- [ ] 日志、错误、报告不泄漏密钥和敏感终端内容。

### 14.4 工程与目录

- [ ] CI 不重复执行 TypeScript 检查。
- [ ] 本地测试与 pre-commit 规则一致且文档清楚。
- [ ] 依赖清单有依据，没有误删运行时依赖。
- [ ] README/中英文 README/网站文档与当前产品能力一致。
- [ ] ARCHITECTURE.md 不再引用不存在的文件和旧架构。
- [ ] 历史文档已归档，原内容可追溯。
- [ ] dist 历史产物经过清单、hash 和保留判断。
- [ ] out 可重新构建，打包资源完整。
- [ ] experiments 源码和独立实验能力保留。
- [ ] 根目录没有无用途临时文件。
- [ ] Git 工作区中用户原有修改仍然保留。

### 14.5 测试

至少执行：

```bash
npm run lint
npm run test
npm run typecheck
npm run build
npm run test:local
```

推荐最终执行：

```bash
npm run verify:local
```

并按改动范围补充：

- Dialog/菜单键盘交互测试；
- Connection 连接/取消/重试测试；
- 项目侧栏激活测试；
- Agent 终端执行拒绝测试；
- 文件审批拒绝/批准测试；
- iTerm 绑定、观察授权、撤销测试；
- Main/PTY 退出清理测试；
- 长会话性能测试；
- Markdown 本地链接检查；
- Universal 打包资源静态检查（本轮如未要求实际打包，不执行发行）。

不能将历史测试报告直接作为本轮通过证据。所有最终测试结果必须来自当前工作区。

---

## 15. 最终实施报告

完成后在以下位置创建报告：

`Document/new3/MOXUN_PROJECT_CLEANUP_AND_QUALITY_REFACTOR_IMPLEMENTATION_REPORT_20261101.md`

报告至少包含：

1. 执行摘要；
2. 开始时 Git 工作区基线；
3. 最终 Git 工作区状态；
4. 旧模块/残余引用审计表；
5. 删除文件清单及逐项删除依据；
6. 保留的历史兼容模块及原因；
7. App、Terminal IPC、Settings 的结构变化；
8. UI/交互改进和前后截图；
9. README/架构/安全文档同步情况；
10. package scripts 和依赖变化；
11. dist/out 清理清单、SHA-256、释放空间；
12. 测试命令、通过/失败/跳过数量；
13. 安全边界回归结果；
14. 性能测试前后数据；
15. 未完成项和风险；
16. 是否需要用户进一步确认。

最终报告必须严格区分：

- 源码已修改；
- 静态检查通过；
- 自动化测试通过；
- 真实 Electron/iTerm 已验证；
- 仅有历史测试证据；
- 未验证/待用户确认。

**不得用“代码已清理”“功能正常”等笼统文字代替具体证据。**

---

## 16. 给 Codex 的最终执行指令

请把本计划当作一次工程质量收敛任务来执行。

先完成阶段 A，给出当前基线和删除候选表；随后分批执行，不要一口气修改所有模块。

最重要的是：

1. **清理旧代码，但不误删仍被使用的基础能力。**
2. **清理旧模块残留，但不恢复已经删除的旧架构。**
3. **清理项目目录，但不删除用户需要的安装包、品牌源文件、实验源码和历史证据。**
4. **精简 UI，但不减少现有实际能力。**
5. **整理架构，但不进行大规模重写。**
6. **保持 Agent 终端执行永久禁用、本地文件修改必须批准这两条安全底线。**
7. **任何无法确认用途的文件先保留并报告，不要猜测删除。**

本轮不需要新增任何大型功能。最终目标是让墨巡现有能力更加精简、稳定、直观、可靠，让后续 Codex 能够在一套准确的目录结构、架构文档和工程规范上持续开发。

