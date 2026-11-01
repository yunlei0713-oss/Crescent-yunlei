import { hasHighWriteVerb, isStaticallyReadonly } from './command-guard'
import type { CommandSuggestion, CommandProposal } from './guided-ops-types'

/** Suggestions are text, NOT execution requests. Unknown syntax must remain reviewable. */
export function suggestionSafety(
  command: string,
  claimedRisk: CommandSuggestion['risk']
): { risk: CommandSuggestion['risk']; safety: CommandProposal['safety'] } {
  if (claimedRisk === 'high' || hasHighWriteVerb(command))
    return { risk: 'high', safety: 'high-risk' }
  if (isStaticallyReadonly(command) && claimedRisk === 'read-only')
    return { risk: 'read-only', safety: 'verified-read-only' }
  // An unrecognized command, script or program is not proven safe by a model label.
  return { risk: 'medium', safety: 'review-required' }
}

export function validateSuggestionCommand(command: string): void {
  if (
    !command.trim() ||
    command.length > 4000 ||
    [...command].some((char) => {
      const code = char.charCodeAt(0)
      return (code < 32 && char !== '\n' && char !== '\t') || code === 127
    })
  )
    throw new Error(
      'Suggest one bounded command or coherent script; no terminal control characters'
    )
}
