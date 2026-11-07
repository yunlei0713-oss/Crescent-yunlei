# 墨巡旧品牌图标与操作入口修复

日期：2026-11-04。依据桌面问题记录和三张截图实施，并按后续要求排查全项目旧 Crescent 图标。现有 ZIP、DMG 保留；本轮不重新打包。

## 完成的修改

- 删除 `Document/new/brand/archive/crescent-legacy/` 和 `retired-compatibility-paths/` 中 38 个旧图标、兼容副本及旧生成脚本。另清理本轮测试产生的 2 张过期图标模拟截图。删除清单只保留路径和 SHA-256，不保存旧图像。
- `scripts/generate-icons.cjs` 只从批准的山水主图生成资源，不再备份被替换的旧图标。重新执行 `npm run icons` 后，旧目录没有重新出现；源码、资源、打包目录及网站没有旧 Crescent 图标文件名或有效引用。
- 原生图标准备同步默认、原引用及历史生成别名，移除旧 asset-catalog 图标名；开发启动即使字节未变化，也刷新 Launch Services。Main 显式设置同一主图生成的运行时 Dock 图标，覆盖可能继承的旧图像。保持既有应用标识与数据目录。
- 顶部、侧栏及确认弹窗统一使用“归档对话”：停止 AI 回复、审批及全部观察，保留聊天记录，终端和任务继续运行。
- “管理终端”菜单区分“移出此对话”和“终止终端进程…”，分别显示影响说明。前者停止当前终端观察并保留终端；后者以危险操作样式展示，仍通过 Main 原生确认，终止 Shell 和前台任务。绑定已有 iTerm 的菜单只提供移出操作。
- 侧栏外层名称及无障碍标签统一为“设置”；子菜单保留 Agent 设置、MCP 服务、Skills 管理、语言。中英文同步。

运行时图标使用 Electron 官方 [Dock.setIcon](https://www.electronjs.org/docs/latest/api/dock#dockseticonimage-macos)；原生 bundle 图标仍单独准备，并未用运行时设置替代冷启动资源。

## 验证

- `npm run ci`：最终校验中的 lint、安全边界检查（345 项）、类型检查、Main/preload/renderer 构建通过。
- 真实 Electron 组件：32 项检查通过，包含中英文设置入口、键盘开关与 Escape 焦点返回、终端操作分流、稳定 session ID、已有终端限制、重开期间禁用及窄窗口布局；浅深主题截图已核对。
- 图标及相关定向回归：4 个文件通过，8 项通过、1 项跳过。检查实际 Main 启动时传给原生 Dock API 的资源确实为批准图像；系统导出的注册图标保留外框，没有二次缩小。该导出不能单独证明实时 Dock 图像更新。
- `npm run verify:local` 最终通过：CI 通过；全量本地测试 83 个文件通过、9 个跳过，505 项通过、14 项跳过。

首次全量本地测试有 504 项通过、14 项跳过，供应商编辑器的一项 compositor 截图稳定性检查失败；该测试随后单独复跑和最终全量复跑均通过，原始结果保留在证据目录。

## 验收边界与证据

本环境无法使 Electron 窗口进入最小化状态，最小化／恢复图标验收保留为跳过，仍需人工复核。Main 原生 Dock API 调用及图标资源检查通过；实时 Dock 图像与截图中的最小化徽标仍需人工复核。

UI 测试使用真实组件和合成 IPC，原生图标测试使用独立 Electron Profile；不连接业务终端或付费模型，不代替真实终端原生授权验收。本轮没有修改终端管理权限或 IPC 调用边界。测试仍为本地 gitignored 文件，未提交 Git。

证据目录：[issue-actions-validation-20261104](issue-actions-validation-20261104/)。

- [浅色终端菜单](issue-actions-validation-20261104/menu-zh-CN-false.png)
- [深色终端菜单](issue-actions-validation-20261104/menu-zh-CN-true.png)
- [32 项交互检查](issue-actions-validation-20261104/results.json)
- [旧文件删除清单](issue-actions-validation-20261104/removed-legacy-assets.json)
- [图标及相关定向回归](issue-actions-validation-20261104/targeted.log)

- [最终完整校验日志](issue-actions-validation-20261104/verify-local.log)
- [源码与资源图标复查](issue-actions-validation-20261104/source-icons-audit.json)

- [最终原生图标资源及 Dock API 启动检查](issue-actions-validation-20261104/native-final.log)
