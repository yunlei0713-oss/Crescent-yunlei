import { randomUUID } from 'node:crypto'
import { lstat } from 'node:fs/promises'
import type { WebContents } from 'electron'
import type { AgentRunInput } from '../../shared/agent-types'
import type { AgentTurnDraft } from '../../shared/agent-turn-queue'
import { redactSensitiveText } from '../../shared/secret-redaction'
import { getDatabase, resolveConversationId } from '../crescent-sqlite'
import { ensureConversation } from '../sqlite/conversations'
import { rendererIpc } from '../ipc-security'
import { localDocumentReaderForOwner, withDocumentOwner } from '../local-document-ipc'
import { assertProjectIdle, resolveProjectForOwner } from '../projects'
import { readTerminalQueueBinding, terminalConfirmationFingerprint } from '../terminal/ipc'
import { readProjectAssociation } from '../sqlite/project-association'
import { AgentTurnQueue } from './turn-queue'

let instance: AgentTurnQueue | undefined
export function agentTurnQueue(): AgentTurnQueue {
  return (instance ??= new AgentTurnQueue(getDatabase()))
}
const ownerTokens = new WeakMap<WebContents, string>()
const accepting = new Map<string, Promise<unknown>>()

export function queueOwner(owner: WebContents): string {
  const existing = ownerTokens.get(owner)
  if (existing) return existing
  if (owner.isDestroyed()) throw new Error('Turn owner is closed')
  const token = randomUUID()
  const release = (): void => {
    owner.removeListener('destroyed', release)
    owner.removeListener('did-start-navigation', release)
    ownerTokens.delete(owner)
    instance?.release(token)
  }
  owner.once('destroyed', release)
  owner.once('did-start-navigation', release)
  ownerTokens.set(owner, token)
  return token
}

function conversationId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 150)
    throw new Error('Invalid conversation ID')
  return resolveConversationId(value)
}

function strings(value: unknown, count: number): string[] | undefined {
  if (value === undefined) return undefined
  if (
    !Array.isArray(value) ||
    value.length > count ||
    !value.every((entry) => typeof entry === 'string' && entry.length <= 4096)
  )
    throw new Error('Invalid turn references')
  return value
}

function safeDraft(draft: AgentTurnDraft): AgentTurnDraft {
  if (
    typeof draft?.originalInput !== 'string' ||
    typeof draft.displayInput !== 'string' ||
    typeof draft.request?.input !== 'string' ||
    !draft.request.input.trim() ||
    JSON.stringify(draft).length > 200_000
  )
    throw new Error('Invalid queued turn')
  if (draft.references !== undefined) {
    for (const key of ['skills', 'wiki', 'tools', 'paths'] as const) {
      const entries = draft.references?.[key]
      if (
        !Array.isArray(entries) ||
        entries.length > 64 ||
        entries.some((item) => !item || typeof item.id !== 'string')
      )
        throw new Error('Invalid queued display references')
    }
  }
  const source = draft.request
  for (const value of [
    source.skillInput,
    source.resumeInput,
    source.providerId,
    source.model,
    source.tabId,
    source.executionTabId,
    source.executionConnectionId,
    source.projectId,
    source.locale,
    source.agentStyle
  ]) {
    if (value !== undefined && (typeof value !== 'string' || value.length > 32_000))
      throw new Error('Invalid turn field')
  }
  if (
    source.attachments !== undefined &&
    (!Array.isArray(source.attachments) ||
      source.attachments.length > 8 ||
      source.attachments.some((item) => typeof item?.path !== 'string'))
  )
    throw new Error('Invalid queued attachments')
  const request: AgentRunInput = {
    input: source.input,
    skillInput: source.skillInput,
    resumeInput: source.resumeInput,
    terminalOperatorFinished: source.terminalOperatorFinished === true,
    providerId: source.providerId,
    model: source.model,
    tabId: source.tabId,
    executionTabId: source.executionTabId,
    executionConnectionId: source.executionConnectionId,
    projectId: source.projectId,
    locale: source.locale,
    agentStyle: source.agentStyle,
    observationTabIds: strings(source.observationTabIds, 8),
    activeWikiIds: strings(source.activeWikiIds, 64),
    activeSkillPaths: strings(source.activeSkillPaths, 64),
    attachments: source.attachments?.map(({ path }) => ({ path }))
  }
  return {
    request,
    originalInput: draft.originalInput,
    displayInput: draft.displayInput,
    references: draft.references,
    skipUserLog: draft.skipUserLog === true
  }
}

function bindings(ownerId: number, id: string, request: AgentRunInput): string | undefined {
  const keys = [...new Set([request.executionTabId, ...(request.observationTabIds ?? [])])]
    .filter((tab): tab is string => Boolean(tab))
    .map((tab) => {
      const binding = readTerminalQueueBinding(ownerId, id, tab)
      if (!binding && request.observationTabIds?.includes(tab))
        throw new Error('Queued terminal is no longer available')
      return binding
    })
    .filter(Boolean)
  return keys.length ? JSON.stringify(keys) : undefined
}

export async function queueAttachments(
  ownerId: number,
  request: AgentRunInput,
  root?: string
): Promise<string | undefined> {
  if (!request.attachments?.length) return
  const reader = await localDocumentReaderForOwner(
    ownerId,
    root,
    request.attachments.map(({ path }) => path)
  )
  const files = await Promise.all(
    request.attachments.map(async ({ path }) => {
      const authorized = await reader.authorize(path)
      const file = await lstat(authorized, { bigint: true })
      if (!file.isFile()) throw new Error('Queued attachment is no longer a regular file')
      return [authorized, file.dev, file.ino, file.size, file.mtimeNs, file.ctimeNs].map(String)
    })
  )
  return JSON.stringify(files)
}

export async function verifyTurnSnapshot(
  owner: WebContents,
  id: string,
  snapshot: AgentTurnDraft & {
    bindings?: string
    files?: string
    projectRoot?: string
    bindingOwner?: string
    projectSince?: string
  },
  token: string
): Promise<void> {
  const { request } = snapshot
  const association = readProjectAssociation(getDatabase(), id)
  if (association.projectId !== request.projectId || association.since !== snapshot.projectSince)
    throw new Error('Queued conversation project changed')
  if (
    (snapshot.bindings && snapshot.bindingOwner !== token) ||
    bindings(owner.id, id, request) !== snapshot.bindings
  )
    throw new Error('Queued terminal target or observation authorization changed')
  const projectRoot = request.projectId
    ? (await resolveProjectForOwner(owner, request.projectId)).root
    : undefined
  if (projectRoot !== snapshot.projectRoot) throw new Error('Queued project directory changed')
  if ((await queueAttachments(owner.id, request, projectRoot)) !== snapshot.files)
    throw new Error('Queued attachment changed or is no longer authorized')
}

export function registerAgentTurnQueueIpc(isRunning: (id: string) => boolean): void {
  rendererIpc.handle(
    'agent:turn-enqueue',
    (event, input: { conversationId: string; draft: AgentTurnDraft; priority?: boolean }) => {
      const id = conversationId(input?.conversationId)
      const token = queueOwner(event.sender)
      const draft = safeDraft(input.draft)
      const accept = (accepting.get(id) ?? Promise.resolve())
        .catch(() => {})
        .then(() =>
          withDocumentOwner(event.sender, async (assertCurrent) => {
            if (queueOwner(event.sender) !== token) throw new Error('Turn owner changed')
            assertProjectIdle(id)
            const project = readProjectAssociation(getDatabase(), id)
            if (project.projectId !== draft.request.projectId)
              throw new Error('Conversation project changed before enqueue')
            const terminalBindings = bindings(event.sender.id, id, draft.request)
            const terminalConfirmation = draft.request.terminalOperatorFinished
              ? terminalConfirmationFingerprint(
                  event.sender.id,
                  id,
                  draft.request.executionTabId ?? ''
                )
              : undefined
            const projectRoot = draft.request.projectId
              ? (await resolveProjectForOwner(event.sender, draft.request.projectId)).root
              : undefined
            const files = await queueAttachments(event.sender.id, draft.request, projectRoot)
            assertCurrent()
            assertProjectIdle(id)
            if (readProjectAssociation(getDatabase(), id).since !== project.since)
              throw new Error('Conversation project changed before enqueue')
            ensureConversation(getDatabase(), id)
            return agentTurnQueue().enqueue(
              id,
              token,
              {
                ...draft,
                bindings: terminalBindings,
                files,
                projectRoot,
                bindingOwner: token,
                projectSince: project.since,
                terminalConfirmation
              },
              input.priority === true
            )
          })
        )
      accepting.set(id, accept)
      return accept.finally(() => {
        if (accepting.get(id) === accept) accepting.delete(id)
      })
    }
  )
  rendererIpc.handle('agent:turn-list', (event, id: unknown) =>
    agentTurnQueue().list(conversationId(id), queueOwner(event.sender))
  )
  rendererIpc.handle('agent:turn-claim', (event, input: unknown) => {
    const id = conversationId(input)
    if (isRunning(id)) return
    const item = agentTurnQueue().claim(id, queueOwner(event.sender))
    if (item) {
      const { id, request, originalInput, displayInput, references, skipUserLog } = item
      return { id, request, originalInput, displayInput, references, skipUserLog }
    }
    return undefined
  })
  rendererIpc.handle('agent:turn-unclaim', (event, id: unknown) => {
    if (typeof id === 'string') agentTurnQueue().recoverClaim(id, queueOwner(event.sender))
  })
  rendererIpc.handle('agent:turn-resume', (event, id: unknown) =>
    agentTurnQueue().resume(conversationId(id), queueOwner(event.sender))
  )
  rendererIpc.handle(
    'agent:turn-remove',
    (_, input: { conversationId: string; id: string }) =>
      typeof input?.id === 'string' &&
      agentTurnQueue().remove(conversationId(input.conversationId), input.id)
  )
}

export function queueFailure(error: unknown): string {
  return redactSensitiveText(error instanceof Error ? error.message : String(error)).slice(0, 400)
}
