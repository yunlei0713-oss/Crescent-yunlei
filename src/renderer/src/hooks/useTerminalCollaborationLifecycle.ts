import { useEffect, type MutableRefObject } from 'react'
import { terminalClient } from '@renderer/clients'
import type { AgentTerminalTab } from '@renderer/lib/terminal-tabs'

/** Connection state subscriptions do not depend on a visible terminal or active chat. */
export function useTerminalCollaborationLifecycle({
  tabsRef,
  updateTab,
  onExit
}: {
  tabsRef: MutableRefObject<AgentTerminalTab[]>
  updateTab: (id: string, update: (tab: AgentTerminalTab) => AgentTerminalTab) => void
  onExit: (id: string) => void
}): void {
  useEffect(() => {
    const stopBinding = terminalClient.onExternalBinding((event) => {
      updateTab(event.tabId, (tab) =>
        tab.sessionId === event.sessionId ? { ...tab, external: event.external } : tab
      )
    })
    const stopPrompt = terminalClient.onPrompt(({ tabId, cwd }) => {
      updateTab(tabId, (tab) => ({ ...tab, terminalCwd: cwd }))
    })
    const stopExit = terminalClient.onExit((event) => {
      const tab = tabsRef.current.find((candidate) => candidate.id === event.tabId)
      // Ignore late events from a previous transport generation.
      if (!tab || (event.sessionId && tab.sessionId && event.sessionId !== tab.sessionId)) return
      updateTab(event.tabId, (current) => ({
        ...current,
        sessionId: undefined,
        terminalReady: false,
        terminalExited: true
      }))
      onExit(event.tabId)
      // Never reconnect automatically or replace an SSH session with a local shell.
    })
    return () => {
      stopBinding()
      stopPrompt()
      stopExit()
    }
  }, [tabsRef, updateTab, onExit])
}
