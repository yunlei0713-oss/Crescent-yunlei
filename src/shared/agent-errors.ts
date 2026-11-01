export type AgentErrorKind =
  | 'quota'
  | 'transient'
  | 'vision'
  | 'attachment'
  | 'connection'
  | 'other'

/** Host validation errors carry a stable category; provider diagnostics remain intact. */
export class AttachmentError extends Error {
  constructor(
    message: string,
    readonly kind: 'vision' | 'attachment' = 'attachment'
  ) {
    super(message)
    this.name = 'AttachmentError'
  }
}

export function parseAgentErrorKind(value: unknown): AgentErrorKind | undefined {
  return typeof value === 'string' &&
    ['quota', 'transient', 'vision', 'attachment', 'connection', 'other'].includes(value)
    ? (value as AgentErrorKind)
    : undefined
}
