import { useEffect, useRef, useState } from 'react'
import { ChevronDownIcon, ChevronRightIcon, FolderIcon, PlusIcon } from 'lucide-react'
import type { LocalProject } from '../../../shared/projects'
import type { StoredSessionHistoryItem } from '../../../shared/agent-types'
import type { AgentTerminalTab } from '@renderer/lib/terminal-tabs'
import { Button } from './ui/button'
import { CodeIntelligenceSettings } from './CodeIntelligenceSettings'

export function ProjectSidebar({
  expanded,
  zh,
  activeId,
  projectId,
  busy,
  sessions,
  history,
  onExpand,
  onAttach,
  onNew,
  onSelect,
  onHistory
}: {
  expanded: boolean
  zh: boolean
  activeId: string
  projectId?: string
  busy: boolean
  sessions: AgentTerminalTab[]
  history: StoredSessionHistoryItem[]
  onExpand: () => void
  onAttach: (id: string) => void
  onNew: (id: string) => void
  onSelect: (id: string) => void
  onHistory: (item: StoredSessionHistoryItem) => void
}): React.JSX.Element {
  const [projects, setProjects] = useState<LocalProject[]>([])
  const [opened, setOpened] = useState(projectId ?? '')
  const [ready, setReady] = useState('')
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
    <section aria-label={zh ? '项目' : 'Projects'} className="min-w-0">
      <div className="flex items-center">
        <Button
          variant="ghost"
          className="app-sidebar-action min-w-0 flex-1"
          title={zh ? '项目' : 'Projects'}
          aria-label={zh ? '项目' : 'Projects'}
          onClick={() => {
            onExpand()
            if (!projects.length) void add()
          }}
        >
          <FolderIcon className="size-4 shrink-0" />
          {expanded && <span>{zh ? '项目' : 'Projects'}</span>}
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
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={
                      busy ||
                      ready !== project.id ||
                      (Boolean(projectId) && projectId !== project.id)
                    }
                    onClick={() => onAttach(project.id)}
                  >
                    {projectId === project.id
                      ? zh
                        ? '当前项目'
                        : 'Current project'
                      : zh
                        ? '关联当前对话'
                        : 'Use in this chat'}
                  </Button>
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
                    <Button
                      key={session.id}
                      variant="ghost"
                      className="app-sidebar-action h-7"
                      aria-current={activeId === session.id ? 'page' : undefined}
                      onClick={() => onSelect(session.id)}
                      title={session.title}
                    >
                      <span className="truncate">{session.title}</span>
                    </Button>
                  ))}
                {history
                  .filter(
                    (item) =>
                      item.projectId === project.id &&
                      !sessions.some((session) => session.id === item.tabId)
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
                    <CodeIntelligenceSettings key={project.id} root={project.root} zh={zh} />
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
