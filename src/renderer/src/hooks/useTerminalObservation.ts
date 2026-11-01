import { useEffect, useRef, useState } from 'react'
import { terminalClient } from '@renderer/clients'
import type { AgentTerminalTab } from '@renderer/lib/terminal-tabs'
import type { TerminalObservationGrant } from '../../../shared/external-terminal'

export function useTerminalObservation(tab: AgentTerminalTab) {
  const binding = `${tab.id}:${tab.sessionId ?? ''}:${tab.external?.sessionId ?? ''}`
  const [state, setState] = useState<{
    binding: string
    grant?: TerminalObservationGrant
    loading: boolean
    busy: boolean
    error: string
  }>({ binding: '', loading: true, busy: false, error: '' })
  const requests = useRef({ binding: '', revision: 0, mutating: false, stopped: true })

  useEffect(() => {
    const context = { binding, revision: 0, mutating: false, stopped: false }
    requests.current = context
    let refreshing = false
    const refresh = async (): Promise<void> => {
      if (!tab.sessionId || refreshing || context.mutating) return
      refreshing = true
      const request = ++context.revision
      try {
        const value = await terminalClient.observation({ tabId: tab.id, action: 'status' })
        if (!context.stopped && request === context.revision)
          setState({ binding, grant: value, loading: false, busy: false, error: '' })
      } catch (cause) {
        if (!context.stopped && request === context.revision)
          setState({
            binding,
            loading: false,
            busy: false,
            error: cause instanceof Error ? cause.message : String(cause)
          })
      } finally {
        refreshing = false
      }
    }
    void refresh()
    const timer = setInterval(() => void refresh(), 3000)
    return () => {
      context.stopped = true
      clearInterval(timer)
    }
  }, [binding, tab.id, tab.sessionId])

  const action = async (selected: 'pause' | 'revoke' | 'authorize'): Promise<void> => {
    const context = requests.current
    if (context.stopped || context.binding !== binding || context.mutating || !tab.sessionId) return
    context.mutating = true
    const request = ++context.revision
    setState((previous) => ({ ...previous, busy: true, error: '' }))
    try {
      const value = await terminalClient.observation({
        tabId: tab.id,
        action: selected,
        mode: 'live'
      })
      if (!context.stopped && request === context.revision)
        setState({ binding, grant: value, loading: false, busy: false, error: '' })
    } catch (cause) {
      if (!context.stopped && request === context.revision)
        setState((previous) => ({
          ...previous,
          loading: false,
          busy: false,
          error: cause instanceof Error ? cause.message : String(cause)
        }))
    } finally {
      context.mutating = false
    }
  }

  const open = async (): Promise<void> => {
    const context = requests.current
    if (context.stopped || context.binding !== binding) return
    try {
      const result = await terminalClient.focusITerm(tab.id)
      if (!context.stopped) setState((previous) => ({ ...previous, error: result.error ?? '' }))
    } catch (cause) {
      if (!context.stopped)
        setState((previous) => ({
          ...previous,
          error: cause instanceof Error ? cause.message : String(cause)
        }))
    }
  }

  const current = state.binding === binding
  return {
    grant: current ? state.grant : undefined,
    loading: current ? state.loading : Boolean(tab.sessionId),
    busy: current && state.busy,
    error: current ? state.error : '',
    action,
    open
  }
}
