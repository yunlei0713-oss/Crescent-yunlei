# UI Design System

MoXun (墨巡) uses a compact, chat-first desktop style. iTerm is the external manual-operation surface, not an embedded canvas. Final visual sources: `Document/new/brand/brand-guide.md` and `Document/new/brand/theme/ink-wash-theme-spec.md`.

## Source Of Truth

- Ordinary UI tokens live in `src/renderer/src/assets/theme.css`; component styles live in `main.css`.
- Library palettes live in `src/shared/theme-definitions.ts`, with a renderer re-export. Shared modules never import the renderer.
- Keep only `ink-wash-light` (墨巡 · 宣纸) and `ink-wash-dark` (墨巡 · 夜墨). New installs default to light; the four retired dark preferences migrate to dark. Unknown values default to light.
- Use `useAppTheme()` for React visuals, and `subscribeAppTheme()` for imperative consumers. Theme changes never recreate PTYs or iTerm sessions.
- Mermaid configuration is strict and serialized per render; cache keys include the theme. Offscreen diagrams repaint when visible. Chart and Architecture repaint with `useDiagramTheme()` after the first UI frame. Architecture exports use the selected palette.

## Layout Rules

- Keep operational screens dense and scannable.
- Chat is the only main workspace. No split/terminal selector, xterm canvas, terminal tab strip or subterminal panel.
- Sidebar defaults to 60 px, expands to 244 px (230 px on narrow windows), and persists its state. Low-frequency knowledge/settings entries use secondary navigation.
- Navigation actions, including external-terminal connection, live only in the sidebar; the titlebar shows only the brand. The conversation title sits above the composer, left-aligned beside the session-details toggle. Settings is the last sidebar action, below pet/theme controls. Empty conversations have no centered welcome graphic or explanatory block.
- Shell chrome has no full-width titlebar or full-height sidebar divider. The titlebar shares the chat canvas background; the brand and sidebar form one continuous chrome surface. Their widths stay aligned when the sidebar expands or the window narrows.
- Messages center within 760 px; the composer shell is at most 784 px including horizontal padding. The independent scroll region leaves the composer fixed at the bottom. Thinking and usage details default to collapsed.
- A quiet turn navigator hugs the chat viewport's left edge, independently of the centered reading column. Idle marks stay 6 px wide; hover or keyboard focus expands the selected mark and its neighbors into a small wave and previews that turn. Click or Enter jumps to the turn and pauses streaming follow. Arrow keys move between markers, Escape dismisses the preview. Hide it when the chat viewport is 600 px or narrower.
- Message role, timestamp and copy controls sit below the content, outside user bubbles. Reveal them on message hover or keyboard focus without moving content; keep them available on devices without hover. Completed runs place a quiet duration/details row and a thin divider before the final answer.
- Inline code may wrap at natural boundaries, with anywhere wrapping only when necessary. Clone its padding, border and background on every wrapped fragment so a line break never leaves an open-ended code box. Block code keeps its existing scrolling behavior.
- Command suggestions only offer copy, follow-up and ignore. File Diff approvals remain separate. Historical command audits are read-only.
- Latest diagnostic suggestions are primary conversation content in the same normal scroll flow as analysis/evidence, never a fixed-height header obscuring them. Keep command text prominent; target metadata, expectations and history may collapse. Unverified/high-risk suggestions require explicit risk review before copying, not execution approval. A connected terminal supports starting from a problem description without initial terminal input.
- Automatic following and “Back to latest” prioritize the recommended command when a suggestion group exceeds the viewport, rather than its footer. Manual scrolling up to analysis or down to alternatives pauses following; no whole-panel collapse is required.
- Search and filter controls stay fixed; result lists scroll independently.
- Sticky section headers must touch the container edge when pinned.
- Avoid cards inside cards; use cards only for repeated items, modals, or framed tools.
- Interactive list tiles use `.app-list-row` with optional `data-selected="true"`. Idle background is `--background` (theme page); hover lifts via accent + primary-tinted border. Do not invent local `bg-card/70` / `hover:bg-muted/25` card classes.
- Use icons for compact repeated actions and keep text labels for primary commands.

## Component Rules

- Presentational UI belongs in `src/renderer/src/components`.
- Pure formatting, parsing, and theme constants belong in `src/renderer/src/lib`.
- Components receive plain props and callbacks; business effects stay in parent controllers or hooks.
- Repeated modals, status indicators, list rows, and settings editors should be extracted before adding new variants.

## Color Use

- The selected theme accent is for action/focus/selection, not a full-page background.
- Light code/log/diagram surfaces use warm gray with dark text; dark mode uses ink-black/gray layers. Text, tables and Diff never sit over ink textures.
- iTerm colors belong to the user's Profile and are never modified by MoXun.
- No blue/purple neon, rainbow composer borders or decorative full-page gradients. Preserve finalized brand graphics.
- Error, warning, and success retain their meaning and accompanying labels/icons in every theme.
- Actions have accessible names, visible focus rings and Escape dismissal. Respect `prefers-reduced-motion`.
