# 墨巡测试与交付报告

日期：2026-10-30。此报告区分自动化证据与未完成的人工/真机验收。

## 环境

- macOS，本机 Electron 运行架构 x64，Pi 三包 1.0.3，应用 1.0.12。
- 所有 Electron 验收使用独立 `CRESCENT_DATA_DIR` / `CRESCENT_USER_DATA_DIR`、临时工作区与 loopback 确定性 SSE 模型服务。
- 原生图片确认由 runner 自动响应，明确属于测试夹具。未调用付费模型或生产集群。
- 日志根目录：`/private/var/folders/9b/zxdf7gd103xfwmrbskqdgq640000gn/T/opencode/`。

## 本地门禁

| 阶段                         | 实际结果                                |
| ---------------------------- | --------------------------------------- |
| 改造前 CI                    | 品牌脚本 lint 失败                      |
| 改造前本地测试               | 40 文件，245 项，3 失败                 |
| 中间版本完整 `verify:local`  | 47 文件，271 项通过；`moxun-verify.log` |
| 最终 CI / 本地测试           | `verify:local` 通过；324 项静态边界检查，48 文件、273 项本地测试通过 |
| 最终编译 Electron / UI       | 50 项通过；`moxun-electron-delivery.log` |
| Universal `.app` / DMG / ZIP | 打包完成，29 项完整性/资源检查通过；包内 Electron 50 项、实际可执行文件 16 项通过 |

最终门禁日志为 `moxun-final-verify.log`。其中本地工具记录测试曾有 5 项格式警告，随后仅调整该测试格式，独立 `eslint --no-cache` 及最终全量 `npm run lint` 均通过（0 警告，`moxun-final-lint.log`）；生产源码与打包输入未改变。`git diff --check` 通过。

## 行为测试覆盖

- 能力边界：异步 Agent 域拒绝 PTY/pipe 写入、中断、创建；Runtime 未知/旧/默认工具拒绝；主/子 Agent、本地模型真实工具调用与 MCP 连接前拒绝。
- 文件审批：未批准无写入、窗口 owner/digest、一次性消费、逐文件强确认、Hash 变化、过期/取消/队列、路径穿越、symlink、批量/move/delete/空目录和部分失败。
- 观察器：分块 OSC、编辑输入、真实失败退出码、未知边界、密码/OTP/私钥、交互式程序、多行/历史/补全、主机代次切换、长输出/JSON预算。
- Guided Ops：单回合单步、模型不得声明状态成功、目标切换失效、历史保留、取消后新回合和新草稿竞态。
- 多模态：实际格式/MIME/尺寸/授权/容量、双图 ImageContent、文本模型发送前拒绝、同 ID 能力撤销/恢复、原生隐私确认取消、实际 PDF 提取、文本脱敏。
- UI/回归：模型编辑能力往返、主题、滚动/Whale fixture、真实建议复制、完整 Diff 与审批按钮、窗口大小。
- 普通工具记录：完整审批内容不写入聊天 tool args，参数/结果在截断前脱敏。

## Electron 验收

Runner：本地临时目录中的 `moxun-electron-acceptance.cjs`，加载编译后的真实 Main、preload 和 renderer，启动真实本地 PTY，调用真实 IPC 与 Pi SDK。

第一轮 40 项通过，报告位于 `moxun-e2e-qXeytg/report.json`。扩展轮另外验证跨窗口代批拒绝、关闭 owner 后审批失效、实际聊天卡片、复制时 0 次 `terminal:write`、完整 Diff 及真实批准按钮写入；旧 runner 的“所有 dialog 都消失”断言误匹配应用隐藏 dialog，已修正。

最终编译轮 50 项全部通过：`moxun-e2e-JfhN3Q/report.json`。新增验证 Agent 分析期间真实 xterm 键盘输入仍可进入终端 IPC，完整 Diff 可选中复制，紧凑窗口无外层横向溢出。慢流夹具曾缺少 `finish_reason` 导致 SDK 重试；补齐协议结束事件后通过。

已查看实际截图：同目录 `06-guided-ui-dark.png`、`07-guided-ui-light.png`、`08-file-review-ui.png`、`09-compact-ui-light.png`，确认双主题、单步卡片、纯色完整 Diff、可用审批按钮与紧凑布局。静态品牌预览位于 `new/brand/theme/`，不是应用运行截图。

## Universal 产物与包内运行

输出目录：`dist/moxun-20261030/universal/`。

- 应用：`mac-universal/墨巡.app`。
- DMG：`crescent-1.0.12-universal.dmg`，355,763,801 字节。
- ZIP：`墨巡-1.0.12-universal-mac.zip`，357,935,061 字节。
- 校验文件：`SHA256SUMS.txt`。

```text
7011c11da3d4896dba92d273d2962e0469446c83378ab6a261b338d2ec644ece  crescent-1.0.12-universal.dmg
b31a3739357c215d1921ddb1eb049c9a360d93891d00b66f5b55f79982a5b060  墨巡-1.0.12-universal-mac.zip
```

验证结果：

- `hdiutil verify`、`unzip -tq` 均通过。
- 只读挂载 DMG 后，核对 `.app`、DMG、ZIP 中的 Info.plist、主程序、app.asar、通用 esbuild 及两架构 PTY，6 个关键文件 SHA-256 全部一致；挂载已卸载。报告 `moxun-container-report.json`。
- 主程序、Electron Framework、通用 esbuild 均包含 `x86_64 arm64`；node-pty、spawn-helper、Pi native 和 esbuild 平台 prebuilds 两架构齐全。
- Pi 三包 1.0.3、MCP SDK unpacked 资源可用；独立导入 MCP SDK 成功，未启动外部服务。
- Main PDF legacy/worker/标准字体/CMaps 与 renderer PDF chunk/worker 齐全；包中无可选 native canvas。
- 288 个 Main/preload/renderer 编译文件与冻结的 `out/` 输入逐字节一致；应用归档不含本地测试、验收夹具或源码树。
- 包内完整 runner 50 项通过：`moxun-e2e-2KxOxT/report.json`，包括真实双图传输、审批和人工键盘输入。
- 直接启动 `墨巡.app/Contents/MacOS/墨巡`，以隔离目录通过 16 项检查：真实 PTY、Pi 执行拒绝、单步建议、UI 文件审批及防重放、PDF 提取。报告 `moxun-packaged-launch-Y29dlh/report.json`，不是以开发 Electron 加载归档代替实际可执行文件启动。
- 已查看实际应用审批截图 `moxun-packaged-launch-Y29dlh/02-actual-package-diff.png`。

实际包内 PDF 文字提取成功；PDF.js 首次加载仍输出可选 canvas/DOMMatrix/Path2D 缺失的渲染能力警告。Main 使用文字提取路径，不调用画布渲染；这不表示 Main 支持 PDF 页面光栅化。未出现缺少标准字体资源的警告。

构建日志：`moxun-package.log`；资源报告：`moxun-artifact-report.json`；运行日志：`moxun-packaged-electron.log`、`moxun-packaged-launch.log`。本地签名、公证和发布均关闭。

交付目录下 `acceptance/` 保存最终报告、日志、验收脚本和实际截图副本，可在临时目录清理后继续查阅；不包含隔离运行的配置、数据库或附件目录。

## 尚需人工/外部环境验收

- Intel 与 Apple Silicon 各自真机运行；当前 x64 运行/静态 arm64 检查不能替代 arm64 真机。
- 用户实际旧数据副本恢复、Keychain、原自动更新签名链和安装覆盖；不访问或迁移用户个人数据。
- 隔离 SSH/跳板/多级 SSH、sudo/密码/OTP、vim/less/top、mysql/psql/kubectl 的完整人工操作矩阵。纯观察器/既有回归测试不等于每项真实服务验收。
- 真人图片隐私检查、不同供应商视觉识别效果、中文复杂 PDF/扫描 PDF 的实际资料验收。
- 签名、公证与 Gatekeeper；本地包明确禁用这些步骤。

这些项目不标记为通过，也不通过恢复 Agent 执行能力规避。
