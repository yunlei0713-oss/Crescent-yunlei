import { auditEvent } from './security-audit'

/** Host-reviewed capabilities. Settings, styles, prompts and tool descriptions cannot extend this. */
export const AGENT_CAPABILITIES = Object.freeze({
  read: 'file.read',
  code_search: 'file.search',
  symbol_lookup: 'file.search',
  dependency_trace: 'file.search',
  impact_analysis: 'file.search',
  memory_search: 'file.read',
  subagent: 'analysis.delegate',
  'create-skill': 'file.write.request',
  'create-sop': 'file.write.request',
  propose_command: 'terminal.suggest',
  observe_terminal: 'terminal.observe',
  request_file_change: 'file.write.request'
} as const)

export function assertAgentTools(names: readonly string[]): void {
  for (const name of names) {
    if (!Object.hasOwn(AGENT_CAPABILITIES, name)) denyAgentOperation(`tool:${name}`)
  }
}

export function denyAgentOperation(operation: string): void {
  auditEvent({
    sessionId: 'capability-policy',
    actor: 'agent',
    eventType: 'permission_denied',
    summary: operation
  })
  throw new Error(
    `Guided Ops: Agent capability denied (${operation}). Terminal input belongs to the operator.`
  )
}
