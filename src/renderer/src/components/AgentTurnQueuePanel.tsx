import { Button } from './ui/button'
import type { AgentTurnSummary } from '../../../shared/agent-turn-queue'

export function AgentTurnQueuePanel({
  turns,
  zh,
  onContinue,
  onRemove
}: {
  turns: AgentTurnSummary[]
  zh: boolean
  onContinue: () => void
  onRemove: (id: string) => void
}): React.JSX.Element | null {
  const queued = turns.filter(({ status }) => status === 'queued' || status === 'waiting')
  const failed = turns.filter(({ status }) => status === 'failed')
  if (!queued.length && !failed.length) return null
  const waiting = queued.filter(({ status }) => status === 'waiting').length
  return (
    <section
      aria-label={zh ? '消息队列' : 'Message queue'}
      className="max-h-32 space-y-1 overflow-auto px-3 py-1 text-xs"
    >
      {queued.length > 0 && (
        <p role="status" className="font-medium text-muted-foreground">
          {zh
            ? `待处理消息 · ${queued.length}${waiting ? `（${waiting} 条待继续）` : ''}`
            : `Pending messages · ${queued.length}${waiting ? ` (${waiting} to resume)` : ''}`}
        </p>
      )}
      {queued.length > 0 && !turns.some((item) => item.status === 'running') && (
        <Button type="button" variant="outline" size="xs" onClick={onContinue}>
          {zh ? '继续待处理回合' : 'Continue pending turns'}
        </Button>
      )}
      {queued.length > 0 && (
        <ol>
          {queued.map((item, index) => (
            <li key={item.id} className="flex items-baseline gap-2 py-0.5">
              <span className="shrink-0">
                {index + 1} ·{' '}
                {item.status === 'waiting' ? (zh ? '待继续' : 'Waiting') : zh ? '排队中' : 'Queued'}
              </span>
              <time className="shrink-0" dateTime={new Date(item.createdAt).toISOString()}>
                {new Date(item.createdAt).toLocaleTimeString()}
              </time>
              <span className="min-w-0 flex-1 truncate" title={item.text}>
                {item.text}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                aria-label={
                  zh ? `删除第 ${index + 1} 条待处理消息` : `Remove pending message ${index + 1}`
                }
                onClick={() => onRemove(item.id)}
              >
                {zh ? '删除' : 'Remove'}
              </Button>
            </li>
          ))}
        </ol>
      )}
      {failed.length > 0 && (
        <details>
          <summary className="cursor-pointer text-muted-foreground">
            {zh ? `发送失败 · ${failed.length}` : `Failed messages · ${failed.length}`}
          </summary>
          <ul className="mt-1 space-y-1">
            {failed.map((item) => (
              <li key={item.id} className="break-words">
                <p>{item.text}</p>
                {item.error && <p className="text-muted-foreground">{item.error}</p>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
