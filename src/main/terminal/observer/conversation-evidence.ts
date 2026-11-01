import type { TerminalEvidence } from '../../../shared/terminal-observation-types'
import { normalizeTerminalContextChars } from '../../../shared/terminal-observation-types'

/** One total budget, not one full context window per participating terminal. */
export function conversationEvidence(
  current: TerminalEvidence,
  peers: TerminalEvidence[],
  contextChars?: number
): TerminalEvidence & { relatedTerminals?: TerminalEvidence[] } {
  const budget = normalizeTerminalContextChars(contextChars)
  const selected = [current, ...peers.slice(0, 7)].map((evidence) => structuredClone(evidence))
  const share = Math.floor(budget / selected.length) - 128
  for (const evidence of selected) {
    while (JSON.stringify(evidence).length > share && evidence.observations.length > 1)
      evidence.observations.shift()
    const latest = evidence.observations.at(-1)
    while (latest?.output && JSON.stringify(evidence).length > share)
      latest.output = latest.output.slice(Math.ceil(latest.output.length / 2))
    if (JSON.stringify(evidence).length > share) evidence.observations = []
  }
  const result = { ...selected[0], relatedTerminals: selected.slice(1) }
  // Oversized metadata cannot defeat the aggregate cap. The active terminal is
  // retained; excess peers are omitted rather than sending unbounded context.
  while (JSON.stringify(result).length > budget && result.relatedTerminals.length)
    result.relatedTerminals.pop()
  return peers.length ? result : selected[0]
}
