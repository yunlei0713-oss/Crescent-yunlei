import { ChevronDownIcon, UnlinkIcon, SquareIcon } from 'lucide-react'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from './ui/dropdown-menu'

/** Terminal actions are scoped to one terminal, independently of chat archival. */
export function TerminalSessionMenu({
  zh,
  disabled,
  onDetach,
  onEnd
}: {
  zh: boolean
  disabled?: boolean
  onDetach?: () => void
  onEnd?: () => void
}): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="xs" variant="ghost" disabled={disabled}>
          {zh ? '管理终端' : 'Manage terminal'}
          <ChevronDownIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-[calc(100vw-2rem)] w-72">
        {onDetach && (
          <DropdownMenuItem onSelect={onDetach} className="items-start">
            <UnlinkIcon className="mt-0.5" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block">{zh ? '移出此对话' : 'Remove from conversation'}</span>
              <span className="block text-xs text-muted-foreground whitespace-normal">
                {zh
                  ? '停止观察此终端；保留聊天，终端和任务继续运行'
                  : 'Stop observing this terminal. Keep the chat, terminal and tasks running.'}
              </span>
            </span>
          </DropdownMenuItem>
        )}
        {onDetach && onEnd && <DropdownMenuSeparator />}
        {onEnd && (
          <DropdownMenuItem variant="destructive" onSelect={onEnd} className="items-start">
            <SquareIcon className="mt-0.5" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block">{zh ? '终止终端进程…' : 'Terminate terminal process…'}</span>
              <span className="block text-xs text-muted-foreground whitespace-normal">
                {zh
                  ? '终止 Shell 及前台任务，无法恢复；需再次确认'
                  : 'End the shell and foreground tasks permanently. Confirmation required.'}
              </span>
            </span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
