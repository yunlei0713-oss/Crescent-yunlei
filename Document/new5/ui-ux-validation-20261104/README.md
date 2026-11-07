# 本轮独立验证证据

- `baseline-status.txt` / `final-status.txt`：原有与最终工作区改动。
- `skill-searches.txt`：全局 ui-ux-pro-max 本地检索的命令和输出，无 persist。
- `before-*.png` / `before-audit.json`：修改前实际 Electron，空聊天和辅助页面，原生窗口宽度 1440 / 800 / 560。
- `after-*.png` / `after-audit.json`：最终实际 Electron，合成历史、多工具、错误详情、附件及辅助页面；独立 Profile。
- `overflow-before-fix.png` / `after-first-batch-audit.json`：本轮视觉检查识别的导出按钮溢出，保留失败证据。
- `ci.log` / `test-local.log`：最终完整门禁；`*-first-batch.log` 为先前批次，`test-local-initial.log` 为临时父目录缺失导致的失败。
- `regression/`：既有 Electron 聊天和终端菜单回归在本轮的独立输出，不覆盖 new4。
- `token-contrast.json`：基础主题 Token 的对比度计算，非完整无障碍认证。
- `electron-*-runner.cjs.txt`：验收夹具原始代码，复制为临时 .cjs 后在仓库根目录运行。不是产品入口或新增 IPC。

实际原生截图为 2x 像素密度，CSS 内容高度受本机屏幕限制为 752 px；宽度检查使用实际 innerWidth，没有设备宽度模拟。`extra-*` 是中英文及知识资料辅助页检查。
