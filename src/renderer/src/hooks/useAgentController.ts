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
import { useEffect, useRef, type FormEvent, type RefObject } from 'react'
import { normalizeAgentStyle } from '../../../shared/agent-style'
import type {
  AgentConfig,
  AgentModelOption,
  CaptureKind,
  StoredAgentRun
} from '../../../shared/agent-types'
import { parseCaptureIntent } from '../../../shared/capture-intent'
import { useProactiveTerminalSuggestions } from './useProactiveTerminalSuggestions'

interface Parameters {
  activeTabIdRef: RefObject<string>
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
  const proactiveRunRef = useRef<
    (terminal: AgentTerminalTab, chatId: string, token: string) => Promise<void>
  >(async () => {})
  useEffect(() => {
    proactiveRunRef.current = (terminal, chatId, token) =>
      runAgentConversation(
        locale === 'en'
          ? 'Analyze the latest authorized terminal output and suggest the three most useful next-command choices. Continue the current diagnostic goal if any. Do not execute commands.'
          : '分析最新授权的终端输出，主动给出最可能用到的三个下一步命令选项；已有排查目标时围绕该目标继续。不要执行命令。',
        terminal.id,
        terminal.connectionId,
        locale === 'en'
          ? 'Terminal follow-up · three next-command choices'
          : '终端主动建议 · 三个下一步命令选项',
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
    options?: { forcedConnectionId?: string; skipUserLog?: boolean }
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

    const skillRefs = tab?.skillRefs ?? []
    dismissProactive(terminalTabId)
    const pathRefs = tab?.pathRefs ?? []
    const selected = resolveTabModelSelection(tab, config, visibleModels)
    const model = visibleModels.find(
      (entry) => entry.id === selected.model && entry.providerId === selected.providerId
    )
    if (hasImageAttachments(pathRefs) && !model?.capabilities?.imageInput) return
    const toolRefs = tab?.toolRefs ?? []
    const wikiRefs = tab?.wikiRefs ?? []
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
    const input =
      isContinueIntent(displayInput) && tab ? buildResumeAgentInput(tab, baseInput, t) : baseInput
    const conversationContext = tab ? buildRecentConversationContext(tab, displayInput, t) : ''
    const submission = Symbol(chatTabId)
    submissions.current.set(chatTabId, submission)
    // A new operator turn cancels reasoning and approvals, then waits for Main teardown.
    // Connection/login remains an explicit operation of the connection UI.
    const previousRun = activeRunIdRef.current.get(chatTabId)
    if (previousRun) {
      activeRunCanceledRef.current.add(chatTabId)
      await agentClient.cancel(previousRun)
    }
    if (submissions.current.get(chatTabId) !== submission) return
    submissions.current.delete(chatTabId)
    updateTab(chatTabId, (current) =>
      current.agentInput.trim() !== rawInput
        ? current
        : applyComposerInput(current, '', {
            pathRefs: [],
            skillRefs: [],
            toolRefs: [],
            wikiRefs: [],
            activeWikiIds: []
          })
    )
    if (!options?.skipUserLog)
      appendLog({ kind: 'user', text: rawInput || promptInput, references: messageRefs }, chatTabId)
    await runAgentConversation(
      input,
      terminalTabId,
      terminalTab?.connectionId,
      promptInput,
      false,
      Date.now(),
      {
        conversationContext,
        chatTabId,
        activeWikiIds: [...(tab?.activeWikiIds ?? [])],
        activeSkillPaths: skillRefs.map((skill) => skill.path).filter(Boolean),
        attachments: pathRefs
          .filter((reference) => reference.kind === 'file')
          .map(({ path }) => ({ path }))
      }
    )
  }

  async function runAgentConversation(
    input: string,
    terminalTabId: string,
    connectionId?: string,
    displayInput = input,
    appendUserLog = true,
    startedAt = Date.now(),
    options: {
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
    const supplements = pendingPostLoginSupplementsRef.current.get(chatTabId) ?? []
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
      if (appendUserLog) appendLog({ kind: 'user', text: displayInput }, chatTabId)
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
      const result = await agentClient.run({
        proactiveToken: options.proactiveToken,
        attachments: options.attachments,
        projectId: chatTab?.projectId,
        runId,
        input,
        skillInput: displayInput,
        conversationContext:
          options.conversationContext ?? buildRecentConversationContext(chatTab, displayInput, t),
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
      })
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
    }
  }
  return { submitAgent, submitAgentMessage, runAgentConversation }
}
