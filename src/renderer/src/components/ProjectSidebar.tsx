import { useEffect, useRef, useState } from 'react'
import { ChevronDownIcon, ChevronRightIcon, FolderIcon, PlusIcon, XIcon } from 'lucide-react'
import type {
  LocalProject,
  ProjectAssociationAction,
  ProjectAssociationState
} from '../../../shared/projects'
import type { StoredSessionHistoryItem } from '../../../shared/agent-types'
import type { AgentTerminalTab } from '@renderer/lib/terminal-tabs'
import { Button } from './ui/button'
import { CodeIntelligenceSettings } from './CodeIntelligenceSettings'

export function ProjectSidebar({
  expanded,
  zh,
  activeId,
  conversationId,
  projectId,
  busy,
  sessions,
  history,
  onExpand,
  onAssociation,
  onNew,
  onSelect,
  onHistory,
  onClose
}: {
  expanded: boolean
  zh: boolean
  activeId: string
  conversationId: string
  projectId?: string
  busy: boolean
  sessions: AgentTerminalTab[]
  history: StoredSessionHistoryItem[]
  onExpand: () => void
  onAssociation: (value: ProjectAssociationState) => void
  onNew: (id: string) => void
  onSelect: (id: string) => void
  onHistory: (item: StoredSessionHistoryItem) => void
  onClose: (id: string) => void
}): React.JSX.Element {
  const [projects, setProjects] = useState<LocalProject[]>([])
  const [opened, setOpened] = useState(projectId ?? '')
  const [ready, setReady] = useState('')
  const [association, setAssociation] = useState<ProjectAssociationState>()
  const [updating, setUpdating] = useState(false)
  const status =
    association &&
    association.conversationId === conversationId &&
    association.projectId === projectId
      ? association
      : undefined
  const directoryLabel = {
    'not-activated': zh ? '目录未激活' : 'Directory inactive',
    authorized: zh ? '目录已授权' : 'Directory authorized',
    stale: zh ? '目录已变化' : 'Directory changed',
    missing: zh ? '目录不可用' : 'Directory missing',
    denied: zh ? '目录访问被拒绝' : 'Directory access denied'
  }
  const indexLabel = {
    'not-indexed': zh ? '未索引' : 'Not indexed',
    indexing: zh ? '索引中' : 'Indexing',
    ready: zh ? '索引就绪' : 'Index ready',
    partial: zh ? '索引部分覆盖' : 'Index partial',
    failed: zh ? '索引失败' : 'Index failed'
  }
  useEffect(() => {
    if (!conversationId) return
    let current = true
    void window.api.projects
      .association(conversationId)
      .then((value) => {
        if (current) setAssociation(value)
      })
      .catch(() => {})
    return () => {
      current = false
    }
  }, [conversationId, projectId, expanded, ready])

  async function associate(
    action: ProjectAssociationAction['action'],
    target?: string
  ): Promise<void> {
    setUpdating(true)
    setError('')
    try {
      const next = await window.api.projects.associate({
        conversationId,
        action,
        projectId: target
      })
      if (!mounted.current) return
      onAssociation(next)
      setAssociation(next)
      if (action === 'rebind') {
        setProjects(await window.api.projects.list())
        setReady(next.directory === 'authorized' ? (next.projectId ?? '') : '')
      }
    } catch (error) {
      if (mounted.current) setError(error instanceof Error ? error.message : String(error))
    } finally {
      if (mounted.current) setUpdating(false)
    }
  }
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    void window.api.projects
      .list()
      .then((items) => {
        if (mounted.current) setProjects(items)
      })
      .catch((e) => {
        if (mounted.current) setError(String(e))
      })
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    if (!opened || !expanded) return
    let canceled = false
    void window.api.projects
      .activate(opened)
      .then(() => {
        if (!canceled) {
          setReady(opened)
          setError('')
        }
      })
      .catch((e) => {
        if (!canceled) setError(String(e))
      })
    return () => {
      canceled = true
    }
  }, [opened, expanded])
  async function add(): Promise<void> {
    setAdding(true)
    try {
      const project = await window.api.projects.open()
      if (!project || !mounted.current) return
      setProjects(await window.api.projects.list())
      setOpened(project.id)
      setReady(project.id)
      setError('')
      onExpand()
    } catch (e) {
      if (mounted.current) setError(String(e))
    } finally {
      if (mounted.current) setAdding(false)
    }
  }
  return (
    <section aria-label={zh ? '项目检索' : 'Project search'} className="min-w-0">
      <div className="flex items-center">
        <Button
          variant="ghost"
          className="app-sidebar-action min-w-0 flex-1"
          title={zh ? '项目检索' : 'Project search'}
          aria-label={zh ? '项目检索' : 'Project search'}
          onClick={() => {
            onExpand()
            if (!projects.length) void add()
          }}
        >
          <FolderIcon className="size-4 shrink-0" />
          {expanded && <span>{zh ? '项目检索' : 'Project search'}</span>}
        </Button>
        {expanded && (
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={adding}
            title={zh ? '打开项目' : 'Open project'}
            aria-label={zh ? '打开项目' : 'Open project'}
            onClick={() => void add()}
          >
            <PlusIcon />
          </Button>
        )}
      </div>
      {expanded && conversationId && (
        <div className="px-1 text-[11px] text-muted-foreground">
          <p className="break-words">
            {projectId
              ? `${zh ? '已关联' : 'Linked'} · ${status?.project?.name ?? projects.find((item) => item.id === projectId)?.name ?? projectId}`
              : zh
                ? '当前对话未关联项目'
                : 'Conversation has no project'}
          </p>
          {projectId && status && (
            <p>
              {directoryLabel[status.directory]} · {indexLabel[status.index]}
            </p>
          )}
          {projectId && (
            <div className="flex flex-wrap gap-1">
              <Button
                size="xs"
                variant="ghost"
                disabled={busy || updating}
                onClick={() => void associate('revalidate')}
              >
                {zh ? '重新验证目录' : 'Revalidate directory'}
              </Button>
              {status &&
                ['stale', 'missing', 'denied'].includes(status.directory) &&
                status.project && (
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={busy || updating}
                    onClick={() => void associate('rebind')}
                  >
                    {zh ? '重新选择目录' : 'Choose directory again'}
                  </Button>
                )}
              <Button
                size="xs"
                variant="ghost"
                disabled={busy || updating}
                onClick={() => void associate('detach')}
              >
                {zh ? '解除关联' : 'Unlink'}
              </Button>
            </div>
          )}
        </div>
      )}
      {expanded &&
        projects.map((project) => (
          <div key={project.id}>
            <Button
              variant="ghost"
              className="app-sidebar-action"
              title={project.root}
              aria-expanded={opened === project.id}
              aria-current={projectId === project.id ? 'true' : undefined}
              onClick={() => {
                setReady('')
                setOpened(opened === project.id ? '' : project.id)
              }}
            >
              {opened === project.id ? (
                <ChevronDownIcon className="size-3 shrink-0" />
              ) : (
                <ChevronRightIcon className="size-3 shrink-0" />
              )}
              <span className="truncate">{project.name}</span>
            </Button>
            {opened === project.id && (
              <div className="ml-2 space-y-1 border-l pl-2">
                <p className="break-all px-1 text-[10px] text-muted-foreground">{project.root}</p>
                <div className="flex flex-wrap gap-1">
                  {projectId === project.id ? (
                    <span className="px-1 py-1 text-[11px] text-muted-foreground">
                      {zh ? '已关联到此项目' : 'Linked to this project'}
                    </span>
                  ) : (
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={busy || updating}
                      onClick={() => void associate(projectId ? 'switch' : 'attach', project.id)}
                    >
                      {projectId
                        ? zh
                          ? '更换项目'
                          : 'Switch project'
                        : zh
                          ? '关联当前对话'
                          : 'Link conversation'}
                    </Button>
                  )}
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={ready !== project.id}
                    onClick={() => onNew(project.id)}
                  >
                    {zh ? '新建对话' : 'New chat'}
                  </Button>
                </div>
                {sessions
                  .filter(
                    (session) =>
                      session.projectId === project.id &&
                      session.agentLog.some((log) => log.kind === 'user')
                  )
                  .map((session) => (
                    <div key={session.conversationId} className="flex min-w-0 items-center">
                      <Button
                        variant="ghost"
                        className="app-sidebar-action h-7 min-w-0 flex-1"
                        aria-current={activeId === session.id ? 'page' : undefined}
                        onClick={() => onSelect(session.id)}
                        title={session.title}
                      >
                        <span className="truncate">{session.title}</span>
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label={
                          zh
                            ? `归档对话：${session.title}`
                            : `Archive conversation: ${session.title}`
                        }
                        title={zh ? '归档对话' : 'Archive conversation'}
                        onClick={() => onClose(session.id)}
                      >
                        <XIcon />
                      </Button>
                    </div>
                  ))}
                {history
                  .filter(
                    (item) =>
                      item.projectId === project.id &&
                      !sessions.some(
                        (session) => session.conversationId === (item.conversationId ?? item.tabId)
                      )
                  )
                  .slice(0, 10)
                  .map((item) => (
                    <Button
                      key={item.tabId}
                      variant="ghost"
                      className="app-sidebar-action h-7"
                      onClick={() => onHistory(item)}
                      title={item.title}
                    >
                      <span className="truncate">{item.title}</span>
                    </Button>
                  ))}
                {ready === project.id && (
                  <details>
                    <summary className="cursor-pointer py-1 text-[11px] text-muted-foreground">
                      {zh ? '文件与索引' : 'Files and index'}
                    </summary>
                    <CodeIntelligenceSettings
                      key={project.root}
                      root={project.root}
                      projectId={project.id}
                      zh={zh}
                      onIndexChange={() =>
                        void window.api.projects
                          .association(conversationId)
                          .then(setAssociation)
                          .catch(() => {})
                      }
                    />
                  </details>
                )}
              </div>
            )}
          </div>
        ))}
      {expanded && error && (
        <p role="alert" className="break-words p-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}
