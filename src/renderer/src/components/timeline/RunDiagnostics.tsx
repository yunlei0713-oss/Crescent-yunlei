import type { Dictionary } from '@renderer/i18n'
import type { ParsedAgentRunDocument } from '@renderer/lib/agent-run-document'
import { localizeAgentEventMessage } from '@renderer/lib/agent-event-formatters'
import type { AgentRunStep } from '@renderer/lib/terminal-tabs'
import { Button } from '../ui/button'
import { formatDuration } from './helpers'
import { ChevronRightIcon } from 'lucide-react'

/** Unknown/internal statuses stay inspectable, but never become conversation prose. */
export function visibleStatus(
  step: AgentRunStep,
  t: Dictionary,
  runFinished = false
): string | undefined {
  if (step.kind !== 'status') return undefined
  const raw = step.detail || step.title
  if (
    /^(?:正在压缩上下文（(?:手动|阈值|溢出)）|Compacting context \((?:manual|threshold|overflow)\))/.test(
      raw
    )
  )
    return runFinished ? undefined : raw
  if (
    /^(?:上下文已压缩（(?:手动|阈值|溢出)）|Context compacted \((?:manual|threshold|overflow)\))/.test(
      raw
    )
  )
    return raw
  // Keep provider error details in the diagnostics drawer.
  const compactionOutcome =
    /^(?:上下文压缩(?:失败|已中止)（(?:手动|阈值|溢出)）|Context compaction (?:failed|aborted) \((?:manual|threshold|overflow)\))/.exec(
      raw
    )
  if (compactionOutcome) return compactionOutcome[0]
  if (/^Using |^Loaded \d+ MCP|^Selected \d+ active tools:|Guided Ops/i.test(raw)) return undefined
  const localized = localizeAgentEventMessage(raw, t)
  if (localized !== raw) return localized
  if (
    Object.values(t.input).some((value) => value === step.title) ||
    Object.values(t.commandReview).some((value) => value === step.title)
  )
    return step.title
  return undefined
}

export function RunError({
  document,
  t,
  onOpenModelSettings
}: {
  document: ParsedAgentRunDocument
  t: Dictionary
  onOpenModelSettings?: () => void
}): React.JSX.Element {
  const zh = t.locale === 'zh-CN'
  const descriptions = {
    quota: zh
      ? '模型额度已用尽，请检查供应商额度或切换模型。'
      : 'Model quota exhausted. Check provider credits or switch models.',
    transient: zh
      ? '模型服务暂时不可用。请稍后重新发送；已有操作不会自动重试。'
      : 'The model service is temporarily unavailable. Send again later; previous actions are not retried automatically.',
    vision: zh
      ? '此供应商与模型尚未声明图片输入能力。请启用已确认的视觉能力、切换模型或移除图片。'
      : 'Image input is not declared for this provider and model. Enable confirmed vision support, switch models or remove the images.',
    attachment: zh
      ? '附件校验失败。请查看技术详情中的文件与原因，移除或替换附件后重发。'
      : 'Attachment validation failed. Check the file and reason in technical details, then remove or replace the attachment.',
    connection: zh
      ? '连接失败，请检查网络、供应商地址和连接设置。'
      : 'Connection failed. Check your network, provider URL and connection settings.',
    other: zh
      ? '本次请求未完成。原始错误保留在技术详情中。'
      : 'This request could not be completed. The original error is available in technical details.'
  }
  return (
    <div className="space-y-2 px-3 py-2.5 text-sm" role="alert">
      <p>{descriptions[document.errorKind ?? 'other']}</p>
      {onOpenModelSettings &&
        ['quota', 'vision', 'connection'].includes(document.errorKind ?? '') && (
          <Button size="sm" variant="outline" onClick={onOpenModelSettings}>
            {t.input.switchModel}
          </Button>
        )}
    </div>
  )
}

export function RunDiagnostics({
  document,
  t,
  onView,
  onExportFull,
  onExportTrace
}: {
  document: ParsedAgentRunDocument
  t: Dictionary
  onView?: () => void
  onExportFull?: () => void
  onExportTrace?: () => void
}): React.JSX.Element {
  const zh = t.locale === 'zh-CN'
  const statuses = document.steps.filter((step) => step.kind === 'status')
  return (
    <details className="app-agent-run-diagnostics group/diagnostics min-w-0 text-xs text-muted-foreground">
      <summary
        className="flex cursor-pointer items-center gap-1.5 marker:content-none focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
        aria-label={zh ? '运行详情' : 'Run details'}
      >
        {typeof document.elapsedMs === 'number' && !document.errorMarkdown
          ? `${zh ? '用时' : 'Worked for'} ${formatDuration(document.elapsedMs)}`
          : zh
            ? '运行详情'
            : 'Run details'}
        <ChevronRightIcon
          className="size-3 transition-transform group-open/diagnostics:rotate-90"
          aria-hidden="true"
        />
      </summary>
      <div className="mt-2 min-w-0 space-y-2">
        {typeof document.elapsedMs === 'number' && (
          <p>
            {t.input.elapsed}: {formatDuration(document.elapsedMs)}
          </p>
        )}
        {document.errorProvider && <p>Provider: {document.errorProvider}</p>}
        {document.errorResetHint && <p>{document.errorResetHint}</p>}
        {statuses.map((step) => (
          <pre key={step.id} className="whitespace-pre-wrap break-words">
            {step.detail || step.title}
          </pre>
        ))}
        {document.errorMarkdown && (
          <details open>
            <summary>{zh ? '技术详情' : 'Technical details'}</summary>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all py-2">
              {document.errorMarkdown}
            </pre>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => void navigator.clipboard.writeText(document.errorMarkdown)}
            >
              {zh ? '复制错误详情' : 'Copy error details'}
            </Button>
          </details>
        )}
        <div className="flex flex-wrap gap-1">
          {onView && (
            <Button
              size="xs"
              variant="ghost"
              className="h-auto min-h-6 max-w-full justify-start whitespace-normal text-left"
              onClick={onView}
            >
              {t.input.fullRunViewSteps}
            </Button>
          )}
          {onExportFull && (
            <Button
              size="xs"
              variant="ghost"
              className="h-auto min-h-6 max-w-full justify-start whitespace-normal text-left"
              onClick={onExportFull}
            >
              {t.common.exportFullMarkdownTooltip}
            </Button>
          )}
          {onExportTrace && (
            <Button
              size="xs"
              variant="ghost"
              className="h-auto min-h-6 max-w-full justify-start whitespace-normal text-left"
              onClick={onExportTrace}
            >
              {t.common.exportTraceJsonTooltip}
            </Button>
          )}
        </div>
      </div>
    </details>
  )
}
