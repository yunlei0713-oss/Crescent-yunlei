import { guidedOpsRepository, type GuidedOpsRepository } from '../sqlite/guided-ops-repository'
import { resolveConversationId } from '../crescent-sqlite'
import { randomUUID } from 'node:crypto'
import type {
  CommandProposalInput,
  GuidedOpsAction,
  GuidedOpsSnapshot
} from '../../shared/guided-ops-types'
import type { TerminalEvidence } from '../../shared/terminal-observation-types'
import { terminalIdentityKey } from '../terminal/observer/terminal-observer'
import { auditEvent } from '../security/security-audit'
import { redactSensitiveText } from '../../shared/secret-redaction'
import { suggestionSafety, validateSuggestionCommand } from '../../shared/suggestion-safety'

interface Session {
  proactive: boolean
  identityKey: string
  observationAtStart: boolean
  runId: string
  proposedRun?: string
  changedAt: number
  snapshot: GuidedOpsSnapshot
}
export class GuidedOpsService {
  constructor(private readonly repository: GuidedOpsRepository = guidedOpsRepository) {}
  private sessions = new Map<string, Session>()
  private key(ownerId: number, chatId: string): string {
    return `${ownerId}:${resolveConversationId(chatId)}`
  }
  begin(
    ownerId: number,
    chatId: string,
    runId: string,
    goal: string,
    evidence: TerminalEvidence,
    proactive = false
  ): void {
    const key = this.key(ownerId, chatId)
    const previous = this.sessions.get(key)
    if (previous?.snapshot.proposal) previous.snapshot.proposal.valid = false
    if (this.sessions.size >= 100 && !previous)
      this.sessions.delete(this.sessions.keys().next().value!)
    this.sessions.set(key, {
      runId,
      proactive,
      identityKey: terminalIdentityKey(evidence.identity),
      observationAtStart: evidence.available,
      changedAt: Date.now(),
      snapshot: {
        state: previous ? 'ANALYZING_NEXT' : 'ANALYZING',
        goal: proactive
          ? previous?.snapshot.goal || this.repository.latestGoal(chatId)
          : redactSensitiveText(goal).slice(0, 2000),
        history: [],
        evidence
      }
    })
    auditEvent({
      sessionId: runId,
      actor: 'agent',
      eventType: 'analysis',
      summary: 'Operator turn started'
    })
  }
  propose(
    ownerId: number,
    chatId: string,
    runId: string,
    input: CommandProposalInput,
    evidence: TerminalEvidence
  ): GuidedOpsSnapshot {
    const entry = this.sessions.get(this.key(ownerId, chatId))
    if (
      !entry ||
      entry.runId !== runId ||
      entry.proposedRun === runId ||
      !['ANALYZING', 'ANALYZING_NEXT'].includes(entry.snapshot.state)
    )
      throw new Error('Only one current step per operator turn; wait for the operator')
    if (!evidence.identity.sessionGeneration || (entry.proactive && !evidence.available))
      throw new Error('No current terminal target or authorized proactive evidence')
    if (entry.observationAtStart && !evidence.available)
      throw new Error('Observation ended during analysis; start a new turn from the user question')
    if (terminalIdentityKey(evidence.identity) !== entry.identityKey)
      throw new Error('Terminal identity changed during analysis; start a new turn')
    const suggestions = [input, ...(input.alternatives ?? [])]
    if (suggestions.length < 1 || suggestions.length > 3)
      throw new Error('Publish one to three distinct suggestions')
    if (new Set(suggestions.map((item) => item.command.trim())).size !== suggestions.length)
      throw new Error('Suggestions must be distinct')
    for (const suggestion of suggestions) {
      validateSuggestionCommand(suggestion.command)
      if (redactSensitiveText(suggestion.command) !== suggestion.command)
        throw new Error('Do not include credentials in suggestions')
    }
    const sanitize = (suggestion: (typeof suggestions)[number]) => ({
      command: suggestion.command.trim(),
      purpose: redactSensitiveText(suggestion.purpose).slice(0, 2000),
      ...suggestionSafety(suggestion.command, suggestion.risk),
      expectedOutput: redactSensitiveText(suggestion.expectedOutput).slice(0, 2000),
      onUnexpected: redactSensitiveText(suggestion.onUnexpected).slice(0, 2000)
    })
    const proposal = this.repository.append(chatId, runId, {
      ...sanitize(input),
      judgment: redactSensitiveText(input.judgment).slice(0, 2000),
      goal: redactSensitiveText(input.goal).slice(0, 1000),
      alternatives: input.alternatives?.map(sanitize),
      id: randomUUID(),
      step: 0,
      createdAt: Date.now(),
      target: evidence.identity,
      valid: true,
      observationRequired: evidence.available
    })
    entry.proposedRun = runId
    entry.changedAt = Date.now()
    entry.snapshot.proposal = proposal
    entry.snapshot.evidence = evidence
    entry.snapshot.goal = proposal.goal
    entry.snapshot.state = 'PROPOSAL_READY'
    auditEvent({
      sessionId: runId,
      actor: 'agent',
      eventType: 'command_suggestion',
      summary: `${proposal.id}: step ${proposal.step}`
    })
    return structuredClone(entry.snapshot)
  }
  read(ownerId: number, chatId: string, evidence: TerminalEvidence): GuidedOpsSnapshot | undefined {
    const entry = this.sessions.get(this.key(ownerId, chatId))
    if (!entry) return undefined
    if (Date.now() - entry.changedAt > 30 * 60 * 1000) {
      this.sessions.delete(this.key(ownerId, chatId))
      return undefined
    }
    const snapshot = entry.snapshot
    snapshot.evidence = evidence
    if (
      ['ANALYZING', 'ANALYZING_NEXT'].includes(snapshot.state) &&
      (entry.identityKey !== terminalIdentityKey(evidence.identity) ||
        (entry.observationAtStart && !evidence.available))
    )
      snapshot.state = 'INTERRUPTED'
    const proposal = snapshot.proposal
    if (proposal?.valid) {
      if (
        !evidence.identity.sessionGeneration ||
        (proposal.observationRequired && !evidence.available) ||
        terminalIdentityKey(evidence.identity) !== terminalIdentityKey(proposal.target)
      ) {
        proposal.valid = false
        snapshot.state = 'INTERRUPTED'
      } else {
        const observed = evidence.observations
          .filter((item) => item.startedAt >= proposal.createdAt)
          .at(-1)
        if (observed) {
          if (
            observed.status === 'completed' ||
            observed.status === 'failed' ||
            observed.status === 'finished-unknown'
          )
            snapshot.state = 'EVIDENCE_READY'
          else if (observed.status === 'submitted') snapshot.state = 'COMMAND_RUNNING'
          else if (observed.status === 'running')
            snapshot.state = observed.output ? 'OBSERVING' : 'COMMAND_RUNNING'
          else snapshot.state = 'OBSERVATION_UNCERTAIN'
        }
      }
    }
    if (proposal) this.repository.update(proposal.id, snapshot.state)
    return structuredClone(snapshot)
  }
  action(ownerId: number, chatId: string, action: GuidedOpsAction): boolean {
    const entry = this.sessions.get(this.key(ownerId, chatId))
    if (!entry) return false
    if (action === 'wait') {
      if (entry.snapshot.state !== 'PROPOSAL_READY') return false
      entry.snapshot.state = 'WAITING_OPERATOR'
    } else if (['skip', 'interrupt', 'complete'].includes(action)) {
      entry.snapshot.state = action === 'complete' ? 'COMPLETED' : 'INTERRUPTED'
      if (entry.snapshot.proposal) {
        entry.snapshot.proposal.valid = false
        this.repository.update(entry.snapshot.proposal.id, entry.snapshot.state)
      }
    } else return false
    entry.changedAt = Date.now()
    if (entry.snapshot.proposal)
      this.repository.update(entry.snapshot.proposal.id, entry.snapshot.state)
    return true
  }
  currentRunId(ownerId: number, chatId: string): string | undefined {
    return this.sessions.get(this.key(ownerId, chatId))?.runId
  }
  cancelRun(ownerId: number, runId: string): void {
    for (const [key, entry] of this.sessions) {
      if (!key.startsWith(`${ownerId}:`) || entry.runId !== runId) continue
      entry.snapshot.state = 'INTERRUPTED'
      if (entry.snapshot.proposal) {
        entry.snapshot.proposal.valid = false
        this.repository.update(entry.snapshot.proposal.id, entry.snapshot.state)
      }
    }
  }
}
export const guidedOps = new GuidedOpsService()
