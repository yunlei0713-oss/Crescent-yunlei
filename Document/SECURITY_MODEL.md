# 墨巡 Security Model

This document records the chat-first, external-iTerm workbench. Agent terminal execution is permanently forbidden, not enabled by approval, style, legacy settings or observation consent.

## Capability Boundaries

| Capability                      | Boundary                                                 | Expected Control                                                        |
| ------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------- |
| Agent execution/input/interrupt | PTY, pipe, iTerm, SSH or indirect tools                  | Permanently denied in Main Agent-origin scope and runtime allowlists    |
| Terminal observation            | Exact owner/tab/iTerm UUID/connection/generation/host    | Native operator confirmation, Main-only grant, finite redacted evidence |
| User terminal operation         | User-owned iTerm or Main-owned shared PTY                | Manual input in iTerm; existing bindings are read-only                  |
| Local file writes               | Crescent client filesystem                               | User-supplied or confirmed destination, no implicit report path         |
| Local document parsing          | Crescent client filesystem                               | User-referenced path, extension-specific parsers                        |
| SSH connections                 | Remote shell                                             | Explicit connection selection and user-driven credential prompt         |
| OpenAPI configuration           | Legacy migration data                                    | No OpenAPI tools exposed to the current Pi agent                        |
| Agent MCP tools                 | Configured stdio or HTTP server with unverified behavior | Denied: reviewed implementation allowlist is empty                      |
| Model providers                 | External AI endpoint                                     | API key storage and secret redaction in logs/UI                         |

## Tool Metadata

Tool catalog entries should describe:

- `source`: built-in, OpenAPI, or MCP.
- `risk`: low, medium, or high.
- `requiresApproval`: whether execution may require explicit user approval.
- `external`: whether the tool can call an external system.
- `stateChanging`: whether the tool can mutate local or remote state.

This metadata is advisory. Enforcement belongs in Main capability checks, runtime allowlists, observation grants and file destination validation. No tool name or read-only hint proves safety.

## Observation consent and privacy

- Every terminal starts `off`. Renderer requests consent; only Main's native confirmation approves `live` or `context-live`. Agent-origin code cannot authorize or resume.
- `off` never feeds TerminalObserver or exposes evidence. Existing iTerm only performs a 5-second metadata/liveness check while off; no screen read.
- Pause/end and identity changes synchronously stop sampling and clear evidence. Resume requires fresh confirmation and does not replay paused content.
- Existing iTerm provides bounded accessible-text snapshots, possibly including some scrollback, never guaranteed full history, command boundaries or exit codes. `live` conservatively includes newly appended complete lines; ambiguous rewrites are omitted.
- Shared PTY evidence is structured only with reliable OSC 133 boundaries. Remote shells are not assumed to have integration; nothing is installed or injected remotely for observation.
- Redacted evidence stays in memory (20 events, 16K/event, 64K total, 30 minutes). Models read it only when needed, not on every output fragment.
- Analysis has no command-name or syntax whitelist. Visible redacted interactive/running output may be analyzed without claiming completion; uncertain keystrokes are not retained as commands. Secret prompts, credentials and private keys remain suppressed/redacted.
- Unbinding existing iTerm sends no exit/Ctrl+C and does not close its shell. Ending collaboration does not close a shared PTY; quitting MoXun terminates its owned bridge.

## Diagnostic suggestions are not execution permissions

- A connected terminal can receive a first suggestion from the user's problem and target metadata before observation is authorized. The model must state that no terminal results were observed; this never enables screen reads or terminal input.
- Complex pipelines, custom commands and bounded multiline snippets are displayable text. Static checks only label suggestion risk, never gate reading or analysis. Unverified/high-risk suggestions require explicit manual risk review before copying; no label proves an arbitrary program safe.
- Main binds analysis to immutable target identity and starting observation state. Refreshing the UI cannot replace those baselines; changed targets or revoked required observation invalidate suggestions. Copying rechecks validity and sends no terminal input. Guided cancellation is scoped by Main to the owning chat/run.

## Electron and Credential Boundaries

- Renderer windows use sandboxing, context isolation and disabled Node integration. Preload exposes typed operations; generic IPC is not exposed.
- Main IPC handlers reject foreign origins and child frames, and cap payload size/complexity. Base64 attachments are bounded before decoding.
- Credentials are encrypted with safeStorage; unavailable encryption and failed decryption reject persistence. Linux's `basic_text` backend is not accepted.
- Provider keys and MCP environment/header values are replaced with stored-value placeholders. Connection passwords use opaque references consumed by main only at a live password prompt on their bound PTY.
- File approvals, cancellation and steering validate the owning window. Legacy command approval requests fail closed; cancellation never interrupts user terminals. Main and child Pi runtimes do not register bash, write/edit, terminal creation or command execution tools.
- Crescent's own data tree uses private modes without following symlinks. The final log sink redacts secrets.
- Media permissions allow explicit audio requests only. macOS entitlements retain JIT, audio input and user-selected files; signing/native-module compatibility still requires release validation.
- CI runs security boundary policy checks. Behavioral unit tests remain local-only under the repository policy; CI does not claim unit coverage. See [TESTING.md](TESTING.md).

## High-Risk Review Checklist

- Does the change execute commands, write files, call remote APIs, start MCP servers, or touch credentials?
- Are secrets excluded from logs, release artifacts, tests, and issue templates?
- Does the user see enough source, parameter, risk, and approval context before state changes?
- Are tests updated for command risk, path handling, provider config, or tool selection?
