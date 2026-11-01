# 历史材料归档

用户指定：旧架构、废弃模块、重复实现和失效资源移到桌面 `test`，不永久删除。

本轮位置：`/Users/xusong.yu/Desktop/test/Crescent-cleanup-20261101/`。

| 目录 | 内容 |
| --- | --- |
| `retired/` | 本轮移出的文件/历史构建，保持仓库原相对路径 |
| `already-deleted-at-start/` | 开始时已经删除的 33 个文件的 Git HEAD 版本，仅导出，不恢复源码 |
| `workspace-before/` | 开始时文件内容备份，包含旧 README/架构/执行约定和原有未提交修改 |
| `evidence/` | Git 状态/diff、引用表、移动清单、SHA-256、测试日志 |

`retired/Document/` 保存 Document 根目录旧 fix、实施报告及 2026-10 专项计划/验收原文。`retired/plan.json` 保存 2026-07 规划。`retired/dist/` 保存旧安装包与应用，当前 `dist/moxun-20261101/` 不移动。原文与日期不改，不把旧测试通过或旧 Agent 执行设计当作当前事实。

旧报告中的相对截图/源码引用属于历史快照，部分开始时就已经失效；本轮不伪造旧证据。仍被 protected 材料引用的 `out/implementation/` 保留，详情见本轮审计/实施报告。迁移目录的逐项路径及 hash 见归档 `evidence/moved-files.json`。外部归档不会随仓库分发；协作者如需原文，须由用户提供归档。
