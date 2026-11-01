# 清理基线与引用审计（2026-11-01）

## 基线及归档约定

- 实施计划：本目录 `MOXUN_PROJECT_CLEANUP_AND_QUALITY_REFACTOR_PLAN_20261101.md`。
- 用户指定归档位置：`/Users/xusong.yu/Desktop/test/Crescent-cleanup-20261101/`，不是永久删除。
- `workspace-before/` 保存本轮开始时的文件内容；`evidence/` 保存 Git 状态、原有 binary diff、文件/hash 清单和测试日志。
- 开始时已有 33 个删除；其 Git HEAD 版本仅导出至 `already-deleted-at-start/`，未恢复进工作区，不计为本轮删除。
- 活跃文件盘点排除 `.git`、`node_modules`、`dist`、`out`、缓存；源码、脚本、资源、文档、网站、实验独立盘点，共 851 个文件（包含本地测试）。
- 不 commit、push、release、打包；不改变用户数据，不操作用户原有 iTerm。

机器可读依据均在归档的 `evidence/`：`files-before.json`、`old-module-references.json`、`static-source-references.json`、`dependency-use.json`、`script-use.json`、`dist-sha256-before.json`。

## 删除前检查表

静态检查使用 TypeScript AST（import/export/字面量 import()/require），并补充全工作区文本检查，包括 ignored 本地测试、规则、脚本、配置、打包、迁移及文档。未将“没有 import”单独视为淘汰依据。

| 候选 | 开工存在 | 引用/动态/构建/测试检查 | 结论 |
| --- | --- | --- | --- |
| 33 个已删除模块与旧品牌图 | 否 | 生产源码没有旧路径导入；Vite 仍有旧 chunk 分支；历史计划/验收保留旧名称 | 保留现有删除，清理活跃构建残留；导出历史版本 |
| `src/main/agent/pi-terminal-bash.ts` | 是 | host、文件审批、捕获、子工具共享上下文；直接执行入口为拒绝陷阱 | 重构后保留；不能按文件名删除 |
| `src/main/agent/pi-change-plan.ts` | 是 | 无运行时/动态/构建/本地测试调用；仅历史设计记录引用；工具已从 host allowlist 移除 | 可移出：旧工具 schema、提示词及注册工厂；保留底层拒绝/失效策略 |
| `src/main/agent/readonly-batch.ts` | 是 | 仅重复 re-export；生产代码直接使用 shared；无脚本/测试/构建引用 | 可移出；保留 `src/shared/readonly-batch.ts` |
| Main/Renderer 的 `command-whitelist.ts` | 是 | 无运行时、动态发现、迁移、测试或脚本引用；旧审批控件已移除 | 可移出；不删用户配置兼容字段和 shared 命令解析 |
| `src/renderer/src/lib/terminal-output-ring.ts` | 是 | 原唯一 Hook 已由用户删除；无动态/构建/测试引用 | 可移出；不影响 Main 观察证据缓存 |
| `src/renderer/src/components/QuotaErrorCard.tsx` | 是 | 无调用；运行错误统一由 `timeline/RunDiagnostics.tsx` 展示；无动态/测试引用 | 可移出：被现有错误视图替代 |
| `src/renderer/src/components/ui/toggle-group.tsx` | 是 | 无产品/动态/测试调用；旧布局选择器已移除 | 可移出；不卸载 Radix 的传递包 |
| `src/renderer/src/lib/handoff-target.ts` | 是 | 本地行为测试仍引用 | 待确认，保留，不通过删除测试缩减门禁 |
| `src/main/agent/command-classify.ts` | 是 | 测试恢复脚本及稳定性夹具仍引用 | 待确认，保留，避免损坏本地工作流 |
| `scripts/git-commit-policy.cjs` | 是 | 隐藏目录 `.githooks/commit-msg` 等调用（普通文本盘点容易漏掉） | 保留 |
| `src/main/retired-data-migration.ts` | 是 | Main 启动调用；专用本地测试覆盖 | 保留历史数据迁移，不碰用户数据 |
| `plan.json` | 是 | 2026-07 旧架构计划；仓库/IDE 规则无消费入口；用户本次明确要求旧资料移到 test | 归档原内容，不销毁 |
| Document 根历史 fix/专项计划/验收报告 | 是 | 检查入链；保留 new/new1/new2/new3 与品牌 archive | 归档原内容，并更新活跃规范入链 |
| 历史 dist（除 `moxun-20261101`） | 是 | 完整文件/hash 清单先生成；逐目录保留 app/DMG/ZIP/证据 | 仅移动至 test，保留最新交付；不释放本机总空间 |
| `out/implementation` | 是 | 历史验收记录和 protected 文档引用 | 保留，不将证据当缓存清除 |
| Worker/WASM/Pi/Photon/PDF/node-pty/MCP/Tree-sitter/XYFlow | 是 | 动态加载、asarUnpack、解析器及图表路径仍使用 | 保留 |
| `dev-app-update.yml` / 图标准备 / native / 实验脚本 | 是 | updater/生命周期/builder/手工开发流程使用 | 保留 |

## 本轮安全调用关系

```text
Renderer → typed Preload → rendererIpc（Main sender/frame/payload 校验）
  ├─ 人工连接 → terminal/ipc → SessionManager → shared PTY/iTerm 或已有 iTerm 绑定
  ├─ 观察申请 → 原生确认 → ObservationGrants → 脱敏、有界、短时证据
  └─ Agent run → Pi host allowlist / Agent-origin scope
       ├─ 只读资料/知识/索引/观察/建议
       ├─ 文件变更提议 → FileApprovalService → 原生人工审批 → 校验后写入
       ├─ Subagent → 缩小后的只读工具列表
       └─ bash/PTY 写入/中断/MCP 未审计实现 → Main 拒绝
```

`TERM=xterm-256color` 是 PTY 终端协议标识，不是内嵌 xterm UI，必须保留。历史 Timeline 的 bash/approval 解析是只读历史兼容，不能删除历史记录，也不能恢复审批执行按钮。

## 阶段推进

基线、B、C/G 完整门禁已通过。当前 7 个源码、17 份历史文件和 7 个历史 dist 目录已移入桌面 test，24 个文件 hash 复核无差异，dist 移动前后逐文件及 symlink 校验通过。最新 `dist/moxun-20261101/` 与有历史入链的 `out/implementation/` 保留，不释放整台电脑磁盘空间。

F 的隔离 Renderer 定向回归已通过：127 项检查，12 份中英/浅深主题/窗口布局及截图。初始焦点检查缺少退出动画等待、主题夹具未应用完整属性及 aria-label 预期错误均保留失败日志；修正夹具，不减断言。两次批次并行完整门禁分别因菜单焦点时序和既有桌宠测试超时失败；桌宠定向复测与串行完整 `VITEST_MAX_WORKERS=1 npm run verify:local` 通过：332 静态安全、67 文件/368 tests passed、7 tests 既有跳过。未改桌宠、超时、安全规则或默认配置；并行桌宠超时根因仍待查。详见 [实施报告](MOXUN_PROJECT_CLEANUP_AND_QUALITY_REFACTOR_IMPLEMENTATION_REPORT_20261101.md)。

E 首批已将 Provider 详情 UI 从 `SettingsSheet.tsx` 提取为受控 `ProviderSettingsEditor.tsx`，不新建 state/Hook/存储、不改 App 或现有 controller/persistence owner。原 JSX 除窄 prop 别名和等价格式外一致，不保留第二份正文；panel/field ID、password、模型 imageInput metadata、默认模型回退、删除保护及保存后关闭时序保留。同一新增 gitignored 回归改前/改后及最终门禁中均通过：87 项内部检查、每版 12 组中英/浅深/窗口快照，DOM/字段几何/回调顺序完全一致，不宣称 PNG 逐像素相等。首次 fixture 换行转义失败原样保留。改前和改后完整串行门禁通过；改后为 333 静态安全、68 文件/369 tests passed、7 tests 既有跳过，新增数量分别为 1 个生产文件和 1 个本地测试，原安全脚本及锁文件 hash 未变。5 个预期代码/测试/报告路径及 lint 生成的 gitignored `.eslintcache` 单独记录，未发现文件缺失或其他用户/protected 内容改动；证据在 `evidence/stage-E-provider/`。

E 的 App/Terminal IPC 和其他 Settings 流程尚未迁移，G 的依赖候选未卸载。后续每阶段继续保存状态与本轮差异；补测批见下文，不能据自动化门禁通过宣称整个 A–I 计划全部完成。

## 剩余测试补充批

补测批新增两个历史 helper，修复恢复时旧 user/logId=1 游标与主动分页被实时上限裁剪；Main owner crash/完整主文档替换/destroyed 时回收该 owner 终端、撤销授权及取消待确认请求；locale effect 同步 HTML lang。Agent allowlist、Pi host 拒绝入口、文件审批与跨进程边界不变。新增/修改测试全部 gitignored，未提交。

真实 Renderer crash recovery、窗口关闭、Main SIGKILL、三种 iTerm 入口、共享 PTY 与 disposable loopback SSH 已有通过证据，用户原有两个 iTerm UUID 保留。23 项分页/owner 定向回归通过；完整应用三轮实际完成 100/500/1000 历史、36 组双语/主题/缩放（12 native、24 device-metrics 模拟）、AX/reduced-motion/Escape 和部分流式帧采样。最终 live 轮为 31 passed/2 skipped，漏设 opt-in 的 UI feedback 单独补跑 1 passed，原 minimize 跳过仍不算通过。改前 500/1000 分页失败，没有有效全量性能基线；未宣称性能优化或稳定 60 fps。

默认完整 `env -u VITEST_MAX_WORKERS npm run verify:local` 三轮通过，各 333 静态安全、69 文件/384 tests passed、8 文件/11 tests skipped；最后两轮 lint 0 warning，类型检查和构建通过，保留两条既有构建 import 提示。原有 87 项 Provider 行为断言不变；严格 PNG 对照仍失败，最后附加对照仅 3/12 字节一致且 native content/焦点条件有变化。空白窗口探针也无法得到原生焦点；保留 `MOXUN_PROVIDER_NATIVE_FOCUS_LIVE=1` 的额外严格检查和实际失败，默认隔离 Renderer 通过不冒充 native focus 通过。未加像素容差、关闭焦点环/动画、增加原用例超时或跳过原有行为用例。

最终只读资源审计 `owned-resource-audit-03.json` 覆盖 36 个有 provenance 的目录：无记录的自有 PID/socket/UUID 残留，用户原有两个 UUID 保留。65 个已完成临时目录、2501 个文件/链接记录 hash/symlink 校验后移入 `temporary-originals/`，保留快照和原内容，未永久删除。77 个本地测试全部 ignored、无 tracked tests。整轮最终 `final-04-round-audit.json` 为 108 路径（73 modified、24 moved、11 new），无额外缺失或 protected 内容变化；本批 `final-04-*` snapshot/diff 与 `final-evidence-sha256.json` 不覆盖旧基线或失败。

原生 minimize 环境不支持、Provider 原生焦点/严格像素、真实 native consent、VoiceOver/人工辅助技术、物理高分辨率窗口及付费模型未验收，不能宣称所有剩余测试全绿或 A–I 完成。所有失败/通过和阶段 hash 证据位于桌面 `test/Crescent-cleanup-20261101/evidence/remaining-tests/`，详见实施报告第 10 节。未提交、推送、发布或重新打包；最终门禁后仅更新收尾审计说明。
