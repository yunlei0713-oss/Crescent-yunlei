import { discardHostedHistory } from '../agent/pi-host'
import { historicalText } from '../sqlite/context-checkpoints'
import { memoryService } from '../memory/service'
import { rendererIpc } from '../ipc-security'

import {
  getDatabase,
  archiveConversation,
  activateConversation,
  resolveConversationId,
  deleteAgentLogs,
  deleteOpsHistoryRecord,
  deleteSessionHistory,
  getAgentLog,
  getAgentRun,
  getOpsHistoryByRunId,
  listAgentRunsForTab,
  listAllAgentRunsForTab,
  getSessionTokenUsage,
  listAgentLogs,
  countAgentLogs,
  listOpsHistoryForConnection,
  listSessionHistory,
  readSessionHistoryDetail,
  renameSessionHistory,
  saveAgentLog,
  saveAgentRun,
  saveSessionTabs,
  updateAgentLog,
  updateOpsHistoryRecord,
  updateSessionHistorySummary,
  upsertOpsHistoryRecord
} from '../crescent-sqlite'
import { AgentBrain } from '../agent/brain'
import { buildOpsFeedbackSummarizeSource, parseOpsFeedbackSummary } from '../agent/ops-history'
import { readAgentConfig } from '../crescent-store'
import type { WebContents } from 'electron'
import { safeWebContentsSend } from '../safe-ipc-send'
import { resolveOpsConnectionId } from '../../shared/local-connection'
import type {
  OpsHistoryRating,
  StoredAgentLogEntry,
  StoredAgentRun,
  StoredSessionSummaryUpdate,
  StoredSessionTab,
  SubmitOpsFeedbackInput,
  SubmitOpsFeedbackResult,
  UpdateOpsFeedbackInput,
  UpdateOpsFeedbackResult
} from '../agent/types'

const pendingSessionSummaryTimers = new Map<string, NodeJS.Timeout>()

export function registerStorageIpc(): void {
  rendererIpc.handle('storage:activate-conversation', (_, id: string) => {
    if (typeof id !== 'string' || !id.trim()) throw new Error('Invalid conversation')
    activateConversation(id)
    return { ok: true }
  })
  rendererIpc.handle('storage:archive-conversation', (_, id: string) => {
    if (typeof id !== 'string' || !id.trim()) throw new Error('Invalid conversation')
    archiveConversation(id)
    return { ok: true }
  })
  rendererIpc.handle('storage:save-tabs', (_, tabs: StoredSessionTab[]) => {
    saveSessionTabs(tabs)
    return { ok: true }
  })

  rendererIpc.handle('storage:save-agent-log', (event, entry: StoredAgentLogEntry) => {
    saveAgentLog(entry)
    scheduleSessionSummary(entry.tabId, event.sender)
    return { ok: true }
  })

  rendererIpc.handle(
    'storage:update-agent-log',
    (event, input: Pick<StoredAgentLogEntry, 'tabId' | 'logId' | 'text'>) => {
      updateAgentLog(input)
      scheduleSessionSummary(input.tabId, event.sender)
      return { ok: true }
    }
  )

  rendererIpc.handle(
    'storage:delete-agent-logs',
    async (event, input: { tabId?: string; logIds?: number[] }) => {
      const tabId = input?.tabId?.trim() ?? ''
      const logIds = Array.isArray(input?.logIds) ? input.logIds : []
      if (tabId && logIds.length) await discardHostedHistory(resolveConversationId(tabId))
      const removed = deleteAgentLogs(tabId, logIds)
      if (removed > 0 && tabId) scheduleSessionSummary(tabId, event.sender)
      memoryService().syncHistory()
      return { ok: true, removed }
    }
  )

  rendererIpc.handle('storage:save-agent-run', (_, run: StoredAgentRun) => {
    saveAgentRun(run)
    return { ok: true }
  })

  rendererIpc.handle('storage:get-agent-run', (_, runId: string) => {
    return getAgentRun(runId ?? '')
  })

  rendererIpc.handle(
    'storage:list-agent-runs',
    (_, payload?: { tabId?: string; limit?: number }) => {
      return listAgentRunsForTab(payload?.tabId ?? '', payload?.limit)
    }
  )

  rendererIpc.handle('storage:list-all-agent-runs', (_, tabId?: string) => {
    return listAllAgentRunsForTab(typeof tabId === 'string' ? tabId : '')
  })

  rendererIpc.handle('storage:get-session-token-usage', (_, tabId?: string) => {
    return getSessionTokenUsage(typeof tabId === 'string' ? tabId : '')
  })

  rendererIpc.handle('storage:get-agent-log', (_, payload?: { tabId?: string; logId?: number }) => {
    const tabId = payload?.tabId?.trim() ?? ''
    const logId = typeof payload?.logId === 'number' ? payload.logId : Number.NaN
    return getAgentLog(tabId, logId)
  })

  rendererIpc.handle(
    'storage:list-agent-logs',
    (_, payload?: { tabId?: string; beforeLogId?: number; limit?: number }) => {
      return listAgentLogs(payload?.tabId ?? '', {
        beforeLogId: payload?.beforeLogId,
        limit: payload?.limit
      })
    }
  )

  rendererIpc.handle('storage:count-agent-logs', (_, tabId?: string) => {
    return countAgentLogs(tabId ?? '')
  })

  rendererIpc.handle('storage:list-session-history', (_, limit?: number) => {
    return listSessionHistory(limit)
  })

  rendererIpc.handle('storage:get-session-history', (_, tabId: string) => {
    return readSessionHistoryDetail(tabId)
  })

  rendererIpc.handle('storage:delete-session-history', async (_, tabId: string) => {
    if (typeof tabId !== 'string' || !tabId.trim()) return { ok: false }
    const id = resolveConversationId(tabId)
    await discardHostedHistory(id)
    const timer = pendingSessionSummaryTimers.get(id)
    if (timer) clearTimeout(timer)
    pendingSessionSummaryTimers.delete(id)
    const ok = deleteSessionHistory(id)
    memoryService().syncHistory()
    return { ok }
  })

  rendererIpc.handle(
    'storage:rename-session-history',
    (_, payload: { tabId?: string; title?: string }) => {
      return { ok: renameSessionHistory(payload?.tabId ?? '', payload?.title ?? '') }
    }
  )

  rendererIpc.handle(
    'storage:submit-ops-feedback',
    async (_, payload: SubmitOpsFeedbackInput): Promise<SubmitOpsFeedbackResult> => {
      return submitOpsFeedback(payload)
    }
  )

  rendererIpc.handle('storage:get-ops-feedback', (_, runId: string) => {
    return getOpsHistoryByRunId(runId ?? '')
  })

  rendererIpc.handle(
    'storage:list-ops-feedback',
    (_, payload?: { connectionId?: string; tabId?: string; limit?: number }) => {
      return listOpsHistoryForConnection(
        resolveOpsConnectionId(payload?.connectionId),
        payload?.limit
      )
    }
  )

  rendererIpc.handle(
    'storage:update-ops-feedback',
    (_, payload: UpdateOpsFeedbackInput): UpdateOpsFeedbackResult => {
      const id = payload?.id?.trim() ?? ''
      if (!id) return { ok: false, error: 'Invalid ops feedback id.' }

      const record = updateOpsHistoryRecord({
        id,
        rating: payload.rating,
        userGoal: payload.userGoal,
        pathSummary: payload.pathSummary,
        lesson: payload.lesson
      })
      if (!record) return { ok: false, error: 'Ops feedback not found or invalid.' }
      return { ok: true, record }
    }
  )

  rendererIpc.handle('storage:delete-ops-feedback', (_, id: string) => {
    return { ok: deleteOpsHistoryRecord(id ?? '') }
  })
}

async function submitOpsFeedback(
  payload: SubmitOpsFeedbackInput
): Promise<SubmitOpsFeedbackResult> {
  const tabId = payload?.tabId?.trim() ?? ''
  const runId = payload?.runId?.trim() ?? ''
  const rating = payload?.rating
  if (!tabId || !runId || (rating !== 'like' && rating !== 'dislike')) {
    return { ok: false, error: 'Invalid ops feedback payload.' }
  }

  const run = getAgentRun(runId)
  if (!run) return { ok: false, error: 'Agent run not found.' }
  if (resolveConversationId(run.tabId) !== resolveConversationId(tabId))
    return { ok: false, error: 'Run does not belong to this session.' }

  const connectionId = resolveOpsConnectionId(payload.connectionId || run.connectionId)

  const existing = getOpsHistoryByRunId(runId)
  if (existing) {
    if (existing.rating !== rating) {
      return {
        ok: false,
        error: 'Ops feedback already rated; like and dislike are mutually exclusive.'
      }
    }
    if (existing.connectionId === connectionId && existing.pathSummary.trim()) {
      return { ok: true, record: existing }
    }
  }

  try {
    const summarized = await summarizeOpsFeedback(run, rating)
    const record = upsertOpsHistoryRecord({
      id: existing?.id ?? `ops-${crypto.randomUUID()}`,
      tabId,
      connectionId,
      runId,
      rating,
      userGoal: run.input.trim().slice(0, 500),
      pathSummary: summarized.pathSummary,
      lesson: summarized.lesson
    })
    if (!record) return { ok: false, error: 'Failed to persist ops feedback.' }
    return { ok: true, record }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

async function summarizeOpsFeedback(
  run: StoredAgentRun,
  rating: OpsHistoryRating
): Promise<{ pathSummary: string; lesson: string }> {
  const source = buildOpsFeedbackSummarizeSource(run)
  const completion = await new AgentBrain(readAgentConfig()).chat({
    temperature: 0,
    messages: [
      {
        role: 'system',
        content: [
          'You distill a Crescent ops run into a short path reference for the SAME connection/terminal (SSH when connected, otherwise local terminal).',
          'This is NOT an SOP or wiki document — only a concise ops path + lesson for later guidance.',
          'Return strict JSON only: {"pathSummary":"...","lesson":"..."}.',
          'pathSummary: concise ordered ops path (what was checked/changed and in what order).',
          rating === 'like'
            ? 'lesson: why this approach is a good reference for similar future goals on this connection/terminal.'
            : 'lesson: why this approach failed or should be avoided as a cautionary example on this connection/terminal.',
          'Use the same natural language as the user goal. Keep pathSummary under 80 words and lesson under 40 words.'
        ].join('\n')
      },
      {
        role: 'user',
        content: `Rating: ${rating}\n\n${source}`
      }
    ]
  })

  const parsed = parseOpsFeedbackSummary(completion.choices[0]?.message.content ?? '')
  if (parsed) return parsed

  return {
    pathSummary: (run.trace?.resultSummary || run.output || run.input).trim().slice(0, 1200),
    lesson:
      rating === 'like'
        ? 'User marked this ops path as a positive reference for this connection/terminal.'
        : 'User marked this ops path as a cautionary example for this connection/terminal.'
  }
}

function scheduleSessionSummary(tabId: string, webContents: WebContents): void {
  const normalizedTabId = resolveConversationId(tabId.trim())
  if (!normalizedTabId) return

  const existing = pendingSessionSummaryTimers.get(normalizedTabId)
  if (existing) clearTimeout(existing)

  const timer = setTimeout(() => {
    pendingSessionSummaryTimers.delete(normalizedTabId)
    summarizeSessionHistory(normalizedTabId, webContents)
  }, 2500)
  pendingSessionSummaryTimers.set(normalizedTabId, timer)
}

/** Sidebar metadata is local and deterministic. Learning has a separate, consented model path. */
function summarizeSessionHistory(tabId: string, webContents: WebContents): void {
  try {
    const logs = listAgentLogs(tabId, { limit: 12 })
    const latest = logs.findLast(
      (log) => ['user', 'assistant', 'error'].includes(log.kind) && historicalText(log).trim()
    )
    if (!latest) return
    const summary = historicalText(latest).replace(/\s+/g, ' ').trim().slice(0, 260)
    const title = String(
      getDatabase().prepare('SELECT title FROM conversations WHERE conversation_id=?').get(tabId)
        ?.title ?? 'Conversation'
    )
    const updated = updateSessionHistorySummary({ tabId, title, summary })
    if (!updated.ok) return
    const event: StoredSessionSummaryUpdate = {
      tabId,
      title: updated.title,
      summary: updated.summary,
      updatedAt: updated.updatedAt
    }
    safeWebContentsSend(webContents, 'storage:session-summary-updated', event)
  } catch {
    // A removed history or unavailable metadata must not block chat.
  }
}
