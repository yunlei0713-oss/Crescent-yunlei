import { useMemo, type RefObject, type ReactNode } from 'react'
import { Loader2Icon, RefreshCwIcon, ServerIcon, TriangleAlertIcon } from 'lucide-react'

import { AgentLogMessage } from '@renderer/components/AgentLogMessage'
import { Button } from '@renderer/components/ui/button'
import type { Dictionary } from '@renderer/i18n'
import { isConnectionStatusText, logListItemSpacingClass } from '@renderer/lib/agent-log'
import type { AgentLogEntry, AgentRunViewState } from '@renderer/lib/terminal-tabs'
import type { CaptureKind } from '../../../shared/agent-types'
import { useStableCallback } from '@renderer/hooks/useStableCallback'

export function AgentLogList({
  logRef,
  entries,
  tabId,
  liveRunByLogId,
  copiedLogId,
  thinking,
  thinkingMessage,
  thinkingCollapsedByDefault,
  connectionRecovery,
  t,
  onCopyEntry: copyEntry,
  onCopyResult: copyResult,
  onExportResult: exportResult,
  onExportFull: exportFull,
  onExportTrace: exportTrace,
  onOpsFeedback: opsFeedback,
  onResolveApproval: resolveApproval,
  feedbackByLogId,
  feedbackBusyLogId,
  savingSopLogId,
  onRetryConnection,
  onReinitTerminal,
  onOpenConnections,
  onAddCommandToWhitelist: addCommandToWhitelist,
  onInjectSuggestions: injectSuggestions,
  onOpenModelSettings: openModelSettings,
  onSaveAsSop: saveAsSop,
  onFocusTerminal: focusTerminal,
  captureReadyLogs = [],
  hiddenCaptureReadyLogIds = [],
  onOpenCaptureDraft: openCaptureDraft,
  hasEarlierLogs,
  loadingEarlier,
  earlierLogsError = null,
  onLoadEarlier,
  primaryContent
}: {
  logRef: RefObject<HTMLDivElement | null>
  entries: AgentLogEntry[]
  tabId?: string
  liveRunByLogId?: Record<number, AgentRunViewState>
  copiedLogId?: number | null
  thinking?: boolean
  thinkingMessage?: string
  thinkingCollapsedByDefault?: boolean
  connectionRecovery?: {
    visible: boolean
    dismissed?: boolean
    canRetry: boolean
    connecting?: boolean
    pipeFallback?: boolean
    reason?: string
  }
  t: Dictionary
  onCopyEntry: (entry: AgentLogEntry) => void
  onCopyResult: (entry: AgentLogEntry) => void
  onExportResult: (entry: AgentLogEntry) => void
  onExportFull: (entry: AgentLogEntry) => void
  onExportTrace: (entry: AgentLogEntry) => void
  onOpsFeedback: (entry: AgentLogEntry, rating: 'like' | 'dislike') => void
  onResolveApproval?: (requestId: string, approved: boolean, note?: string) => void
  onAddCommandToWhitelist?: (command: string) => void
  onInjectSuggestions?: (texts: string[]) => void
  onOpenModelSettings?: () => void
  onSaveAsSop?: (entry: AgentLogEntry) => void
  onFocusTerminal?: (tabId: string) => void
  captureReadyLogs?: Array<{ logId: number; kind: CaptureKind }>
  hiddenCaptureReadyLogIds?: number[]
  onOpenCaptureDraft?: (kind: CaptureKind) => void
  feedbackByLogId?: Record<number, 'like' | 'dislike'>
  feedbackBusyLogId?: number | null
  savingSopLogId?: number | null
  onRetryConnection?: () => void
  onReinitTerminal?: () => void
  onOpenConnections?: () => void
  hasEarlierLogs?: boolean
  loadingEarlier?: boolean
  earlierLogsError?: string | null
  onLoadEarlier?: () => void | Promise<void>
  /** Latest guidance participates in the same scroll flow as analysis and evidence. */
  primaryContent?: ReactNode
}): React.JSX.Element {
  const onCopyEntry = useStableCallback(copyEntry)
  const onOpenCaptureDraft = useStableCallback(openCaptureDraft)
  const onCopyResult = useStableCallback(copyResult)
  const onExportResult = useStableCallback(exportResult)
  const onExportFull = useStableCallback(exportFull)
  const onExportTrace = useStableCallback(exportTrace)
  const onOpsFeedback = useStableCallback(opsFeedback)
  const onResolveApproval = useStableCallback(resolveApproval)
  const onAddCommandToWhitelist = useStableCallback(addCommandToWhitelist)
  const onInjectSuggestions = useStableCallback(injectSuggestions)
  const onOpenModelSettings = useStableCallback(openModelSettings)
  const onSaveAsSop = useStableCallback(saveAsSop)
  const onFocusTerminal = useStableCallback(focusTerminal)
  // Transport exit is authoritative even when there is no matching historical error row.
  const showRecovery = Boolean(connectionRecovery?.visible && !connectionRecovery.dismissed)
  // Absorb legacy/edge standalone connection status rows into the nearest
  // assistant card so the timeline never renders fragmented system lines.
  const absorbedByAssistantId = useMemo(() => {
    const map = new Map<number, Array<{ id: number; text: string; createdAt: string }>>()
    let currentAssistantId: number | undefined
    for (const entry of entries) {
      if (entry.kind === 'assistant') {
        currentAssistantId = entry.id
        continue
      }
      if (entry.kind === 'status' && isConnectionStatusText(entry.text, t)) {
        if (currentAssistantId !== undefined) {
          const bucket = map.get(currentAssistantId) ?? []
          bucket.push({ id: entry.id, text: entry.text, createdAt: entry.createdAt })
          map.set(currentAssistantId, bucket)
        }
      }
    }
    return map
  }, [entries, t])
  const absorbedIds = useMemo(() => {
    const ids = new Set<number>()
    for (const bucket of absorbedByAssistantId.values()) {
      for (const entry of bucket) ids.add(entry.id)
    }
    return ids
  }, [absorbedByAssistantId])
  const hiddenReadyIds = useMemo(
    () => new Set(hiddenCaptureReadyLogIds),
    [hiddenCaptureReadyLogIds]
  )
  const readyLogById = useMemo(
    () => new Map(captureReadyLogs.map((item) => [item.logId, item.kind])),
    [captureReadyLogs]
  )

  return (
    <div
      ref={logRef}
      className="app-agent-log-list relative z-0 min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain px-4 pb-4 text-sm select-text"
    >
      <div className="flow-root min-w-0" data-scroll-follow-content>
        {onLoadEarlier && hasEarlierLogs ? (
          <div className="mb-3 flex flex-col items-center gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-[11px]"
              disabled={loadingEarlier}
              onClick={() => void onLoadEarlier()}
            >
              {loadingEarlier ? t.input.loadingEarlierLogs : t.input.loadEarlierLogs}
            </Button>
            {earlierLogsError ? (
              <p className="text-center text-[11px] text-destructive" role="alert">
                {earlierLogsError}
              </p>
            ) : null}
          </div>
        ) : null}
        {entries
          .filter((entry) => entry.kind !== 'user-supplement')
          .filter((entry) => !(entry.kind === 'status' && absorbedIds.has(entry.id)))
          .filter((entry) => !hiddenReadyIds.has(entry.id))
          .map((entry, entryIndex, visibleEntries) => {
            const previousKind = entryIndex > 0 ? visibleEntries[entryIndex - 1]?.kind : undefined
            const spacing = logListItemSpacingClass(entry.kind, previousKind, entryIndex === 0)
            const readyKind = readyLogById.get(entry.id)

            return (
              <AgentLogMessage
                key={entry.id}
                spacing={spacing}
                readyKind={readyKind}
                onCopyEntry={onCopyEntry}
                onOpenCaptureDraft={onOpenCaptureDraft}
                entry={entry}
                liveRun={liveRunByLogId?.[entry.id]}
                tabId={tabId}
                t={t}
                copied={copiedLogId === entry.id}
                feedbackRating={feedbackByLogId?.[entry.id] ?? null}
                feedbackBusy={feedbackBusyLogId === entry.id}
                savingSop={savingSopLogId === entry.id}
                absorbedStatusEntries={
                  entry.kind === 'assistant' ? absorbedByAssistantId.get(entry.id) : undefined
                }
                thinkingCollapsedByDefault={thinkingCollapsedByDefault}
                onCopyResult={onCopyResult}
                onExportResult={onExportResult}
                onExportFull={onExportFull}
                onExportTrace={onExportTrace}
                onOpsFeedback={onOpsFeedback}
                onResolveApproval={onResolveApproval}
                onAddCommandToWhitelist={onAddCommandToWhitelist}
                onInjectSuggestions={onInjectSuggestions}
                onOpenModelSettings={onOpenModelSettings}
                onSaveAsSop={onSaveAsSop}
                onFocusTerminal={onFocusTerminal}
              />
            )
          })}

        {showRecovery ? (
          <div className="mt-4 rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              {connectionRecovery?.connecting ? (
                <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <TriangleAlertIcon className="size-3.5 text-amber-500" aria-hidden="true" />
              )}
              <span>{t.input.connectionRecoveryTitle}</span>
            </div>
            {connectionRecovery?.connecting ? (
              <p className="mt-1 text-xs text-muted-foreground">{t.input.retryConnecting}</p>
            ) : connectionRecovery?.pipeFallback ? (
              <>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {t.input.reinitTerminalHint}
                </p>
                {connectionRecovery.reason ? (
                  <p className="mt-1 break-words text-[11px] leading-relaxed text-muted-foreground/80">
                    {connectionRecovery.reason}
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {t.input.connectionRecoveryHint}
                </p>
                {connectionRecovery?.reason ? (
                  <p className="mt-1 break-words text-[11px] leading-relaxed text-muted-foreground/80">
                    {connectionRecovery.reason}
                  </p>
                ) : null}
              </>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {connectionRecovery?.connecting ? null : connectionRecovery?.pipeFallback ? (
                <Button type="button" size="sm" onClick={onReinitTerminal}>
                  <RefreshCwIcon data-icon="inline-start" />
                  {t.input.reinitTerminal}
                </Button>
              ) : connectionRecovery?.canRetry && onRetryConnection ? (
                <Button type="button" size="sm" onClick={onRetryConnection}>
                  <RefreshCwIcon data-icon="inline-start" />
                  {t.input.retryConnection}
                </Button>
              ) : null}
              {onOpenConnections ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onOpenConnections}
                  disabled={connectionRecovery?.connecting}
                >
                  <ServerIcon data-icon="inline-start" />
                  {t.input.openConnections}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {thinking ? (
          <div className="mt-3 flex items-start gap-2 px-0.5 text-xs text-muted-foreground">
            <span className="mt-1.5 inline-block size-1.5 animate-pulse rounded-full bg-primary" />
            <div className="min-w-0">
              <div className="font-medium text-foreground/80">{t.input.thinking}</div>
              <p className="mt-0.5 leading-relaxed">
                {thinkingMessage || t.input.thinkingAnalyzingRequest}
              </p>
            </div>
          </div>
        ) : null}
        {primaryContent}
      </div>
    </div>
  )
}
