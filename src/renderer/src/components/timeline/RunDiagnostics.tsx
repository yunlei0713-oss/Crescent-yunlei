import type { Dictionary } from '@renderer/i18n'
import type { ParsedAgentRunDocument } from '@renderer/lib/agent-run-document'
import { localizeAgentEventMessage } from '@renderer/lib/agent-event-formatters'
import type { AgentRunStep } from '@renderer/lib/terminal-tabs'
import { Button } from '../ui/button'
import { formatDuration } from './helpers'

/** Unknown/internal statuses stay inspectable, but never become conversation prose. */
export function visibleStatus(step: AgentRunStep, t: Dictionary): string | undefined {
  if (step.kind !== 'status') return undefined
  const raw = step.detail || step.title
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
    <details className="min-w-0 px-3 py-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer focus-visible:outline-ring">
        {zh ? '运行详情' : 'Run details'}
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
            <Button size="xs" variant="ghost" onClick={onView}>
              {t.input.fullRunViewSteps}
            </Button>
          )}
          {onExportFull && (
            <Button size="xs" variant="ghost" onClick={onExportFull}>
              {t.common.exportFullMarkdownTooltip}
            </Button>
          )}
          {onExportTrace && (
            <Button size="xs" variant="ghost" onClick={onExportTrace}>
              {t.common.exportTraceJsonTooltip}
            </Button>
          )}
        </div>
      </div>
    </details>
  )
}
