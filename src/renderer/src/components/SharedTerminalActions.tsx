import { useRef, useState } from 'react'
import { terminalClient } from '../clients'
import { Button } from './ui/button'
import type { ExternalWindowState } from '../../../shared/external-terminal'
export function SharedTerminalActions({
  tabId,
  sessionId,
  state,
  zh
}: {
  tabId: string
  sessionId: number
  state?: ExternalWindowState
  zh: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  async function act(end = false): Promise<void> {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      if (end) await terminalClient.endShared(tabId, sessionId)
      else await terminalClient.reopenShared(tabId, sessionId)
    } catch (cause) {
      setError(String(cause))
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  if (state === 'ended') return <span>{zh ? '终端会话已结束' : 'Terminal session ended'}</span>
  return (
    <>
      <Button
        size="xs"
        variant="outline"
        disabled={busy || state === 'reopening'}
        onClick={() => void act()}
      >
        {state === 'window-closed'
          ? zh
            ? '重新打开终端'
            : 'Reopen terminal'
          : state === 'reopening'
            ? zh
              ? '正在重新打开…'
              : 'Reopening…'
            : state === 'status-unknown'
              ? zh
                ? '重试检查'
                : 'Retry check'
              : zh
                ? '显示终端'
                : 'Show terminal'}
      </Button>
      <Button
        size="xs"
        variant="ghost"
        disabled={busy || state === 'reopening'}
        onClick={() => void act(true)}
      >
        {zh ? '结束终端会话…' : 'End terminal session…'}
      </Button>
      {error && (
        <p role="alert" className="break-words text-destructive">
          {error}
        </p>
      )}
    </>
  )
}
