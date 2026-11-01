# Manual iTerm and Agent observation

MoXun is chat-first, without an embedded xterm workspace. **You operate local or SSH terminals in external iTerm; the Agent analyzes and suggests**. It cannot type, execute, interrupt or press Enter for you.

## Flow {#flow}

<ArchitectureDiagram name="terminal-en" />

A connection card opens iTerm and connects to the selected target. The standalone external-terminal entry creates a shared local iTerm or binds an existing iTerm, without implicitly connecting a cluster. Existing bindings are read-only; unbinding sends no exit/Ctrl+C and does not close your shell.

## Optional observation

- **Off**: the default; no terminal screen reads.
- **Observe from now**: native confirmation permits subsequent evidence, not replay of pre-consent content.
- **Include current context and continue**: native confirmation permits a bounded accessible-text snapshot and subsequent evidence.

Observation never grants input. Snapshots do not guarantee full scrollback, complete output, command boundaries or exit codes. Evidence is redacted, bounded and short-lived in memory. Pause, revocation and identity/session changes stop sampling and clear evidence. Resume needs fresh confirmation and never replays paused content.

Before consent, the Agent may suggest a first step from your problem and target metadata, explicitly stating that no results were observed. Run it yourself, then authorize observation or provide redacted output. See [SSH connections](/en/guide/ssh) and [suggestion risk and approval](/en/guide/command-review).
