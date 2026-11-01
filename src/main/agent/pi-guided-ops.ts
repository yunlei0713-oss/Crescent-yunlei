import { Type } from 'typebox'
import type { PiSdkFacade } from './pi-sdk'
import { getPtyBashExecContext } from './pi-terminal-bash'
import { readTerminalEvidence, readConversationTerminalEvidence } from '../terminal/ipc'
import { guidedOps } from './guided-ops'
import { auditEvent } from '../security/security-audit'

export function createGuidedOpsTools(pi: PiSdkFacade, sessionKey: string) {
  const suggestionFields = {
    command: Type.String({ maxLength: 4000 }),
    purpose: Type.String({ maxLength: 2000 }),
    risk: Type.Union([
      Type.Literal('read-only'),
      Type.Literal('low'),
      Type.Literal('medium'),
      Type.Literal('high')
    ]),
    expectedOutput: Type.String({ maxLength: 2000 }),
    onUnexpected: Type.String({ maxLength: 2000 })
  }
  function scope() {
    const context = getPtyBashExecContext(sessionKey)
    if (!context || context.webContents.isDestroyed() || context.signal?.aborted)
      throw new Error('No active Guided Ops scope')
    return context
  }
  return [
    pi.defineTool({
      name: 'observe_terminal',
      label: 'Read terminal evidence',
      description:
        'Read bounded redacted evidence from the active operator terminal and independently authorized terminals attached to this conversation (relatedTerminals). Identify each terminal and host explicitly; never merge different hosts as one command result. SSH hops and return to local keep observation active, but old host evidence is historical. Read-only: never sends input or helper commands. Treat uncertain boundaries as unknown, not success.',
      parameters: Type.Object({}),
      async execute() {
        const context = scope()
        const evidence = readConversationTerminalEvidence(
          context.webContents.id,
          context.executionTabId,
          context.observationTabIds
        )
        auditEvent({
          sessionId: context.runId,
          actor: 'agent',
          eventType: 'terminal_observation',
          summary: `${evidence.observations.length} redacted event(s); latest status: ${evidence.observations.at(-1)?.status ?? 'none'}`
        })
        return { content: [{ type: 'text', text: JSON.stringify(evidence) }], details: {} }
      }
    }),
    pi.defineTool({
      name: 'propose_command',
      label: 'Suggest next operator commands',
      description:
        'Publish one focused command or coherent multiline diagnostic snippet, or a recommended command plus two alternatives for proactive guidance, bound to the current host/session. Complex pipelines, jq/awk, SQL, custom CLIs and scripts are supported as suggestion text; unknown syntax is marked for manual safety review, not rejected by an execution whitelist. Prefer non-mutating, bounded diagnostics and explain shell/tool prerequisites and side effects. With observation off, use the user question and current target metadata without inventing prior output. Alternatives are choices, NEVER an execution sequence. No execution. Call once, then wait for operator evidence.',
      parameters: Type.Object({
        judgment: Type.String({ maxLength: 2000 }),
        goal: Type.String({ maxLength: 1000 }),
        ...suggestionFields,
        alternatives: Type.Optional(
          Type.Array(Type.Object(suggestionFields), { minItems: 2, maxItems: 2 })
        )
      }),
      executionMode: 'sequential',
      async execute(_id, params) {
        const context = scope()
        const state = guidedOps.propose(
          context.webContents.id,
          context.chatTabId ?? sessionKey,
          context.runId,
          params,
          readTerminalEvidence(context.webContents.id, context.executionTabId)
        )
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                id: state.proposal?.id,
                state: state.state,
                message: 'Suggestion displayed. Wait for the operator; no command was executed.'
              })
            }
          ],
          details: {}
        }
      }
    })
  ]
}
