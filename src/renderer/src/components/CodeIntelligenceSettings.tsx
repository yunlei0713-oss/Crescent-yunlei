import { useEffect, useState } from 'react'
import { FileIcon, FolderIcon } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import type { CodeIndexSkip, CodeIndexStatus } from '../../../shared/knowledge'
import type { LocalDocumentNode } from '../../../shared/local-documents'

/** Project-scoped inspector; mounting never changes the active conversation's cwd. */
export function CodeIntelligenceSettings({
  root,
  projectId,
  onIndexChange,
  zh
}: {
  root: string
  projectId?: string
  onIndexChange?: () => void
  zh: boolean
}): React.JSX.Element {
  const [status, setStatus] = useState<CodeIndexStatus>()
  const [directory, setDirectory] = useState(root)
  const [nodes, setNodes] = useState<LocalDocumentNode[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState('search')
  const [result, setResult] = useState('')
  const [skips, setSkips] = useState<CodeIndexSkip[]>([])
  const [moreSkips, setMoreSkips] = useState(true)
  useEffect(() => {
    let canceled = false
    void window.api.knowledge
      .codeStatus(root)
      .then((value) => {
        if (!canceled) setStatus(value)
      })
      .catch((e) => {
        if (!canceled) setError(String(e))
      })
    return () => {
      canceled = true
      void window.api.knowledge.codeCancel()
    }
  }, [root])
  useEffect(() => {
    let canceled = false
    void window.api.documents
      .list(directory, projectId)
      .then((value) => {
        if (!canceled) {
          setNodes(value)
          setError('')
        }
      })
      .catch((e) => {
        if (!canceled) {
          setNodes([])
          setError(String(e))
        }
      })
    return () => {
      canceled = true
    }
  }, [directory, projectId])
  async function perform(action: () => Promise<void>): Promise<void> {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="min-w-0 space-y-2 py-2 text-[11px]">
      <p className="break-all text-muted-foreground">
        {directory === root ? '.' : directory.slice(root.length + 1)}
      </p>
      {directory !== root && (
        <Button
          size="xs"
          variant="ghost"
          onClick={() => setDirectory(directory.slice(0, directory.lastIndexOf('/')) || root)}
        >
          ..
        </Button>
      )}
      <div className="max-h-48 overflow-y-auto">
        {nodes.map((node) => (
          <Button
            key={node.path}
            variant="ghost"
            className="h-6 w-full min-w-0 justify-start px-1 text-[11px]"
            title={node.path}
            onClick={() =>
              node.directory
                ? setDirectory(node.path)
                : void perform(async () => {
                    const page = await window.api.documents.read({
                      path: node.path,
                      projectId,
                      limit: 200,
                      requestId: crypto.randomUUID()
                    })
                    setResult(
                      `${node.path}\n${page.lines.map((line) => `${line.line}: ${line.text}`).join('\n')}\n${page.hasMore ? (zh ? '还有更多内容，可让 Agent 按行读取。' : 'More content available; ask the agent to read a range.') : ''}`
                    )
                  })
            }
          >
            {node.directory ? (
              <FolderIcon className="size-3 shrink-0" />
            ) : (
              <FileIcon className="size-3 shrink-0" />
            )}
            <span className="truncate">{node.name}</span>
          </Button>
        ))}
      </div>
      <p>
        {zh ? '文件' : 'Files'} {status?.files ?? 0} · {zh ? '符号' : 'Symbols'}{' '}
        {status?.symbols ?? 0} · {zh ? '跳过' : 'Skipped'} {status?.skipped ?? 0} ·{' '}
        {zh ? '异常' : 'Errors'} {status?.errors ?? 0}
        {status?.limited && (zh ? ' · 达到上限' : ' · Limit reached')}
      </p>
      <p className="text-muted-foreground">
        {status?.updatedAt
          ? new Date(status.updatedAt).toLocaleString()
          : zh
            ? '未索引'
            : 'Not indexed'}
      </p>
      <div className="flex flex-wrap gap-1">
        <Button
          size="xs"
          disabled={busy}
          onClick={() =>
            void perform(async () => {
              const indexing = window.api.knowledge.codeIndex(root)
              try {
                setStatus(await indexing)
                setSkips([])
                setMoreSkips(true)
              } finally {
                onIndexChange?.()
              }
            })
          }
        >
          {zh ? '重新索引' : 'Reindex'}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          disabled={busy}
          onClick={() =>
            void perform(async () => {
              await window.api.knowledge.codeClear(root)
              setStatus(await window.api.knowledge.codeStatus(root))
              setResult('')
              setSkips([])
              setMoreSkips(true)
              onIndexChange?.()
            })
          }
        >
          {zh ? '清除索引' : 'Clear index'}
        </Button>
        {busy && (
          <Button size="xs" variant="ghost" onClick={() => void window.api.knowledge.codeCancel()}>
            {zh ? '取消' : 'Cancel'}
          </Button>
        )}
      </div>
      {Boolean(status?.symbolOnly) && (
        <p>
          {zh ? '仅符号与引用' : 'Symbols and references only'} {status?.symbolOnly}
        </p>
      )}
      {Boolean(status?.skipped) && (
        <details>
          <summary>{zh ? '跳过原因与文件' : 'Skip reasons and files'}</summary>
          <p className="break-words">
            {Object.entries(status?.skipReasons ?? {})
              .map(([reason, count]) => `${reason} ${count}`)
              .join(' · ')}
          </p>
          <ul className="max-h-32 overflow-auto">
            {skips.map((item) => (
              <li className="break-all" key={item.path}>
                <button
                  type="button"
                  className="text-left underline"
                  onClick={() => setResult(item.path)}
                >
                  {item.path}
                </button>
                {' · '}
                {item.reason}
              </li>
            ))}
          </ul>
          {moreSkips && (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  const entries = await window.api.knowledge.codeSkips(root, skips.at(-1)?.path)
                  setSkips([...skips, ...entries])
                  setMoreSkips(entries.length === 40)
                })
              }
            >
              {zh ? '显示更多跳过文件' : 'Show more skipped files'}
            </Button>
          )}
        </details>
      )}
      <form
        className="flex flex-wrap gap-1"
        onSubmit={(event) => {
          event.preventDefault()
          if (busy || !query.trim()) return
          void perform(async () =>
            setResult(
              JSON.stringify(await window.api.knowledge.codeSearch(root, query, mode), null, 2)
            )
          )
        }}
      >
        <Input
          className="h-7 w-full min-w-0 text-xs"
          aria-label={zh ? '项目查询' : 'Project query'}
          placeholder={zh ? '符号、路径或关键词' : 'Symbol, path or keyword'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={200}
        />
        <select
          className="min-w-0 flex-1 rounded border bg-background p-1"
          aria-label={zh ? '查询方式' : 'Query mode'}
          value={mode}
          onChange={(e) => setMode(e.target.value)}
        >
          {[
            ['search', zh ? '代码搜索' : 'Code search'],
            ['symbol', zh ? '符号定义/引用' : 'Symbols'],
            ['dependency', zh ? '依赖追踪' : 'Dependencies'],
            ['impact', zh ? '影响分析' : 'Impact']
          ].map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Button type="submit" size="xs" disabled={busy || !query.trim() || !status?.files}>
          {zh ? '查询' : 'Search'}
        </Button>
      </form>
      {error && (
        <p className="break-words text-destructive" role="alert">
          {error}
        </p>
      )}
      {result && (
        <details open>
          <summary className="cursor-pointer">{zh ? '读取结果' : 'Read result'}</summary>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-[10px]">
            {result}
          </pre>
        </details>
      )}
    </section>
  )
}
