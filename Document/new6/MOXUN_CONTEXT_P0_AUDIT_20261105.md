# P0 代码与迁移审计

- 手动压缩从用量栏或 `/compact` 经 typed preload 和 `agent:compact` 到 Main。宿主校验窗口所有权和忙碌状态，在会话互斥内调用 Pi。Pi 1.0.3 用内存 SessionManager，压缩后追加 CompactionEntry，将摘要与保留消息投影到运行态。原始聊天由 Renderer 保存到独立的 SQLite，运行态摘要原先不跨重启。
- Pi 已启用 threshold/overflow 自动压缩。阈值取决于模型窗口和输出预留，保留窗口按 Token 预算计算。运行时已收到压缩事件。实施应在同一事件链记录检查点并验证，无需第二个触发器。
- 主库由 `crescent-sqlite.ts` 和 `sqlite/conversations.ts` 管理。会话别名映射到稳定 Conversation ID。旧记录主键是 (tab_id, log_id)，引用不能只使用数字 ID。日志有 kind、created_at、updated_at、run_id；角色和实际执行状态必须分开。现有修订统计可能漏掉同长度编辑。新增事务性变更计数区分追加与编辑/删除，编辑/删除使包含旧内容的派生检查点失效。
- `storage/ipc.ts` 是日志写入、编辑和删除入口。现有会话摘要是独立的旧显示逻辑。跨库清理需要持久化补偿，来源读取和审核仍要校验原始行，避免清理延迟造成可召回残留。
- `memory/service.ts` 使用独立 memory.db，WAL 和外键开启，旧条目、学习记录、关系和设置必须保留。Memory Center 经 `knowledge-ipc.ts` 和 `preload/modules/knowledge.ts` 管理。提取及自动学习已使用目的地绑定同意和 AbortSignal，延续既有入口；新增模型输出必须引用同一输入分块内可验证的原始证据。
- Electron 41.10.7 的 Node SQLite 为 3.53.1，实测 FTS5/trigram 可用。中文两字、端口和精确标识符需要额外词元策略。对旧库增量回填，启动不扫描正文。测试使用临时目录中的旧 schema 和合成源数据。
- 备份策略：应用退出后复制整个数据目录（包括 SQLite 的 WAL/SHM 若存在），或者用 SQLite 一致性备份分别保存两库；在副本验证后再升级。回退时使用同一时点的两库备份。迁移版本分阶段写入，事务失败不继续写新 schema。
- 基线 `npm run ci` 已完成，348 条安全边界检查通过且 Main/Preload/Renderer 构建通过。全量本地测试与实现前基准数据见最终报告。

```text
手动压缩
用量栏 / compact → typed Preload → Main 的 owner 校验和会话互斥
  → Pi 内存 SessionManager → compactionSummary + 近期消息 → 后续模型请求

自动压缩
Pi 模型用量与输出预留 → threshold / overflow → 同一运行态投影
  → compaction_start / compaction_end → Main 的事件桥 → 聊天用量与诊断状态

独立原文与记忆
聊天保存 / 更新 / 删除 → Main SQLite → Conversation + Agent Logs + Runs
历史整理 → 目的地绑定授权 + 脱敏输入 → 模型 → revision 校验 → memory.db 候选
Memory Center 人工审核 → 已批准记忆 → Main 作用域过滤 → 当前模型请求
```

基线本地回归结果为 86 个文件、516 项通过，另有 9 个文件中的 14 项跳过。
