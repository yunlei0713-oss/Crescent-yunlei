# 墨巡（MoXun）品牌图标设计说明

## 设计概念

**墨滴 + 巡检环（Ink Drop + Inspection Orbit）**

墨滴代表沉淀、洞察、知识与东方水墨气质；不闭合的巡检环代表持续观察、巡检和问题追踪；环上的青灰色节点代表发现、定位与下一步行动。墨滴内部的负形曲线代表排查路径，强调“AI 分析、人类操作”的协作方式。

## 设计性格

- 克制、冷静、可信、专业。
- 东方审美与现代软件图标结合。
- 以几何结构和留白建立辨识度。
- 避免书法字、传统印章、山水插画和复杂装饰。

## 色彩

| 名称 | HEX | 用途 |
|---|---|---|
| Ink 950 | #0B1112 | 图标底色 |
| Ink 900 | #111A1B | 深色面板 |
| Ink 700 | #293638 | 边缘、分隔 |
| Mist 100 | #EEF2EF | 主图形 |
| Mist 300 | #C5D0CA | 巡检环 |
| Smoke 500 | #82948E | 辅助线条 |
| Bamboo 500 | #86AAA0 | 路径节点 |

## 文件说明

- moxun-symbol.svg：透明背景的独立品牌符号，可用于浅色/深色界面二次适配。
- moxun-app-icon.svg：带深墨色底板的应用图标母版。
- moxun-wordmark.svg：横向图文组合标识。
- moxun-symbol.png：透明底 PNG 预览。
- moxun-app-icon-1024.png：1024×1024 PNG 预览。
- moxun-wordmark.png：横向 PNG 预览。

SVG 是可编辑源文件。PNG 是预览与交付副本。当前资产仅保存在 new/brand，不会覆盖项目现有图标或打包资源。

## 使用建议

- macOS Dock / Windows 任务栏：使用应用图标版本。
- 应用顶部和关于页：优先使用横向 Wordmark。
- 左下角或窄栏：使用独立符号。
- 终端区域不建议铺设品牌水墨纹理，以免影响命令可读性。
- 深色底使用当前浅色符号；浅色底需要单独导出深色符号版本。
- 小尺寸下优先保留墨滴和巡检环，避免缩小后细节消失。

## 正式替换注意事项

项目现有 scripts/generate-icons.cjs 会从 build/icons/crescent-logo.png 生成 Electron 图标、资源图标、Dock 图标和 Renderer Logo。正式接入时应评估并更新母版路径和资源引用，再运行项目既有图标生成流程。不要在设计审阅前覆盖 build/icon.icns、build/icon.ico、build/icon.png 或 resources/icon.png。


## 浅色背景版本

- moxun-symbol-light.svg：深墨色符号，适用于宣纸白、浅灰等浅色表面。
- moxun-wordmark-light.svg：深色文字版横向标识。
- 深色表面使用 moxun-symbol.svg 和 moxun-wordmark.svg。
- 应用 Dock 图标使用 moxun-app-icon.svg，不使用透明符号代替。
