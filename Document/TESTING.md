# Local-only testing

Crescent keeps **unit tests on developer machines only**. Test files are listed in [`.gitignore`](../.gitignore) and must **not** be committed.

## Why

- CI runs `npm run test` to verify security boundaries (IPC registration, preload exposure, sandbox, approval, logging and renderer imports). It does not claim unit-test coverage.
- Developers still run real Vitest suites locally before committing risky changes.

## Setup

Restore core tests from git history (files stay untracked):

```bash
./scripts/restore-local-tests.sh
```

Or restore a single file:

```bash
git show 0ca23c0:src/shared/capture-intent.test.ts > src/shared/capture-intent.test.ts
```

## Commands

| Script               | Purpose                                                                   |
| -------------------- | ------------------------------------------------------------------------- |
| `npm run test`       | CI / hook step — runs security boundary policy checks; no unit-test claim |
| `npm run test:local` | Local gate — runs gitignored tests (`CRESCENT_LOCAL_TESTS=1`)             |
| `npm run ci`         | lint → static security checks → build (build includes typecheck)          |
| `npm run verify:local` | CI followed by local-only behavioral tests; the complete local gate    |

**Before commit**, run:

```bash
npm run verify:local
```

## Where to put tests

`.githooks/pre-commit` automatically runs `npm run ci`, not local Vitest suites. When local tests exist, developers must run `test:local` before committing (or use `verify:local` above). Do not skip hooks or count the CI/build typecheck twice.

Colocate with the module under test:

- `src/main/agent/*.test.ts`
- `src/shared/*.test.ts`
- `src/renderer/src/lib/*.test.ts`

Vitest config: [`vitest.config.ts`](../vitest.config.ts).

Local verification uses two isolated projects: Node-only suites keep their normal
parallel workers; `desktop` fixtures run one at a time because they share the macOS
display, focus and GPU. Per-file forks, sandboxing, assertions and test timeouts stay
unchanged. This scheduling isolation is not proof of improved product performance.

Native/complete-app tests require explicit opt-in flags and disposable app data.
`MOXUN_FULL_QUALITY_LIVE=1` exercises synthetic 100/500/1000-message history,
loopback streaming, zoom, Chromium accessibility and reduced motion.
The full-app matrix records actual CSS and native content dimensions. macOS may
clamp tall windows to the current display; those large viewports are explicitly
marked as Chromium device-metrics emulation within the real app, not physical
high-resolution/native-window acceptance. `MOXUN_FULL_QUALITY_DIAGNOSTIC=1` adds
per-evaluation phases and native process metrics without changing timeouts.
Provider regression evidence defaults to a per-run directory. Its screenshot gate
waits for real animations and three identical consecutive compositor bitmaps within
the existing 2-second settling window; it does not disable animations or use pixel
tolerances. The foreground fixture labels display-clamped viewports as emulated.
`capture-focus.jsonl` records actual native-window focus separately from document
focus and the active element/focus ring; showing a window is not proof of OS focus.
`MOXUN_PROVIDER_NATIVE_FOCUS_LIVE=1` additionally requires the actual native focus
event before every capture and verifies that focus survives it. This native check
remains separate from the original isolated-Renderer behavior assertions. A native
focus failure is not accepted, including when the ordinary behavior suite passes.
`MOXUN_PROVIDER_SETTINGS_SOURCE` can read archived pre-extraction Settings source
without replacing workspace files; `MOXUN_PROVIDER_CAPTURE_DIAGNOSTIC=1` preserves
changed capture frames. Cross-run strict PNG comparisons remain separate evidence
and must not be reported green when native-control pixels differ.
`MOXUN_FULL_LIFECYCLE_LIVE=1` checks real Renderer crash recovery, window close and
Main exit with fixture-owned iTerm UUIDs/PTYs/sockets; its observation consent is
simulated. Neither is packaged/VoiceOver or real native-consent acceptance.
Never enable `MOXUN_VISION_LIVE` without approval: it reads saved provider credentials
and sends a paid external request. Only close UUIDs and processes created by the test.

## Priority suites (restore first)

| Module                                      | Risk                          |
| ------------------------------------------- | ----------------------------- |
| `src/shared/command-guard.ts`               | Wrong approval → unsafe shell |
| `src/shared/secret-redaction.ts`            | Leaked secrets in logs/UI     |
| `src/shared/capture-intent.ts`              | Capture identity drift        |
| `src/main/agent/command-classify.ts`        | Misclassified commands        |
| `src/renderer/src/lib/login-action-wait.ts` | False login success / hang    |

Historical snapshot commit: `0ca23c0` (broader set). `command-guard.test.ts` last at `43c4ef8`.

Security regression suites created for this audit remain gitignored: `security-regression.test.ts`, `security-boundaries.test.ts`, `crescent-store.test.ts`, `pi-mcp-tools.test.ts`, and `mcp-approval.test.ts`. Run `npm run test:local` for actual behavioral coverage.

## Complete local verification and unsigned macOS delivery

`npm run verify:local` runs the existing CI gate and then the local-only unit suites. `npm run build:mac:local` verifies and creates **one Universal macOS application, DMG and ZIP**, each containing x64 and arm64, under `dist/local-macos/universal/`. All Mac packaging scripts use Universal; legacy `:x64` and `:arm64` commands are compatibility aliases and no longer produce separate packages. No commit, push or publish is performed. Signing identities and notarization are explicitly disabled for this local flow. See [the development and packaging rules](DEVELOPMENT.md) for the permanent Mac-only delivery standard, signed packaging and offline preparation.

UI and main-process acceptance can use `CRESCENT_DATA_DIR` and `CRESCENT_USER_DATA_DIR` to isolate application records and Electron profiles. Keep the default user directories for normal launches. `CRESCENT_STARTUP_TRACE=1` logs main/agent milestones; renderer Performance entries record boot, first UI and first terminal readiness.

Runtime alternatives are evaluated in `experiments/agent-runtime`; they have their own lockfile, typecheck, benchmark and audit. Their simulated host transport results must not be reported as real SSH/MCP or model acceptance. Local test files remain gitignored and are not part of GitHub CI. Release quality checks use lint, static security checks, types, build and audit before packaging.

The 2026-10-10 host execution regression is historical evidence, not current Agent permission or this round's acceptance. Its original `Crescent_v1.0.11_专项改造验收记录_20261010.md` is preserved externally; see [archive map](archive/README.md). `CRESCENT_OFFLINE_BUILD=1` enables local cache prechecks and prohibits native prebuild network fallback; prepare the locked Electron, DMG tooling and esbuild caches before disconnecting. `CRESCENT_LOCAL_BUILD_DIR` can select a separate directory under `dist/`. Never rebuild `out/` while packaging is reading it.
