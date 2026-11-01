# Agent tools

Pi uses an explicit Main-owned allowlist, not project Pi extensions or built-in bash/write/edit.

| Tool/capability | Current boundary |
| --- | --- |
| `read`, code index and document reading | Authorized local scope with path, type, size and secret-file checks |
| `request_file_change` | A proposal; full Diff, per-file decisions and one-time Main approval before writing |
| `observe_terminal` | Authorized, redacted, bounded evidence tied to the current identity |
| Diagnostic suggestions | Displayed text for manual iTerm execution; copying only writes the clipboard |
| `subagent` | Reduced read-only tools, no terminal, SSH login or writes |
| `create-skill` / `create-sop` | Background drafts persisted by Main only after confirmation |

## Flow {#flow}

<ArchitectureDiagram name="tools-en" />

Agent terminal execution is permanently disabled; tool names, low-risk labels, MCP and compatibility APIs cannot restore it. OpenAPI is legacy configuration only. Agent MCP connection/calls are disabled because the reviewed implementation allowlist is empty. Explicit user-triggered settings-side discovery is separate, not Agent authorization.

See [observation](/en/guide/terminal), [approval](/en/guide/command-review), [read-only subtasks](/en/guide/subagents) and [Skills](/en/guide/skills).
