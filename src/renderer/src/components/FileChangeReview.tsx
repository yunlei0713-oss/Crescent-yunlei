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
      setRequests((all) =>
        all.some((item) => item.id === next.id)
          ? all.map((item) => (item.id === next.id ? next : item))
          : [...all, next]
      )
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
      key={request.id + request.digest}
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
  const [batchConfirmed, setBatchConfirmed] = useState(false)
  const strongChanges = request.changes.filter((change) => change.strongApproval)
  const strongPaths = batchConfirmed ? strongChanges.map((change) => change.path) : []
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
                ? '请审阅以下全部 Diff，然后一次确认本次批次。'
                : 'Review all Diffs, then confirm this entire batch once.'}
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
                  <p className="text-destructive">
                    {zh
                      ? '需批次确认 · 可能修改或删除已有内容'
                      : 'Batch confirmation required · may change or remove existing content'}
                  </p>
                )}
              </section>
            ))}
            {strongChanges.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <p className="font-medium">
                  {zh ? '本次涉及的全部高影响操作' : 'All higher-impact changes in this batch'}
                </p>
                <ul className="space-y-1">
                  {strongChanges.map((change) => (
                    <li key={change.path} className="break-all">
                      {change.operation} · {change.path}
                      {change.destination ? ` → ${change.destination}` : ''}
                    </li>
                  ))}
                </ul>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    disabled={busy || now >= request.expiresAt}
                    checked={batchConfirmed}
                    onChange={(event) => setBatchConfirmed(event.target.checked)}
                  />
                  {zh
                    ? '我已审阅本次全部 Diff，允许执行以上列出的全部变更。'
                    : 'I reviewed every Diff and approve all changes listed in this batch.'}
                </label>
              </div>
            )}
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
        <p role="status" className="px-4 text-xs text-muted-foreground">
          {now >= request.expiresAt
            ? zh
              ? '审批已过期，请重新申请。'
              : 'Review expired; request a new proposal.'
            : strongChanges.length > 0 && !batchConfirmed
              ? zh
                ? '请先勾选批次确认，再批准本次修改。'
                : 'Confirm the batch before approving these changes.'
              : zh
                ? '审批仅适用于当前显示的变更。'
                : 'Approval applies only to the displayed changes.'}
        </p>
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
              (strongChanges.length > 0 && !batchConfirmed)
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
