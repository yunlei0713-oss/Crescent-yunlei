export interface TerminalIdentity {
  conversationId?: string
  ownerId?: number
  itermSessionId?: string
  tabId: string
  connectionId?: string
  connectionName?: string
  connectionOrigin?: import('./connection-state').ConnectionOrigin
  /** Saved connection entry point; a cluster's current node may differ. */
  configuredHost?: string
  targetScope?: 'host' | 'cluster'
  connectionPhase?: import('./connection-state').ConnectionPhase
  sessionGeneration: number
  host?: string
  hostSource?: 'prompt' | 'configured-target' | 'local-shell'
  /** Current-host directory only. Never the local PTY launch cwd for SSH. */
  cwd?: string
}
export interface TerminalObservation extends TerminalIdentity {
  eventId: string
  commandId?: string
  commandGroupId?: string
  source?: 'osc133' | 'osc633' | 'snapshot' | 'user-confirmation' | 'terminal-stream'
  groupState?: 'pending' | 'finished' | 'incomplete'
  command?: string
  output: string
  exitCode?: number
  startedAt: number
  finishedAt?: number
  status:
    | 'submitted'
    | 'running'
    | 'completed'
    | 'failed'
    | 'finished-unknown'
    | 'interrupted'
    | 'session-lost'
    | 'timeout-unconfirmed'
    | 'prompt-returned'
    | 'interactive'
    | 'unknown'
  boundary: 'osc133' | 'osc633' | 'prompt' | 'uncertain' | 'user-confirmation'
  confidence?: 'structured' | 'snapshot' | 'uncertain'
  sensitive: boolean
  redacted: boolean
}
export interface TerminalEvidence {
  identity: TerminalIdentity
  available: boolean
  observations: TerminalObservation[]
  retention: string
}

/** Authorization follows the native terminal, not SSH destinations or cwd. */
export function terminalObservationBindingKey(identity: TerminalIdentity): string {
  return JSON.stringify([
    identity.ownerId,
    identity.conversationId,
    identity.tabId,
    identity.itermSessionId,
    identity.connectionId,
    identity.sessionGeneration
  ])
}

/** Main-issued, one-use analysis hint. Never contains terminal text or permissions. */
export interface TerminalEvidenceNotice {
  identity: TerminalIdentity
  token?: string
}

export function normalizeTerminalContextChars(value?: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(8000, Math.min(64000, Math.round(value)))
    : 32000
}
