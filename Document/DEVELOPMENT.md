# 开发与 Mac 打包规范

按 2026-11-01 最新用户要求，**仅交付 Mac Intel（x64）包**，替代此前的 Universal 规则。应用名称为 `墨巡.app`，新安装包文件名前缀为 `moxun`；主程序为 Intel x64（Mach-O 名称 `x86_64`）。不生成 arm64、Universal、Windows 或 Linux 安装包。

## 开发门禁

- 遵循根目录 `AGENTS.md`、`.cursor/rules/` 和项目 `pi-dev` / `electron-development` skills。变更 Agent 或进程边界前，阅读已安装 Pi SDK 文档与类型。
- main 持有 OS、SSH、文件、数据与秘密；preload 只暴露验证过的 IPC；renderer 不访问 Node/文件系统。Pi 通过既有 lazy SDK facade 加载。
- Agent 永久无终端输入、执行、远程操作权限；旧计划执行器拒绝派发任何命令。文件修改经专用 Main 服务完整 Diff、一次性人工审批及写后验证。用户手动终端继续可用。
- 本地验证禁止连接生产环境实施变更，不自动提交、push、发布。不纳入明文密码、Token、原始敏感终端日志或用户配置。
- 运行 `npm run ci` 和 `npm run test:local`；测试文件保持 gitignored，禁止提交。测试规则见 [TESTING.md](TESTING.md)。

## macOS 图标与开发启动

- 正式母版只用 `Document/new/brand/source/moxun-mountain-river-master.png`。`npm run icons` 生成 UI PNG、网站 ICO 及 Mac ICNS/iconset；旧月牙素材只保留在 `Document/new/brand/archive/`，不得从归档恢复到构建目录。
- macOS ICNS 山水图铺满方形画布，不额外添加透明安全边、灰色底板、圆角或阴影。macOS 26 会自动将图标适配到标准 Dock 外框；为直角图额外留边会触发系统二次缩小，形成“灰色底板里的小图”。以系统实际渲染而非源 PNG 尺寸验收；更早的 macOS 版本仍需独立人工验收，不声明自动外框行为相同。
- `npm start` 是已构建产物的预览，不会编译源码；源码改动先运行 `npm run build`，或直接使用 `npm run dev`。
- `prestart`、`predev` 和 `postinstall` 在 Electron 启动前生成并写入原生开发 bundle 图标。原生名称为“墨巡”，开发 bundle id 为 `com.crescent.moxun.dev`，图标文件名包含内容摘要，避免复用旧 Crescent 图标缓存。Main 不再运行时切换 Dock PNG，启动、运行与最小化徽标统一使用 bundle ICNS。
- 正式包继续使用 `com.crescent.app`，原数据目录不变。`build:mac`、`build:mac:local` 和 `build:unpack` 都先生成图标；`afterPack` 在签名前将原生 `CFBundleIconFile` 改为带内容摘要的山水 ICNS，同时替换原引用文件，避免最小化徽标沿用旧文件名缓存。历史 `dist/` 安装包不会被自动覆盖或删除，必须重新打包才有新图标。
- 已运行的旧进程需要完全退出后重启。若 Dock 固定的是旧安装包，应移除该旧快捷入口、重新固定新应用；不要通过清空系统缓存、重启 Dock 或删除用户数据代替资源修复。

## 标准打包入口

```sh
npm run build:mac:local
```

此入口先运行完整 CI 和本地测试，再串行构建和打包，只生成：

```text
dist/local-macos/x64/mac/墨巡.app
dist/local-macos/x64/moxun-<version>-x64.dmg
dist/local-macos/x64/moxun-<version>-x64-mac.zip
```

`build:mac:unsigned` 和 `build:mac:local:x64` 转到这一入口，`build:mac:x64` 转到 `build:mac`。arm64 / Universal alias 及 Windows / Linux 打包脚本已移除；本地脚本仅接受默认或 `x64` 参数，其他架构直接失败。`electron-builder.yml` 的 Mac DMG/ZIP 目标明确设置 `arch: [x64]`。发布 workflow 只保留 Mac Intel 构建行，固定 `--mac --x64`；修改规则不触发远程 workflow 或发布。

`build:unpack` 固定为 Mac Intel 应用目录构建，并先运行完整本地门禁。`npm run build:mac` 是需要预先配置签名身份与公证凭据的打包入口，固定 `--x64 --publish never`。它也先运行 `npm run verify:local`，通过完整门禁后才打包。签名和公证需要联网且需另行安排；不会因打包而自动发布。

本地入口剔除继承的 Apple/签名凭据、禁用 signing / notarization / hardened runtime，并显式使用 `--publish never`。本地包供开发验证，不能据此宣称发行签名、公证或 Gatekeeper 验收成功。可用 `CRESCENT_LOCAL_BUILD_DIR` 指定 `dist/` 内的独立输出根目录，其下只有 `x64/`。正式 appId `com.crescent.app`、内部 npm 包标识和用户数据目录不因安装包更名而改变。

## Intel 原生依赖约束

保留 `asarUnpack` 对 node-pty、Pi、MCP SDK、Pi WASM 等运行资源的规则。移除已不适用的 Universal 合并配置，不删除运行时原生依赖或粗放扩大 unpack 范围。

Pi SDK facade 和 MCP client transport 的实际 import 依赖闭包也必须 unpack；electron-builder 会提升嵌套依赖，只有 `@earendil-works/**` 不足以覆盖 `highlight.js` 等运行模块。`electron-builder.yml` 使用有限包名清单，本地 `scripts/macos-esm-packaging.test.ts` 对当前安装依赖的 import 图做回归检查，不把整个 `node_modules` unpack。包内运行核验必须在仓库外的独立 `.app` 副本执行，避免向上解析到开发机 `node_modules` 而假通过。

node-pty 和 Pi 必须保留 x64 native prebuilds；依赖自带的其他平台 prebuild 不代表交付其他架构应用。原生准备脚本只准备锁定的 x64 esbuild，并拒绝其他 Mac 架构；即使在 Apple Silicon 主机打包，也不得误用宿主 arm64 可执行文件。Electron 主程序和 esbuild 的 `lipo -archs` 都应仅为 `x86_64`。PDF.js 预览和 worker 打入 renderer；Main 文本提取另需保留 legacy 模块及 worker。可选 native canvas 不进入运行包，必须验证该条件下的文本提取。

打包开始后必须冻结 `out/`，不得同时运行 CI/build 或另一个打包任务去重写输入。Mac 入口不自动清空整个 `dist/`；需要清理时只清理自己确认不再使用的输出目录。

## 离线构建

在可信联网准备机完成锁定依赖安装及 postinstall，预热当前锁定 Electron 的 **darwin-x64 ZIP**、electron-builder DMG 工具和锁定 esbuild Darwin x64 tarball 缓存。默认缓存在 `~/Library/Caches/electron`、`~/Library/Caches/electron-builder`；可通过 `ELECTRON_CACHE` / `ELECTRON_BUILDER_CACHE` 指定。还需携带兼容的 Node、源码/lockfile、node_modules 和 x64 native prebuilds。esbuild 缓存优先使用 `node_modules/.cache/crescent-native/` 已校验 tarball；本地脚本的 npm 缓存位于 `out/implementation/npm-cache`，也应一起准备。项目整理会归档这些本地缓存，离线打包前须恢复所需缓存。不得携带个人配置、凭据或生产日志。

```sh
CRESCENT_OFFLINE_BUILD=1 npm run build:mac:local
```

离线入口检查 x64 Electron、DMG 工具和 native 缓存；缺少资源直接失败，不再要求 arm64 缓存。esbuild tarball 以 lockfile SRI 校验，离线时不回退网络下载。使用已经安装好的依赖与本地资源；离线机不能以缺依赖的 `npm ci` 代替缓存准备。依赖或 Electron 版本升级后必须重新预热缓存。

## 产物验收

1. 确认只交付一套 Intel `.app` / DMG / ZIP，应用名为“墨巡”、安装包前缀为 `moxun`，主程序和 esbuild 仅含 x64，node-pty / Pi x64 native prebuilds 齐全。
2. 执行 `hdiutil verify <dmg>` 与 `unzip -tq <zip>`，记录 DMG/ZIP 的 SHA-256；确认包内 Pi/MCP 可以从 unpacked 路径加载、PDF lazy chunk 和本地 worker 存在。
3. 从实际打包应用用隔离的 `CRESCENT_DATA_DIR` / `CRESCENT_USER_DATA_DIR` 验证 Pi runtime、人工原生 PTY、Agent 执行拒绝、文件审批与多模态流程；禁止使用生产连接和真实敏感日志做夹具。
4. 在 Intel Mac 上记录实际运行；不宣称 Apple Silicon 原生支持或 Rosetta 验收。正式分发另需签名、公证与 Gatekeeper 验证。

2026-10-10 的 A～H 专项修复和验收记录已移入桌面 test，原名 `Crescent_v1.0.11_专项改造验收记录_20261010.md`，见 [归档映射](archive/README.md)。历史执行验收不是当前 Agent 执行授权，也不是本轮重新验收结果。
