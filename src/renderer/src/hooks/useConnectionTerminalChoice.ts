import { useEffect, useRef, useState } from 'react'
import type { ConnectionConfig } from '../../../shared/agent-types'
import type { TerminalObservationMode } from '../../../shared/external-terminal'

export type ConnectionTerminalMode = 'iterm'

export function useConnectionTerminalChoice(
  onConnect: (
    connection: ConnectionConfig,
    mode: ConnectionTerminalMode,
    signal: AbortSignal,
    observationMode?: TerminalObservationMode
  ) => Promise<void>
) {
  const [connection, setConnection] = useState<ConnectionConfig | null>(null)
  const [connecting, setConnecting] = useState<ConnectionTerminalMode | null>(null)
  const [error, setError] = useState('')
  const [observationMode, setObservationMode] = useState<TerminalObservationMode>('off')
  const request = useRef<AbortController | null>(null)

  useEffect(() => () => request.current?.abort(), [])

  const cancel = (): void => {
    request.current?.abort()
    request.current = null
    setConnection(null)
    setConnecting(null)
    setError('')
  }

  const show = (selected: ConnectionConfig): void => {
    cancel()
    setObservationMode('off')
    setConnection(selected)
  }

  const connect = async (mode: ConnectionTerminalMode): Promise<void> => {
    if (!connection || request.current) return
    const current = new AbortController()
    request.current = current
    setConnecting(mode)
    setError('')
    try {
      await onConnect(connection, mode, current.signal, mode === 'iterm' ? observationMode : 'off')
      if (!current.signal.aborted) setConnection(null)
    } catch (error) {
      if (!current.signal.aborted) setError(error instanceof Error ? error.message : String(error))
    } finally {
      if (request.current === current) {
        request.current = null
        setConnecting(null)
      }
    }
  }

  return {
    connection,
    connecting,
    error,
    show,
    cancel,
    connect,
    observationMode,
    setObservationMode
  }
}
