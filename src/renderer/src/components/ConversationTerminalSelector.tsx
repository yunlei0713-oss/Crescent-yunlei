import { PlusIcon } from 'lucide-react'
import { Button } from './ui/button'
import type { AgentTerminalTab } from '@renderer/lib/terminal-tabs'

/** Selection changes the active suggestion target, never the chat or its grants. */
export function ConversationTerminalSelector({
  terminals,
  activeId,
  zh,
  onSelect,
  onConnect
}: {
  terminals: AgentTerminalTab[]
  activeId: string
  zh: boolean
  onSelect: (id: string) => void
  onConnect: () => void
}): React.JSX.Element | null {
  if (!terminals.length) return null
  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-1 border-b px-2 py-1"
      role="group"
      aria-label={zh ? '终端目标' : 'Terminal targets'}
    >
      <span className="text-xs text-muted-foreground">{zh ? '终端目标' : 'Terminal target'}</span>
      {terminals.map((tab) => (
        <Button
          key={tab.id}
          size="xs"
          variant={tab.id === activeId ? 'secondary' : 'ghost'}
          data-conversation-terminal={tab.id}
          aria-pressed={tab.id === activeId}
          title={
            tab.connectionName ??
            (tab.external?.kind === 'existing' ? tab.title : zh ? '本地 iTerm' : 'Local iTerm')
          }
          onClick={() => onSelect(tab.id)}
        >
          <span className="max-w-48 truncate">
            {tab.connectionName ??
              (tab.external?.kind === 'existing'
                ? tab.title.replace(/^iTerm · /, '')
                : zh
                  ? '本地 iTerm'
                  : 'Local iTerm')}
          </span>
          {tab.external?.windowState === 'window-closed'
            ? zh
              ? ' · 窗口已关闭'
              : ' · window closed'
            : !tab.sessionId
              ? zh
                ? ' · 已断开'
                : ' · disconnected'
              : null}
        </Button>
      ))}
      <Button size="xs" variant="ghost" onClick={onConnect} data-add-conversation-terminal>
        <PlusIcon data-icon="inline-start" />
        {zh ? '连接其他终端' : 'Connect another terminal'}
      </Button>
    </div>
  )
}
