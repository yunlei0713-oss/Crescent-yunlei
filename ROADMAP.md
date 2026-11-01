# MoXun Development Roadmap

Current direction (2026-11-01): **chat-first analysis, manual external iTerm operation, optional authorized observation, and approved local file changes**. This is a direction and validation backlog, not a claim that release or platform acceptance has passed.

## Current boundaries

- Pi runs in Electron Main behind host tool allowlists. No Agent terminal execution, input or interruption, including through MCP or subagents.
- Users operate local/SSH sessions in iTerm. Observation starts off and requires Main's native confirmation.
- Local changes require full Diff review, per-file decisions, one-time authorization and write verification.
- OpenAPI is legacy configuration only. Agent MCP is disabled because the reviewed implementation allowlist is empty; explicit settings-side discovery is separate.
- Delivery targets macOS Intel (x64) only: `墨巡.app` and `moxun` DMG/ZIP filenames. No other architecture/platform packaging entries remain.

## Quality convergence

- Audit and externally archive retired modules, old plans and historical build outputs without losing evidence.
- Synchronize README, architecture and bilingual website with implemented capabilities.
- Reuse existing Dialog/Menu primitives; simplify iTerm entry and observation explanations.
- Extract App, terminal IPC and Settings responsibilities incrementally with explicit state ownership.
- Measure 100/500/1000-message rendering and lifecycle behavior before introducing virtualization.
- Verify real iTerm, focus/keyboard behavior, Intel Mac runtime and release signing separately.

Full staged scope and acceptance checklist: [cleanup plan](Document/new3/MOXUN_PROJECT_CLEANUP_AND_QUALITY_REFACTOR_PLAN_20261101.md). Current contracts: [architecture](Document/ARCHITECTURE.md), [security](Document/SECURITY_MODEL.md), [testing](Document/TESTING.md).

Earlier OpenAPI execution, embedded-terminal and docked-subagent roadmap entries described a retired direction. Historical content is preserved in the external `workspace-before/` archive; see [archive map](Document/archive/README.md).
