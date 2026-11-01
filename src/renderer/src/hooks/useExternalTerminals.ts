import { useRef, useState } from 'react'
import { terminalClient } from '@renderer/clients'
import { createTerminalTab, type AgentTerminalTab } from '@renderer/lib/terminal-tabs'
import type {
  ITermSessionSummary,
  TerminalObservationMode
} from '../../../shared/external-terminal'

export function useExternalTerminals(
  onConnected: (tab: AgentTerminalTab) => void,
  currentConversation: () => Partial<AgentTerminalTab> = () => ({})
) {
  const [open, setOpen] = useState(false)
  const [sessions, setSessions] = useState<ITermSessionSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')
  const [observationMode, setObservationMode] = useState<TerminalObservationMode>('off')
  const [conversationScope, setConversationScope] = useState<'current' | 'new'>('current')
  const target = useRef<Partial<AgentTerminalTab>>({})
  const busy = useRef(false)
  const refreshId = useRef(0)
  const refresh = async (): Promise<void> => {
    const id = ++refreshId.current
    setLoading(true)
    setError('')
    try {
      const result = await terminalClient.listITerm()
      if (id !== refreshId.current) return
      setSessions(result.sessions)
      setError(result.error ?? '')
    } catch (error) {
      if (id === refreshId.current) setError(String(error))
    } finally {
      if (id === refreshId.current) setLoading(false)
    }
  }
  const show = (): void => {
    if (busy.current) return
    target.current = currentConversation()
    setConversationScope('current')
    setObservationMode('off')
    setOpen(true)
    void refresh()
  }
  const connect = async (
    kind: 'shared' | 'existing',
    selected?: ITermSessionSummary
  ): Promise<void> => {
    if (busy.current) return
    busy.current = true
    setConnecting(true)
    setError('')
    const tab = createTerminalTab({
      ...(conversationScope === 'current' ? target.current : {}),
      title: selected ? `iTerm · ${selected.name}` : 'iTerm'
    })
    let connected = false
    try {
      const result = await terminalClient.connectITerm({
        tabId: tab.id,
        kind,
        sessionId: selected?.id,
        observationMode
      })
      connected = true
      onConnected({
        ...tab,
        external: result.external,
        sessionId: result.sessionId,
        terminalMode: result.mode,
        terminalCwd: result.cwd,
        terminalReady: true
      })
      setOpen(false)
    } catch (error) {
      if (connected) terminalClient.stop(tab.id)
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      busy.current = false
      setConnecting(false)
    }
  }
  return {
    open,
    setOpen,
    sessions,
    loading,
    connecting,
    error,
    refresh,
    show,
    connect,
    observationMode,
    setObservationMode,
    conversationScope,
    setConversationScope
  }
}
