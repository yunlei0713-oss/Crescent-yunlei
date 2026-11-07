import { useEffect, useState } from 'react'
import {
  BookOpenIcon,
  BotIcon,
  BrainIcon,
  FolderOpenIcon,
  HistoryIcon,
  LanguagesIcon,
  MessageSquareIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PlugIcon,
  PlusIcon,
  ServerIcon,
  SettingsIcon,
  SquareTerminalIcon,
  XIcon
} from 'lucide-react'
import type { AgentTerminalTab } from '@renderer/lib/terminal-tabs'
import { terminalClient } from '@renderer/clients'
import { toast } from 'sonner'
import { getSessionDisplayTitle } from '@renderer/lib/terminal-tabs'
import type { StoredSessionHistoryItem } from '../../../shared/agent-types'
import type { Dictionary } from '@renderer/i18n'
import { Button } from './ui/button'
import { ProductLogo } from './ProductLogo'
import { AppUtilityToolbar } from './AppUtilityToolbar'
import { ProjectSidebar } from './ProjectSidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from './ui/dropdown-menu'

const SIDEBAR_KEY = 'moxun.sidebar-expanded'

export function AppSidebar({
  t,
  locale,
  sessions,
  tabs,
  activeId,
  history,
  petVisible,
  onTogglePet,
  onNew,
  onSelect,
  onHistory,
  onOpenHistory,
  onCloseSession,
  onConnections,
  onExternalTerminal,
  onMemory,
  onDocuments,
  onWiki,
  onSettings,
  onSkills,
  onMcp,
  onLanguage,
  conversationId,
  onProjectAssociation,
  onNewProjectChat,
  projectId,
  busy
}: {
  t: Dictionary
  locale: 'zh-CN' | 'en'
  sessions: AgentTerminalTab[]
  tabs: AgentTerminalTab[]
  activeId: string
  history: StoredSessionHistoryItem[]
  petVisible: boolean
  onTogglePet: () => void
  onNew: () => void
  onSelect: (id: string) => void
  onHistory: () => void
  onOpenHistory: (item: StoredSessionHistoryItem) => void
  onCloseSession: (id: string) => void
  onConnections: () => void
  onExternalTerminal: () => void
  onMemory: () => void
  onDocuments: () => void
  onWiki: () => void
  onSettings: () => void
  onSkills: () => void
  onMcp: () => void
  onLanguage: () => void
  projectId?: string
  busy: boolean
  conversationId: string
  onProjectAssociation: (value: import('../../../shared/projects').ProjectAssociationState) => void
  onNewProjectChat: (id: string) => void
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === 'true'
    } catch {
      return false
    }
  })
  const zh = locale === 'zh-CN'
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, String(expanded))
    } catch {
      /* Session choice remains usable. */
    }
  }, [expanded])
  const nav = (Icon: typeof PlusIcon, label: string, action: () => void) => (
    <Button
      type="button"
      variant="ghost"
      className="app-sidebar-action"
      aria-label={label}
      title={label}
      onClick={action}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {expanded && <span className="truncate">{label}</span>}
    </Button>
  )
  return (
    <aside
      className={`app-sidebar ${expanded ? 'is-expanded' : ''}`}
      aria-label={zh ? '工作区导航' : 'Workspace navigation'}
    >
      <div className="app-titlebar-brand flex h-8 shrink-0 items-center">
        <ProductLogo />
      </div>
      <Button
        type="button"
        variant="ghost"
        className="app-sidebar-action"
        aria-label={
          expanded ? (zh ? '收起侧栏' : 'Collapse sidebar') : zh ? '展开侧栏' : 'Expand sidebar'
        }
        title={
          expanded ? (zh ? '收起侧栏' : 'Collapse sidebar') : zh ? '展开侧栏' : 'Expand sidebar'
        }
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <PanelLeftCloseIcon className="size-4" />
        ) : (
          <PanelLeftOpenIcon className="size-4" />
        )}
        {expanded && <span>{zh ? '收起侧栏' : 'Collapse'}</span>}
      </Button>
      {nav(PlusIcon, zh ? '新建对话' : 'New conversation', onNew)}
      {nav(ServerIcon, t.connections.manageConnections, onConnections)}
      {terminalClient?.openManaged &&
        nav(
          SquareTerminalIcon,
          t.locale === 'zh-CN' ? '打开墨巡终端' : 'Open MoXun Terminal',
          () => {
            void terminalClient.openManaged(t.locale).catch((error) => toast.error(String(error)))
          }
        )}
      {conversationId &&
        terminalClient?.openCollaboration &&
        nav(
          SquareTerminalIcon,
          zh ? '打开本地协作终端' : 'Open local collaboration terminal',
          () => {
            void terminalClient
              .openCollaboration(locale, conversationId)
              .catch((error) => toast.error(String(error)))
          }
        )}
      {nav(SquareTerminalIcon, t.terminal.externalConnect, onExternalTerminal)}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="app-sidebar-action"
            aria-label={zh ? '知识与资料' : 'Knowledge and files'}
            title={zh ? '知识与资料' : 'Knowledge and files'}
          >
            <BookOpenIcon className="size-4 shrink-0" />
            {expanded && <span>{zh ? '知识与资料' : 'Knowledge and files'}</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start">
          <DropdownMenuItem onSelect={onMemory}>
            <BrainIcon />
            {zh ? '记忆中心' : 'Memory'}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onWiki}>
            <BookOpenIcon />
            {t.wiki.title}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onDocuments}>
            <FolderOpenIcon />
            {zh ? '本地资料' : 'Local documents'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ProjectSidebar
          expanded={expanded}
          zh={zh}
          activeId={activeId}
          projectId={projectId}
          busy={busy}
          sessions={sessions}
          history={history}
          onExpand={() => setExpanded(true)}
          conversationId={conversationId}
          onAssociation={onProjectAssociation}
          onNew={onNewProjectChat}
          onSelect={onSelect}
          onHistory={onOpenHistory}
          onClose={onCloseSession}
        />
        {nav(HistoryIcon, t.history.title, onHistory)}
        {expanded && (
          <>
            <p className="px-3 pt-4 pb-1 text-[11px] text-muted-foreground">
              {zh ? '最近会话' : 'Recent conversations'}
            </p>
            {sessions
              .filter(
                (session) =>
                  !session.projectId && session.agentLog.some((entry) => entry.kind === 'user')
              )
              .slice(-20)
              .reverse()
              .map((session) => (
                <div key={session.id} className="group flex items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    className="app-sidebar-action min-w-0 flex-1"
                    aria-current={session.id === activeId ? 'page' : undefined}
                    title={getSessionDisplayTitle(session, tabs)}
                    onClick={() => onSelect(session.id)}
                  >
                    <MessageSquareIcon className="size-3.5 shrink-0" />
                    <span className="truncate">{getSessionDisplayTitle(session, tabs)}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    aria-label={`${t.confirm.closeTabsTitle}: ${getSessionDisplayTitle(session, tabs)}`}
                    title={t.confirm.closeTabsTitle}
                    onClick={() => onCloseSession(session.id)}
                  >
                    <XIcon />
                  </Button>
                </div>
              ))}
            {history
              .filter(
                (item) =>
                  !item.projectId &&
                  !sessions.some(
                    (session) => session.conversationId === (item.conversationId ?? item.tabId)
                  )
              )
              .slice(0, 8)
              .map((item) => (
                <Button
                  key={item.tabId}
                  type="button"
                  variant="ghost"
                  className="app-sidebar-action"
                  title={item.title}
                  onClick={() => onOpenHistory(item)}
                >
                  <HistoryIcon className="size-3.5 shrink-0" />
                  <span className="truncate">{item.title}</span>
                </Button>
              ))}
          </>
        )}
      </div>
      <div className="flex flex-col items-start gap-1 px-1">
        <AppUtilityToolbar
          t={t}
          locale={locale}
          petVisible={petVisible}
          onTogglePet={onTogglePet}
        />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            id="settings-trigger"
            type="button"
            variant="ghost"
            className="app-sidebar-action"
            aria-label={t.common.settings}
            title={t.common.settings}
          >
            <SettingsIcon className="size-4 shrink-0" />
            {expanded && <span>{t.common.settings}</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end">
          <DropdownMenuItem onSelect={onSettings}>
            <SettingsIcon />
            {t.settings.title}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onMcp}>
            <PlugIcon />
            {t.settings.mcpServers}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onSkills}>
            <BotIcon />
            {t.settings.skillsManagement}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onLanguage}>
            <LanguagesIcon />
            {t.app.language}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </aside>
  )
}
