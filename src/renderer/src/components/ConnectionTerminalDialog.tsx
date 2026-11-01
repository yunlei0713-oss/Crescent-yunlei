import { ExternalLinkIcon, Loader2Icon } from 'lucide-react'
import type { useConnectionTerminalChoice } from '@renderer/hooks/useConnectionTerminalChoice'
import type { Dictionary } from '@renderer/i18n'
import { Button } from './ui/button'
import { TerminalObservationChoice } from './TerminalObservationChoice'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog'

export function ConnectionTerminalDialog({
  controller,
  target,
  t
}: {
  controller: ReturnType<typeof useConnectionTerminalChoice>
  target: string
  t: Dictionary
}): React.JSX.Element {
  const { connection, connecting, error, cancel, connect } = controller
  return (
    <Dialog open={Boolean(connection)} onOpenChange={(open) => !open && cancel()}>
      <DialogContent className="max-w-md gap-0" data-connection-terminal-dialog>
        <DialogHeader>
          <DialogTitle>{t.connections.connectWithIterm}</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{connection?.name}</span>
            <span className="mt-1 block break-all font-mono">{target}</span>
          </DialogDescription>
        </DialogHeader>
        <TerminalObservationChoice
          value={controller.observationMode}
          onChange={controller.setObservationMode}
          disabled={Boolean(connecting)}
          zh={t.locale === 'zh-CN'}
        />
        <div className="space-y-2 border-y px-4 py-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t.connections.itermTerminalHint}
          </p>
          {connecting === 'iterm' && (
            <p role="status" className="flex items-center gap-2 pt-1 text-xs">
              <Loader2Icon aria-hidden="true" className="size-3 animate-spin" />
              {t.terminal.externalConnecting}
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="whitespace-pre-wrap break-words pt-1 text-xs text-destructive"
            >
              {error}
            </p>
          )}
        </div>
        <DialogFooter className="p-3">
          <Button variant="ghost" onClick={cancel}>
            {t.common.cancel}
          </Button>
          <Button
            type="button"
            data-terminal-mode="iterm"
            disabled={Boolean(connecting)}
            onClick={() => void connect('iterm')}
          >
            <ExternalLinkIcon aria-hidden="true" />
            {t.connections.connectWithIterm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
