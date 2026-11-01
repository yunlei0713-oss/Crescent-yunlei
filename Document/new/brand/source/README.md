# 品牌源文件

- `moxun-mountain-river-master.png`：最终批准的黑白水墨群山与蜿蜒河流工作主图，512×512。
- `generate-brand-assets.cjs`：从工作主图生成应用图标、Logo、favicon 和主题预览的脚本。

## 重新生成

在项目根目录运行：

```bash
node new/brand/source/generate-brand-assets.cjs
```

生成目标全部位于 `new/brand/`。脚本不会写入项目的 `build/`、`resources/` 或 `src/` 正式资源目录。

当前 1024×1024 图标是从 512×512 工作主图插值放大所得；如取得更高分辨率的正式原图，替换主图后重新生成即可。