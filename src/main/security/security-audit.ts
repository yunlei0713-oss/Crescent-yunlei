import { randomUUID } from 'node:crypto'
import { redactSensitiveText } from '../../shared/secret-redaction'

export interface AgentAuditEvent {
  id: string
  sessionId: string
  timestamp: number
  actor: 'user' | 'agent' | 'system'
  eventType:
    | 'analysis'
    | 'command_suggestion'
    | 'terminal_observation'
    | 'file_change_request'
    | 'file_change_approval'
    | 'file_change_rejection'
    | 'file_change_applied'
    | 'permission_denied'
  summary: string
}
// Session-scoped metadata only. No raw terminal output or file contents on disk.
const events: AgentAuditEvent[] = []
const RETENTION_MS = 24 * 60 * 60 * 1000
export function auditEvent(event: Omit<AgentAuditEvent, 'id' | 'timestamp'>): void {
  const now = Date.now()
  events.push({
    ...event,
    id: randomUUID(),
    timestamp: now,
    summary: redactSensitiveText(event.summary).slice(0, 1000)
  })
  while (events.length > 1000 || (events[0] && events[0].timestamp < now - RETENTION_MS))
    events.shift()
}
export function readAuditEvents(sessionId: string): AgentAuditEvent[] {
  return events
    .filter(
      (event) => event.sessionId === sessionId && event.timestamp >= Date.now() - RETENTION_MS
    )
    .map((event) => ({ ...event }))
}
