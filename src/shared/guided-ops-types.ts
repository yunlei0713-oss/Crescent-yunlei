import type { TerminalEvidence, TerminalIdentity } from './terminal-observation-types'
export type GuidedOpsState =
  | 'ANALYZING'
  | 'PROPOSAL_READY'
  | 'WAITING_OPERATOR'
  | 'COMMAND_RUNNING'
  | 'OBSERVING'
  | 'EVIDENCE_READY'
  | 'ANALYZING_NEXT'
  | 'COMPLETED'
  | 'INTERRUPTED'
  | 'OBSERVATION_UNCERTAIN'
export interface CommandSuggestion {
  command: string
  purpose: string
  risk: 'read-only' | 'low' | 'medium' | 'high'
  expectedOutput: string
  onUnexpected: string
}
export interface CommandProposalInput extends CommandSuggestion {
  judgment: string
  goal: string
  /** Alternative directions, not a sequence to execute together. */
  alternatives?: CommandSuggestion[]
}
export interface CommandProposal extends CommandProposalInput {
  id: string
  step: number
  createdAt: number
  target: TerminalIdentity
  valid: boolean
  /** Display classification only. Never authorizes execution. */
  safety: 'verified-read-only' | 'review-required' | 'high-risk'
  alternatives?: Array<CommandSuggestion & { safety: CommandProposal['safety'] }>
  /** Revoking observation invalidates proposals made with observed evidence. */
  observationRequired: boolean
}
export interface GuidedOpsSnapshot {
  state: GuidedOpsState
  goal: string
  proposal?: CommandProposal
  history: CommandProposal[]
  evidence: TerminalEvidence
}
export type GuidedOpsAction = 'wait' | 'skip' | 'interrupt' | 'complete'
