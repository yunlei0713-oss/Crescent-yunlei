export interface ManagedTerminalIdentity {
  terminalSessionId: string
  sessionGeneration: number
}

export interface ManagedTerminalAttachment extends ManagedTerminalIdentity {
  attachmentId: string
}

export interface ManagedTerminalSnapshot {
  data: string
  /** UTF-16 offset of the first code unit not included in data. */
  cursor: number
  /** Reset the display before replaying the retained tail. */
  truncated: boolean
  executionState?: ManagedExecutionState
  shellTarget?: ManagedShellTarget
  canProbeSsh?: boolean
  sshProbe?: 'waiting' | 'confirm'
  exit?: { exitCode: number; signal?: number | string }
}

export interface ManagedShellTarget {
  cwd: string
  host: string
  transport?: 'ssh'
  shell?: 'bash' | 'zsh'
  user?: string
  version?: string
  /** Separate from the attachment generation when the same PTY enters another shell. */
  shellGeneration?: number
}

export type ManagedExecutionState =
  | 'starting'
  | 'ready'
  | 'approval-pending'
  | 'dispatched'
  | 'running'
  | 'timed-out-running'
  | 'completed-success'
  | 'completed-failure'
  | 'interrupted'
  | 'unknown'
  | 'manual-only'

export interface ManagedCommandResult {
  commandId: string
  approvalId: string
  commandHash: string
  target: ManagedTerminalIdentity & ManagedShellTarget
  startedAt?: number
  finishedAt?: number
  durationMs?: number
  state: ManagedCommandState
  exitCode?: number
  output?: string
  outputTruncated?: boolean
  cancelRequested?: boolean
  reason?: 'shell-exited' | 'transport-lost' | 'authority-lost' | 'restart' | 'audit-unavailable'
  /** Shell exit is only the command result. Business verification is independent. */
  taskVerified: false
}

export type ManagedCommandState =
  | Exclude<ManagedExecutionState, 'starting' | 'ready' | 'manual-only'>
  | 'approved'
  | 'rejected'

export function isPendingManagedCommand(state: ManagedCommandState): boolean {
  return (
    state === 'approval-pending' ||
    state === 'approved' ||
    state === 'dispatched' ||
    state === 'running' ||
    state === 'timed-out-running'
  )
}
