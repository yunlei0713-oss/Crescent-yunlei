import { storageClient } from '@renderer/clients'
import { toStoredSessionTabs } from '@renderer/lib/terminal-tabs'
import { agentClient } from '@renderer/clients'
import { hasImageAttachments } from '../../../shared/model-capabilities'
import type { AgentLogEntryInput } from '@renderer/lib/terminal-tabs'
import type { AttentionNotifyOptions } from '@renderer/lib/pending-attention-notify'
import type { Dictionary } from '@renderer/i18n'
import { localizeAgentEventMessage } from '@renderer/lib/agent-event-formatters'
import {
  buildAgentInputWithReferences,
  buildRecentConversationContext,
  buildResumeAgentInput,
  isContinueIntent
} from '@renderer/lib/agent-input'
import { formatAgentRunMarkdown } from '@renderer/lib/agent-log'
import { snapshotMessageReferences } from '@renderer/lib/agent-message-refs'
import { buildFinishPersistText, closeStreamingOpenSteps } from '@renderer/lib/agent-run-document'
import { resolveSuccessfulAgentResult } from '@renderer/lib/agent-run-finalize'
import { buildTraceFromAgentRunView } from '@renderer/lib/agent-run-trace-export'
import type { ReuseAgentRun } from '@renderer/lib/app-controller-support'
import { mergePostLoginSupplements } from '@renderer/lib/busy-supplement'
import { hasComposerRefTokens, stripComposerRefTokens } from '@renderer/lib/composer-ref-tokens'
import { summarizeNotificationBody } from '@renderer/lib/pending-attention-notify'
import { parseCompactSlashCommand } from '@renderer/lib/slash-commands'
import {
  resolveSessionChatTabId,
  getSessionTerminals,
  resolveTabModelSelection,
  retainSettledClarification,
  type AgentRunViewState,
  type AgentTerminalTab
} from '@renderer/lib/terminal-tabs'
import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react'
import { normalizeAgentStyle } from '../../../shared/agent-style'
import type {
  AgentConfig,
  AgentModelOption,
  CaptureKind,
  StoredAgentRun
} from '../../../shared/agent-types'
import { parseCaptureIntent } from '../../../shared/capture-intent'
import type { AgentRunInput } from '../../../shared/agent-types'
import type { AgentTurnSummary, ClaimedAgentTurn } from '../../../shared/agent-turn-queue'
import { useProactiveTerminalSuggestions } from './useProactiveTerminalSuggestions'

interface Parameters {
  activeTabIdRef: RefObject<string>
  activeConversationId?: string
  tabsRef: RefObject<AgentTerminalTab[]>
  startNewSession: () => void
  reloadApplicationRuntime: () => Promise<void>
  updateTab: (tabId: string, updater: (tab: AgentTerminalTab) => AgentTerminalTab) => void
  applyComposerInput: (
    tab: AgentTerminalTab,
    value: string,
    extras?: Partial<AgentTerminalTab>
  ) => AgentTerminalTab
  compactCurrentSession: (instructions?: string) => Promise<void>
  startCaptureFromCurrentSession: (
    kind: CaptureKind,
    scope: 'turn' | 'session',
    seedText?: string,
    tabId?: string
  ) => Promise<void>
  t: Dictionary
  activeRunIdRef: RefObject<Map<string, string>>
  appendLog: (entry: AgentLogEntryInput, tabId?: string) => number
  pendingPostLoginSupplementsRef: RefObject<Map<string, string[]>>
  updateAgentRun: (tabId: string, updater: (run: AgentRunViewState) => AgentRunViewState) => void
  setActiveExecutionTerminal: (chatTabId: string, terminalTabId: string | null) => void
  pendingAttentionNotifierRef: RefObject<{
    notifyRunComplete: (
      runId: string,
      title: string,
      body: string,
      options?: Omit<AttentionNotifyOptions, 'runId'>
    ) => void
    clearRunAttention: (runId: string) => void
  }>
  activeRunCanceledRef: RefObject<Set<string>>
  activeRunInputRef: RefObject<Map<string, string>>
  activeAgentRunRef: RefObject<Map<string, AgentRunViewState>>
  persistAgentRun: (run: StoredAgentRun) => void
  config: AgentConfig
  visibleModels: AgentModelOption[]
  activeExecutionTabIdRef: RefObject<Map<string, string>>
  locale: 'en' | 'zh-CN'
  sessionAgentStyle: 'swift' | 'concise' | 'guided' | 'teach'
  updateLogEntryText: (tabId: string, logId: number, text: string) => void
  pruneLiveRuns: (logIds: number[]) => void
}

export function useAgentController({
  activeTabIdRef,
  activeConversationId,
  tabsRef,
  startNewSession,
  reloadApplicationRuntime,
  updateTab,
  applyComposerInput,
  compactCurrentSession,
  startCaptureFromCurrentSession,
  t,
  activeRunIdRef,
  appendLog,
  pendingPostLoginSupplementsRef,
  updateAgentRun,
  setActiveExecutionTerminal,
  pendingAttentionNotifierRef,
  activeRunCanceledRef,
  activeRunInputRef,
  activeAgentRunRef,
  persistAgentRun,
  config,
  visibleModels,
  activeExecutionTabIdRef,
  locale,
  sessionAgentStyle,
  updateLogEntryText,
  pruneLiveRuns
}: Parameters) {
  const submissions = useRef(new Map<string, symbol>())
  const draining = useRef(new Set<string>())
  const accepting = useRef(new Map<string, number>())
  const [visibleQueue, setVisibleQueue] = useState<{ id: string; turns: AgentTurnSummary[] }>()
  const turns = visibleQueue?.id === activeConversationId ? (visibleQueue?.turns ?? []) : []
  const visibleConversation = useRef(activeConversationId)
  const drainRef = useRef<(chatId: string, conversationId: string) => Promise<void>>(async () => {})
  useEffect(() => {
    visibleConversation.current = activeConversationId
    let current = true
    if (activeConversationId) {
      void agentClient
        .listTurns(activeConversationId)
        .then((items) => {
          if (current) setVisibleQueue({ id: activeConversationId, turns: items })
        })
        .catch(() => {})
    }
    return () => {
      current = false
    }
  }, [activeConversationId])
  useEffect(() => {
    drainRef.current = drainTurns
  })

  const proactiveRunRef = useRef<
    (terminal: AgentTerminalTab, chatId: string, token: string) => Promise<void>
  >(async () => {})
  useEffect(() => {
    proactiveRunRef.current = (terminal, chatId, token) =>
      runAgentConversation(
        locale === 'en'
          ? 'Analyze the latest authorized terminal output and suggest one to three useful next-command choices, without padding. Continue the current diagnostic goal if any. Do not execute commands.'
          : '分析最新授权的终端输出，主动给出1～3 个确有价值的下一步命令选项，不为数量凑数；已有排查目标时围绕该目标继续。不要执行命令。',
        terminal.id,
        terminal.connectionId,
        locale === 'en'
          ? 'Terminal follow-up · next-command choices'
          : '终端主动建议 · 下一步命令选项',
        false,
        Date.now(),
        { chatTabId: chatId, proactiveToken: token }
      )
  })
  const dismissProactive = useProactiveTerminalSuggestions({
    tabsRef,
    activeTabIdRef,
    activeRunIdRef,
    submissionsRef: submissions,
    ready: visibleModels.length > 0,
    runRef: proactiveRunRef
  })

  async function submitAgent(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    await submitAgentMessage()
  }

  async function submitAgentMessage(
    overrideInput?: string,
    options?: {
      forcedConnectionId?: string
      skipUserLog?: boolean
      stopAndSend?: boolean
      terminalOperatorFinished?: boolean
    }
  ): Promise<void> {
    const terminalTabId = activeTabIdRef.current
    const chatTabId = resolveSessionChatTabId(tabsRef.current, terminalTabId)
    const tab = tabsRef.current.find((candidate) => candidate.id === chatTabId)
    const terminalTab = tabsRef.current.find((candidate) => candidate.id === terminalTabId)
    const rawInput = (overrideInput ?? tab?.agentInput ?? '').trim()
    const displayInput = stripComposerRefTokens(rawInput).trim()
    if (!displayInput && !hasComposerRefTokens(rawInput) && !tab?.pathRefs.length) return

    if (/^\/new$/i.test(displayInput)) {
      startNewSession()
      return
    }
    if (/^\/reload$/i.test(displayInput)) {
      void reloadApplicationRuntime()
      return
    }
    const compactCommand = parseCompactSlashCommand(displayInput)
    if (compactCommand) {
      updateTab(chatTabId, (current) => applyComposerInput(current, ''))
      void compactCurrentSession(compactCommand.instructions)
      return
    }
    const capture = parseCaptureIntent(displayInput)
    if (capture) {
      updateTab(chatTabId, (current) => applyComposerInput(current, ''))
      void startCaptureFromCurrentSession(capture.kind, capture.scope, capture.seedText)
      return
    }

    const skillRefs = options?.terminalOperatorFinished ? [] : (tab?.skillRefs ?? [])
    dismissProactive(terminalTabId)
    const pathRefs = options?.terminalOperatorFinished ? [] : (tab?.pathRefs ?? [])
    const selected = resolveTabModelSelection(tab, config, visibleModels)
    const model = visibleModels.find(
      (entry) => entry.id === selected.model && entry.providerId === selected.providerId
    )
    if (hasImageAttachments(pathRefs) && !model?.capabilities?.imageInput) return
    const toolRefs = options?.terminalOperatorFinished ? [] : (tab?.toolRefs ?? [])
    const wikiRefs = options?.terminalOperatorFinished ? [] : (tab?.wikiRefs ?? [])
    const messageRefs = snapshotMessageReferences({ skillRefs, pathRefs, toolRefs, wikiRefs })
    const promptInput =
      displayInput || (locale === 'en' ? 'Analyze the attached evidence.' : '请分析所附证据。')
    const baseInput = buildAgentInputWithReferences(
      promptInput,
      skillRefs,
      pathRefs,
      toolRefs,
      wikiRefs,
      t
    )
    const resumeInput =
      isContinueIntent(displayInput) && tab && !tab.projectId
        ? buildResumeAgentInput(tab, baseInput, t)
        : undefined
    if (!tab) return
    const conversationId = tab.conversationId
    const executionTabId = terminalTabId
    const request: AgentRunInput = {
      input: baseInput,
      resumeInput,
      terminalOperatorFinished: options?.terminalOperatorFinished,
      skillInput: displayInput,
      tabId: chatTabId,
      executionTabId,
      executionConnectionId: options?.forcedConnectionId ?? terminalTab?.connectionId,
      projectId: tab.projectId,
      providerId: selected.providerId,
      model: selected.model,
      locale,
      agentStyle: normalizeAgentStyle(sessionAgentStyle),
      observationTabIds: getSessionTerminals(tabsRef.current, chatTabId)
        .filter((terminal) => terminal.external && terminal.sessionId)
        .map((terminal) => terminal.id)
        .slice(0, 8),
      activeWikiIds: options?.terminalOperatorFinished ? [] : [...tab.activeWikiIds],
      activeSkillPaths: skillRefs.map((skill) => skill.path).filter(Boolean),
      attachments: pathRefs
        .filter((reference) => reference.kind === 'file')
        .map(({ path }) => ({ path }))
    }
    const previousRun = options?.stopAndSend ? activeRunIdRef.current.get(chatTabId) : undefined
    accepting.current.set(conversationId, (accepting.current.get(conversationId) ?? 0) + 1)
    submissions.current.set(chatTabId, Symbol(chatTabId))
    try {
      await agentClient.enqueueTurn(
        conversationId,
        {
          request,
          originalInput: rawInput || promptInput,
          displayInput: promptInput,
          references: messageRefs,
          skipUserLog: options?.skipUserLog
        },
        Boolean(previousRun)
      )
      if (
        !options?.terminalOperatorFinished &&
        (overrideInput === undefined || rawInput === tab.agentInput.trim())
      )
        updateTab(chatTabId, (current) =>
          current.agentInput !== tab.agentInput ||
          current.pathRefs !== tab.pathRefs ||
          current.skillRefs !== tab.skillRefs ||
          current.toolRefs !== tab.toolRefs ||
          current.wikiRefs !== tab.wikiRefs ||
          current.activeWikiIds !== tab.activeWikiIds
            ? current
            : applyComposerInput(current, '', {
                pathRefs: [],
                skillRefs: [],
                toolRefs: [],
                wikiRefs: [],
                activeWikiIds: []
              })
        )
      if (previousRun && activeRunIdRef.current.get(chatTabId) === previousRun) {
        activeRunCanceledRef.current.add(chatTabId)
        await agentClient.cancel(previousRun)
      }
    } catch (error) {
      appendLog(
        { kind: 'error', text: error instanceof Error ? error.message : String(error) },
        chatTabId
      )
    } finally {
      const remaining = (accepting.current.get(conversationId) ?? 1) - 1
      if (remaining) accepting.current.set(conversationId, remaining)
      else {
        accepting.current.delete(conversationId)
        submissions.current.delete(chatTabId)
      }
    }
    const drain = drainTurns(chatTabId, conversationId)
    void refreshTurns(conversationId)
    await drain
  }

  async function refreshTurns(conversationId: string): Promise<void> {
    try {
      const items = await agentClient.listTurns(conversationId)
      if (visibleConversation.current === conversationId)
        setVisibleQueue({ id: conversationId, turns: items })
    } catch {
      // A navigation can close the initiating document before its query returns.
    }
  }

  async function drainTurns(chatTabId: string, conversationId: string): Promise<void> {
    if (
      draining.current.has(conversationId) ||
      accepting.current.has(conversationId) ||
      activeRunIdRef.current.has(chatTabId)
    )
      return
    draining.current.add(conversationId)
    const ownsChat = (): boolean =>
      tabsRef.current.some(
        (item) => item.id === chatTabId && item.conversationId === conversationId
      )
    try {
      while (
        ownsChat() &&
        !accepting.current.has(conversationId) &&
        !activeRunIdRef.current.has(chatTabId)
      ) {
        const queued = await agentClient.claimTurn(conversationId)
        if (!queued) break
        try {
          if (!ownsChat()) break
          await storageClient.saveTabs(toStoredSessionTabs(tabsRef.current))
          if (!ownsChat()) break
          const run = runAgentConversation(
            queued.request.input,
            queued.request.executionTabId ?? chatTabId,
            queued.request.executionConnectionId,
            queued.displayInput,
            false,
            Date.now(),
            { chatTabId, queued }
          )
          void refreshTurns(conversationId)
          await run
        } finally {
          await agentClient.releaseTurn(queued.id)
        }
      }
    } catch (error) {
      appendLog(
        { kind: 'error', text: error instanceof Error ? error.message : String(error) },
        chatTabId
      )
    } finally {
      draining.current.delete(conversationId)
      await refreshTurns(conversationId)
    }
  }

  async function continueTurns(): Promise<void> {
    const chatId = resolveSessionChatTabId(tabsRef.current, activeTabIdRef.current)
    const tab = tabsRef.current.find((item) => item.id === chatId)
    if (!tab) return
    try {
      await agentClient.resumeTurns(tab.conversationId)
      await drainTurns(chatId, tab.conversationId)
    } catch (error) {
      appendLog(
        { kind: 'error', text: error instanceof Error ? error.message : String(error) },
        chatId
      )
    }
  }

  async function removeTurn(id: string): Promise<void> {
    const chatId = resolveSessionChatTabId(tabsRef.current, activeTabIdRef.current)
    const tab = tabsRef.current.find((item) => item.id === chatId)
    if (!tab) return
    try {
      await agentClient.removeTurn(tab.conversationId, id)
      await refreshTurns(tab.conversationId)
      await drainTurns(chatId, tab.conversationId)
    } catch (error) {
      appendLog(
        { kind: 'error', text: error instanceof Error ? error.message : String(error) },
        chatId
      )
    }
  }

  async function runAgentConversation(
    input: string,
    terminalTabId: string,
    connectionId?: string,
    displayInput = input,
    appendUserLog = true,
    startedAt = Date.now(),
    options: {
      queued?: ClaimedAgentTurn
      proactiveToken?: string
      attachments?: Array<{ path: string }>
      conversationContext?: string
      chatTabId?: string
      reuseRun?: ReuseAgentRun
      connectionRouteLabel?: string
      activeWikiIds?: string[]
      activeSkillPaths?: string[]
    } = {}
  ): Promise<void> {
    const chatTabId = options.chatTabId ?? resolveSessionChatTabId(tabsRef.current, terminalTabId)
    const queueTab = tabsRef.current.find((candidate) => candidate.id === chatTabId)
    if (
      !options.queued &&
      ((activeRunIdRef.current.has(chatTabId) &&
        !(options.reuseRun && activeRunCanceledRef.current.has(chatTabId))) ||
        (queueTab && draining.current.has(queueTab.conversationId)))
    )
      return
    const supplements = options.queued
      ? []
      : (pendingPostLoginSupplementsRef.current.get(chatTabId) ?? [])
    if (supplements.length) {
      pendingPostLoginSupplementsRef.current.delete(chatTabId)
      input = mergePostLoginSupplements(input, supplements)
    }
    const existing =
      options.reuseRun && activeAgentRunRef.current.get(chatTabId)?.logId === options.reuseRun.logId
        ? activeAgentRunRef.current.get(chatTabId)
        : undefined
    const runId = existing?.runId ?? options.reuseRun?.runId ?? `run-${crypto.randomUUID()}`
    const isCurrent = (): boolean =>
      activeRunIdRef.current.get(chatTabId) === runId &&
      !activeRunCanceledRef.current.has(chatTabId)
    activeRunCanceledRef.current.delete(chatTabId)
    activeRunIdRef.current.set(chatTabId, runId)
    activeRunInputRef.current.set(chatTabId, displayInput)
    setActiveExecutionTerminal(chatTabId, terminalTabId)
    updateTab(chatTabId, (current) => ({
      ...current,
      agentBusy: true,
      agentThinking: false,
      thinkingMessage: undefined,
      pendingClarification: retainSettledClarification(current.pendingClarification)
    }))
    void persistAgentRun({
      runId,
      tabId: chatTabId,
      input: displayInput,
      status: 'running',
      connectionId
    })
    if (existing) {
      activeAgentRunRef.current.set(chatTabId, {
        ...existing,
        runId,
        startedAt: existing.startedAt ?? startedAt,
        error: undefined,
        elapsedMs: undefined
      })
    } else {
      if (options.queued && !options.queued.skipUserLog) {
        appendLog(
          {
            kind: 'user',
            text: options.queued.originalInput,
            references: options.queued.references
          },
          chatTabId
        )
      } else if (appendUserLog) appendLog({ kind: 'user', text: displayInput }, chatTabId)
      const logId = appendLog(
        {
          kind: 'assistant',
          text: formatAgentRunMarkdown({ logId: -1, actions: [], steps: [] }, t)
        },
        chatTabId
      )
      activeAgentRunRef.current.set(chatTabId, { logId, runId, actions: [], steps: [], startedAt })
    }
    updateAgentRun(chatTabId, (run) => run)
    const executionTabId = activeExecutionTabIdRef.current.get(chatTabId) ?? terminalTabId

    const finish = (status: 'success' | 'error', text: string): void => {
      if (!isCurrent()) return
      const elapsedMs = Date.now() - startedAt
      updateAgentRun(chatTabId, (run) => ({
        ...run,
        steps: closeStreamingOpenSteps(run.steps ?? []),
        ...(status === 'success' ? { result: text } : { error: text }),
        elapsedMs
      }))
      const outcome = status === 'success' ? { output: text } : { error: text }
      void persistAgentRun({
        runId,
        tabId: chatTabId,
        input: displayInput,
        status,
        connectionId,
        ...outcome,
        startedAt: new Date(startedAt).toISOString(),
        elapsedMs,
        trace: buildTraceFromAgentRunView({
          runId,
          tabId: chatTabId,
          displayInput,
          status,
          connectionId,
          run: activeAgentRunRef.current.get(chatTabId),
          startedAt,
          ...outcome
        })
      })
      pendingAttentionNotifierRef.current.notifyRunComplete(
        runId,
        status === 'success' ? t.notifications.runCompleteTitle : t.notifications.runFailedTitle,
        summarizeNotificationBody(text) || (status === 'success' ? t.input.done : t.input.failed),
        { tabId: executionTabId, chatTabId }
      )
    }

    try {
      const runTab = tabsRef.current.find((candidate) => candidate.id === terminalTabId)
      const chatTab = tabsRef.current.find((candidate) => candidate.id === chatTabId)
      const selection = resolveTabModelSelection(chatTab ?? runTab, config, visibleModels)
      if (!options.queued) await storageClient.saveTabs(toStoredSessionTabs(tabsRef.current))
      if (!isCurrent()) return
      const result = await agentClient.run(
        options.queued
          ? {
              ...options.queued.request,
              tabId: chatTabId,
              runId,
              queueTurnId: options.queued.id,
              conversationContext: buildRecentConversationContext(chatTab, displayInput, t)
            }
          : {
              proactiveToken: options.proactiveToken,
              attachments: options.attachments,
              projectId: chatTab?.projectId,
              runId,
              input,
              skillInput: displayInput,
              conversationContext:
                options.conversationContext ??
                buildRecentConversationContext(chatTab, displayInput, t),
              providerId: selection.providerId,
              model: selection.model,
              tabId: chatTabId,
              executionTabId,
              observationTabIds: getSessionTerminals(tabsRef.current, chatTabId)
                .filter((tab) => tab.external && tab.sessionId)
                .map((tab) => tab.id)
                .slice(0, 8),
              locale,
              agentStyle: normalizeAgentStyle(sessionAgentStyle),
              activeWikiIds: options.activeWikiIds ?? chatTab?.activeWikiIds ?? [],
              activeSkillPaths:
                options.activeSkillPaths ??
                (chatTab?.skillRefs ?? []).map((skill) => skill.path).filter(Boolean)
            }
      )
      if (!isCurrent()) return
      if (result.ok) {
        const resolved = resolveSuccessfulAgentResult({
          text: result.text,
          run: activeAgentRunRef.current.get(chatTabId),
          doneFallback: t.input.done
        })
        finish(resolved.ok ? 'success' : 'error', resolved.ok ? resolved.text : resolved.error)
      } else finish('error', localizeAgentEventMessage(result.error || t.input.failed, t))
    } catch (error) {
      finish(
        'error',
        localizeAgentEventMessage(error instanceof Error ? error.message : String(error), t)
      )
    } finally {
      // Late results from a canceled run cannot overwrite a new turn or its draft.
      if (activeRunIdRef.current.get(chatTabId) === runId) {
        if (activeRunCanceledRef.current.has(chatTabId)) {
          void persistAgentRun({
            runId,
            tabId: chatTabId,
            input: displayInput,
            status: 'canceled',
            connectionId
          })
        }
        const finishedRun = activeAgentRunRef.current.get(chatTabId)
        const logId = finishedRun?.logId
        if (finishedRun && typeof logId === 'number') {
          try {
            updateLogEntryText(chatTabId, logId, buildFinishPersistText(finishedRun))
          } catch (error) {
            console.warn('[moxun] finish snapshot write failed', error)
          }
        }
        activeAgentRunRef.current.delete(chatTabId)
        activeRunCanceledRef.current.delete(chatTabId)
        activeRunIdRef.current.delete(chatTabId)
        activeRunInputRef.current.delete(chatTabId)
        if (typeof logId === 'number') pruneLiveRuns([logId])
        updateTab(chatTabId, (current) => ({
          ...current,
          agentBusy: false,
          agentThinking: false,
          thinkingMessage: undefined
        }))
      }
      if (!options.queued && queueTab) void drainRef.current(chatTabId, queueTab.conversationId)
    }
  }
  return { submitAgent, submitAgentMessage, runAgentConversation, turns, continueTurns, removeTurn }
}
