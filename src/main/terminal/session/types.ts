import type { connectionPhase } from '../../../shared/connection-state'

export interface TerminalSession {
  conversationId?: string
  detached?: boolean
  external?: import('../../../shared/external-terminal').ExternalTerminalBinding
  openExternal?: () => Promise<void>
  setObservation?: (
    mode: import('../../../shared/external-terminal').TerminalObservationMode
  ) => Promise<void>
  /** Main-only revocation: stops sampling synchronously, even during an Agent read. */
  stopObservation?: () => void
  id: number
  mode: 'pty' | 'pipe'
  pid: number
  cwd: string
  shell: string
  foregroundCommand?: () => string
  write: (data: string) => void | Promise<void>
  display: (data: string) => void
  interrupt: () => void
  resize: (cols: number, rows: number) => void
  pauseOutput?: () => void
  resumeOutput?: () => void
  clear: () => void
  kill: () => void
}

export interface TerminalExitNotification {
  exitCode: number
  signal?: number | string
}

export interface TerminalAutomationFilterState {
  startMarker: string
  endMarker: string
  phase: 'before-start' | 'body'
  pending: string
}

export interface TerminalCommandExecutionResult {
  outcome?: import('../../../shared/command-outcome').CommandOutcome
  ok: boolean
  command: string
  mode?: 'pty' | 'pipe'
  cwd?: string
  exitCode?: number
  output: string
  error?: string
  timedOut?: boolean
  interrupted?: boolean
  terminalExited?: boolean
  detached?: boolean
  environmentDrift?: boolean
  observedHost?: string
  expectedHost?: string
  code?: 'SSH_TARGET_UNAVAILABLE'
  connectionPhase?: ReturnType<typeof connectionPhase>
  recoveryAction?: 'reconnect-or-select-target' | 'wait-for-target-prompt'
  /** Stable key for the same drift event (expected|observed), used for recovery brakes. */
  driftKey?: string
  subterminalName?: string
  subterminalTabId?: string
  /** True only after the command wrapper was handed to the terminal. */
  dispatched?: boolean
}

export interface TemporarySubterminalEntry {
  name: string
  tabId: string
  busy: boolean
  detached: boolean
  lastUsedAt: number
}

export interface TerminalTransportInput {
  sessionId: number
  shell: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
  cols: number
  rows: number
}
export interface TerminalSessionEvents {
  onExternalWindow?(
    binding: import('../../../shared/external-terminal').ExternalTerminalBinding
  ): void
  onExternalBinding?(
    binding: import('../../../shared/external-terminal').ExternalTerminalBinding
  ): void
  onSnapshot?(text: string, completeLinesOnly?: boolean): void
  onExternalSize?(columns: number, rows: number): void
  onData(data: string): void
  onDisplay(data: string): void
  onExit(event: TerminalExitNotification): void
  onPrompt(cwd: string): void
}
