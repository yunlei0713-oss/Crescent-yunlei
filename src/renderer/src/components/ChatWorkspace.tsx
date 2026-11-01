import { GuidedOpsPanel } from './GuidedOpsPanel'
import { ComposerAttachments } from './ComposerAttachments'
import { hasImageAttachments } from '../../../shared/model-capabilities'
import { type FormEvent, type KeyboardEvent, type RefObject, useId, useState } from 'react'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronRightIcon,
  FileIcon,
  FolderOpenIcon,
  Loader2Icon,
  PaperclipIcon,
  PlusIcon,
  TriangleAlertIcon
} from 'lucide-react'

import { AgentLogList } from '@renderer/components/AgentLogList'
import { CaptureDraftPin } from '@renderer/components/CaptureDraftPin'
import { ComposerEditor, type ComposerInputHandle } from '@renderer/components/ComposerEditor'
import { ConnectionClarifyCard } from '@renderer/components/ConnectionClarifyCard'
import { SessionUsageBar } from '@renderer/components/SessionUsageBar'
import {
  PasswordPromptInlineCard,
  type PasswordPromptRequest
} from '@renderer/components/AppModals'
import { SlashCommandMenu } from '@renderer/components/SlashCommandMenu'
import { StatusDot } from '@renderer/components/StatusIndicators'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import type { ConnectionClarifyConfirmPayload } from '@renderer/lib/connection-route'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@renderer/components/ui/tooltip'
import type { Dictionary } from '@renderer/i18n'
import type { SlashCommandOption } from '@renderer/lib/slash-commands'
import type { CaptureDraftPinView } from '@renderer/lib/capture-draft-ui'
import {
  type AgentLogEntry,
  type AgentRunViewState,
  type AgentTerminalTab
} from '@renderer/lib/terminal-tabs'
import { buildModelSelectionValue } from '@renderer/lib/app-runtime'
import {
  agentStyleHint,
  agentStyleSelectOptions,
  agentStyleTitle
} from '@renderer/lib/agent-style-ui'
import { normalizeAgentStyle, type AgentStyle } from '../../../shared/agent-style'
import type {
  AgentModelOption,
  AgentPinnedWorkflow,
  CaptureKind
} from '../../../shared/agent-types'

export function ChatWorkspace({
  sessionChatTab,
  sessionTitle,
  activeTab,
  agentLogRef,
  followingAgentLog,
  onFollowAgentLog,
  agentInputRef,
  slashCommandListRef,
  slashMenuVisible,
  slashCommandOptions,
  selectedSlashCommandIndex,
  terminalStartError,
  activeModel,
  activeModelSelectionValue,
  activeTabModelId,
  visibleModels,
  aiState,
  aiStatusText,
  modelValidationError,
  agentStyle,
  onAgentStyleChange,
  thinkingCollapsedByDefault,
  activeAgentPending,
  pinnedWorkflows,
  connectionRecovery,
  t,
  onCopyEntry,
  onCopyResult,
  onExportResult,
  onExportFull,
  onExportTrace,
  onExportSessionTrace,
  onOpsFeedback,
  feedbackByLogId,
  feedbackBusyLogId,
  savingSopLogId,
  liveRunByLogId,
  onInjectSuggestions,
  onOpenModelSettings,
  onDeclareVision,
  onClarifyConfirm,
  onClarifyDismiss,
  onFocusTerminal,
  onModelChange,
  onSubmit,
  onInsertSlashCommand,
  onInsertPinnedWorkflow,
  onAgentInputChange,
  onProactiveSuggestionsPausedChange,
  onComposerCaretChange,
  onAgentInputKeyDown,
  onAgentInputPaste,
  onAgentFiles,
  onRemovePath,
  onPickPathReference,
  onStopAgent,
  onRetryConnection,
  onOpenConnections,
  passwordPromptRequest = null,
  passwordPromptValue = '',
  passwordPromptError = '',
  passwordPromptInputRef,
  onPasswordPromptChange,
  onPasswordPromptCancel,
  onPasswordPromptSubmit,
  onSaveAsSop,
  captureReadyLogs = [],
  hiddenCaptureReadyLogIds = [],
  captureDraftPins = [],
  onOpenCaptureDraft,
  hasEarlierLogs,
  loadingEarlier,
  earlierLogsError,
  onLoadEarlier,
  sessionInputTokens,
  sessionOutputTokens,
  sessionCacheReadTokens,
  sessionCacheWriteTokens,
  contextPercent,
  contextPending,
  onCompactContext,
  compactDisabled
}: {
  sessionChatTab: AgentTerminalTab
  sessionTitle: string
  activeTab: AgentTerminalTab
  agentLogRef: RefObject<HTMLDivElement | null>
  followingAgentLog: boolean
  onFollowAgentLog: () => void
  agentInputRef?: RefObject<ComposerInputHandle | null>
  slashCommandListRef: RefObject<HTMLDivElement | null>
  slashMenuVisible: boolean
  slashCommandOptions: SlashCommandOption[]
  selectedSlashCommandIndex: number
  terminalStartError?: string
  activeModel?: AgentModelOption
  activeModelSelectionValue: string
  activeTabModelId: string
  visibleModels: AgentModelOption[]
  aiState: 'ready' | 'pending' | 'not-ready'
  aiStatusText: string
  modelValidationError?: string
  agentStyle: AgentStyle
  onAgentStyleChange: (style: AgentStyle) => void
  thinkingCollapsedByDefault: boolean
  activeAgentPending: boolean
  pinnedWorkflows: AgentPinnedWorkflow[]
  connectionRecovery?: {
    visible: boolean
    dismissed?: boolean
    canRetry: boolean
    connecting?: boolean
    pipeFallback?: boolean
    reason?: string
  }
  t: Dictionary
  onCopyEntry: (entry: AgentLogEntry) => void
  onCopyResult: (entry: AgentLogEntry) => void
  onExportResult: (entry: AgentLogEntry) => void
  onExportFull: (entry: AgentLogEntry) => void
  onExportTrace: (entry: AgentLogEntry) => void
  onExportSessionTrace: () => void
  onCompactContext?: () => void
  compactDisabled?: boolean
  onOpsFeedback: (entry: AgentLogEntry, rating: 'like' | 'dislike') => void
  feedbackByLogId?: Record<number, 'like' | 'dislike'>
  feedbackBusyLogId?: number | null
  savingSopLogId?: number | null
  liveRunByLogId?: Record<number, AgentRunViewState>
  onInjectSuggestions?: (texts: string[]) => void
  onOpenModelSettings?: () => void
  onDeclareVision?: () => void
  onClarifyConfirm?: (payload: ConnectionClarifyConfirmPayload) => void
  onClarifyDismiss?: () => void
  onFocusTerminal: (tabId: string) => void
  onModelChange: (selection: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onInsertSlashCommand: (option: SlashCommandOption) => void
  onInsertPinnedWorkflow: (workflow: AgentPinnedWorkflow) => void
  onAgentInputChange: (value: string) => void
  onProactiveSuggestionsPausedChange: (paused: boolean) => void
  onComposerCaretChange?: (cursor: number) => void
  onAgentInputKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  onAgentInputPaste: (event: React.ClipboardEvent<HTMLElement>) => void
  onAgentFiles: (files: File[]) => void
  onRemovePath: (id: string) => void
  onPickPathReference: (kind: 'file' | 'directory') => void
  onStopAgent: () => void
  onRetryConnection?: () => void
  onOpenConnections?: () => void
  passwordPromptRequest?: PasswordPromptRequest | null
  passwordPromptValue?: string
  passwordPromptError?: string
  passwordPromptInputRef?: RefObject<HTMLInputElement | null>
  onPasswordPromptChange?: (value: string) => void
  onPasswordPromptCancel?: () => void
  onPasswordPromptSubmit?: (event: FormEvent<HTMLFormElement>) => void
  onSaveAsSop?: (entry: AgentLogEntry) => void
  captureReadyLogs?: Array<{ logId: number; kind: CaptureKind }>
  hiddenCaptureReadyLogIds?: number[]
  captureDraftPins?: CaptureDraftPinView[]
  onOpenCaptureDraft?: (kind: CaptureKind) => void
  hasEarlierLogs?: boolean
  loadingEarlier?: boolean
  earlierLogsError?: string | null
  onLoadEarlier?: () => void | Promise<void>
  sessionInputTokens: number
  sessionOutputTokens: number
  sessionCacheReadTokens: number
  sessionCacheWriteTokens: number
  contextPercent?: number | null
  contextPending?: boolean
}): React.JSX.Element {
  const sessionDetailsId = useId()
  const [sessionDetailsOpen, setSessionDetailsOpen] = useState(false)
  const imageMismatch =
    hasImageAttachments(sessionChatTab.pathRefs) && !activeModel?.capabilities?.imageInput
  const zh = t.locale === 'zh-CN'
  const [dragging, setDragging] = useState(false)
  const showSendButton =
    activeAgentPending ||
    sessionChatTab.agentBusy ||
    Boolean(sessionChatTab.agentInput.trim()) ||
    sessionChatTab.pathRefs.length > 0

  return (
    <section
      data-chat-id={sessionChatTab.id}
      className="app-agent-pane chat-workspace relative flex min-h-0 min-w-0 flex-1 flex-col"
      aria-label={t.app.chat}
    >
      {terminalStartError ? (
        <div
          className="mx-4 mt-2 flex shrink-0 items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          role="alert"
        >
          <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>{t.terminal.failedToStartShellReason.replace('{reason}', terminalStartError)}</span>
        </div>
      ) : null}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <AgentLogList
          logRef={agentLogRef}
          entries={sessionChatTab.agentLog}
          tabId={sessionChatTab.id}
          liveRunByLogId={liveRunByLogId}
          copiedLogId={sessionChatTab.copiedLogId}
          thinking={sessionChatTab.agentThinking}
          thinkingMessage={sessionChatTab.thinkingMessage}
          thinkingCollapsedByDefault={thinkingCollapsedByDefault}
          connectionRecovery={connectionRecovery}
          t={t}
          onCopyEntry={onCopyEntry}
          onCopyResult={onCopyResult}
          onExportResult={onExportResult}
          onExportFull={onExportFull}
          onExportTrace={onExportTrace}
          onOpsFeedback={onOpsFeedback}
          onInjectSuggestions={onInjectSuggestions}
          feedbackByLogId={feedbackByLogId}
          feedbackBusyLogId={feedbackBusyLogId}
          savingSopLogId={savingSopLogId}
          onRetryConnection={onRetryConnection}
          onOpenConnections={onOpenConnections}
          onOpenModelSettings={onOpenModelSettings}
          onSaveAsSop={onSaveAsSop}
          captureReadyLogs={captureReadyLogs}
          hiddenCaptureReadyLogIds={hiddenCaptureReadyLogIds}
          onOpenCaptureDraft={onOpenCaptureDraft}
          hasEarlierLogs={hasEarlierLogs}
          loadingEarlier={loadingEarlier}
          earlierLogsError={earlierLogsError}
          onLoadEarlier={onLoadEarlier}
          onFocusTerminal={onFocusTerminal}
          primaryContent={
            activeTab.external ? (
              <GuidedOpsPanel
                key={sessionChatTab.id + ':' + activeTab.id}
                chatId={sessionChatTab.id}
                terminalId={activeTab.id}
                zh={zh}
                onAsk={(text) => {
                  onAgentInputChange(text)
                  agentInputRef?.current?.focus()
                }}
                onStart={() => agentInputRef?.current?.focus()}
                paused={Boolean(activeTab.proactiveSuggestionsPaused)}
                onPausedChange={onProactiveSuggestionsPausedChange}
              />
            ) : undefined
          }
        />
        {!followingAgentLog ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="absolute bottom-3 left-1/2 z-10 h-8 -translate-x-1/2 gap-1.5 rounded-full bg-background px-3 text-xs shadow-md"
            onClick={onFollowAgentLog}
          >
            <ArrowDownIcon className="size-3.5" aria-hidden="true" />
            {t.input.backToLatest}
          </Button>
        ) : null}
      </div>
      {sessionChatTab.pendingClarification?.kind === 'connection-intent' &&
      onClarifyConfirm &&
      onClarifyDismiss ? (
        <ConnectionClarifyCard
          key={`${sessionChatTab.pendingClarification.originalInput}:${sessionChatTab.pendingClarification.defaultOptionId ?? ''}`}
          clarification={sessionChatTab.pendingClarification}
          t={t}
          onConfirm={onClarifyConfirm}
          onDismiss={onClarifyDismiss}
        />
      ) : null}
      {passwordPromptRequest &&
      passwordPromptInputRef &&
      onPasswordPromptChange &&
      onPasswordPromptCancel &&
      onPasswordPromptSubmit ? (
        <div className="shrink-0 border-t bg-background px-4 pt-3">
          <PasswordPromptInlineCard
            request={passwordPromptRequest}
            t={t}
            value={passwordPromptValue}
            error={passwordPromptError}
            inputRef={passwordPromptInputRef}
            onChange={onPasswordPromptChange}
            onCancel={onPasswordPromptCancel}
            onSubmit={onPasswordPromptSubmit}
          />
        </div>
      ) : null}
      <div className="app-input-dock space-y-1.5 p-2.5">
        {captureDraftPins.length > 0 && onOpenCaptureDraft ? (
          <div className="flex flex-col gap-1">
            {captureDraftPins.map((pin) => (
              <CaptureDraftPin
                key={pin.kind}
                kind={pin.kind}
                phase={pin.phase}
                hasContent={pin.hasContent}
                t={t}
                onOpen={() => onOpenCaptureDraft(pin.kind)}
              />
            ))}
          </div>
        ) : null}
        <div className="chat-session-meta">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <h1
              className="chat-session-title min-w-0 truncate text-xs font-medium text-muted-foreground"
              title={sessionTitle}
            >
              {sessionTitle}
            </h1>
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1 rounded-sm text-[11px] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              aria-expanded={sessionDetailsOpen}
              aria-controls={sessionDetailsId}
              onClick={() => setSessionDetailsOpen((open) => !open)}
            >
              <ChevronRightIcon
                className={`size-3 ${sessionDetailsOpen ? 'rotate-90' : ''}`}
                aria-hidden="true"
              />
              {zh ? '会话详情' : 'Session details'}
            </button>
          </div>
          <div
            id={sessionDetailsId}
            className="chat-session-details mt-1"
            hidden={!sessionDetailsOpen}
          >
            <SessionUsageBar
              inputTokens={sessionInputTokens}
              outputTokens={sessionOutputTokens}
              cacheReadTokens={sessionCacheReadTokens}
              cacheWriteTokens={sessionCacheWriteTokens}
              contextPercent={contextPercent}
              contextPending={contextPending}
              compactDisabled={compactDisabled}
              t={t}
              onExportSessionTrace={onExportSessionTrace}
              onCompactContext={onCompactContext}
            />
          </div>
        </div>
        <form
          onSubmit={(event) => {
            if (imageMismatch) event.preventDefault()
            else onSubmit(event)
          }}
          className={`space-y-1.5 ${dragging ? 'outline outline-2 outline-ring' : ''}`}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false)
          }}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            const files = Array.from(event.dataTransfer.files)
            if (files.length) onAgentFiles(files)
            else
              onAgentInputChange(
                sessionChatTab.agentInput + event.dataTransfer.getData('text/plain')
              )
          }}
        >
          {dragging && (
            <p className="p-2 text-xs">
              {zh ? '放入图片、日志、配置或 PDF' : 'Drop images, logs, configs or PDFs'}
            </p>
          )}
          <ComposerAttachments
            model={activeModel}
            references={sessionChatTab.pathRefs}
            zh={zh}
            onRemove={onRemovePath}
            onSettings={onOpenModelSettings}
            onDeclareVision={onDeclareVision}
          />
          <div
            className={`app-composer relative rounded-lg p-1.5${
              sessionChatTab.agentThinking || sessionChatTab.agentBusy
                ? ' app-composer-thinking'
                : ''
            }`}
          >
            <SlashCommandMenu
              visible={slashMenuVisible}
              listRef={slashCommandListRef}
              options={slashCommandOptions}
              selectedIndex={selectedSlashCommandIndex}
              t={t}
              onSelect={onInsertSlashCommand}
            />
            {pinnedWorkflows.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5 px-2 pb-1">
                <span className="text-[11px] text-muted-foreground">{t.input.pinnedWorkflows}</span>
                {pinnedWorkflows.map((workflow) => (
                  <Button
                    key={workflow.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 max-w-[180px] truncate px-2 text-[11px]"
                    title={workflow.prompt}
                    aria-label={`${t.input.insertPinnedWorkflow}: ${workflow.name}`}
                    onClick={() => onInsertPinnedWorkflow(workflow)}
                  >
                    {workflow.name}
                  </Button>
                ))}
              </div>
            ) : null}
            <ComposerEditor
              value={sessionChatTab.agentInput}
              placeholder={
                activeTab.external
                  ? zh
                    ? '描述要排查的问题，无需先执行命令；或追问当前建议…'
                    : 'Describe an issue without running a command first, or ask about the current suggestion…'
                  : t.input.askPlaceholder
              }
              ariaLabel={t.input.askPlaceholder}
              t={t}
              agentInputRef={agentInputRef}
              skillRefs={sessionChatTab.skillRefs}
              wikiRefs={sessionChatTab.wikiRefs}
              toolRefs={sessionChatTab.toolRefs}
              pathRefs={sessionChatTab.pathRefs}
              onChange={onAgentInputChange}
              onCaretChange={onComposerCaretChange}
              onKeyDown={(event) => {
                if (imageMismatch && event.key === 'Enter' && !event.shiftKey)
                  event.preventDefault()
                else onAgentInputKeyDown(event)
              }}
              onPaste={onAgentInputPaste}
            />
            <div className="app-composer-toolbar flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-y-1">
                <Select
                  value={activeModelSelectionValue}
                  onValueChange={onModelChange}
                  disabled={visibleModels.length === 0}
                >
                  <SelectTrigger
                    size="sm"
                    className="app-model-trigger min-w-0 overflow-hidden"
                    aria-label={t.app.model}
                    aria-haspopup="listbox"
                    title={
                      activeModel
                        ? `${activeModel.name} · ${activeModel.providerName} · ${aiStatusText}`
                        : aiStatusText
                    }
                  >
                    <span className="sr-only">
                      <SelectValue aria-label={t.app.model} />
                    </span>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <StatusDot state={aiState} title={aiStatusText} />
                      <span className="truncate">
                        {activeModel ? activeModel.name : activeTabModelId}
                      </span>
                      {modelValidationError && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className="pointer-events-auto inline-flex shrink-0"
                                aria-label={`${t.app.aiNotReady}: ${modelValidationError}`}
                                onPointerDown={(event) => event.stopPropagation()}
                              >
                                <TriangleAlertIcon
                                  className="size-3.5 text-destructive"
                                  aria-hidden="true"
                                />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs break-words">
                              {modelValidationError}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </span>
                  </SelectTrigger>
                  <SelectContent align="start" position="popper" side="top">
                    <SelectGroup>
                      <SelectLabel>{t.app.model}</SelectLabel>
                      {visibleModels.map((model) => (
                        <SelectItem
                          key={`${model.providerId}:${model.id}`}
                          value={buildModelSelectionValue(model.providerId, model.id)}
                        >
                          {model.name} · {model.providerName} ·{' '}
                          {model.capabilities?.imageInput
                            ? zh
                              ? '视觉'
                              : 'Vision'
                            : zh
                              ? '纯文本'
                              : 'Text only'}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Select
                  value={normalizeAgentStyle(agentStyle)}
                  onValueChange={(value) => onAgentStyleChange(normalizeAgentStyle(value))}
                >
                  <SelectTrigger
                    size="sm"
                    className="app-model-trigger app-style-trigger relative z-10 shrink-0"
                    aria-label={t.executionSettings.replyStyle}
                    aria-haspopup="listbox"
                    title={agentStyleHint(normalizeAgentStyle(agentStyle), t)}
                  >
                    <span className="truncate">
                      {t.executionSettings.replyPrefix}
                      {agentStyleTitle(normalizeAgentStyle(agentStyle), t)}
                    </span>
                  </SelectTrigger>
                  <SelectContent align="start" position="popper" side="top">
                    <SelectGroup>
                      <SelectLabel>{t.executionSettings.replyStyle}</SelectLabel>
                      {agentStyleSelectOptions(t).map((option) => (
                        <SelectItem key={option.id} value={option.id} title={option.description}>
                          {option.title}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="ml-auto flex h-6 shrink-0 items-center gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="app-composer-icon"
                      aria-label={t.input.reference}
                      title={t.input.reference}
                    >
                      <PaperclipIcon aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="app-reference-menu"
                    side="top"
                    align="end"
                    sideOffset={6}
                  >
                    <DropdownMenuItem onSelect={() => onPickPathReference('file')}>
                      <FileIcon aria-hidden="true" />
                      {t.input.referenceFile}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onPickPathReference('directory')}>
                      <FolderOpenIcon aria-hidden="true" />
                      {t.input.referenceDirectory}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {sessionChatTab.agentBusy ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="xs"
                    className="h-6 px-2 text-[11px]"
                    onClick={onStopAgent}
                  >
                    {t.common.stop}
                  </Button>
                ) : null}
                <Button
                  type="submit"
                  size="icon-xs"
                  className={`rounded-full ${showSendButton ? undefined : 'invisible'}`}
                  tabIndex={showSendButton ? undefined : -1}
                  aria-hidden={showSendButton ? undefined : true}
                  aria-label={
                    sessionChatTab.agentThinking
                      ? t.input.thinking
                      : sessionChatTab.agentBusy
                        ? t.input.contextAdd
                        : t.common.send
                  }
                  disabled={!showSendButton || sessionChatTab.agentThinking || imageMismatch}
                >
                  {sessionChatTab.agentThinking ||
                  (sessionChatTab.agentBusy && !sessionChatTab.agentInput.trim()) ? (
                    <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" />
                  ) : sessionChatTab.agentBusy ? (
                    <PlusIcon className="size-3.5" aria-hidden="true" />
                  ) : (
                    <ArrowUpIcon className="size-3.5" aria-hidden="true" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </section>
  )
}
