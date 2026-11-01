# Suggestion risk and file approval

This legacy URL remains available, but “review then Agent execution” is retired. **Agents can never execute, type into or interrupt terminals**. Low-risk labels, allowlists, approvals and observation consent do not grant that ability.

## Flow {#flow}

<ArchitectureDiagram name="command-review-en" />

Terminal suggestions are text. Review the target and impact, then type and execute them yourself in iTerm. Risk labels do not prove arbitrary programs safe. Complex or high-risk suggestions require manual review before copying. Copy only writes the clipboard, never the terminal or Enter.

## Local file changes

`request_file_change` proposes changes without writing. Review the full Diff and decide per file. After native confirmation, Main revalidates the path, content hash, owning run and expiry, consumes authorization once and verifies the result. Rejection or invalidation leaves file bytes unchanged.

Historical command/approval Timeline entries are read-only, not rerunnable approvals. See [Agent tools](/en/guide/tools) and [terminal observation](/en/guide/terminal).
