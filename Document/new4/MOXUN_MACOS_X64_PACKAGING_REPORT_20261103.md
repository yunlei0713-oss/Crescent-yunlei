# 墨巡 macOS Intel 安装包验收记录

日期：2026-11-03。版本：1.0.12。目标：macOS Intel x64。

## 交付产物

输出目录：`dist/local-macos-20261103-chat-polish/x64/`。

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| `moxun-1.0.12-x64.dmg` | 262182738 | `fbbb626e204a33df98c5ca4146abe6d50c868bedcdbee092045ba5af48e90d9f` |
| `moxun-1.0.12-x64-mac.zip` | 268362873 | `74632db7a27cce8df99a1db63ddfbb5c6c097fd14ec959402a6e740357d6aad8` |

另有 `mac/墨巡.app`、`SHA256SUMS.txt` 和 `acceptance/` 验收证据。

## 构建与检查

使用项目标准入口，独立输出目录，构建期间冻结 `out/`：

```sh
CRESCENT_LOCAL_BUILD_DIR=dist/local-macos-20261103-chat-polish \
CRESCENT_OFFLINE_BUILD=1 npm run build:mac:local
```

- `npm run ci` 通过：lint、安全边界 344 项检查、类型检查和构建通过。
- `npm run test:local`：82 个文件通过、9 个跳过；504 项测试通过、14 项跳过。
- `scripts/smoke-packaging.cjs` 通过；只生成 macOS x64 产物。
- DMG 校验和 ZIP 完整性检查通过。
- 包内 286 个编译资源与本次 `out/` 逐项哈希一致，内置文档写作 Skill 已包含。
- 主程序、esbuild 和实际使用的 PTY 原生模块均包含 x86_64 架构。

## 隔离副本验收

将应用复制到仓库外临时目录，使用独立数据目录，验证包内运行时：

- Pi SDK 导入及空工具许可列表的隔离会话创建。
- MCP 客户端 ESM 导入。
- 从 ASAR 加载 node-pty，完成本机测试 PTY 启动与输出。
- PDF.js legacy worker 和文本提取，无需可选原生 canvas。
- 实际启动打包应用，加载验收会话并截图；阅读区 760px，定位条距离内容容器左侧 8px，静止标记宽 6px，行内代码换行装饰为 `clone`，角色与时间默认隐藏，完成用时分隔显示正常。
- 未绑定终端时上下文为 `none`，旧命令生成入口返回禁用状态。

证据位于产物目录 `acceptance/`：`results.json`、`compiled-assets.json`、`runtime-probe.log`、`app-ui.json`、`packaged-app.png` 等。

## 范围

这是未签名、未公证的本地安装包，构建使用 `--publish never`，没有发布或提交代码。验收未调用付费模型、连接业务终端或替代人工原生审批验证。Apple Silicon 原生运行不在本次范围内。
