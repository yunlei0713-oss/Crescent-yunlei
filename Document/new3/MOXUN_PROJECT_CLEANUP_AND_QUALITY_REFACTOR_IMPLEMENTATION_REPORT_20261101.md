# 墨巡清理与质量收敛实施记录（2026-11-01）

> 分批实施记录，**不是 A–I 全部完成声明**。补测批修复历史分页、Renderer owner 生命周期及 HTML lang 同步；真实 iTerm/loopback SSH、崩溃恢复/窗口关闭/Main 退出及 UI feedback 通过。完整应用质量与默认完整门禁各三轮通过。第 10 节保留该批 Provider 严格像素、原生焦点/授权、人工辅助技术及付费模型的未完成项；同日后续集群／真实模型补测见第 11 节，不改写历史计数。

## 1. 用户工作区保护

- 开工已有 101 项修改、33 项删除、171 项未跟踪文件；本轮未 reset/restore/clean/stash，未提交、推送、发布或重新打包。
- 原内容和用户已有 binary diff 保存在 `/Users/xusong.yu/Desktop/test/Crescent-cleanup-20261101/workspace-before/` 与 `evidence/`。
- 原有 33 项删除的 Git HEAD 内容仅导出至 `already-deleted-at-start/`，未恢复到源码，不计为本轮移出。
- 历史文件和构建只移动，不永久删除。桌宠、品牌母版、new/new1/new2/new3、实验源码、必要 native/Worker/WASM 和用户数据保留。
- C/D/F/G 批次收尾相对开工有 92 个变更/移出/新建路径：62 修改、24 文件移出、6 新建（含两份 gitignored 本地测试）。E 首批新增的差异单独见第 9 节。`evidence/round-changes.json` 区分原有工作区状态与本轮前后 hash；`batch-workspace-validation.json` 核对额外缺失及品牌、桌宠、new/new1/new2、实验和锁文件。该计数不含单独盘点的历史 dist 目录。

## 2. 分阶段状态

| 阶段 | 本批结果 | 尚未完成/边界 |
| --- | --- | --- |
| A | Git 状态/diff、文件/hash、引用图、依赖/脚本/产物清单及真实基线门禁 | AST 只覆盖字面量动态引用，未把无 import 当完整淘汰证明 |
| B | 7 个审计后无消费方源码移出；构建/CSS/import/注释残留收敛；回归通过 | 未声称全仓库每个 export、CSS 与翻译 key 已全部审完 |
| C | README 双语、架构、执行约定、网站 28 页及图数据同步；根历史文件归档；活跃入链更新 | 外部归档不会随仓库分发；历史材料原内容保留，不伪造历史证据 |
| D | 历史 dist 按逐文件清单/hash 移到 test，最新交付保留 | 本机总磁盘空间不释放；不删除有入链的 `out/implementation/` |
| F | 连接管理复用 Dialog；附件复用 DropdownMenu；iTerm 主按钮；观察限制折叠；显式 locale；隔离 UI 127 项检查通过 | 独立 Renderer 回归不能替代真实完整应用、native iTerm、辅助技术和全部缩放验收 |
| E | 首批 Provider 详情 UI 提取；前后 DOM/布局/回调对照和本批完整串行门禁通过 | App/Terminal IPC 及其他领域仍需逐流程处理，不能仅按行数拆分 |
| G | CI 与 workflow 去掉重复 typecheck；完整本地门禁与 hook 文档统一 | 依赖没有卸载/升级；候选仍需动态/打包验证；不改变本地测试不提交策略 |
| H | 完整应用 100/500/1000 历史与流式测量三轮通过；真实 iTerm/SSH 和 owner 生命周期专项通过 | 改前 500/1000 分页失败，不能作性能改善基线；原生焦点/授权及人工辅助技术未验收 |
| I | 写入可追溯阶段报告；串行完整门禁、文档及批次目录/hash 核对通过 | 整体最终清单仍未全部勾选；并行桌宠超时根因待查 |

## 3. 本轮源码移出与保留

移入 `retired/` 的 7 文件：

- `src/main/agent/pi-change-plan.ts`
- `src/main/agent/readonly-batch.ts`
- `src/main/agent/command-whitelist.ts`
- `src/renderer/src/lib/command-whitelist.ts`
- `src/renderer/src/lib/terminal-output-ring.ts`
- `src/renderer/src/components/QuotaErrorCard.tsx`
- `src/renderer/src/components/ui/toggle-group.tsx`

静态/字面量动态、构建、测试、迁移、规则及文档引用审计见 [审计表](MOXUN_CLEANUP_AUDIT_20261101.md)。移动前后内容 hash 一致，逐项记录在归档 `evidence/moved-files.json`。

保留 `pi-terminal-bash.ts` 的共享上下文和拒绝兼容入口：文件审批、观察、捕获、子任务仍使用。保留 `command-classify.ts`、`handoff-target.ts` 的本地测试/恢复用途，保留数据迁移及历史 Timeline 只读解析。`scripts/git-commit-policy.cjs` 有隐藏 hooks 调用，不能按普通 grep 漏报删除。

`TERM=xterm-256color` 是 PTY 协议标识，不是内嵌 xterm UI。人工 SSH/PTY、iTerm、观察和文件审批基础能力没有移除，Agent 终端执行没有恢复。

## 4. 文档及目录治理

- 新架构引用实际 `src/main/code-intelligence/`，覆盖 Main/Preload/Renderer/Shared、Pi allowlist、人工 iTerm、观察授权、文件审批、存储、资源与实验边界。
- 网站中英页面和 20 个图预设改为人工终端/只读分析；图拓扑按语言共享，避免一份语言保留旧执行路径。旧页面 URL/preset 名称保留。
- 网站下载组件识别 Universal DMG；历史独立架构下载明确标记为历史，不把包存在当签名/真机验收。
- CHANGELOG 只添加 unreleased 当前说明，不改写旧发布条目。ROADMAP 旧正文已在开工备份保留，新正文不是 release 声明。
- 历史 Document 根 fix、专项计划/验收、实施与安全审计记录，以及 `plan.json` 原样移动到 `retired/`。开工规则/仓库无 `plan.json` 消费入口；不能保证未知仓库外消费者，用户如有该工作流应使用归档原文件。
- SOURCE_BUILD、DEVELOPMENT、TESTING 的活跃历史入链改为 [归档映射](../archive/README.md)，不复制第二份正文。protected 材料不改写。
- 根/网站锁文件未改写，`website/` 独立锁定安装只补足本机依赖，不升级包。

归档完成：7 个源码文件、17 份历史文件（含 `plan.json`）以及 7 个历史 dist 目录。24 个文件归档 hash 再次核对一致；dist 移动时逐文件字节/hash 和 symlink 目标前后均校验。移出历史 dist 的逻辑内容为 **17,071,226,659 字节**，当前 `dist/` 约 690M、`out/` 约 671M，保留最新 `dist/moxun-20261101/`、`.DS_Store` 和有历史入链的 `out/implementation/`。同盘移动没有释放整台电脑空间。完成证据为 `evidence/stage-D-result.json`、`moved-files.json` 和 `batch-archive-ui-validation.json`，未重新运行移动脚本。

## 5. UI 行为与状态 owner

- `ConnectionManagerModal` 使用现有 Radix Dialog 的焦点陷阱和关闭语义，初始定位搜索，保存原触发焦点；如连接操作打开另一个 Dialog，不抢走其焦点。表单仍由原上层管理，保存/连接/导入/删除回调不变。
- `ChatWorkspace` 附件菜单由 DropdownMenu 管理焦点、键盘及关闭，移除原全局 pointerdown/Escape 监听。文件/目录选择仍调用同一授权回调；CSS 改为匹配真实菜单项。
- `ConnectionTerminalDialog` 唯一 iTerm 选择改为主按钮，保留目标、取消、连接状态、错误和观察选择；不修改 ExternalTerminalDialog 的两种真实接入路径。
- 观察 off/live/context-live 完整保留。每项一句说明；详细滚屏、遗漏、退出码、脱敏/时效、暂停/撤销限制仍可展开。默认 off，Main 原生授权机制不变。
- `dictionaries` 增加显式 `locale` 元数据；组件使用 `t.locale`，不再从业务译文是否含汉字猜语言。不重写整个 i18n，不建立新全局 Store。
- `ProjectSidebar` 展开后的 activate **保留**：Main 每次 `ProjectRegistry.resolve()` 都验证真实路径、symlink 与授权，折叠期间路径可能被外部替换。暂不把持久 ready 当安全缓存。后续优化须保留 Main 复核并增加竞态测试。

## 6. 工程门禁

`ci = lint → 静态安全 → build（内含 typecheck）`，GitHub workflow 同步。`verify:local = ci + test:local`。pre-commit 只自动 CI；有本地测试时提交前必须自行运行完整门禁，不跳 hook。

未卸载 Swagger/Radix/zustand/autoprefixer 候选：无文本引用不证明无传递、动态、工具或打包用途。本批不运行根 `npm ci` 重建 native，不更换 Pi，不改变 Universal 规则，不触发 release。

## 7. 验证记录

| 命令/检查 | 结果 | 证据 |
| --- | --- | --- |
| A `npm run verify:local` | 339 静态安全；65 文件、365 tests passed；6 文件/7 tests 既有跳过 | `evidence/baseline-verify.log` |
| B `npm run verify:local` | 通过；65 文件/365 tests passed，7 skipped | `evidence/stage-B-verify.log` |
| C/G `npm run verify:local` | 通过；65 文件/365 tests passed，7 skipped | `evidence/stage-C-G-verify.log` |
| 网站首次 build | 缺少 vitepress，失败；不是内容构建通过 | `evidence/stage-C-docs-build.log` |
| `npm ci --prefix website` 后网站 build | 通过；有既有大 chunk 提示，未降低门禁 | `evidence/website-npm-ci.log`、`evidence/stage-C-docs-build-installed.log` |
| 当前规范链接/架构路径/图预设 | missing path=0、active link issue=0、graph issue=0、20 presets | `evidence/docs-audit.json` |
| F Node/Web 类型检查及 lint | 通过 | `evidence/stage-F-typecheck.log`、`evidence/stage-F-lint.log` |
| 批次网站最终 build | 通过；保留大 chunk 提示 | `evidence/batch-final-docs-build.log` |
| UI 首次/首次重试 | 首次夹具初始化超时；重试未等待退出动画，焦点断言失败 | `evidence/stage-F-ui-test.log`、`stage-F-ui-test-retry.log` |
| C/D/F/G 首次完整门禁 | CI 通过；菜单动画结束前焦点断言失败，367 passed / 1 failed / 7 skipped；整条命令失败 | `evidence/batch-C-D-F-G-final-verify.log` |
| UI 动画等待修正后定向回归 | 通过；当时主题夹具不完整，不能用作深色主题验收 | `evidence/stage-F-ui-test-animation.log`、`ui-animation-only/` |
| UI 主题/交接扩展初次运行 | 预期 aria-label 写成简称，夹具断言失败；按现有双语词典完整文案修正，不改产品文案 | `evidence/stage-F-ui-test-theme-handover.log`、`ui-theme-handover-fixture-failure/` |
| UI 最终定向回归 | 通过；127 项检查、12 份布局/截图，中英及真实浅/深主题属性 | `evidence/stage-F-ui-test-final.log`、`ui-targeted-passed/results.json` |
| C/D/F/G 再次并行完整门禁 | CI、新 UI 回归通过；既有桌宠浏览器测试 60s 超时，367 passed / 1 failed / 7 skipped；整条命令失败 | `evidence/batch-C-D-F-G-accepted-verify.log` |
| 既有桌宠用例定向复测 | 通过；未改桌宠代码、资源、动画、测试断言或超时 | `evidence/batch-whale-timeout-recheck.log` |
| `VITEST_MAX_WORKERS=1 npm run verify:local` | 完整通过：lint、332 静态安全、Node/Web 类型检查、Main/Preload/Renderer build；67 文件/368 tests passed，6 文件/7 tests 既有跳过 | `evidence/batch-C-D-F-G-serial-verify.log` |
| 批次工作区与归档复核 | 24 文件归档 hash 一致；未发现额外缺失或 protected 内容改动；本地测试仍 ignored；`git diff --check` 通过 | `evidence/batch-archive-ui-validation.json`、`batch-workspace-validation.json`、`round-changes.json` |

新增本地回归为 `components/quality-cleanup.browser.test.ts` 和 `i18n/locale.test.ts`，保持 gitignored，不提交。UI fixture 是隔离 Electron Renderer、stubbed IPC：不能宣称完整 Main、真实 iTerm、SSH、签名、发布已验收。

UI 验证覆盖搜索初始焦点、35 次 Tab/Shift+Tab、Escape/关闭按钮/遮罩关闭和焦点恢复、草稿关闭重开保留、保存/保存并连接不同回调，以及连接管理交接新连接 Dialog 时不抢焦点。附件菜单验证 Enter、方向键、Home、Escape、文件选择回调和完整双语 aria-label；观察验证默认 off、三个模式、限制说明可展开及 iTerm 按钮回调。每种语言/主题覆盖 2560×1440、1920×1080、800×600。浅/深背景分别为 `rgb(247, 247, 243)` / `rgb(17, 19, 18)`，不再只切换 `.dark` 而漏掉项目主题属性。截图只为改后隔离界面，不是完整应用 before/after、缩放或辅助技术验收。

焦点失败通过夹具等待真实动画卸载及 Radix 延后 autofocus 完成解决，未降低焦点断言，未为测试改产品逻辑。并行完整门禁的桌宠超时不能仅凭定向通过断定根因；`VITEST_MAX_WORKERS=1 npm run verify:local` 串行重跑全部原门禁已通过，未跳用例、增超时、关闭隔离或更改默认配置。Vitest 串行耗时 132.73s，只是本机测试调度结果，不是产品性能指标；此前失败仍保留，不宣称默认并行调度问题已经修复。

静态安全数量由基线 339 到当前 332，是同一脚本对移出的 7 个源码不再逐文件执行通用检查所致。`scripts/check-security-boundaries.cjs` 本轮与开工 hash 一致，未删减安全规则。新 UI 的 127 项内部检查属于 1 个 Vitest 用例，不再叠加到 368 tests passed 中。

## 8. 下一批必须完成

1. E：Provider 详情 UI 首批已提取（见第 9 节），其他职责尚未迁移。继续一次一个流程处理 App 会话/连接协调、terminal 观察 IPC、Settings 领域编辑器，保留唯一状态 owner 和全部校验。原 `evidence/stage-E-readonly-boundaries.md` 保留为迁移前只读盘点，不当作其他流程已完成证据。
2. F：补齐完整应用 before/after、焦点/遮罩/连接保存语义、辅助技术、窗口缩放验收；验证侧栏优化是否确有安全且必要的可行边界。
3. G：依赖候选完成动态、构建及 native 包内证据后才决定卸载；不得仅按无 import 删除。
4. H：隔离真实 iTerm 生命周期及长会话数据集测量，仅回收测试自身 PTY/socket/UUID，不操作用户原有终端。
5. I：最终门禁和全量目录验收后逐项勾选；本记录仍有未完成项时，不宣布计划整体完成。

## 9. E 首批：Provider 详情编辑器

### 工作区与职责边界

- 本批开工文件/hash 与上一批收尾完全一致，没有新增的用户修改被覆盖。新的 Git 状态、binary diff、833 个文件/hash 清单，以及待改文件原内容存放在 `evidence/stage-E-provider/`；`before-files.json` 是本批基线，不替代整轮开工备份。
- 修改 `src/renderer/src/components/SettingsSheet.tsx`，新增 `src/renderer/src/components/ProviderSettingsEditor.tsx`，新增 gitignored 本地 `ProviderSettingsEditor.browser.test.ts`；同步本报告及审计表。本批没有文件删除、归档移动、依赖安装/卸载、重新打包、提交、推送或发布。
- SettingsSheet 977→838 行，新的完整 Provider 详情 UI 187 行。目的为领域边界，不以减少总行数为验收；原编辑器正文不再在 SettingsSheet 中并存。

```text
App（唯一 config/选中 ID/原始模型文本/open/saved owner）
  ├─ useSettings：Provider/model 派生与原有 fallback
  ├─ useProviderController：ID 冲突/重命名、模型解析、启用回退、删除确认
  ├─ useSessionPersistence/saveAgentConfig：保存、验证、原有 Promise 时序
  └─ SettingsSheet：Sheet/焦点/宽度及 Provider→OpenAPI→instruction 分支协调
       └─ ProviderSettingsEditor：受控详情表单，无 state/effect/IPC/存储
```

- 新组件只接收 Provider、选中 ID、模型文本、删除许可、saved 和窄回调，不接收整个 config、不新建 draft/Store/Hook、不复制 parser。Main、Preload、Pi 和安全策略均未迁移。
- 保留 `provider-editor-panel`、6 个 field ID/label、password 类型、placeholder、样式和双语说明。图片能力仍由既有 `formatProviderModels`/controller round-trip；不从模型名推断图片能力，不丢已有模型 metadata。
- 保留父级 fallback、分支优先级、启用后的默认模型回退、至少一项 Provider 的删除保护/确认。关闭仅改变原 editor-open；保存仍调用原父级 callback，由 App 在 `await saveConfig()` 后关闭，子组件不添加提前关闭。
- `source-contract-audit.json` 核对原 JSX 与新 JSX 除显式 prop 别名和等价格式外一致；App、3 个原 owner Hook、安全脚本和锁文件 hash 未变。测试不修改产品错误处理：预期保存拒绝仅由 fixture 订阅用于断言。

### 本批验证与边界

| 检查 | 结果 | 本批证据（`evidence/stage-E-provider/`） |
| --- | --- | --- |
| 改前串行完整 `VITEST_MAX_WORKERS=1 npm run verify:local` | 通过：332 静态安全、67 文件/368 tests passed、7 tests 既有跳过 | `baseline-verify.log` |
| 新回归首次、尚未改生产代码 | fixture 嵌套 JavaScript 换行转义错误，失败；未算通过 | `provider-before.log`、`ui-before/failure.json` |
| 修正 fixture 后改前定向回归 | 通过，87 项内部检查及 12 组布局/DOM/截图 | `provider-before-retry.log`、`ui-before-retry/results.json` |
| 提取后同一回归 | 通过；87 项检查、12 组快照的 DOM、字段几何和回调顺序与改前完全一致 | `provider-after.log`、`ui-after/results.json`、`ui-after-comparison.json` |
| 定向 lint、格式及 `git diff --check` | 通过；3 个触及的代码/测试文件定向 lint 无告警 | `targeted-lint.log`，本批最终 Git check 清单 |
| 本批最终 `VITEST_MAX_WORKERS=1 npm run verify:local` | 完整通过：333 静态安全、68 文件/369 tests passed、6 文件/7 tests 既有跳过；lint、Node/Web 类型检查及 Main/Preload/Renderer build 通过 | `final-verify.log`、`gate-summary.json` |
| 最终完整门禁中的 Provider 回归对照 | 通过；同样 87 项检查、12 组 DOM/字段几何/回调与提取前完全一致 | `ui-gate/results.json`、`ui-gate-comparison.json` |

87 项内部检查属于 **1 个 Vitest 用例**，不与完整门禁测试数重复相加。覆盖中英、真实浅深主题及 2560×1440/1920×1080/800×600；ID 空值/冲突/重命名、受控字段、图片声明与 metadata、启用回退、草稿关闭重开、删除取消/确认/最后一项、保存 pending/reject/resolve、saved 文案、fallback/分支交接和 Sheet Escape/焦点恢复。每个版本各 12 组快照；这仍是隔离 Electron Renderer、真实现有 Hook + stubbed API/save，仅使用合成凭据，**不替代完整应用、真实密钥存储、iTerm/SSH、性能、辅助技术或发布验收**。

DOM/字段几何/回调完全一致不等于 PNG 逐像素一致。附加图片审计发现 8/12 PNG 字节一致、4 份有像素差异（原始 2×图像最大通道差分别为 4、1、4、16），记录在 `png-before-after-hashes.json`、`png-pixel-differences.json`；本批没有逐像素相等门禁，也未专项确认截图差异根因，不把该证据写成完整视觉验收通过。

本批静态安全 332→333 来自新增的 1 个生产源码文件逐文件检查，原安全脚本 hash 不变；测试 368→369 来自新增 1 个本地用例，没有跳用例、增加超时、关闭隔离或改默认调度配置。完整 lint 与本批基线均保留既有 `quality-cleanup.browser.test.ts` 的 17 项格式 warning（0 error）；本批触及的 3 个代码/测试文件定向 lint 无 warning。默认并行桌宠超时根因仍未修复。

阶段工作区核对首次严格检查另报告 `.eslintcache` 变化；已确认这是 lint 更新的既有 gitignored 生成缓存，保留其前后 hash 并单列，不删除/恢复缓存、不将它混作源码改动。最终阶段清单为 5 个预期代码/测试/报告路径及该缓存，无文件缺失或额外用户/protected 内容改动。本批可以进入下一项有界 E 工作，但不代表 E 或整个计划已完成；下一项 App 连接 owner 的只读准备在 `next-App-readonly.md`，尚未迁移代码。

整轮累计 `round-changes.json` 已刷新为 94 个路径：62 修改、24 文件移出、8 新建（包含现在 3 份 gitignored 本地测试）。该整轮计数不含单独盘点的历史 dist 目录；本批缓存变化另在 `stage-E-provider/changes.json` 记录。归档文件和 protected 内容未在 E 批次再次移动或修改。

## 10. 剩余测试补充批

本批证据根目录：`evidence/remaining-tests/`。`before-files.json` 保存 E 收尾时 835 文件/hash，`before-git-diff.txt` 为 Git binary diff；`workspace-before/` 保存原本地测试与 new3 文档，`production-before/` 保存本批修改前的 App、agent-log、Main index 和 terminal IPC。所有失败日志保留，不用后续通过覆盖失败。

### 修复及测试边界

- **历史分页（产品修复）**：主动加载更早消息不能重新应用实时 120 条软裁剪；恢复历史需取连续的最新页，不能保留 logId=1 的旧 user 造成游标停滞。新增纯分页合并、去重和 0/1/119/120/121/500/1000 边界回归；实时软上限、单条文本 clamp、SQLite 全量历史和导出消费者语义不变。仅在恢复入口先截取最新页再 hydrate，避免全量解析。
- **Renderer owner 生命周期（产品修复）**：真实 crash 测试曾证实 Main 遗留旧 PTY 和观察授权（`artifacts/mxlife-cZQe7g/crash.json`）。Main 在 `render-process-gone`、完整主文档替换、WebContents destroyed 时取消该 owner 待确认请求、撤销授权和回收终端；owner epoch 阻止旧异步 consent 完成。子框架/同文档导航不清理，其他 owner 和用户原有 iTerm UUID 保留。未恢复 Agent 执行或绕过文件审批。
- **desktop 调度（夹具修复）**：Node-only 单元测试仍正常并行；共享 macOS display/focus/GPU 的 desktop project 单 worker、逐文件独立 fork。原断言、超时和隔离保留。桌宠、滚动、Provider 等直接启动 Electron runtime并等待测试自有 Main 回收。此调度不等于产品性能优化，也未确认底层 GPU/调度超时根因。
- **夹具纠错**：完整历史持久化会主动移除 thought，改用保留的工具输出 Timeline 验证真实展开/折叠；数组 `entries` 是方法，不能拿其参数个数当 IPC 行数，现按真实数组 length 验证 200 行边界。proactive 重开 UUID 按既有产品语义返回 `expired` 而非 undefined，现严格要求过期、无证据、无请求、无输入。实际授权状态另存 `reopened-identity.json`。
- **证据保护**：Provider 默认输出改为每轮独立临时目录，不再覆盖 E 的 `ui-gate/`；截图前等待实际 CSS 动画结束，不关闭产品动画或修改业务代码。历史 Provider 的 4 张差异图仍保留，不能仅用 DOM 相等冒充像素相等。
- **语言可访问性（产品修复）**：实际切到英文后 HTML `lang` 仍为 `zh-CN`，现随既有 locale effect 同步；两轮完整双语矩阵验证。
- **完整应用夹具后半段纠错**：英文 selector 用 JSON 转义；Radix 菜单入口使用真实 Enter，而非不触发 pointerdown 的 DOM click。焦点失败确认是选中了隐藏的 `#app-theme-menu[role=dialog]`，不是 Settings 失焦，现严格指定 Settings Sheet；`artifacts/moxun-full-quality-aksvWT/settings-focus.json` 保存两者及实际聚焦按钮，未为此改产品焦点逻辑。

### 已完成的真实与定向验证

| 验证 | 当前结果 | 证据 |
| --- | --- | --- |
| 分页合并及 owner 初次定向回归 | 2 文件/14 tests passed | `targeted-fixes-01.log` |
| 补齐边界、子框架和待确认 crash 回归 | 2 文件/23 tests passed | `targeted-fixes-02.log` |
| 修复后 Node/Web typecheck 和构建 | 通过 | `fixes-build-01.log`、`fixes-build-02.log` |
| 完整应用 Renderer crash/recovery、窗口关闭、Main SIGKILL | 3 tests passed，旧 PTY/socket 回收、原有 UUID 保留 | `live-acceptance-01.log`；`artifacts/mxlife-1yKtZE`、`mxlife-siVRuH`、`mxlife-uXEPRa` |
| 三种 iTerm 入口及 disposable loopback SSH | 真实通过，不访问业务 SSH | `live-acceptance-01.log`；`artifacts/moxun-chat-ui-sFL42m` |
| 原生双向共享 PTY、快照、解绑/重开 | 真实通过，Agent 不写入 | `live-acceptance-01.log`；`artifacts/moxun-live-iterm-b16wtF` |
| 完整应用 UI feedback | 通过 | `live-acceptance-01.log` |
| proactive：问题先行、主动三选一、草稿优先、复制审查、暂停/撤销及 UUID 过期 | 纠正夹具语义后通过；模拟原生 consent、loopback 模型 | `full-quality-proactive-02.log`；`moxun-proactive-yydh84/reopened-identity.json` |
| 完整应用质量，含可选阶段诊断 | 通过：100/500/1000 全量历史、36 布局、AX、减少动画、Settings Escape、部分流式更新/帧采样 | `quality-provider-09.log`；`artifacts/moxun-full-quality-aksvWT/` |
| 完整应用质量，无阶段诊断，及原生图标重复 | 3 files/3 tests passed、1 minimize 环境跳过；完整质量重复通过，launch/running 严格 PNG 通过 | `quality-icons-provider-10.log`；`artifacts/moxun-full-quality-fPYwjt/`、`moxun-dock-acceptance-pBPgH1/` |
| 最终 live 重复及分页/owner 回归 | 8 files/31 tests passed、1 file/2 tests skipped；三种生命周期、共享 PTY/iTerm/SSH、proactive、完整质量及 launch/running 通过 | `final-live-acceptance-02.log`；`artifacts/mxlife-4tnRLU/`、`mxlife-itR1E3/`、`mxlife-g1h9hq/`、`moxun-full-quality-AQMu4U/`、`moxun-chat-ui-3W0SJT/`、`moxun-live-iterm-nh5yJq/`、`moxun-proactive-a8Z5fm/`、`moxun-dock-acceptance-0aWiHu/` |
| UI feedback 最终单独补跑 | 1 file/1 test passed；live 轮漏设 opt-in，原 skip 保留，不倒算该轮通过 | `final-ui-feedback-live-03.log`；`artifacts/moxun-ui-feedback-HUgVSw/` |

### 性能数据与可比性

`quality-summary-01.json` 核对改前/两轮改后数据集 SHA-256 完全相同。改前 `moxun-full-quality-ujxrOX` 整体失败于 500 条分页；仅 100 条场景有完整数据（首开 246.1 ms、hydration 26.1 ms、最大帧间隔 18.6 ms）。改前 `ipcRows=0` 是夹具误读 `Array.entries`，不作为指标；500/1000 没有成功的全量基线。

| 消息数 | 两轮改后首开 ms | 主动 hydration ms | 最大帧间隔 ms | DOM nodes | Renderer heap MiB（非强制 GC） |
| --- | --- | --- | --- | --- | --- |
| 100 | 340.0 / 316.4 | 27.9 / 29.7 | 35.7 / 50.0 | 4748 / 4742 | 12.93 / 12.24 |
| 500 | 232.5 / 200.0 | 1622.7 / 1085.4 | 81.5 / 50.4 | 20030 / 20030 | 14.12 / 14.08 |
| 1000 | 188.1 / 189.5 | 2627.9 / 2900.1 | 82.5 / 49.4 | 39813 / 39777 | 20.76 / 36.33 |

两轮 1000 条各 10 次真实 Timeline 展开/折叠合计 992.3 / 1261.6 ms；切到空会话并 GC 后 heap 都为约 8.11 MiB、DOM 355。loopback 流式耗时 1248.7 / 1281.9 ms，各有 18 个不同内容的 Chromium rAF 采样及 21 次 DOM mutation；不是付费模型或截图逐帧验收。36 组包含 12 native-window 和 24 完整应用中的 Chromium device-metrics 模拟，逐组保存请求尺寸、native content 和实际 CSS 尺寸，不称为物理高分辨率窗口验收。最终 live 轮第三次完整质量也通过，19 个不同内容的 rAF 样本、22 次 mutation；`quality-summary-02.json` 核对三轮数据集 hash 一致，不将多轮内部检查累加为 Vitest 用例数。

未新增虚拟列表依赖；数据有阶段诊断开销、GC 波动和前台条件差异，最大帧间隔仍高于单帧 16.7 ms，**不宣称性能优化或稳定 60 fps**。此前 170 秒 watchdog 整轮失败保留，后续重复成功也不能证明旧瞬时卡点根因已经查清。

### Provider 严格视觉对照

- 等动画结束的第一轮重拍仍为 8/12 PNG 字节一致；第二轮要求 2 秒内三个连续相同 raw bitmap，大面积 2560 差异消除至 11/12，但英文浅色 800 仍有 1 个通道差 1。比较与每次 capture hash 均保存；没有容差、遮罩或删图。
- 加入 `show:true` 可见窗口、请求聚焦并对屏幕裁剪尺寸显式模拟后（当时未证明实际 native focus），归档提取前源码与当前源码的 DOM/几何/87 项行为和回调仍全部一致，但严格 PNG 为 **6/12**；差异各 1–30 个通道、max 1–3，集中原生 checkbox 和圆角边缘。`provider-foreground-comparison.json`、`provider-foreground-pixel-diagnostics.json`、`provider-foreground-before/`、`provider-foreground-after/` 保存原图和精确坐标。该项仍失败，不能把微小差异直接归因为已解决的 GPU 问题。
- 产品 UI 未为了像素测试去掉动画、blur 或原生控件；Provider 默认仍是独立 Renderer，不能冒充完整应用验收。前台运行避免隐藏窗口条件，实际矩阵依然明确区分 native 与 simulated viewport。
- 当前生产源码在前台重复两次也只有 **7/12** 严格 PNG 一致，DOM/几何/行为和回调完全一致（`provider-foreground-same-source-repeat.json`，`provider-foreground-after/` 对 `artifacts/moxun-provider-ui-9RXMJ3/evidence/`）。这证明同源码跨运行像素也不稳定，不能将全部差异归因于 Provider 提取；底层根因仍未查明，严格视觉项仍不通过。
- 第二轮默认门禁的额外前后图片复核为 **3/12** 严格 PNG 一致，最大通道差 169（`provider-final-default-comparison-02.json`）。snapshot 差异逐项诊断仅为屏幕裁剪 native content 高度 752→748，实际 DOM/字段/CSS 几何/回调仍相同（`provider-final-default-dom-diagnostics-02.json`）；800 图还有焦点环与背景差异，不能将这轮也概括成仅几个边缘像素或可比的纯源码差异。
- 新增每次 capture 的真实焦点诊断后，原生焦点严格检查实际失败，03/04/05 失败日志保留。空白窗口独立探针在小窗口和大窗口均 `isFocused=false`，按测试自有 PID 调用 AppKit 激活也未得到焦点（`native-focus-probe-01/results.json`，只操作自有 PID）。这证明当前环境存在原生焦点阻塞，不证明此前像素差异全部由它造成。
- 原有 87 项隔离 Renderer 行为断言、动画和位图稳定检查不变；额外的原生 OS 焦点要求使用显式 `MOXUN_PROVIDER_NATIVE_FOCUS_LIVE=1`，检查保留且在 `provider-native-focus-current-06.log` 再次失败。默认运行保存 `capture-focus.jsonl` 的真实 native/document focus，**不能把默认行为门禁通过冒充该原生检查通过**。没有关闭焦点环、blur/动画、增加原用例超时或像素容差，也没有跳过原有行为用例。

### 默认完整门禁与收尾

- 首轮 `env -u VITEST_MAX_WORKERS npm run verify:local` 完整通过：333 静态安全检查、69 文件/384 tests passed、8 文件/11 tests skipped，日志 `final-default-verify-01.log`。Node-only 仍默认并行，desktop 项独占显示资源；这不等于所有 live/原生项目已通过。
- 首轮有 17 项本批创建测试的格式 warning；已仅格式化 `quality-cleanup.browser.test.ts`、`locale.test.ts`，保留断言。live 轮另发现 owner 用例一处 `rejects.toThrow` 未显式 await；补齐后 `final-targeted-await-03.log` 为 2 文件/23 tests passed，无该 warning。
- 第二轮及最终第三轮相同默认命令完整通过：各 333 静态安全、69 文件/384 tests passed、8 文件/11 tests skipped，`final-default-verify-02.log`、`final-default-verify-03.log`；两轮 lint 0 warning，Node/Web 类型检查及构建通过。构建各保留两条既有 dynamic/static import 提示，不声称全日志零告警。第三轮覆盖最后的本地 Provider 焦点诊断及原生 opt-in 边界；最终 12 次 capture 的 native focus 均 false、document focus 均 true，明确不算原生焦点验收。`final-gate-summary.json` 区分默认、live、严格 PNG、原生 focus 和跳过项。

### 最终清理及工作区审计

- `owned-resource-audit-03.json` 只读核对 36 个有自有 PID/socket/UUID provenance 的测试目录（含空白窗口探针）：无记录资源残留；当前 iTerm 仅有用户原有两个 UUID。它不证明整机所有进程归属，未向用户原有终端输入或关闭其会话。
- `archived-artifacts-01.json` 至 `08.json` 保留完成的 runner/runtime/截图/SQLite 等；`moved-temporary-originals-01.jsonl` 至 `03.jsonl` 将 **65 个已完成临时目录、2501 个文件/链接记录** hash/symlink 复核后移到 `temporary-originals/`。已有快照和原临时内容都保留，未永久删除；旧日志中的临时绝对路径用这些映射定位，不改写旧失败。
- `local-test-ignore-final.json` 核对 77 个本地测试文件全部 gitignored、无 tracked test。本批最终 snapshot/hash、原用户 binary diff 与本轮差异分别保存在 `final-04-files.json`、`final-04-changes.json`、`final-04-git-diff.txt` 和 `final-04-round-audit.json`；`final-evidence-sha256.json` 汇总本批证据 hash，不覆盖 baseline、生产代码备份、E 原门禁或旧失败。
- 整轮最终计数 **108 个路径：73 修改、24 文件移出、11 新建**，无额外缺失或 protected 内容变化。它取代第 1/9 节阶段性的 92/94 计数；不含单独盘点的 7 个历史 dist 目录，也不把本批临时证据移动计为源码删除。

`live-acceptance-01.log` **整轮失败**：3 failed、6 passed、1 skipped，失败为分页、原生图标字节差异、proactive 夹具的过期语义误判。不可把这份整轮日志称为全绿。所有内部 UI assertions 属于各自 Vitest 用例，不叠加到 tests passed。

### 尚未完成 / 不可自动宣称通过

- Provider 严格像素和原生焦点仍失败，不能称为本轮所有自动化验收全绿；可见窗口/模拟 document focus 不是 native focus。需在可获得原生焦点的桌面环境继续严格对照，不自动放宽标准。
- 原生 launch/running 有一次严格 PNG 不一致，143 个通道值差异集中在 x=332–399、y=79–100（包含 alpha，不是仅元数据）。产品没有 runtime `dock.setIcon`；诊断轮同一 native image 重复导出的 6 PNG 与两份 TIFF 分别一致，但未据此认定先前差异根因已解决。证据：`native-icon-pixel-diff.json`、`native-icon-diagnostic-01/`。
- 原生 minimize/restore 实际尝试后 `MAC_MINIMIZE_UNAVAILABLE`，跳过不能算通过；真实 native observation consent、VoiceOver 等人工辅助技术未验收。
- 未开启 `MOXUN_VISION_LIVE`，因为会读取用户保存密钥、向外部模型发送内容并产生费用。模拟 consent/loopback streaming 不代替原生授权或付费视觉模型验收。

本批收尾不继续其他 E 职责迁移；所有修改未提交、未推送、未发布、未重新打包。最终门禁后仅更新这些审计说明，不改变生产代码或测试断言。

## 11. 后续连续观察／多终端补测

同日后续按用户授权补测真实 zhangke 集群与已配置付费模型，并修复同终端 SSH 换主机／退回本地的观察连续性、旧通知重复分析、本地主机标签滞留及同机 zsh 提示符误判。真实视觉模型已通过；真实集群跳转、同对话双终端及真实模型读取两边证据也已通过，但该集群成功轮的授权明确为模拟。最新完整本地门禁为 335 静态安全、397 tests passed / 12 opt-in skipped，不能当作所有原生项目全绿。真实原生授权自动点击受 System Events 超时阻塞，Provider native focus／严格 PNG 仍未通过，不能替代第 10 节的原生／人工验收。完整日志、失败及最新真实重复轮见 [连续观察与多终端补测记录](MOXUN_TERMINAL_CONTINUITY_AND_MULTI_TERMINAL_REPORT_20261101.md)。本节不改写第 10 节的历史通过／失败计数。
