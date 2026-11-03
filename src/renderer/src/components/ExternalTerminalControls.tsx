import { terminalClient } from '../clients'
import { SharedTerminalActions } from './SharedTerminalActions'
import { toast } from 'sonner'
import { ExternalLinkIcon } from 'lucide-react'
import { Button } from './ui/button'
import { useTerminalObservation } from '@renderer/hooks/useTerminalObservation'
import type { Dictionary } from '@renderer/i18n'
import type { AgentTerminalTab } from '@renderer/lib/terminal-tabs'

export function ExternalTerminalControls({
  tab,
  t,
  onConnect
}: {
  tab: AgentTerminalTab
  t: Dictionary
  onConnect?: () => void
}): React.JSX.Element {
  const { grant, loading, busy, error, action, open } = useTerminalObservation(tab)
  const zh = t.locale === 'zh-CN'
  const existing = tab.external?.kind === 'existing'
  const windowState = tab.external?.windowState
  const unavailable = !tab.sessionId || (windowState && windowState !== 'attached')
  const statusText =
    windowState === 'window-closed'
      ? zh
        ? '窗口已关闭 · 会话仍在运行 · 可重新打开'
        : 'Window closed · session running · reopen available'
      : windowState === 'status-unknown'
        ? zh
          ? '暂时无法检查 iTerm 状态'
          : 'iTerm status temporarily unknown'
        : windowState === 'reopening'
          ? zh
            ? '正在重新打开终端…'
            : 'Reopening terminal…'
          : !tab.sessionId
            ? zh
              ? '会话已断开 · 观察不可用'
              : 'Disconnected · observation unavailable'
            : loading
              ? zh
                ? '正在读取观察状态…'
                : 'Checking observation…'
              : error
                ? zh
                  ? '观察状态读取失败'
                  : 'Observation status unavailable'
                : grant?.status === 'pending'
                  ? zh
                    ? '已授权 · 登录完成后开始观察'
                    : 'Authorized · observation starts after login'
                  : grant?.status === 'active'
                    ? zh
                      ? 'AI 正在观察'
                      : 'AI observing'
                    : grant?.status === 'paused'
                      ? zh
                        ? '已暂停'
                        : 'Paused'
                      : grant?.status === 'expired'
                        ? zh
                          ? '终端绑定已变化 · 请重新授权'
                          : 'Terminal binding changed · authorize again'
                        : zh
                          ? 'AI 不参与'
                          : 'AI off'
  return (
    <div
      data-active-terminal={tab.id}
      className="shrink-0 border-b bg-background px-2 py-1.5 text-xs text-foreground"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">{zh ? '终端目标' : 'Terminal target'}</span>
        <span
          className="min-w-0 flex-1 truncate text-muted-foreground"
          title={existing ? t.terminal.externalExistingHint : t.terminal.externalSharedHint}
        >
          {tab.connectionId
            ? tab.title
            : existing
              ? t.terminal.externalExisting
              : t.terminal.externalShared}
        </span>
        {existing ? (
          <Button size="xs" variant="outline" onClick={() => void open()} disabled={!tab.sessionId}>
            <ExternalLinkIcon data-icon="inline-start" />
            {t.terminal.externalOpen}
          </Button>
        ) : tab.sessionId ? (
          <SharedTerminalActions
            tabId={tab.id}
            sessionId={tab.sessionId}
            state={windowState}
            zh={zh}
          />
        ) : null}
        <Button
          size="xs"
          variant="ghost"
          disabled={busy || windowState === 'reopening'}
          onClick={() =>
            void terminalClient.detachExternal(tab.id).catch((cause) => toast.error(String(cause)))
          }
        >
          {zh ? '解除关联' : 'Detach'}
        </Button>
        {onConnect && (
          <Button size="xs" variant="ghost" onClick={onConnect}>
            {zh ? '连接其他终端' : 'Connect another terminal'}
          </Button>
        )}
      </div>
      <div className="mt-1 flex items-center gap-2" role="status">
        <span>{statusText}</span>
        {grant?.status !== 'pending' && (
          <Button
            size="xs"
            variant="ghost"
            disabled={busy || loading || Boolean(unavailable)}
            onClick={() => void action(grant?.status === 'active' ? 'pause' : 'authorize')}
          >
            {grant?.status === 'active' ? (zh ? '暂停' : 'Pause') : zh ? '重新授权' : 'Authorize'}
          </Button>
        )}
        {grant && grant.status !== 'expired' && tab.sessionId && (
          <Button size="xs" variant="ghost" disabled={busy} onClick={() => void action('revoke')}>
            {zh ? '撤销观察' : 'Revoke observation'}
          </Button>
        )}
      </div>
      {(error || tab.external?.statusError) && (
        <p role="alert" className="mt-1 break-words text-destructive">
          {error || tab.external?.statusError}
        </p>
      )}
    </div>
  )
}
