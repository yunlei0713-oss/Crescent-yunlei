import { denyAgentOperation } from '../security/agent-capability-policy'
import type { ExecutionMode } from '../../shared/execution-plan'
import { clearPlansForRun } from './change-plan'
import type { WebContents } from 'electron'
import type { ApprovalPolicy, MutationPolicy } from '../../shared/approval-policy'
import { CommandFailures } from './command-failures'
import {
  readTerminalExecutionTarget,
  readTerminalPlanIdentity,
  registerMainTabLoginConfirmedHandler,
  resolveParentTerminalTabId,
  type TerminalCommandExecutionResult
} from '../terminal/ipc'
import { registerPtyExecutionTabChecker } from '../terminal/input-lock'
import type { PiSdkFacade } from './pi-sdk'
import type { AgentConfig, AgentEvent } from './types'

/** Host run context shared by observation, file approval, capture and child tools.
 * The legacy name is retained for callers; this context grants no terminal input.
 */
export interface PtyBashExecContext {
  webContents: WebContents
  executionTabId: string
  observationTabIds?: string[]
  chatTabId?: string
  runId: string
  userInput: string
  terminalContext?: string
  locale?: string
  config: AgentConfig
  executionMode?: ExecutionMode
  approvalPolicy?: ApprovalPolicy
  mutationPolicy?: MutationPolicy
  emit: (event: AgentEvent) => void
  signal?: AbortSignal
  subterminalName?: string
  connectionId?: string
  isSsh?: boolean
  parentConnectionId?: string
  fromSubagent?: boolean
  restorationRequired?: boolean
  executionTargetIdentity?: string
  failures?: CommandFailures
  mainTarget?: { tabId: string; identity?: string; isSsh: boolean; connectionId?: string }
  targetStack?: Array<{ tabId: string; identity?: string; isSsh: boolean; connectionId?: string }>
}

const failedSshSubterminalByRunId = new Map<string, Set<string>>()
export function getFailedSshSubterminalConnectionIds(runId: string): Set<string> {
  let set = failedSshSubterminalByRunId.get(runId)
  if (!set) {
    set = new Set()
    failedSshSubterminalByRunId.set(runId, set)
  }
  return set
}
export function recordFailedSshSubterminalConnection(runId: string, connectionId: string): void {
  const id = connectionId.trim()
  const key = runId.trim()
  if (!id || !key) return
  getFailedSshSubterminalConnectionIds(key).add(id)
}
export function clearFailedSshSubterminalConnectionIds(runId: string): void {
  failedSshSubterminalByRunId.delete(runId)
}

export function shouldRestoreParentBashTab(input: {
  fromSubagent?: boolean
  executionTabId: string
  parentTabId: string
}): boolean {
  if (input.fromSubagent) return false
  return resolveParentTerminalTabId(input.executionTabId) === input.parentTabId.trim()
}

const execContextBySessionKey = new Map<string, PtyBashExecContext>()
// An analyzing agent must never lock the operator's keyboard.
registerPtyExecutionTabChecker(() => false)

export function restorePtyBashExecutionToParentTab(parentTabId: string, ownerId?: number): void {
  const parent = parentTabId.trim()
  if (!parent) return
  for (const [sessionKey, context] of execContextBySessionKey.entries()) {
    if (ownerId !== undefined && context.webContents.id !== ownerId) continue
    if (
      !shouldRestoreParentBashTab({
        fromSubagent: context.fromSubagent,
        executionTabId: context.executionTabId,
        parentTabId: parent
      })
    )
      continue
    if (
      context.executionTabId !== parent &&
      readTerminalPlanIdentity(context.webContents.id, context.executionTabId) ===
        context.executionTargetIdentity
    )
      continue
    if (
      !context.mainTarget?.identity ||
      readTerminalPlanIdentity(context.webContents.id, parent) !== context.mainTarget.identity
    )
      continue
    context.targetStack = []
    context.executionTargetIdentity = context.mainTarget.identity
    context.executionTabId = parent
    context.subterminalName = undefined
    context.isSsh = context.mainTarget.isSsh
    context.connectionId = context.mainTarget.connectionId
    execContextBySessionKey.set(sessionKey, context)
  }
}
registerMainTabLoginConfirmedHandler(restorePtyBashExecutionToParentTab)

export function setPtyBashExecContext(sessionKey: string, context: PtyBashExecContext): void {
  context.executionTargetIdentity = readTerminalPlanIdentity(
    context.webContents.id,
    context.executionTabId
  )
  context.failures ??= new CommandFailures()
  const currentTarget = readTerminalExecutionTarget(context.webContents.id, context.executionTabId)
  context.isSsh = currentTarget.executionMode === 'ssh'
  context.connectionId = currentTarget.connectionId
  const parentTabId = resolveParentTerminalTabId(context.executionTabId)
  const target = readTerminalExecutionTarget(context.webContents.id, parentTabId)
  context.mainTarget = {
    tabId: parentTabId,
    identity: readTerminalPlanIdentity(context.webContents.id, parentTabId),
    isSsh: target.executionMode === 'ssh',
    connectionId: target.connectionId
  }
  if (!context.parentConnectionId?.trim())
    context.parentConnectionId = context.isSsh ? context.connectionId?.trim() : undefined
  execContextBySessionKey.set(sessionKey, context)
}

export function getPtyBashExecContext(sessionKey: string): PtyBashExecContext | undefined {
  return execContextBySessionKey.get(sessionKey)
}
export function updatePtyBashExecutionTabId(
  sessionKey: string,
  executionTabId: string,
  environment?: { connectionId?: string; isSsh?: boolean }
): boolean {
  const existing = execContextBySessionKey.get(sessionKey)
  if (!existing) return false
  const nextId = executionTabId.trim()
  if (!nextId) return false
  const identity = readTerminalPlanIdentity(existing.webContents.id, nextId)
  const authoritative = readTerminalExecutionTarget(existing.webContents.id, nextId)
  if (
    !identity ||
    (environment && Boolean(environment.isSsh) !== (authoritative.executionMode === 'ssh'))
  )
    return false
  existing.restorationRequired = false
  existing.executionTargetIdentity = identity
  existing.executionTabId = nextId
  existing.subterminalName = undefined
  if (environment) {
    existing.isSsh = authoritative.executionMode === 'ssh'
    existing.connectionId = authoritative.connectionId
  }
  execContextBySessionKey.set(sessionKey, existing)
  return true
}
export function returnToMainTerminal(sessionKey: string): { ok: boolean; error?: string } {
  const context = getPtyBashExecContext(sessionKey)
  const target = context?.mainTarget
  if (!context || !target || context.fromSubagent)
    return { ok: false, error: 'No parent execution target in this scope.' }
  const current = readTerminalPlanIdentity(context.webContents.id, target.tabId)
  if (!target.identity || current !== target.identity) {
    context.restorationRequired = true
    return {
      ok: false,
      error:
        'Parent terminal is missing, replaced, or no longer verified. Select/reconnect the parent explicitly; no local fallback.'
    }
  }
  updatePtyBashExecutionTabId(sessionKey, target.tabId, target)
  context.targetStack = []
  return { ok: true }
}
export function pushTemporaryExecutionTarget(sessionKey: string): void {
  const context = getPtyBashExecContext(sessionKey)
  if (!context || context.fromSubagent) return
  const identity = readTerminalPlanIdentity(context.webContents.id, context.executionTabId)
  const target = readTerminalExecutionTarget(context.webContents.id, context.executionTabId)
  ;(context.targetStack ??= []).push({
    tabId: context.executionTabId,
    identity,
    isSsh: target.executionMode === 'ssh',
    connectionId: target.connectionId
  })
}
export function restoreTemporaryExecutionTarget(sessionKey: string): {
  ok: boolean
  error?: string
} {
  const context = getPtyBashExecContext(sessionKey)
  const target = context?.targetStack?.at(-1)
  if (
    !context ||
    !target ||
    !target.identity ||
    readTerminalPlanIdentity(context.webContents.id, target.tabId) !== target.identity
  )
    return {
      ok: false,
      error:
        'Temporary parent is unavailable or replaced; choose a verified target explicitly. No local fallback.'
    }
  updatePtyBashExecutionTabId(sessionKey, target.tabId, target)
  context.targetStack!.pop()
  return { ok: true }
}
export function bindPtyBashExecContextClone(input: {
  fromSessionKey: string
  toSessionKey: string
  executionTabId: string
  fromSubagent?: boolean
}): boolean {
  const parent = execContextBySessionKey.get(input.fromSessionKey)
  if (!parent) return false
  const executionTabId = input.executionTabId.trim()
  if (!executionTabId || !input.toSessionKey.trim()) return false
  const target = readTerminalExecutionTarget(parent.webContents.id, executionTabId)
  execContextBySessionKey.set(input.toSessionKey, {
    ...parent,
    isSsh: target.executionMode === 'ssh',
    connectionId: target.connectionId,
    executionTabId,
    executionTargetIdentity: readTerminalPlanIdentity(parent.webContents.id, executionTabId),
    subterminalName: undefined,
    fromSubagent: Boolean(input.fromSubagent),
    restorationRequired: false,
    failures: new CommandFailures(),
    targetStack: [],
    mainTarget: undefined
  })
  return true
}
export function clearPtyBashExecContext(sessionKey: string): void {
  execContextBySessionKey.delete(sessionKey)
}
export function clearPtyBashExecContextsForRun(runId: string): void {
  const normalized = runId.trim()
  if (!normalized) return
  for (const [key, context] of execContextBySessionKey.entries()) {
    if (context.runId === normalized) execContextBySessionKey.delete(key)
  }
  clearPlansForRun(normalized)
  clearFailedSshSubterminalConnectionIds(normalized)
}

/** Compatibility traps remain fail-closed even when invoked directly by legacy callers. */
export function createPtyBashToolDefinition(
  pi: PiSdkFacade,
  cwd: string,
  _sessionKey: string
): ReturnType<PiSdkFacade['createBashToolDefinition']> {
  return pi.createBashToolDefinition(cwd, {
    operations: {
      async exec() {
        denyAgentOperation('bash')
        throw new Error('Agent terminal execution is unavailable')
      }
    }
  })
}
export async function executeReviewedPtyCommand(_input: {
  sessionKey: string
  context: PtyBashExecContext
  command: string
  timeoutMs?: number
  signal?: AbortSignal
  planGuard?: () => void
}): Promise<TerminalCommandExecutionResult> {
  denyAgentOperation('terminal.execute-reviewed')
  throw new Error('Agent terminal execution is unavailable')
}
