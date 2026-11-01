import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { agentClient } from '../clients'
import type { FileChangeRequest } from '../../../shared/file-approval-types'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from './ui/dialog'

/** Reviews are transient; raw file contents are never persisted to chat/audit storage. */
export function FileChangeReview({ locale }: { locale: string }) {
  const [requests, setRequests] = useState<FileChangeRequest[]>([])
  const request = requests[0]
  const zh = locale.startsWith('zh')
  useEffect(() => {
    const stopRequest = agentClient.onFileChangeRequest((next) =>
      setRequests((all) => [...all, next])
    )
    const stopResult = agentClient.onFileChangeResult((result) => {
      setRequests((all) => all.filter((item) => item.id !== result.id))
      if (result.ok)
        toast.success(zh ? '文件变更已写入并校验' : 'File changes applied and verified')
      else
        toast.error(result.error ?? 'File change failed', {
          description: result.touched?.length
            ? `${zh ? '可能已变更，请检查' : 'Possibly changed; inspect'}: ${result.touched.join(', ')}`
            : undefined
        })
    })
    return () => {
      stopRequest()
      stopResult()
    }
  }, [zh])
  if (!request) return null
  return (
    <ReviewDialog
      key={request.id}
      request={request}
      count={requests.length}
      zh={zh}
      dismiss={() => setRequests((all) => all.filter((item) => item.id !== request.id))}
    />
  )
}

function ReviewDialog({
  request,
  count,
  zh,
  dismiss
}: {
  request: FileChangeRequest
  count: number
  zh: boolean
  dismiss: () => void
}) {
  const [strongPaths, setStrongPaths] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!request) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [request])
  async function decide(approved: boolean, revise = false): Promise<void> {
    if (!request || busy) return
    setBusy(true)
    try {
      const result = await agentClient.resolveFileChange({
        id: request.id,
        digest: request.digest,
        approved,
        strongPaths,
        note: revise ? `Revise the proposal: ${note}` : note
      })
      if (!result.ok)
        toast.error(
          zh ? '审批无效或已过期，请重新申请' : 'Review invalid or expired; request a new review'
        )
      dismiss()
    } catch (error) {
      toast.error(String(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open={Boolean(request)}
      onOpenChange={(open) => {
        if (!open) void decide(false)
      }}
    >
      <DialogContent
        className="max-h-[90vh] max-w-4xl bg-card backdrop-blur-none"
        showCloseButton={!busy}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {zh ? '本地文件修改审批' : 'Local file change review'} · {count}
          </DialogTitle>
          <DialogDescription>{request?.reason}</DialogDescription>
        </DialogHeader>
        {request && (
          <div className="min-h-0 space-y-4 overflow-auto px-4 text-xs select-text">
            <p>
              {zh
                ? '风险：现有文件变更需逐项确认。审批仅对以下完整 Diff 生效。'
                : 'Risk: confirm each existing-file change. Approval applies only to the complete Diff below.'}
            </p>
            <p className="text-muted-foreground">
              {zh
                ? '回滚：审批前请复制原始内容作为备份。批量变更遇错即停，可能部分完成。'
                : request.rollback}
            </p>
            <p>
              {zh ? '有效期' : 'Expires'}: {new Date(request.expiresAt).toLocaleTimeString()} ·
              SHA256: <code className="break-all">{request.digest}</code>
            </p>
            {request.changes.map((change) => (
              <section key={change.path} className="space-y-2 border-t border-border pt-3">
                <h3 className="break-all font-semibold">
                  {change.operation} · {change.path}
                  {change.destination ? ` → ${change.destination}` : ''}
                </h3>
                <pre className="overflow-x-auto bg-muted p-3 font-mono whitespace-pre text-foreground">
                  {change.diff}
                </pre>
                <details>
                  <summary>
                    {zh ? '查看完整文件（原始 / 新内容）' : 'Full files (original / proposed)'}
                  </summary>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <pre className="overflow-auto bg-muted p-2 whitespace-pre">
                      {change.before ?? '∅'}
                    </pre>
                    <pre className="overflow-auto bg-muted p-2 whitespace-pre">
                      {change.content ?? (change.destination ? change.before : '∅')}
                    </pre>
                  </div>
                </details>
                {change.strongApproval && (
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={strongPaths.includes(change.path)}
                      onChange={(event) =>
                        setStrongPaths((paths) =>
                          event.target.checked
                            ? [...paths, change.path]
                            : paths.filter((path) => path !== change.path)
                        )
                      }
                    />
                    {zh
                      ? '单独确认此文件的修改 / 覆盖 / 删除 / 移动'
                      : 'Explicitly confirm this file modification / replacement / removal / move'}
                  </label>
                )}
              </section>
            ))}
            <textarea
              aria-label={zh ? '调整意见' : 'Revision feedback'}
              placeholder={zh ? '可填写调整意见' : 'Optional revision feedback'}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={2000}
              className="w-full rounded border border-border bg-background p-2"
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => void decide(false)}>
            {zh ? '拒绝' : 'Reject'}
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => void decide(false, true)}>
            {zh ? '要求调整' : 'Request revision'}
          </Button>
          <Button
            disabled={
              busy ||
              !request ||
              now >= request.expiresAt ||
              request.changes.some(
                (change) => change.strongApproval && !strongPaths.includes(change.path)
              )
            }
            onClick={() => void decide(true)}
          >
            {busy
              ? zh
                ? '正在校验…'
                : 'Verifying…'
              : zh
                ? '批准本次修改'
                : 'Approve these changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
