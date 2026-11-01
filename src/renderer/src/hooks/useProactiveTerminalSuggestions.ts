import { useEffect, useRef, type RefObject } from 'react'
import { agentClient, terminalClient } from '@renderer/clients'
import { resolveSessionChatTabId, type AgentTerminalTab } from '@renderer/lib/terminal-tabs'
import type { TerminalEvidenceNotice } from '../../../shared/terminal-observation-types'

/** Observe metadata, not raw terminal output. Explicit messages/drafts always win. */
export function useProactiveTerminalSuggestions({
  tabsRef,
  activeTabIdRef,
  activeRunIdRef,
  submissionsRef,
  ready,
  runRef
}: {
  tabsRef: RefObject<AgentTerminalTab[]>
  activeTabIdRef: RefObject<string>
  activeRunIdRef: RefObject<Map<string, string>>
  submissionsRef: RefObject<Map<string, symbol>>
  ready: boolean
  runRef: RefObject<(terminal: AgentTerminalTab, chatId: string, token: string) => Promise<void>>
}): (terminalId: string) => void {
  const pending = useRef(new Map<string, TerminalEvidenceNotice>())
  const running = useRef<{ terminalId: string; chatId: string; runId?: string } | undefined>(
    undefined
  )
  const mounted = useRef(false)
  const pump = useRef<() => void>(() => {})
  useEffect(() => {
    pump.current = () => {
      if (!mounted.current) return
      const active = running.current
      if (active) {
        const tab = tabsRef.current.find((tab) => tab.id === active.terminalId)
        if (
          !tab?.sessionId ||
          tab.proactiveSuggestionsPaused ||
          activeTabIdRef.current !== active.terminalId
        ) {
          pending.current.delete(active.terminalId)
          if (active.runId) void agentClient.cancel(active.runId)
        }
        return
      }
      const terminalId = activeTabIdRef.current
      const notice = pending.current.get(terminalId)
      const terminal = tabsRef.current.find((tab) => tab.id === terminalId)
      if (!notice?.token || !ready || !terminal?.external || !terminal.sessionId) return
      if (
        terminal.proactiveSuggestionsPaused ||
        terminal.terminalExited ||
        terminal.sessionId !== notice.identity.sessionGeneration ||
        terminal.external.sessionId !== notice.identity.itermSessionId
      ) {
        pending.current.delete(terminalId)
        return
      }
      const chatId = resolveSessionChatTabId(tabsRef.current, terminalId)
      const chat = tabsRef.current.find((tab) => tab.id === chatId)
      if (
        !chat ||
        chat.agentBusy ||
        activeRunIdRef.current.has(chatId) ||
        submissionsRef.current.has(chatId) ||
        chat.agentInput.trim() ||
        chat.pathRefs.length ||
        chat.skillRefs.length ||
        chat.toolRefs.length ||
        chat.wikiRefs.length ||
        (chat.pendingClarification && !chat.pendingClarification.settled)
      )
        return
      pending.current.delete(terminalId)
      const current = { terminalId, chatId, runId: undefined as string | undefined }
      running.current = current
      const started = runRef.current(terminal, chatId, notice.token)
      current.runId = activeRunIdRef.current.get(chatId)
      void started
        .finally(() => {
          if (running.current === current) running.current = undefined
          pump.current()
        })
        .catch((error) => console.warn('[moxun] proactive suggestion failed', error))
    }
    // React commits resume a coalesced notice after a manual turn/draft, not timers.
    pump.current()
  })
  useEffect(() => {
    mounted.current = true
    const queue = pending.current
    const unsubscribe = terminalClient.onEvidenceChanged((notice) => {
      const terminalId = notice.identity.tabId
      if (!notice.token) {
        pending.current.delete(terminalId)
        const active = running.current
        if (active?.terminalId === terminalId && active.runId) void agentClient.cancel(active.runId)
      } else {
        if (pending.current.size >= 100)
          pending.current.delete(pending.current.keys().next().value!)
        pending.current.set(terminalId, notice)
        pump.current()
      }
    })
    return () => {
      mounted.current = false
      unsubscribe()
      queue.clear()
      if (running.current?.runId) void agentClient.cancel(running.current.runId)
    }
  }, [])
  return (terminalId) => {
    pending.current.delete(terminalId)
  }
}
