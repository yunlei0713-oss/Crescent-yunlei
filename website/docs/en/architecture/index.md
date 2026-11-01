# Current architecture

MoXun is a chat-first Electron, React and TypeScript desktop workbench. Pi is a guest runtime in Main. Users operate external iTerm; Agents analyze authorized files/evidence and suggest next steps.

## Usage

<ArchitectureDiagram name="usage-en" />

## System architecture {#system}

<ArchitectureDiagram name="system-en" />

Renderer has no Node/filesystem privileges and uses typed Preload allowlists. Main validates sender, frame and payload and owns SSH/PTY, observation grants, file approvals, credentials and storage. Pi uses host allowlists, no project extensions or terminal execution tools.

Main manages SQLite, configuration, memory, Skills and knowledge in the existing `~/.crescent` data tree. Authorized project files are not restricted to that tree. File changes require full Diff, per-file review, native confirmation, one-time validation and write verification.

## Main workflow {#workflow}

<ArchitectureDiagram name="workflow-en" />

Problem/target → analysis/text suggestions → user reviews and executes in iTerm → optional native-confirmed redacted evidence → further analysis. Observation defaults off; pause/revocation/identity changes clear evidence, and resume needs fresh consent. Agents never execute, type into or interrupt terminals.

OpenAPI is legacy configuration. Agent MCP connection/calls are disabled because its reviewed implementation allowlist is empty. Explicit settings-side discovery is not Agent authorization. Children are read-only and create no terminals.

See repository [ARCHITECTURE.md](https://github.com/aide-family/Crescent/blob/main/Document/ARCHITECTURE.md) and [SECURITY_MODEL.md](https://github.com/aide-family/Crescent/blob/main/Document/SECURITY_MODEL.md) for real file paths and Worker/native/resource boundaries.
