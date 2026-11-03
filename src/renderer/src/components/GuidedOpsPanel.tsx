import { GuidedOpsHistory } from './GuidedOpsHistory'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { agentClient, terminalClient } from '../clients'
import type { GuidedOpsAction, GuidedOpsSnapshot } from '../../../shared/guided-ops-types'
import { Button } from './ui/button'

export function GuidedOpsPanel({
  chatId,
  eventChatId,
  terminalId,
  runId,
  zh,
  onAsk,
  onStart,
  paused,
  onPausedChange
}: {
  chatId: string
  eventChatId?: string
  terminalId: string
  runId?: string
  zh: boolean
  onAsk: (text: string) => void
  onStart: () => void
  paused: boolean
  onPausedChange: (paused: boolean) => void
}) {
  const [received, setReceived] = useState<{
    chatId: string
    terminalId: string
    snapshot?: GuidedOpsSnapshot
  }>()
  const snapshot =
    received?.chatId === chatId && received.terminalId === terminalId
      ? received.snapshot
      : undefined
  const [unavailable, setUnavailable] = useState(false)
  const [review, setReview] = useState<{ proposalId: string; command: string }>()
  useEffect(() => {
    let disposed = false
    let loading = false
    let refreshAgain = false
    async function refresh(): Promise<void> {
      if (disposed) return
      if (loading) {
        refreshAgain = true
        return
      }
      loading = true
      try {
        const next = await agentClient.guidedSnapshot(chatId, terminalId)
        if (!disposed) {
          setReceived({ chatId, terminalId, snapshot: next })
          setUnavailable(false)
        }
      } catch {
        if (!disposed) setUnavailable(true)
      } finally {
        loading = false
        if (refreshAgain && !disposed) {
          refreshAgain = false
          void refresh()
        }
      }
    }
    void refresh()
    // Refresh only after agent activity or an explicit operator action, never idle-poll.
    const unsubscribe = agentClient.onEvent((event) => {
      if (
        (event.tabId === chatId || event.tabId === eventChatId || event.tabId === terminalId) &&
        (event.type === 'done' ||
          event.type === 'error' ||
          event.type === 'status' ||
          (event.type === 'tool' && event.phase === 'finished'))
      )
        void refresh()
    })
    const stopEvidence = terminalClient.onEvidenceChanged((notice) => {
      if (notice.identity.tabId === terminalId) void refresh()
    })
    return () => {
      disposed = true
      unsubscribe()
      stopEvidence()
    }
  }, [chatId, terminalId, eventChatId])
  async function action(value: GuidedOpsAction): Promise<void> {
    try {
      await agentClient.guidedAction(chatId, value, runId)
      setReceived({
        chatId,
        terminalId,
        snapshot: await agentClient.guidedSnapshot(chatId, terminalId)
      })
    } catch (error) {
      toast.error(String(error))
    }
  }
  const proposal = snapshot?.proposal
  async function copySuggestion(command: string): Promise<void> {
    try {
      const current = await agentClient.guidedSnapshot(chatId, terminalId)
      if (
        !current?.proposal?.valid ||
        current.proposal.id !== proposal?.id ||
        ![current.proposal, ...(current.proposal.alternatives ?? [])].some(
          (item) => item.command === command
        )
      )
        throw new Error(
          zh
            ? '建议已过期或观察已结束，请等待新建议。'
            : 'Suggestion expired or observation ended; wait for a fresh suggestion.'
        )
      await navigator.clipboard.writeText(command)
      await action('wait')
    } catch (error) {
      toast.error(String(error))
    }
  }
  const labels: Record<string, string> = {
    ANALYZING: '分析中',
    ANALYZING_NEXT: '分析下一步',
    PROPOSAL_READY: '建议已准备',
    WAITING_OPERATOR: '等待人工操作',
    COMMAND_RUNNING: '观察到命令提交',
    OBSERVING: '观察输出',
    EVIDENCE_READY: '结果证据已就绪',
    COMPLETED: '已结束',
    INTERRUPTED: '已打断 / 目标变化',
    OBSERVATION_UNCERTAIN: '命令边界 / 结果不确定'
  }
  return (
    <section
      aria-label={zh ? '下一步命令建议' : 'Next-command suggestions'}
      className="guided-ops-primary mt-2 min-w-0 border-t border-border pt-2 text-sm"
      data-guided-ops-primary
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">
            {zh ? '下一步排查建议' : 'Next diagnostic step'}
          </h2>
          <p role="status" className="mt-1 text-xs text-muted-foreground">
            {paused
              ? zh
                ? '主动建议已暂停'
                : 'Proactive suggestions paused'
              : zh
                ? '可以先描述问题，也可以直接操作终端。授权后自动分析后续输出；仅复制，不执行。'
                : 'Start with a problem or a terminal command. Authorized output triggers follow-ups; copy only, never execute.'}
          </p>
        </div>
        <Button size="xs" variant="ghost" onClick={() => onPausedChange(!paused)}>
          {paused
            ? zh
              ? '启用主动建议'
              : 'Enable suggestions'
            : zh
              ? '暂停主动建议'
              : 'Pause suggestions'}
        </Button>
      </div>
      {unavailable && (
        <p role="status">
          {zh
            ? '观察暂不可用，终端可继续使用'
            : 'Observation unavailable; your terminal remains usable'}
        </p>
      )}
      {!proposal && (
        <div className="py-2">
          <p>{zh ? '想排查什么问题？' : 'What would you like to diagnose?'}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {zh
              ? '在下方描述故障现象、预期结果和已知条件，Agent 会给出第一条排查建议，不需要先输入终端命令。'
              : 'Describe symptoms, expectations and known context below. The Agent will suggest the first diagnostic command; no initial terminal command is needed.'}
          </p>
          <Button className="mt-2" size="sm" variant="outline" onClick={onStart}>
            {zh ? '描述问题开始排查' : 'Describe an issue to start'}
          </Button>
        </div>
      )}
      {snapshot && (
        <div className="mt-3">
          <p className="text-xs text-muted-foreground" role="status">
            {zh ? labels[snapshot.state] : snapshot.state} ·{' '}
            {snapshot.evidence.identity.host ?? '?'} · {snapshot.evidence.identity.cwd}
          </p>
          {!snapshot.evidence.available && (
            <p className="mt-2 text-xs text-muted-foreground">
              {zh
                ? '当前未观察终端输出。建议仅依据你描述的问题和会话信息；授权观察后可自动跟进人工执行结果。'
                : 'No terminal output is observed. Guidance uses your question and session metadata only; authorize observation for automatic follow-ups.'}
            </p>
          )}
          <div className="space-y-4 pt-3 select-text">
            {proposal && (
              <div className="space-y-3">
                <h3 className="font-semibold">
                  {zh ? '第' : 'Step'} {proposal.step} · {proposal.goal}
                </h3>
                <p>{proposal.judgment}</p>
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">
                    {zh ? '目标会话与安全边界' : 'Target and safety boundary'}
                  </summary>
                  <p className="pt-2">
                    {proposal.target.host ?? '?'} · {proposal.target.tabId} · #
                    {proposal.target.sessionGeneration} ·{' '}
                    {zh
                      ? '人工执行；未知安全性不等于只读'
                      : 'Manual execution; unverified does not mean read-only'}
                  </p>
                </details>
                {!proposal.valid && (
                  <p role="status" className="text-xs text-destructive">
                    {zh
                      ? '建议已失效，请描述新目标或等待新证据。'
                      : 'Suggestion expired; describe a new goal or wait for fresh evidence.'}
                  </p>
                )}
                {[proposal, ...(proposal.alternatives ?? [])].map((suggestion, index) => (
                  <div
                    key={suggestion.command}
                    className="space-y-2 border-t border-border py-2"
                    data-command-suggestion={index}
                    data-scroll-follow-anchor={index === 0 ? '' : undefined}
                  >
                    <p className="font-medium">
                      {index + 1}. {suggestion.purpose}
                      {index === 0 && proposal.alternatives?.length
                        ? zh
                          ? ' · 推荐'
                          : ' · Recommended'
                        : ''}
                    </p>
                    <p
                      className={`text-xs ${suggestion.safety === 'verified-read-only' ? 'text-muted-foreground' : 'text-destructive'}`}
                    >
                      {suggestion.safety === 'verified-read-only'
                        ? zh
                          ? '静态只读检查通过 · 仍需核对目标与前提'
                          : 'Static read-only check passed · verify target and prerequisites'
                        : suggestion.safety === 'high-risk'
                          ? zh
                            ? '高风险 · 可能修改数据或服务，复制前必须确认'
                            : 'High risk · may change data or services; confirmation required before copying'
                          : zh
                            ? '安全性未验证 · 复杂命令/脚本需人工检查，不代表只读'
                            : 'Safety unverified · manually review complex commands/scripts; not proven read-only'}
                    </p>
                    <pre className="guided-ops-command my-1 overflow-x-auto bg-muted p-3 font-mono text-sm whitespace-pre-wrap break-words">
                      {suggestion.command}
                    </pre>
                    <details className="text-xs text-muted-foreground">
                      <summary className="cursor-pointer">
                        {zh
                          ? '预期结果与异常处理'
                          : 'Expected results and unexpected-output handling'}
                      </summary>
                      <p className="pt-2">
                        {zh ? '预期：' : 'Expected: '}
                        {suggestion.expectedOutput}
                      </p>
                      <p className="pt-1">
                        {zh ? '异常时：' : 'If unexpected: '}
                        {suggestion.onUnexpected}
                      </p>
                    </details>
                    <div className="flex gap-1 py-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!proposal.valid}
                        onClick={() => {
                          if (suggestion.safety !== 'verified-read-only')
                            setReview({ proposalId: proposal.id, command: suggestion.command })
                          else void copySuggestion(suggestion.command)
                        }}
                      >
                        {zh ? '复制命令' : 'Copy command'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          onAsk(
                            `${zh ? '我想' : 'I want to '}${suggestion.purpose}${zh ? '。请围绕这个目标给出一条确切的下一步命令，说明必要前提和风险。' : '. Give one exact next command for this goal, with prerequisites and risks.'}`
                          )
                        }
                      >
                        {zh ? '按此方向追问' : 'Ask about this direction'}
                      </Button>
                    </div>
                    {review?.proposalId === proposal.id &&
                      review.command === suggestion.command &&
                      proposal.valid && (
                        <div
                          className="border-l-2 border-destructive pl-3 text-xs"
                          role="group"
                          aria-label={zh ? '复制前安全确认' : 'Safety review before copying'}
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') setReview(undefined)
                          }}
                        >
                          <p>
                            {zh
                              ? '请检查整条命令的管道、重定向、子命令和脚本内容，确认目标、权限及潜在修改。复制后不会自动执行。'
                              : 'Review all pipelines, redirections, substitutions and script content, including target, privileges and possible changes. Copying will not execute it.'}
                          </p>
                          <div className="mt-2 flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setReview(undefined)
                                void copySuggestion(suggestion.command)
                              }}
                            >
                              {zh ? '已核对风险，仅复制' : 'Reviewed risks — copy only'}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setReview(undefined)}>
                              {zh ? '取消' : 'Cancel'}
                            </Button>
                          </div>
                        </div>
                      )}
                  </div>
                ))}
                <div className="flex flex-wrap gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      onAsk(
                        `${zh ? '请解释这条建议及其风险：' : 'Explain this suggestion and its risks: '}${proposal.command}`
                      )
                    }
                  >
                    {zh ? '追问' : 'Ask'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void action('skip')}>
                    {zh ? '跳过' : 'Skip'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      void action('interrupt')
                      onAsk(zh ? '改变排查方向：' : 'Change direction: ')
                    }}
                  >
                    {zh ? '改变方向' : 'Change direction'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      onPausedChange(true)
                      void action('complete')
                    }}
                  >
                    {zh ? '结束排查' : 'Finish'}
                  </Button>
                </div>
              </div>
            )}
            <details>
              <summary>
                {zh ? '终端证据时间线' : 'Terminal evidence timeline'} (
                {snapshot.evidence.observations.length})
              </summary>
              {snapshot.evidence.observations.map((event) => (
                <div key={event.eventId} className="border-t border-border py-2">
                  <p>
                    {new Date(event.startedAt).toLocaleTimeString()} · {event.host ?? '?'} ·{' '}
                    {event.status} {event.exitCode !== undefined ? `exit=${event.exitCode}` : ''}
                  </p>
                  <code>
                    {event.command ??
                      (zh
                        ? '输入未采集（边界不确定或敏感）'
                        : 'Input withheld (uncertain or sensitive)')}
                  </code>
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap">{event.output}</pre>
                </div>
              ))}
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  onAsk(
                    zh
                      ? '请结合当前终端证据分析结果，并给出一个下一步建议。'
                      : 'Analyze current terminal evidence and suggest one next step.'
                  )
                }
              >
                {zh ? '分析结果' : 'Analyze evidence'}
              </Button>
            </details>
          </div>
        </div>
      )}
      <GuidedOpsHistory
        key={chatId}
        conversationId={chatId}
        revision={snapshot?.proposal?.id + ':' + snapshot?.state}
        zh={zh}
      />
    </section>
  )
}
