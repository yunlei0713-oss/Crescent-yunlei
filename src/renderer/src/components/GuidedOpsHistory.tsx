import { useEffect, useRef, useState } from 'react'
import { agentClient } from '../clients'
import type { GuidedOpsHistoryItem, GuidedOpsHistoryPage } from '../../../shared/guided-ops-types'
import { Button } from './ui/button'
import { toast } from 'sonner'
import { guidedOpsStateLabel } from '../lib/guided-ops-labels'
export function GuidedOpsHistory({
  conversationId,
  revision,
  zh
}: {
  conversationId: string
  revision?: string
  zh: boolean
}) {
  const [history, setHistory] = useState<{
    page?: GuidedOpsHistoryPage
    items: GuidedOpsHistoryItem[]
  }>({ items: [] })
  const { page, items } = history
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const request = useRef({ revision: 0, disposed: true })
  useEffect(() => {
    const context = { revision: request.current.revision + 1, disposed: false }
    request.current = context
    const token = context.revision
    void agentClient
      .listGuidedOpsHistory({ conversationId })
      .then((next) => {
        if (context.disposed || token !== request.current.revision) return
        setHistory((current) => {
          const byId = new Map(current.items.map((item) => [item.proposal.id, item]))
          const overlaps = next.items.some((item) => byId.has(item.proposal.id))
          next.items.forEach((item) => byId.set(item.proposal.id, item))
          const items = [...byId.values()].sort(
            (a, b) =>
              b.proposal.createdAt - a.proposal.createdAt ||
              b.proposal.id.localeCompare(a.proposal.id)
          )
          const hasMore = items.length < next.totalCount
          return {
            items,
            page: {
              ...next,
              hasMore,
              nextCursor: hasMore
                ? overlaps && current.page?.hasMore
                  ? current.page.nextCursor
                  : next.nextCursor
                : undefined
            }
          }
        })
        setBusy(false)
        setError('')
      })
      .catch((cause) => {
        if (!context.disposed && token === request.current.revision) {
          setBusy(false)
          setError(String(cause))
        }
      })
    return () => {
      context.disposed = true
    }
  }, [conversationId, revision])
  async function earlier(): Promise<void> {
    if (busy || !page?.nextCursor) return
    const context = request.current
    const token = context.revision
    setBusy(true)
    try {
      const next = await agentClient.listGuidedOpsHistory({
        conversationId,
        beforeCursor: page.nextCursor
      })
      if (context.disposed || token !== request.current.revision) return
      setHistory((current) => {
        const byId = new Map(current.items.map((item) => [item.proposal.id, item]))
        next.items.forEach((item) => byId.set(item.proposal.id, item))
        const items = [...byId.values()].sort(
          (a, b) =>
            b.proposal.createdAt - a.proposal.createdAt ||
            b.proposal.id.localeCompare(a.proposal.id)
        )
        return { items, page: { ...next, hasMore: items.length < next.totalCount && next.hasMore } }
      })
      setError('')
    } catch (cause) {
      if (!context.disposed) setError(String(cause))
    } finally {
      if (!context.disposed) setBusy(false)
    }
  }
  return (
    <details className="mt-2 text-xs" data-guided-history>
      <summary className="cursor-pointer">
        {zh ? '历史步骤（共' : 'Previous steps ('} {page?.totalCount ?? 0} {zh ? '条）' : 'total)'}
      </summary>
      {items.map(({ proposal: item, state }) => (
        <div key={item.id} className="space-y-1 border-t py-2">
          <p>
            {item.step} · {item.target.host ?? '?'} · {new Date(item.createdAt).toLocaleString()} ·{' '}
            {guidedOpsStateLabel(state, zh)}
          </p>
          {[item, ...(item.alternatives ?? [])].map((choice, i) => (
            <div key={i}>
              <p>
                {choice.purpose} · {choice.risk}
              </p>
              <details>
                <summary className="cursor-pointer break-words font-mono">
                  {choice.command.split('\n')[0].slice(0, 140)}
                </summary>
                <pre className="overflow-x-auto whitespace-pre-wrap break-words">
                  {choice.command}
                </pre>
              </details>
              <Button
                size="xs"
                variant="ghost"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(choice.command)
                    .then(() =>
                      toast.message(
                        zh
                          ? '已复制历史文本，请重新核对目标与风险；不会执行。'
                          : 'Historical text copied; recheck target and risks. Nothing executed.'
                      )
                    )
                    .catch((error) => toast.error(String(error)))
                }
              >
                {zh ? '复制历史文本' : 'Copy historical text'}
              </Button>
            </div>
          ))}
        </div>
      ))}
      {page?.hasMore && (
        <Button size="xs" variant="outline" disabled={busy} onClick={() => void earlier()}>
          {zh ? '加载更早步骤' : 'Load earlier steps'}
        </Button>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  )
}
