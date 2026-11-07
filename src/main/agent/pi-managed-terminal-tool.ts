import { Type } from 'typebox'
import type { WebContents } from 'electron'
import { readTerminalSessionHealth } from '../terminal/ipc'
import type { PiSdkFacade } from './pi-sdk'
import { getPtyBashExecContext } from './pi-terminal-bash'
import { managedTerminalWindow } from '../terminal/managed/window'
import type { ManagedCommandResult } from '../../shared/managed-terminal'

export const MANAGED_TERMINAL_TOOL = 'request_terminal_command'
export const MANAGED_TERMINAL_RESULT_TOOLS = [
  'wait_terminal_command',
  'get_terminal_command_result',
  'cancel_terminal_command'
] as const
export const MANAGED_TERMINAL_STATUS_TOOLS = [
  'get_terminal_session_status',
  'list_active_terminal_commands'
] as const

export function isManagedToolAvailable(
  owner: WebContents,
  conversationId: string,
  activeTabId: string
): boolean {
  return (
    !hasLegacyTerminal(owner, activeTabId) &&
    managedTerminalWindow.canExecute(owner, conversationId)
  )
}

export function isManagedCommandHistoryAvailable(
  owner: WebContents,
  conversationId: string,
  activeTabId: string
): boolean {
  return (
    !hasLegacyTerminal(owner, activeTabId) &&
    managedTerminalWindow.canAccessCommandHistory(owner, conversationId)
  )
}

function hasLegacyTerminal(owner: WebContents, tabId: string): boolean {
  const legacy = readTerminalSessionHealth(owner.id, tabId)
  return legacy.hasSession || legacy.restoring
}

export function createManagedTerminalTool(pi: PiSdkFacade, conversationId: string) {
  return pi.defineTool({
    name: MANAGED_TERMINAL_TOOL,
    label: 'Request terminal command',
    description:
      'Ask the operator to approve one command in the visible collaboration shell for this conversation. Supports pwd, true, false, uname (-s, -r, -m), literal ASCII echo, and sleep (1 to 600 seconds). Use propose_command for unsupported commands or targets. Use the original commandId to follow a timed-out command. Report command status separately from task verification.',
    parameters: Type.Object({ command: Type.String({ minLength: 1, maxLength: 120 }) }),
    executionMode: 'sequential',
    async execute(_toolCallId, { command }, signal) {
      const context = getPtyBashExecContext(conversationId)
      if (
        !context ||
        context.fromSubagent ||
        context.isSsh ||
        !context.signal ||
        !isManagedToolAvailable(context.webContents, conversationId, context.executionTabId)
      )
        throw new Error('No current conversation authorizes this tool.')
      const commandSignal = signal ? AbortSignal.any([signal, context.signal]) : context.signal
      const result = await managedTerminalWindow.execute(
        context.webContents,
        conversationId,
        command,
        commandSignal,
        () =>
          getPtyBashExecContext(conversationId) === context &&
          !hasLegacyTerminal(context.webContents, context.executionTabId)
      )
      return toolResult(result)
    }
  })
}

export function createManagedTerminalResultTools(pi: PiSdkFacade, conversationId: string) {
  return MANAGED_TERMINAL_RESULT_TOOLS.map((name) =>
    pi.defineTool({
      name,
      label: name.replaceAll('_', ' '),
      description: {
        wait_terminal_command:
          'Wait for the original commandId to change state. A wait deadline never interrupts or retries it.',
        get_terminal_command_result:
          'Read the original commandId state and any confirmed exit code and bounded output.',
        cancel_terminal_command:
          'Cancel a pending request or ask the operator to approve one Ctrl+C on the visible terminal. A cancellation request does not prove completion.'
      }[name],
      parameters: Type.Object({
        commandId: Type.String({ minLength: 36, maxLength: 36 }),
        ...(name === 'wait_terminal_command'
          ? { waitMs: Type.Optional(Type.Integer({ minimum: 0, maximum: 30_000 })) }
          : {})
      }),
      executionMode: 'sequential',
      async execute(_toolCallId, { commandId, waitMs }, signal) {
        const context = getPtyBashExecContext(conversationId)
        if (
          !context ||
          context.fromSubagent ||
          context.isSsh ||
          !context.signal ||
          hasLegacyTerminal(context.webContents, context.executionTabId)
        )
          throw new Error('No current conversation authorizes this command')
        const commandSignal = signal ? AbortSignal.any([signal, context.signal]) : context.signal
        const scopeCurrent = (): boolean =>
          getPtyBashExecContext(conversationId) === context &&
          !hasLegacyTerminal(context.webContents, context.executionTabId)
        const owner = context.webContents
        if (waitMs !== undefined && typeof waitMs !== 'number')
          throw new Error('Invalid managed command wait')
        const result =
          name === 'cancel_terminal_command'
            ? await managedTerminalWindow.cancelCommand(
                owner,
                conversationId,
                commandId,
                commandSignal,
                scopeCurrent
              )
            : await managedTerminalWindow.lookupCommand(
                owner,
                conversationId,
                commandId,
                name === 'wait_terminal_command' ? (waitMs ?? 15_000) : 0,
                commandSignal,
                scopeCurrent
              )
        return toolResult(result)
      }
    })
  )
}

function toolResult(result: ManagedCommandResult) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    details: { commandId: result.commandId, state: result.state, exitCode: result.exitCode }
  }
}

export function createManagedTerminalStatusTools(pi: PiSdkFacade, conversationId: string) {
  return MANAGED_TERMINAL_STATUS_TOOLS.map((name) =>
    pi.defineTool({
      name,
      label: name.replaceAll('_', ' '),
      description:
        name === 'get_terminal_session_status'
          ? 'Read the bound terminal, shell capability, and visibility for the current conversation.'
          : 'List running, pending, and unknown command IDs for the bound terminal.',
      parameters: Type.Object({}),
      async execute(_toolCallId, _params, signal) {
        const context = getPtyBashExecContext(conversationId)
        if (
          !context ||
          context.fromSubagent ||
          context.isSsh ||
          !context.signal ||
          hasLegacyTerminal(context.webContents, context.executionTabId)
        )
          throw new Error('No current conversation authorizes terminal status')
        context.signal.throwIfAborted()
        signal?.throwIfAborted()
        const status = managedTerminalWindow.commandStatus(context.webContents, conversationId)
        const result = name === 'list_active_terminal_commands' ? status.activeCommands : status
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], details: {} }
      }
    })
  )
}
