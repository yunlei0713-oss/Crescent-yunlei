/** Screen snapshots are plain text, never a trustworthy terminal control stream. */
export function plainTerminalCache(text: string): string {
  return (
    text
      // eslint-disable-next-line no-control-regex -- Drop OSC (BEL/ST terminated) and CSI from cached PTY text.
      .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\][^\x07\x1b]*$|\x1b\[[0-?]*[ -/]*[@-~]/g, '')
      .replace(/\r\n?/g, '\n')
      // eslint-disable-next-line no-control-regex -- Preserve newline/tab only; cache snapshots never replay control bytes.
      .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '')
  )
}

/** Bounded iTerm screen text; not a full terminal emulator. */
export function normalizeITermScreen(text: string): string {
  return (
    text
      .replace(/\r\n?/g, '\n')
      // eslint-disable-next-line no-control-regex -- Strip controls from external screen text.
      .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '')
      // iTerm pads visible rows and empty bottom cells. They are not stable
      // content lines; retaining them prevents append-only evidence on short screens.
      .replace(/[ \t]+$/gm, '')
      .trimEnd()
      .slice(-24000)
  )
}

/** Conservative append evidence, never a command diff. Mutable/reflowed lines are withheld. */
export function appendedITermScreenLines(previous: string, current: string): string {
  const before = previous.split('\n')
  const after = current.split('\n')
  const stable = before.slice(0, -1)
  if (!stable.length) return ''
  for (let overlap = Math.min(stable.length, after.length); overlap > 0; overlap--) {
    if (stable.slice(-overlap).every((line, index) => line === after[index])) {
      // The line after the stable overlap was already visible at the baseline;
      // the final line may still be a partially typed command or secret.
      return after.slice(overlap + 1, -1).join('\n')
    }
  }
  return '' // No provable continuity: clear/reflow/alternate screen, not permission to backfill.
}
