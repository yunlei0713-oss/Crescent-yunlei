export interface TerminalIdentity {
  ownerId?: number
  itermSessionId?: string
  tabId: string
  connectionId?: string
  sessionGeneration: number
  host?: string
  cwd?: string
}
export interface TerminalObservation extends TerminalIdentity {
  eventId: string
  command?: string
  output: string
  exitCode?: number
  startedAt: number
  finishedAt?: number
  status: 'submitted' | 'running' | 'completed' | 'failed' | 'interactive' | 'unknown'
  boundary: 'osc133' | 'uncertain'
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
