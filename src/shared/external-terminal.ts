export interface ExternalTerminalBinding {
  provider: 'iterm2'
  kind: 'shared' | 'existing'
  windowState?: ExternalWindowState
  windowGeneration?: number
  statusError?: string
  sessionId: string
  columns?: number
  rows?: number
}

export interface ITermSessionSummary {
  id: string
  name: string
  window: number
  tab: number
  pane: number
  columns: number
  rows: number
}

export interface ExternalTerminalConnection {
  observation?: TerminalObservationGrant
  sessionId: number
  tabId: string
  mode: 'pty'
  pid: number
  cwd: string
  shell: string
  external: ExternalTerminalBinding
}

export type TerminalObservationMode = 'off' | 'live' | 'context-live'
export interface TerminalObservationGrant {
  mode: Exclude<TerminalObservationMode, 'off'>
  status: 'pending' | 'active' | 'paused' | 'expired'
  startedAt: number
  capability: 'structured-stream' | 'screen-snapshot'
}

export type ExternalWindowState =
  | 'attached'
  | 'window-closed'
  | 'reopening'
  | 'ended'
  | 'status-unknown'
export interface ManagedSharedTerminal {
  tabId: string
  sessionId: number
  pid: number
  cwd: string
  detached: boolean
  external: ExternalTerminalBinding
}
