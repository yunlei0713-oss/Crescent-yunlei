# Read-only subtasks

`subagent` performs independent read-only analysis. It creates no terminal, logs into no SSH host, executes no command and writes no file. Docked subterminal panels and the Agent `open_subterminal` tool are retired.

## Flow {#flow}

<ArchitectureDiagram name="subagents-en" />

The parent delegates independent research and combines conclusions. Profiles include `scout`, `researcher`, `reviewer` and `oracle`; `worker` and `delegate` are rejected. Children cannot spawn children or call capture tools.

Children receive a reduced host-owned read-only tool list. Shared context grants no terminal rights. The parent proposes file changes through human approval. To operate another host, open iTerm yourself through [SSH connections](/en/guide/ssh), not through a child task.
