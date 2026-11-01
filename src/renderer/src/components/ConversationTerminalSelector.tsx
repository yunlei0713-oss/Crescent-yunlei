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
      aria-label={zh ? '本轮对话的终端' : 'Conversation terminals'}
    >
      {terminals.map((tab) => (
        <Button
          key={tab.id}
          size="xs"
          variant={tab.id === activeId ? 'secondary' : 'ghost'}
          data-conversation-terminal={tab.id}
          aria-pressed={tab.id === activeId}
          title={tab.title}
          onClick={() => onSelect(tab.id)}
        >
          <span className="max-w-48 truncate">{tab.title}</span>
          {!tab.sessionId ? (zh ? ' · 已断开' : ' · disconnected') : null}
        </Button>
      ))}
      <Button size="xs" variant="ghost" onClick={onConnect} data-add-conversation-terminal>
        <PlusIcon data-icon="inline-start" />
        {zh ? '连接其他终端' : 'Connect another terminal'}
      </Button>
    </div>
  )
}
