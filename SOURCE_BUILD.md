# 从源码启动与构建

## 环境要求

- Node.js 22.19 或更高版本
- npm（随 Node.js 安装）
- 首次安装依赖时需要网络连接

## 开发模式

解压源码后，在项目根目录运行：

```bash
npm ci
npm run dev
```

`npm ci` 会按 `package-lock.json` 安装依赖并准备 Electron 原生模块。之后每次开发启动运行 `npm run dev` 即可。应用可以启动和浏览；要使用 AI Agent，还需要在应用设置中配置模型供应商和 API 凭据。

Pi 三个依赖统一使用官方 1.0.3，按 `package-lock.json` 安装；已移除 1.0.0 的安全重打包归档。2026-10-05 本地实施记录已移入桌面 test，见 [归档映射](Document/archive/README.md)。当前安全边界以 [安全模型](Document/SECURITY_MODEL.md) 为准：Agent 不执行终端命令，用户在外部 iTerm 操作；观察默认关闭，文件修改须人工审批。

## 编译和桌面安装包

```bash
# 编译主进程和渲染进程，输出到 out/
npm run build

# 完整本地门禁：CI（含类型检查和构建）+ 本地行为测试
npm run verify:local

# 本地无签名 Mac Intel 安装包（不发布）
npm run build:mac:local
```

本地安装包输出到 `dist/local-macos/x64/`。仅交付 Mac Intel（x64）的 `墨巡.app`、`moxun-<version>-x64.dmg` 和 `moxun-<version>-x64-mac.zip`，不生成 arm64、Universal 或其他平台包。`:x64` 命令是 alias；其他架构／平台打包入口已移除。`npm run build:mac` 用于已配置 Apple 签名与公证的场景；源码构建不能代替真机、签名和 Gatekeeper 验收。打包期间冻结 `out/`，详情见 [开发规范](Document/DEVELOPMENT.md)。

## 常见问题

- 如果 `npm ci` 失败，检查 Node.js 版本和网络，然后重新运行 `npm ci`。
- Windows 首次安装可能需要允许原生依赖安装脚本运行。
- 应用配置和用户数据保存在系统用户目录，不包含在源码压缩包中。
