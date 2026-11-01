import { Loader2Icon, RefreshCwIcon, SquareTerminalIcon } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import type { Dictionary } from '@renderer/i18n'
import type { useExternalTerminals } from '@renderer/hooks/useExternalTerminals'
import { TerminalObservationChoice } from './TerminalObservationChoice'

export function ExternalTerminalDialog({
  controller,
  t
}: {
  controller: ReturnType<typeof useExternalTerminals>
  t: Dictionary
}): React.JSX.Element {
  const { open, setOpen, sessions, loading, connecting, error, refresh, connect } = controller
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl gap-0">
        <DialogHeader>
          <DialogTitle>{t.terminal.externalConnect} · iTerm</DialogTitle>
          <DialogDescription>{t.terminal.externalDescription}</DialogDescription>
        </DialogHeader>
        <label className="flex items-center gap-2 px-4 pt-3 text-xs">
          {t.locale === 'zh-CN' ? '连接到' : 'Attach to'}
          <select
            className="rounded border bg-background px-2 py-1 focus-visible:outline-ring"
            aria-label={t.locale === 'zh-CN' ? '终端所属对话' : 'Terminal conversation'}
            value={controller.conversationScope}
            disabled={connecting}
            onChange={(event) =>
              controller.setConversationScope(event.target.value as 'current' | 'new')
            }
          >
            <option value="current">
              {t.locale === 'zh-CN'
                ? '当前对话（保留上下文）'
                : 'Current conversation (keep context)'}
            </option>
            <option value="new">{t.locale === 'zh-CN' ? '新建对话' : 'New conversation'}</option>
          </select>
        </label>
        <TerminalObservationChoice
          value={controller.observationMode}
          onChange={controller.setObservationMode}
          disabled={connecting}
          zh={t.locale === 'zh-CN'}
        />
        <div className="space-y-2 border-y px-4 py-3">
          <Button data-new-local-iterm disabled={connecting} onClick={() => void connect('shared')}>
            <SquareTerminalIcon data-icon="inline-start" />
            {t.terminal.externalShared}
          </Button>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t.terminal.externalSharedHint}
          </p>
        </div>
        <div className="flex items-center justify-between gap-2 px-4 py-2">
          <span className="text-xs font-medium">{t.terminal.externalExisting}</span>
          <Button
            variant="ghost"
            size="sm"
            disabled={loading || connecting}
            onClick={() => void refresh()}
          >
            <RefreshCwIcon className={loading ? 'animate-spin' : ''} data-icon="inline-start" />
            {t.terminal.externalRefresh}
          </Button>
        </div>
        <div className="max-h-64 overflow-y-auto px-4 pb-3">
          {sessions.map((session) => (
            <button
              key={session.id}
              data-iterm-session-id={session.id}
              type="button"
              disabled={connecting}
              className="app-list-row mb-1 flex w-full items-center gap-2 rounded border px-3 py-2 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              onClick={() => void connect('existing', session)}
            >
              <SquareTerminalIcon className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{session.name || 'iTerm'}</span>
              <span className="shrink-0 text-muted-foreground">
                {session.window}:{session.tab}:{session.pane} · {session.columns}×{session.rows}
              </span>
            </button>
          ))}
          {!loading && !sessions.length && (
            <p className="py-2 text-xs text-muted-foreground">{t.terminal.externalEmpty}</p>
          )}
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {t.terminal.externalExistingHint}
          </p>
          {connecting && (
            <p role="status" className="mt-3 flex items-center gap-2 text-xs">
              <Loader2Icon className="size-3 animate-spin" />
              {t.terminal.externalConnecting}
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="mt-3 whitespace-pre-wrap break-words text-xs text-destructive"
            >
              {error}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
