import { memo, type ComponentProps } from 'react'
import { CheckIcon, CopyIcon } from 'lucide-react'
import { ActionLogRow, AgentLogContent } from './AgentLogContent'
import { CaptureDraftReadyRow } from './CaptureDraftPin'
import { Button } from './ui/button'
import {
  formatLogTime,
  isConversationLog,
  logClassName,
  logRoleLabel
} from '@renderer/lib/agent-log'
import type { AgentLogEntry } from '@renderer/lib/terminal-tabs'
import type { CaptureKind } from '../../../shared/agent-types'

/** A settled message keeps its Markdown, timeline and chrome across streaming updates. */
export const AgentLogMessage = memo(function AgentLogMessage({
  spacing,
  deferLayout,
  readyKind,
  onCopyEntry,
  onOpenCaptureDraft,
  ...content
}: ComponentProps<typeof AgentLogContent> & {
  spacing: string
  deferLayout?: boolean
  readyKind?: CaptureKind
  onCopyEntry: (entry: AgentLogEntry) => void
  onOpenCaptureDraft?: (kind: CaptureKind) => void
}): React.JSX.Element {
  const { entry, t, copied } = content
  const conversation = isConversationLog(entry.kind)
  return (
    <div
      data-agent-log-entry={entry.id}
      data-log-kind={entry.kind}
      className={
        conversation
          ? `app-agent-message app-agent-message-${entry.kind} ${logClassName(entry.kind)} min-w-0 ${spacing}`
          : `app-agent-activity-row min-w-0 ${spacing}`
      }
    >
      {conversation ? (
        <>
          <div className="app-agent-message-content" data-defer-layout={deferLayout || undefined}>
            <AgentLogContent {...content} />
          </div>
          <div className="app-agent-message-meta mt-1 flex items-center justify-start gap-3 text-[11px] text-muted-foreground">
            <div className="flex min-w-0 items-center gap-2">
              <span className="font-medium text-foreground/70">{logRoleLabel(entry.kind, t)}</span>
              <time className="tabular-nums text-muted-foreground/70" dateTime={entry.createdAt}>
                {formatLogTime(entry.createdAt)}
              </time>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="select-none"
                aria-label={t.common.copySelectionOrMessage}
                title={t.common.copySelectionOrMessage}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => onCopyEntry(entry)}
              >
                {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
              </Button>
            </div>
          </div>
        </>
      ) : readyKind && onOpenCaptureDraft ? (
        <CaptureDraftReadyRow
          text={entry.text}
          createdAt={entry.createdAt}
          t={t}
          onOpen={() => onOpenCaptureDraft(readyKind)}
        />
      ) : (
        <ActionLogRow entry={entry} t={t} />
      )}
    </div>
  )
})
