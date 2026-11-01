import { AsyncLocalStorage } from 'node:async_hooks'
import { denyAgentOperation } from './agent-capability-policy'

// This origin is assigned by Main, never deserialized from IPC or model arguments.
const origin = new AsyncLocalStorage<'agent'>()

export function withAgentCapabilities<T>(work: () => T): T {
  return origin.run('agent', work)
}

export function assertOperatorTerminalAccess(): void {
  if (origin.getStore() === 'agent') denyAgentOperation('terminal.write/execute')
}
