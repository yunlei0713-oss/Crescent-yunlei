import { useEffect, useState } from 'react'
import { terminalClient } from '../clients'
import type { ManagedSharedTerminal } from '../../../shared/external-terminal'
import { SharedTerminalActions } from './SharedTerminalActions'
/** Main remains owner when a conversation is archived or a terminal is detached. */
export function ManagedSharedTerminals({ zh }: { zh: boolean }) {
  const [items, setItems] = useState<ManagedSharedTerminal[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    let stopped = false,
      revision = 0
    const refresh = (): void => {
      const token = ++revision
      void terminalClient
        .listShared()
        .then((next) => {
          if (!stopped && token === revision) {
            setItems(next)
            setError('')
          }
        })
        .catch((cause) => {
          if (!stopped) setError(String(cause))
        })
    }
    refresh()
    const stops = [
      terminalClient.onExternalWindow(refresh),
      terminalClient.onExternalBinding(refresh),
      terminalClient.onExit(refresh)
    ]
    return () => {
      stopped = true
      stops.forEach((stop) => stop())
    }
  }, [])
  const detached = items.filter((item) => item.detached)
  if (!detached.length && !error) return null
  return (
    <details className="shrink-0 border-b px-3 py-1 text-xs" data-managed-terminals>
      <summary className="cursor-pointer">
        {zh ? '独立运行的终端会话' : 'Independently running terminals'} · {detached.length}
      </summary>
      {detached.map((item) => (
        <div key={item.sessionId} className="flex flex-wrap items-center gap-2 py-1">
          <span>
            #{item.sessionId} · {item.cwd} ·{' '}
            {item.external.windowState === 'window-closed'
              ? zh
                ? '窗口已关闭 · 会话仍在运行'
                : 'Window closed · session running'
              : zh
                ? '会话仍在运行'
                : 'Session running'}
          </span>
          <SharedTerminalActions
            tabId={item.tabId}
            sessionId={item.sessionId}
            state={item.external.windowState}
            zh={zh}
          />
        </div>
      ))}
      {error && <p role="alert">{error}</p>}
    </details>
  )
}
