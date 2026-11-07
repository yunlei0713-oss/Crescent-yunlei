import { memo, useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react'
import type { AgentLogEntry } from '@renderer/lib/terminal-tabs'
import type { Dictionary } from '@renderer/i18n'
import { conversationTitleText } from '../../../shared/conversation-title'
import { safeParseAgentRunDocument } from '@renderer/lib/agent-run-document'
import { CONVERSATION_JUMP_EVENT } from '@renderer/lib/scroll-follow'

const MARK_WAVE_WIDTHS = [26, 20, 12, 8, 6]

export const ConversationNavigator = memo(function ConversationNavigator({
  entries,
  logRef,
  t
}: {
  entries: AgentLogEntry[]
  logRef: RefObject<HTMLDivElement | null>
  t: Dictionary
}): React.JSX.Element | null {
  const turns = useMemo(() => entries.filter((entry) => entry.kind === 'user'), [entries])
  const railRef = useRef<HTMLElement>(null)
  const previewId = useId()
  const [activeId, setActiveId] = useState<number>()
  const [maxHeight, setMaxHeight] = useState(260)
  const [preview, setPreview] = useState<{ id: number; title: string; body: string; top: number }>()
  const zh = t.locale === 'zh-CN'

  useEffect(() => {
    const log = logRef.current
    if (!log || turns.length < 2) return
    const rows = [...log.querySelectorAll<HTMLElement>('[data-log-kind="user"]')]
    let frame: number | undefined
    const update = (): void => {
      frame = undefined
      setMaxHeight(Math.max(26, Math.min(360, log.clientHeight - 40)))
      const boundary = log.getBoundingClientRect().top + 48
      // Rows are ordered vertically. Find the last turn at or above the viewport.
      let low = 0
      let high = rows.length
      while (low < high) {
        const middle = Math.floor((low + high) / 2)
        if (rows[middle].getBoundingClientRect().top <= boundary) low = middle + 1
        else high = middle
      }
      const id = rows[Math.max(0, low - 1)]?.dataset.agentLogEntry
      setActiveId(id === undefined ? turns[0]?.id : Number(id))
    }
    const schedule = (): void => {
      if (frame === undefined) frame = requestAnimationFrame(update)
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(log)
    if (log.firstElementChild) observer.observe(log.firstElementChild)
    log.addEventListener('scroll', schedule, { passive: true })
    schedule()
    return () => {
      log.removeEventListener('scroll', schedule)
      observer.disconnect()
      if (frame !== undefined) cancelAnimationFrame(frame)
    }
  }, [logRef, turns])

  if (turns.length < 2) return null
  const previewIndex = preview ? turns.findIndex((turn) => turn.id === preview.id) : -1

  function showPreview(entry: AgentLogEntry, button: HTMLButtonElement): void {
    const index = entries.indexOf(entry)
    const following = entries
      .slice(index + 1)
      .find((item) => item.kind === 'assistant' || item.kind === 'user')
    let body = ''
    if (following?.kind === 'assistant') {
      const run = safeParseAgentRunDocument(following.text, t)
      body =
        run?.resultMarkdown ||
        run?.steps.find((step) => step.kind === 'message')?.text ||
        (run ? '' : following.text)
    }
    const railTop = railRef.current?.getBoundingClientRect().top ?? 0
    const viewport = logRef.current?.getBoundingClientRect()
    const requestedTop = button.getBoundingClientRect().top - railTop - 20
    const previewTop = viewport
      ? Math.max(
          viewport.top + 8 - railTop,
          Math.min(requestedTop, viewport.bottom - 160 - railTop)
        )
      : requestedTop
    setPreview({
      id: entry.id,
      title: conversationTitleText(entry.text, zh ? '附件消息' : 'Attachment message').slice(
        0,
        180
      ),
      body: body.replace(/[#*`]/g, '').slice(0, 240),
      top: previewTop
    })
  }

  function jump(id: number): void {
    const log = logRef.current
    const row = log?.querySelector<HTMLElement>(`[data-agent-log-entry="${id}"]`)
    if (!log || !row) return
    log.dispatchEvent(new Event(CONVERSATION_JUMP_EVENT))
    const top =
      row.getBoundingClientRect().top - log.getBoundingClientRect().top + log.scrollTop - 20
    log.scrollTo({ top: Math.max(0, top), behavior: 'instant' })
    setActiveId(id)
    setPreview(undefined)
  }

  return (
    <nav
      ref={railRef}
      className="conversation-navigator"
      aria-label={zh ? '对话定位' : 'Conversation navigation'}
      onMouseLeave={() => setPreview(undefined)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPreview(undefined)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setPreview(undefined)
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')]
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const next =
          event.key === 'ArrowDown'
            ? index + 1
            : event.key === 'ArrowUp'
              ? index - 1
              : event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? buttons.length - 1
                  : undefined
        if (next !== undefined) {
          event.preventDefault()
          buttons[Math.max(0, Math.min(buttons.length - 1, next))]?.focus()
        }
      }}
    >
      <div className="conversation-navigator-marks" style={{ maxHeight }}>
        {turns.map((entry, index) => (
          <button
            key={entry.id}
            type="button"
            className="conversation-navigator-mark"
            aria-label={`${zh ? '跳到第' : 'Go to turn '}${index + 1}${zh ? '轮：' : ': '}${conversationTitleText(entry.text).slice(0, 70)}`}
            aria-current={activeId === entry.id ? 'step' : undefined}
            aria-describedby={preview?.id === entry.id ? previewId : undefined}
            onMouseEnter={(event) => showPreview(entry, event.currentTarget)}
            onFocus={(event) => showPreview(entry, event.currentTarget)}
            onClick={() => jump(entry.id)}
          >
            <span
              aria-hidden="true"
              style={{
                width:
                  previewIndex < 0
                    ? 6
                    : MARK_WAVE_WIDTHS[Math.min(4, Math.abs(index - previewIndex))]
              }}
            />
          </button>
        ))}
      </div>
      {preview && (
        <div
          id={previewId}
          role="tooltip"
          className="conversation-navigator-preview"
          style={{ top: preview.top }}
        >
          <p className="line-clamp-2 font-medium text-foreground">{preview.title}</p>
          {preview.body && (
            <p className="mt-2 line-clamp-3 text-muted-foreground">{preview.body}</p>
          )}
        </div>
      )}
    </nav>
  )
})
