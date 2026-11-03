# 墨巡 new4 实施报告（2026-11-03）

本报告记录源码实施和本轮实测，**不是全部 P0/P1 发布验收完成声明**。原计划中的 shared 窗口关闭保留 PTY 语义优先于开头的旧问题描述。未提交、推送、发布或制作安装包；只执行源码构建。本轮证据目录：`/Users/xusong.yu/Desktop/test/Moxun-new4-20261103-u8k5edpz`。

**最新复测：2026-11-03 19:19，完整 `npm run verify:local` 通过（437 passed / 14 skipped / 0 failed），真实 iTerm 独立 opt-in 通过。** 第 8 节保留初轮失败历史，第 11 节记录此次复测及证据。

## 1. 已实施与待验收

已实施 Conversation 持久化／归档恢复、Guided Ops SQLite 历史和 1～3 条建议、批次文件确认、shared 窗口状态和显式管理、existing UUID 消失后的解绑、目标导航与 32px 应用标题栏。Agent 终端执行权限仍永久禁止，没有改动桌宠、主题母版、依赖版本、锁文件、Bundle ID 或签名／公证策略。

Dock 的开发版和当前安装版资源原已正确；根因证据是固定项仍指向不存在的 `Desktop/Crescent-test/dist/local-macos/x64/mac/墨巡.app`。已只将此固定项改指向 `/Applications/墨巡.app`，移除该项的失效 bookmark 后由 Dock 重建，刷新该 Bundle 的 LaunchServices 注册并重启 Dock。其他固定项逐项深度比较一致，没有清空配置或全局 LaunchServices。回退副本位于证据目录的 `private/dock-before.private.plist`，权限 0600，目录 0700。原生 Dock／Finder 最小化截图仍未取得，不将资源 hash 和偏好核对当作视觉验收。

初轮真实 iTerm 连接实测失败于 `ITERM_UNAVAILABLE`（osascript 约 15 秒失败）；Computer Use 对 iTerm 明确拒绝访问，对 Dock／Electron 的原生状态读取也超时。**2026-11-03 19:16 复测已通过真实 iTerm 独立用例**，取得关闭／重开后真实 PID、socket、cwd、环境变量与前台任务连续性的成功证据，见第 11 节。没有关闭整个 iTerm，也没有操作用户原有 Shell。真实二次确认、其他窗口隔离或 iTerm 整体退出等未覆盖场景仍待验收。

## 2. 最终身份关系

```text
Conversation ID（新对话随机稳定 ID；旧记录兼容旧 tab_id）
 ├─ conversations：title / summary / project / archived_at
 ├─ agent_logs / agent_runs / ops_history_records：conversation_id
 ├─ guided_ops_steps：conversation_id + 事务 step_number
 └─ terminal Tab A / B / …：各自 tab.id 和 sessionGroupId 运行态组织
      └─ Main session ID（稳定 PTY 身份）
           └─ iTerm UUID（可关闭／更换）
                └─ ObservationGrant（owner + Conversation + Tab + generation + UUID）
```

新建外置终端使用新的终端身份，避免重用仍被已解绑 shared PTY 占有的 Tab ID。根终端关闭只转移 UI 承载；消息／Run／摘要／Guided 历史不改归属。恢复历史创建新的终端承载，显式清除归档状态，不恢复旧 UUID、PTY、观察、SSH 登录或文件审批。结束对话先等待 Main 取消 Run、保存元数据／当前日志并解绑全部终端；shared PTY 进入独立管理区，existing 仅 detach。

## 3. SQLite migration 与核对

`sqlite/conversations.ts` 在 `BEGIN IMMEDIATE` / COMMIT 中新增 `conversations`、四张旧表的 nullable `conversation_id` 和索引，并补建孤立日志／Run／反馈的 Conversation。保留所有旧列、主键、正文、trace、Token、时间和反馈，不根据标题或时间猜测合并。失败回滚 additive DDL，数据库初始化失败会关闭句柄以便重试。

`conversations` 字段：`conversation_id PRIMARY KEY, title, summary, project_id, title_locked, created_at, updated_at, archived_at`。

真实 `~/.crescent/crescent.db` 只以只读连接备份到私有临时副本；迁移未作用于用户原库。副本连续初始化、独立进程再次初始化结果相同：814 个 Conversation，516 条非空历史；原 801 条终端元数据对应 13 个额外孤立历史身份，没有按相似文本合并。临时副本校验后销毁，不在交付目录保留原始聊天内容。

| 原表 | 迁移前后行数 | 原有全部字段的 SHA-256（前后相同） |
| --- | ---: | --- |
| session_tabs | 801 | `6485fa8b368d1d0010c9b649862b97c42751e108bd7a747403f36308f61faa19` |
| agent_logs | 5772 | `b59752851b2a350be561582e861ccc7cbeec9d066c67d5ac6b9ce8416ab1ec8c` |
| agent_runs | 780 | `cb09d7bc2a6abe691278a4be79a740f8323f399f96b2c296b86e94b1203b5103` |
| ops_history_records | 0 | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` |

`PRAGMA integrity_check=ok`。证据：`migration-before.json`、`migration-after.json`、`migration-run.json`、`migration-second-process.json`、`migration-copy-disposal.json`。空反馈表不构成真实反馈数据迁移覆盖；合成用例覆盖旧结构／孤立消息／回滚。

回滚方式：失败事务自动回滚；上线前应另外保留自己的 SQLite 一致性备份。回退旧应用时优先恢复该备份，迁移后新消息须先保全；本轮不提供自动 DROP 列／表，也不删除历史来回滚。当前用户原库尚未迁移，无需回滚。

## 4. Guided Ops 历史与建议

`guided_ops_steps` 字段：`proposal_id PRIMARY KEY, conversation_id, terminal_tab_id, run_id, step_number, created_at, goal, proposal_json, state, updated_at`。唯一约束为 `(conversation_id,step_number)` 和 `(conversation_id,run_id)`；查询索引覆盖 Conversation 游标、终端时间和 run。

`agent.listGuidedOpsHistory({conversationId, terminalTabId?, beforeCursor?:{createdAt,proposalId}, limit?})` 返回 `totalCount,items,hasMore,nextCursor`。默认 30、上限 100，按 `(created_at DESC,proposal_id DESC)` 排序，游标独占；插入新记录不会移动旧游标。事务内分配 step，持久化成功后才发布当前提案。wait／skip／interrupt／complete 和目标失效同步状态。

86 步实测：30 + 30 + 26 分页全部可读；中途插入第 87 步，旧游标读取原 86 步不重复、不遗漏。超过 100 个运行态会话淘汰后历史仍在；重建 GuidedOpsService 后 goal 和 step 连续；重复 run 被拒绝。SQLite 是历史 owner，`snapshot.history` 只留空数组兼容字段。保存脱敏建议及必要 host/cwd 标签，历史 `valid=false`；不保存原始 TerminalEvidence、UUID、owner 或 ObservationGrant。

Prompt、风格／工具目录、TypeBox `alternatives maxItems=2`、Main 及 Renderer 统一为 1～3 条。proactive 与用户回合均不凑数；保留去重、命令文本检查、凭据检查、风险标签及复制前目标复核。历史命令只能复制为历史文本，明确要求重新核对目标与风险，没有执行队列。

## 5. 文件批次审批

完整逐文件 Diff／原始和新内容、全部高影响路径清单、唯一批次复选框、拒绝和要求调整均保留。未确认／过期／busy 的原因显示在审批底部。digest 更新重置确认；切换语言保持确认。无 strongApproval 的批次不增加空复选框。

Main 对 required strongPaths 做精确集合比较，缺失／重复／额外路径均拒绝；继续校验 request/owner/run/digest/expiry、path/symlink、原始身份／hash、移动目标、mutation queue 和写后验证。定向安全用例覆盖 create、update、update+delete、overwrite、move、mkdir/rmdir、拒绝、过期／排队取消及部分失败。Renderer 只提交确认结果，不能替代 Main 校验。

## 6. 终端状态、原生证据与限制

shared 状态为 attached / window-closed / reopening / status-unknown / ended。精确 UUID 确认 missing 才进入 window-closed，清除 UUID／观察和实时证据，保留同一 PTY、Shell、Socket、目录和管理器对象。重开合并并发请求，仅创建 iTerm 前端；Socket 确认连接后才发布新 UUID。超时保留 PTY，并记录待连接 UUID，避免迟到连接造成双窗口。新 UUID 不继承观察。

`terminal:external-window` 与真正 `terminal:exit` 分离；existing 的暂时错误不会退出，只有 UUID 消失才 detach。显示／重开／结束、解绑均经 typed Preload；结束 shared 需 Main 原生确认后再次验证稳定 session ID，重复结束幂等。会话列表按 sender owner 过滤，Agent-origin 管理操作直接拒绝。Main 退出继续使用 new3 reaper，不新增守护进程。

模拟测试通过：shared PID=7654 / Main session=10 在窗口关闭和重开之间保持，现存 Socket 桥接可重连；窗口丢失无 onExit；Automation denied／unavailable 不 kill；Main 撤销证据；解绑后能枚举；取消原生确认不结束，确认后只结束一次；其他 owner 不能枚举，Agent 不能调用四个管理入口。以上 PID 是模拟值，**不是本机真实 Shell 连续性证据**。

真实 iTerm 用例已补充记录 PID、cwd、环境、前台任务和 Socket 的断言及 `continuity.json` 输出，但本轮在创建前端时超时，没有获得这些成功证据。默认门禁中的真实 Electron reaper normal／SIGKILL／ignore-HUP 回归与本轮 iTerm UI 实测分别统计，不把无窗口的 reaper 检查当作完整原生生命周期验收。

## 7. UI、图标与截图范围

- Guided 面板去除 mt-6/pt-5/py-5 的过大间距；父内容是普通 flow-root，无固定最小高度。空状态按内容收缩，建议数决定真实卡片数。
- 单终端的目标／状态与控制合并，多终端才出现切换条；侧栏始终代表 Conversation。项目行和当前标题栏均有结束入口。
- 应用内容标题栏 48→32px，并承载当前聊天标题／结束动作；BrowserWindow 原生 frame、macOS 红黄绿和原生拖动区域没有修改。
- 开发 Bundle `/Users/xusong.yu/Desktop/moxun-test/node_modules/electron/dist/Electron.app`：`com.crescent.moxun.dev`；当前 `/Applications/墨巡.app`：`com.crescent.app`。两者 `CFBundleIconFile=moxun-34d238232cfc486c.icns`，SHA-256 均为 `34d238232cfc486cfd0b7513addbaa81d6d4396f8f9acbfda8080c10224342e1`，与 `build/icon.icns` 相同。旧 `/Applications/Crescent.app` 仍有旧图标，不是本次固定项的新目标，没有修改旧安装副本。

隔离真实 Electron Renderer 通过 25 项 UI 断言（属于 1 个 Vitest 用例），保存空建议、批次确认和 86 步历史截图；IPC 为合成数据。完整 built app 用例通过稳定身份、归档／恢复、无终端恢复和 32px／无横向溢出检查，不调用真实供应商。

800×600 的实际原生内容尺寸符合请求；1440×900 和 1920×1080 在当前桌面实际被 macOS 限制为 1440×757、1920×757，已记录 requested/native/CSS 尺寸和 native focus。截图是 Electron capturePage，不是完整桌面 Dock 截图。未测真实全屏、最小化／恢复、原生窗口按钮点击及所有 Retina 缩放。

原计划引用的 image-1～image-6 原始图片不在 `Document/new4`，本轮未伪造原截图或“逐图前后对照”。当前截图与实际分辨率清单见证据目录的 `screenshots/` 和 `screenshots.json`；不同夹具的截图不能作为同场景像素前后对照。

## 8. 完整门禁与失败记录

本节为初轮实施时的历史结果；最新门禁已通过，详见第 11 节。

| 命令／范围 | 实际结果 | 日志 |
| --- | --- | --- |
| 首轮 `npm run ci` | lint / 341 安全检查 / Node+Web 类型 / 构建通过；有本地测试格式 warning，随后显式绕过 prettierignore 仅格式化测试 | `moxun-new4-ci-01.log` |
| `npm run test:local` 首轮 | 5 failed / 429 passed / 14 skipped，另有 5 个异步夹具错误；不是通过 | `moxun-new4-tests-01.log` |
| `npm run verify:local` 中间轮 | CI 通过；1 failed / 433 passed / 14 skipped，唯一失败为 Provider compositor screenshot 未稳定 | `moxun-new4-verify-01.log` |
| 最终 `npm run ci`（完整门禁子命令） | **通过**：lint 无 warning、341 安全检查、Node/Web 类型检查与 Main/Preload/Renderer 构建；保留两条既有 static/dynamic import 构建提示 | `moxun-new4-verify-final.log` |
| 最终 `npm run test:local`（完整门禁子命令） | **1 failed / 436 passed / 14 skipped**；75 files passed、1 failed、9 skipped（85 files / 451 tests） | 同上 |
| 最终 `npm run verify:local` | **整体失败**，不能称为全绿；失败为未修改的 ProviderSettingsEditor 截图在 `provider-en-false-1920` 未取得连续三帧相同位图 | 同上，原失败截图／焦点与帧诊断另存 `provider-final-failure/` |
| Main shared 生命周期／owner／观察定向 | 21 tests passed，含原生确认模拟、错误 scope、重复结束及 Agent 拒绝 | `moxun-new4-terminal-main-03.log` |
| Conversation migration／归档恢复、Controller 定向 | 5 tests passed；临时 DB 和模拟 IPC | `moxun-new4-lifecycle-final.log` |
| 新 Renderer UI 与 built app | 最终完整门禁中各 1 test passed；Renderer 内部 25 检查，built app 内部 5 检查／3 组原生尺寸 | `screenshots/renderer/browser-checks.json`、`screenshots/built-app/results.json` |
| 真实 iTerm 独立 opt-in | **1 failed**：ITERM_UNAVAILABLE / Automation 超时，没有 PID/cwd 连续性成功证据 | `moxun-new4-native-terminal-01.log` |
| Dock 配置修复 | 精确一项 URL 修复，bookmark 已自动重建，其他固定项全部未变；没有真实 Dock 截图 | `dock-repair-verification.json` |

最终 14 个默认 opt-in 跳过项来自：ui-feedback（1）、native app-icons（2）、full-app-quality（1）、vision-live（1）、terminal-text-stream 原生编辑（2）、zhangke-continuity（1）、electron-proactive（1）、electron-iterm（1）、live-iterm（1）、full-app-lifecycle（3）。没有更改这些 opt-in 条件。真实供应商／业务集群／付费视觉请求没有开启，跳过不算通过。

Provider 单独复验两轮和完整门禁两轮均保留失败，发生视口不同（中文浅色 1920／2560、英文深色 2560、最终英文浅色 1920），根因未确认；未修改该组件、测试、2 秒三帧一致检查、原生控件或超时。原生 Computer Use 尝试也未获得可用控制结果，不据此把视觉问题归因于已解决的焦点／GPU 条件。

中途失败均保留：最初 shared 测试未建立前端就开启观察（按新契约补齐前端），回调 wrapper 误作为 spy（修正夹具）；新 Renderer 测试检查数量写成 24、实际 23（增加有意义的 expiry 两项，不删断言）；首轮完整测试的旧 strongPaths 夹具和缺失 saveTabs mock、项目恢复误把 Terminal Tab 当 Conversation（按新契约更新）。新 built-app 夹具的窗口全局 mock 和选择器转义错误也已修正，未改产品来迁就夹具。未提高默认超时、跳过失败测试或放宽截图像素断言。

历史 new2/new3 的失败和验收边界没有改写。真实 iTerm 超时、Provider 截图稳定性和 Computer Use 限制独立保留。

## 9. 实际修改文件

不含未改写的原计划。逐文件 hash 及目的另存 `implementation-files.json`。

| 文件 | 修改目的 |
| --- | --- |
| `Document/ARCHITECTURE.md` | 同步稳定 Conversation、SQLite、窗口事件与管理职责。 |
| `Document/EXTERNAL_TERMINALS.md` | 明确暂停、窗口关闭、解除关联、归档、重开与显式结束的不同语义。 |
| `Document/SECURITY_MODEL.md` | 说明授权身份、脱敏历史和精确批次确认边界。 |
| `Document/TESTING.md` | 新增本地用例入口、隔离范围及原生验收限制。 |
| `src/main/agent/guided-ops.ts` | 当前运行状态与历史分离，允许 1～3 条建议并写入状态。 |
| `src/main/agent/ipc.ts` | 历史分页入口及稳定的 Pi session／compact／handoff 标识。 |
| `src/main/agent/pi-guided-ops.ts` | 模型工具 schema 允许 0～2 条备选，描述与 Main 保持一致。 |
| `src/main/crescent-sqlite.ts` | Conversation 元数据与归档／恢复；消息、Run、反馈和摘要按对话查询。 |
| `src/main/security/file-change-approval.ts` | 拒绝重复、缺失或额外 strongPaths，保留原安全校验。 |
| `src/main/storage/ipc.ts` | 有类型归档／恢复入口、摘要别名归一和反馈归属兼容。 |
| `src/main/terminal/external/observed-session.ts` | 仅确定 UUID 消失才退出，暂时错误退避重试。 |
| `src/main/terminal/external/shared-session.ts` | 窗口状态、UUID liveness、封顶退避、原 PTY 重开与幂等结束。 |
| `src/main/terminal/ipc.ts` | 窗口事件、shared 托管列表、解绑、重开、原生确认结束与 owner 校验。 |
| `src/main/terminal/observer/terminal-observer.ts` | 目标身份纳入稳定 Conversation，保持主机分段策略。 |
| `src/main/terminal/session/types.ts` | 窗口事件与托管／Conversation 属性契约。 |
| `src/preload/modules/agent.ts` | 只暴露历史分页 typed API。 |
| `src/preload/modules/storage.ts` | 归档与恢复 typed API。 |
| `src/preload/modules/terminal.ts` | 窗口事件、listShared、detach、reopen、end typed API。 |
| `src/renderer/src/App.tsx` | 对话归档协调、最后日志刷写、shared 解绑不终止、独立管理区与紧凑标题栏。 |
| `src/renderer/src/components/AppSidebar.tsx` | 项目结束回调及历史／活动 Conversation 去重。 |
| `src/renderer/src/components/ChatWorkspace.tsx` | 历史脱离终端存活状态；暴露稳定 Conversation 测试／语义标记。 |
| `src/renderer/src/components/ConversationTerminalSelector.tsx` | 多终端目标命名与连接状态，避免使用聊天标题。 |
| `src/renderer/src/components/ExternalTerminalControls.tsx` | 窗口状态、观察、解绑和 shared 生命周期入口；单终端合并目标行。 |
| `src/renderer/src/components/FileChangeReview.tsx` | 完整 Diff 后唯一批次复选框；digest 重置；底部可见的禁用原因。 |
| `src/renderer/src/components/GuidedOpsPanel.tsx` | 按内容收缩，运行快照与独立历史组件分离，终端切换保留历史页。 |
| `src/renderer/src/components/ProjectSidebar.tsx` | 项目聊天结束入口和稳定 ID 去重。 |
| `src/renderer/src/hooks/useAgentController.ts` | 提交前保存稳定映射并再次检查当前 run；统一 1～3 条主动提示。 |
| `src/renderer/src/hooks/useAgentRuns.ts` | 消息更新按稳定 Conversation 持久化。 |
| `src/renderer/src/hooks/useExternalTerminals.ts` | 连接时传 Conversation ID；终端仍有独立身份。 |
| `src/renderer/src/hooks/useHistoryController.ts` | 重命名按 Conversation 匹配活动聊天。 |
| `src/renderer/src/hooks/useTerminalCollaborationLifecycle.ts` | 区分窗口关闭与 PTY exit，清除 existing 绑定但保留消息。 |
| `src/renderer/src/hooks/useTerminalTabs.ts` | 根承载提升时保留 Conversation ID 和聊天标题。 |
| `src/renderer/src/i18n/en.ts` | 结束对话文案不再承诺终止 Shell。 |
| `src/renderer/src/i18n/zh-CN.ts` | 结束对话文案不再承诺终止 Shell。 |
| `src/renderer/src/lib/terminal-tabs.ts` | 独立 conversationId；external 元数据可保存但无 UUID／grant；导航保持聊天标题。 |
| `src/shared/agent-prompt-discipline.ts` | 建议数量统一为 1～3 条，不凑数。 |
| `src/shared/agent-run-prompt.ts` | 用户及主动回合采用同一建议数量／安全约束。 |
| `src/shared/agent-style.ts` | 各种回复风格保持同一建议数量规则。 |
| `src/shared/agent-tool-catalog.ts` | 工具目录说明与实际建议能力一致。 |
| `src/shared/agent-types.ts` | 持久化元数据新增稳定 Conversation ID／标题。 |
| `src/shared/external-terminal.ts` | 窗口状态、前端代次和 shared 管理条目类型。 |
| `src/shared/guided-ops-types.ts` | 独立历史查询、页、游标与历史项类型。 |
| `src/shared/terminal-observation-types.ts` | 观察绑定键纳入 Conversation。 |
| `src/main/sqlite/conversations.ts` | 事务化增量迁移、孤立历史补建、稳定别名解析。 |
| `src/main/sqlite/guided-ops-repository.ts` | 事务分配步骤号、run 去重、脱敏投影和 keyset 分页。 |
| `src/renderer/src/components/GuidedOpsHistory.tsx` | 默认最近 30 条、真实总数、加载更早、保留已加载页及完整命令文本。 |
| `src/renderer/src/components/ManagedSharedTerminals.tsx` | 展示已解绑或对话归档后仍由 Main 托管的 shared PTY。 |
| `src/renderer/src/components/SharedTerminalActions.tsx` | 统一显示／重开和原生二次确认结束按钮，防重复提交。 |

另新增本实施报告 `Document/new4/MOXUN_ISSUE_REFACTOR_IMPLEMENTATION_REPORT_20261103.md`；原计划原样保留。

本地测试新增／调整包括 `conversations.test.ts`、`guided-ops.test.ts`、`file-change-approval.test.ts`、`pi-local-files.test.ts`、`shared-session.test.ts`、`observed-session.test.ts`、`ipc-external.test.ts`、`useAgentController.test.ts`、`conversation-identity.test.ts`、`new4.browser.test.ts`、`new4-app.browser.test.ts`、项目／滚动及原生生命周期夹具。它们保持 gitignored，没有被加入 Git。没有改动 Provider 测试、桌宠源码／资源／断言、测试配置或依赖。

## 10. 收尾与剩余事项

未提交、未推送、未发布、未制作安装包；当前已安装应用仍是此前版本，Dock 修复不等于安装了本次源码。用户原数据库未迁移。下一次运行本次源码会执行已验证的增量 migration。

shared 窗口关闭／真实重开的独立原生用例已在复测通过。仍需完成 UI 显式结束及原生二次确认、existing 窗口关闭、iTerm 整体退出及多窗口隔离、Dock/Finder／最小化图标、窗口拖动／全屏和完整分辨率的人工验收。初轮失败记录保留，复测结果见第 11 节。

## 11. 2026-11-03 晚间复测

复测证据目录：`/Users/xusong.yu/Desktop/test/Moxun-new4-retest-20261103`。未修改产品源码、测试源码、测试配置、断言或超时。

Provider 首次启动遇到临时父目录 `opencode` 缺失（ENOENT），尚未进入截图检查；补建该目录后重跑通过（26.33 秒）。启用现有 `MOXUN_PROVIDER_NATIVE_FOCUS_LIVE=1` 和截图诊断选项，87 项检查、中文／英文 × 浅色／深色 × 三尺寸共 12 组截图全部通过，每组均为 3 帧／1 个 bitmap SHA256，原生窗口和 document 焦点全部为 true。保留原 2 秒内连续三帧一致要求；此前截图抖动本轮未复现，不据此宣称其根因已修复。证据：`provider-retry.log`、`provider/results.json`、`provider/capture-phases.jsonl` 和 `provider/capture-focus.jsonl`；启动失败见 `provider.log`。

真实 iTerm `MOXUN_ITERM_LIVE=1 CRESCENT_LOCAL_TESTS=1 npx vitest run src/main/terminal/external/live-iterm.test.ts` 通过（1 test，16.51 秒）。测试专用窗口关闭／重开后 UUID 更换，Shell PID 8379 不变，原 socket 保留，cwd 和 `MOXUN_CONTINUITY=preserved` 保留，前台任务继续完成；同时覆盖双向输入、观察开启／关闭及快照范围。用例结束后 PID 和 socket 均已清理。证据：`iterm.log`、`iterm/continuity.json`、`iterm/screen-range.json`、`iterm/cleanup.json`。此前 Automation 失败本轮未复现，未调整系统权限或放宽超时。

随后完整 `npm run verify:local` 正常退出，退出码 0。lint、341 项静态安全边界检查、Node/Web 类型检查、Main/Preload/Renderer 构建通过；本地测试 **76 files passed / 9 skipped，437 tests passed / 14 skipped / 0 failed（总计 85 files / 451 tests）**，测试阶段耗时 122.38 秒。Provider 在完整测试集中再次通过。14 项仍依原 opt-in 条件跳过，其中 live-iterm 已另行显式开启并通过；其余跳过项仍不算通过。完整日志：`verify-local.log`。`git diff --check` 通过；没有提交、推送、发布或打包。
