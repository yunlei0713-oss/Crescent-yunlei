import { ATTACHMENT_LIMITS, hasImageAttachments } from '../../../shared/model-capabilities'
import type { AgentModelOption, AgentPathReference } from '../../../shared/agent-types'
import { Button } from './ui/button'

export function ComposerAttachments({
  model,
  references,
  zh,
  onRemove,
  onSettings,
  onDeclareVision
}: {
  model?: AgentModelOption
  references: AgentPathReference[]
  zh: boolean
  onRemove: (id: string) => void
  onSettings?: () => void
  onDeclareVision?: () => void
}): React.JSX.Element {
  const mismatch = hasImageAttachments(references) && !model?.capabilities?.imageInput
  return (
    <>
      <details className="text-[10px] text-muted-foreground">
        <summary className="w-fit cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-ring">
          {zh ? '附件说明' : 'Attachment info'}
        </summary>
        <div className="py-1 leading-relaxed">
          {model?.capabilities?.imageInput
            ? zh
              ? '视觉 · PNG / JPEG / WebP'
              : 'Vision · PNG / JPEG / WebP'
            : zh
              ? '纯文本 · 未启用图片输入'
              : 'Text only · image input disabled'}
          {' · '}
          {zh ? '文本 / PDF 文本提取' : 'Text / PDF text extraction'}
          {' · '}
          {ATTACHMENT_LIMITS.fileBytes / 1024 / 1024} MiB/{zh ? '文件' : 'file'} ·{' '}
          {ATTACHMENT_LIMITS.files} {zh ? '个文件' : 'files'} · {zh ? '合计' : 'total'}{' '}
          {ATTACHMENT_LIMITS.totalBytes / 1024 / 1024} MiB
          {' · '}PDF ≤ {ATTACHMENT_LIMITS.pdfBytes / 1024 / 1024} MiB / {ATTACHMENT_LIMITS.pdfPages}{' '}
          {zh ? '页' : 'pages'}
        </div>
      </details>
      {mismatch && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded border border-destructive/40 px-2 py-1 text-xs"
        >
          <span>
            {zh
              ? '此供应商下的模型尚未启用图片输入。请选择视觉模型或移除图片；若已确认模型原生支持图片，可直接启用。'
              : 'Image input is not enabled for this provider/model. Select a vision model or remove images. Enable it here if the provider supports images.'}
          </span>
          {onDeclareVision && (
            <Button type="button" size="xs" variant="outline" onClick={onDeclareVision}>
              {zh ? '此模型支持图片，启用' : 'Enable image input for this model'}
            </Button>
          )}
          {onSettings && (
            <Button type="button" size="xs" variant="ghost" onClick={onSettings}>
              {zh ? '模型设置' : 'Model settings'}
            </Button>
          )}
        </div>
      )}
      {references.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {references.map((reference) => (
            <div
              key={reference.id}
              className="flex max-w-52 items-center gap-1 border border-border p-1 text-[10px]"
            >
              {reference.previewDataUrl && (
                <img
                  src={reference.previewDataUrl}
                  alt={reference.name}
                  className="h-12 w-16 object-contain"
                />
              )}
              <span className="truncate" title={reference.path}>
                {reference.name}
                <br />
                {reference.mimeType}{' '}
                {reference.size ? `${Math.ceil(reference.size / 1024)} KiB` : ''}
              </span>
              <button
                type="button"
                className="p-1"
                aria-label={`${zh ? '移除' : 'Remove'} ${reference.name}`}
                onClick={() => onRemove(reference.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
