# 墨巡品牌资源包

本目录是墨巡品牌与主题改造的唯一资源交付入口；正式应用接入记录见 `../IMPLEMENTATION.md`。

## 当前正式方向

黑白水墨群山 + 蜿蜒河流。此前的月亮、墨滴、圆环、轨道方案已废弃并归档。

## 目录

| 目录/文件                         | 内容                                           |
| --------------------------------- | ---------------------------------------------- |
| `source/`                         | 512×512 批准山水主图和可重复执行的资源生成脚本 |
| `app-icons/`                      | PNG 多尺寸、ICNS、ICO、macOS iconset           |
| `logos/`                          | 横版/竖版、浅色/深色 Logo                      |
| `favicon/`                        | 网站图标                                       |
| `theme/`                          | 水墨山河浅色/深色主题 Token、CSS、规范和预览   |
| `archive/previous-orbit-concept/` | 废弃的旧墨滴/巡检环设计                        |
| `brand-guide.md`                  | 品牌设计与接入规范                             |

## 关键文件

- 应用图标：`app-icons/moxun-app-icon-1024.png`
- macOS：`app-icons/moxun-app-icon.icns`
- Windows：`app-icons/moxun-app-icon.ico`
- 横版 Logo：`logos/moxun-wordmark-light.png` / `logos/moxun-wordmark-dark.png`
- 竖版 Logo：`logos/moxun-stacked-light.png` / `logos/moxun-stacked-dark.png`
- 主题规范：`theme/ink-wash-theme-spec.md`
- 主题 Token：`theme/ink-wash-light-tokens.json`、`theme/ink-wash-dark-tokens.json`
- UI 预览：`theme/ink-wash-preview-light.png`、`theme/ink-wash-preview-dark.png`（静态概念稿，不是当前应用截图）

## 重新生成资源

在项目根目录执行：

```bash
node new/brand/source/generate-brand-assets.cjs
```

该脚本只写入 `new/brand/` 内的资源，不会覆盖项目正式图标或修改应用源代码。

## 重要说明

当前批准的山水工作主图为 512×512 PNG。1024 图标由其高质量插值放大；若后续取得更高分辨率原图，替换 `source/moxun-mountain-river-master.png` 后重新运行生成脚本。

批准的主图已接入 `scripts/generate-icons.cjs`，执行 `npm run icons` 生成 build、resources、renderer 和网站 favicon。旧 Crescent 图标、旧兼容文件名和旧生成脚本已于 2026-11-04 从项目移除，资源生成不再保存旧图标备份。主题已接入现有主题系统。安全权限改造不随视觉资源回滚。
