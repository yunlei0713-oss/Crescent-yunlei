import { useEffect, useState } from 'react'
import type { MemoryEvidence } from '../../../shared/knowledge'
import { memoryError } from '../hooks/useMemoryCenter'
import { Button } from './ui/button'

export function MemoryEvidenceList({
  id,
  count,
  updatedAt,
  onOpenHistory
}: {
  id: string
  count: number
  updatedAt: string
  onOpenHistory: (id: string) => Promise<void>
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [evidence, setEvidence] = useState<MemoryEvidence[]>()
  const [error, setError] = useState('')
  useEffect(() => {
    if (!open) return
    let current = true
    void window.api.knowledge
      .memoryEvidence(id)
      .then((value) => {
        if (current) setEvidence(value)
      })
      .catch((reason) => {
        if (current) setError(memoryError(reason))
      })
    return () => {
      current = false
    }
  }, [id, count, updatedAt, open])
  return (
    <details
      onToggle={(event) => {
        setOpen(event.currentTarget.open)
        setEvidence(undefined)
        setError('')
      }}
    >
      <summary className="cursor-pointer py-1 focus-visible:ring-2 focus-visible:ring-ring">
        历史来源 · {count} 条可核对证据
      </summary>
      {open && (
        <div className="space-y-2 border-l pl-2">
          {error ? (
            <p role="alert">{error}</p>
          ) : evidence === undefined ? (
            <p role="status">正在核对来源…</p>
          ) : !evidence.length ? (
            <p role="status">来源已删除或发生变化。</p>
          ) : (
            evidence.map((source, index) => (
              <div
                key={`${source.conversationId}:${source.sourceTabId}:${source.logId}:${index}`}
                className="border-b pb-2"
              >
                <div className="break-all text-muted-foreground">
                  {source.role} · {new Date(source.observedAt).toLocaleString()} · 消息 #
                  {source.logId}
                </div>
                <div className="break-all font-mono text-muted-foreground">
                  {source.conversationId}
                  {source.sourceTabId !== source.conversationId && ` / ${source.sourceTabId}`}
                </div>
                <p className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">
                  {source.excerpt}
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void onOpenHistory(source.conversationId).catch((reason) =>
                      setError(memoryError(reason))
                    )
                  }
                >
                  打开来源会话
                </Button>
              </div>
            ))
          )}
        </div>
      )}
    </details>
  )
}
