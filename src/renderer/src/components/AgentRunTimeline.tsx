import { FullAgentRunOverlay, type FullAgentRunOverlayTab } from './FullAgentRunOverlay'
import { MarkdownContent } from './MarkdownContent'
import { Button } from './ui/button'
import type { Dictionary } from '@renderer/i18n'
import type { ParsedAgentRunDocument } from '@renderer/lib/agent-run-document'
import {
  omitDuplicateTrailingMessage,
  shouldShowAgentRunResult
} from '@renderer/lib/agent-run-document'
import { hasAgentTextTruncationMarker } from '@renderer/lib/agent-text-limits'
import { CheckIcon, Loader2Icon, TriangleAlertIcon } from 'lucide-react'
import { useState } from 'react'
import type { OpsHistoryRating } from '../../../shared/agent-types'
import { sortTimelineBySeq } from '../../../shared/connection-state'
import { ApprovalStepCard } from './timeline/ApprovalStepCard'
import { ConnectionFlowGroup, LoginResultCard } from './timeline/ConnectionRows'
import {
  coalesceVisiblePtyToolSteps,
  groupTimelineSteps,
  hasConnectionFlowFinished,
  isNoiseStatusStep,
  resolveActivity
} from './timeline/helpers'
import { MessageStepRow, ThoughtStepRow, UserSupplementStepRow } from './timeline/MessageRows'
import { ResultSuggestionsPicker } from './timeline/ResultActions'
import { CollapsedLowRiskGroup, ToolCallRow } from './timeline/ToolRows'
import { RunDiagnostics, RunError, visibleStatus } from './timeline/RunDiagnostics'
export { groupTimelineSteps } from './timeline/helpers'
export type { TimelineItem } from './timeline/helpers'

export function AgentRunTimeline({
  document,
  t,
  storageRef,
  onExportFull,
  onExportTrace,
  onResolveApproval,
  onAddCommandToWhitelist,
  onInjectSuggestions,
  onOpenModelSettings,
  onFocusTerminal,
  thinkingCollapsedByDefault = true
}: {
  document: ParsedAgentRunDocument
  t: Dictionary
  copied: boolean
  feedbackRating?: OpsHistoryRating | null
  feedbackBusy?: boolean
  savingSop?: boolean
  storageRef?: { tabId: string; logId: number; runId?: string }
  onCopyResult?: () => void
  onExportResult?: () => void
  onExportFull?: () => void
  onExportTrace?: () => void
  onOpsFeedback?: (rating: OpsHistoryRating) => void
  onResolveApproval?: (requestId: string, approved: boolean, note?: string) => void
  onAddCommandToWhitelist?: (command: string) => void
  onInjectSuggestions?: (texts: string[]) => void
  onOpenModelSettings?: () => void
  onSaveAsSop?: () => void
  onFocusTerminal?: (tabId: string) => void
  thinkingCollapsedByDefault?: boolean
}): React.JSX.Element {
  const [fullOverlayTab, setFullOverlayTab] = useState<FullAgentRunOverlayTab | null>(null)
  const runFinished =
    typeof document.elapsedMs === 'number' || Boolean(document.errorMarkdown?.trim())
  const hasApprovalStep = document.steps.some((step) => step.kind === 'approval')
  const visibleSteps = omitDuplicateTrailingMessage(
    sortTimelineBySeq(
      coalesceVisiblePtyToolSteps(
        document.steps.filter(
          (step) =>
            !isNoiseStatusStep(step, t, hasApprovalStep) &&
            (step.kind !== 'status' ||
              (Boolean(visibleStatus(step, t)) &&
                (!document.errorMarkdown ||
                  ![step.title, step.detail].some((text) =>
                    text?.includes(document.errorMarkdown)
                  ))))
        )
      )
    ),
    document.resultMarkdown
  )
  const timelineItems = groupTimelineSteps(visibleSteps, t)
  const loginFinished = Boolean(document.loginMeta && typeof document.elapsedMs === 'number')
  const resultBodyMarkdown = document.resultMarkdown?.trim() ?? ''
  const errorBodyMarkdown = document.errorMarkdown?.trim() ?? ''
  const showResult =
    shouldShowAgentRunResult({
      hasResultContent: Boolean(resultBodyMarkdown || errorBodyMarkdown),
      elapsedMs: document.elapsedMs
    }) || Boolean(errorBodyMarkdown)
  const resultTruncated = hasAgentTextTruncationMarker(resultBodyMarkdown)
  const canOpenFullRun = Boolean(storageRef && runFinished)
  const activity = resolveActivity(document, visibleSteps, t)
  return (
    <div className="app-agent-run min-w-0 space-y-2.5">
      {timelineItems.length > 0 && (
        <div className="app-agent-timeline min-w-0 space-y-2">
          {timelineItems.map((item) => {
            if (item.kind === 'low-risk-group')
              return <CollapsedLowRiskGroup key={item.id} steps={item.steps} t={t} />
            if (item.kind === 'connection-flow')
              return (
                <ConnectionFlowGroup
                  key={item.id}
                  steps={item.steps}
                  t={t}
                  connectionName={document.loginMeta?.connectionName || item.connectionName}
                  finished={
                    Boolean(errorBodyMarkdown) ||
                    loginFinished ||
                    hasConnectionFlowFinished(item.steps, t)
                  }
                  failed={Boolean(errorBodyMarkdown)}
                />
              )
            const step = item.step
            if (step.kind === 'thought')
              return (
                <ThoughtStepRow
                  key={step.id}
                  step={runFinished ? { ...step, phase: 'done' } : step}
                  t={t}
                  collapsedByDefault={thinkingCollapsedByDefault}
                />
              )
            if (step.kind === 'message') return <MessageStepRow key={step.id} step={step} t={t} />
            if (step.kind === 'status')
              return (
                <div key={step.id} className="text-[11px] leading-relaxed text-muted-foreground/80">
                  {visibleStatus(step, t)}
                </div>
              )
            if (step.kind === 'user-supplement')
              return <UserSupplementStepRow key={step.id} step={step} t={t} />
            if (step.kind === 'tool') {
              const previous = visibleSteps[item.index - 1]
              const hideCommand =
                previous?.kind === 'approval' &&
                Boolean(step.command?.trim()) &&
                previous.command.trim() === step.command?.trim()
              return (
                <ToolCallRow
                  key={step.id}
                  step={step}
                  t={t}
                  hideCommand={hideCommand}
                  onFocusTerminal={onFocusTerminal}
                />
              )
            }
            if (step.kind === 'approval')
              return (
                <ApprovalStepCard
                  key={step.id}
                  step={step}
                  t={t}
                  onResolve={onResolveApproval}
                  onAddToWhitelist={onAddCommandToWhitelist}
                />
              )
            return null
          })}
        </div>
      )}
      {activity && !runFinished && !document.loginMeta && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" />
          <span>{activity}</span>
        </div>
      )}
      {loginFinished && !errorBodyMarkdown ? (
        <LoginResultCard document={document} t={t} />
      ) : (
        showResult && (
          <div className="app-agent-result min-w-0 rounded-xl border border-border/70 bg-card/50">
            <div className="flex items-center gap-2 border-b border-border/60 bg-muted/20 px-3 py-2">
              {errorBodyMarkdown ? (
                <TriangleAlertIcon
                  className="size-3.5 shrink-0 text-destructive"
                  aria-hidden="true"
                />
              ) : (
                <CheckIcon className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
              )}
              <span className="text-xs font-semibold tracking-wide text-foreground/85">
                {errorBodyMarkdown ? t.input.error : t.input.result}
              </span>
            </div>
            {resultBodyMarkdown && (
              <div className="min-w-0 space-y-2 px-3 py-2.5">
                {resultTruncated && canOpenFullRun && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span>{t.input.resultTruncatedHint}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setFullOverlayTab('result')}
                    >
                      {t.input.fullRunViewResult}
                    </Button>
                  </div>
                )}
                <div className="min-w-0 text-[15px] leading-relaxed text-foreground">
                  <MarkdownContent value={resultBodyMarkdown} t={t} />
                </div>
                {!errorBodyMarkdown && onInjectSuggestions && (
                  <ResultSuggestionsPicker
                    resultMarkdown={resultBodyMarkdown}
                    t={t}
                    onInject={onInjectSuggestions}
                  />
                )}
              </div>
            )}
            {errorBodyMarkdown && (
              <RunError document={document} t={t} onOpenModelSettings={onOpenModelSettings} />
            )}
          </div>
        )
      )}
      <RunDiagnostics
        document={document}
        t={t}
        onView={canOpenFullRun ? () => setFullOverlayTab('steps') : undefined}
        onExportFull={onExportFull}
        onExportTrace={onExportTrace}
      />
      {fullOverlayTab && storageRef && (
        <FullAgentRunOverlay
          tabId={storageRef.tabId}
          logId={storageRef.logId}
          runId={storageRef.runId}
          initialTab={fullOverlayTab}
          t={t}
          onClose={() => setFullOverlayTab(null)}
        />
      )}
    </div>
  )
}
