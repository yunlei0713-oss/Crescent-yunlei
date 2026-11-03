import { constants } from 'node:fs'
import { lstat, open, mkdir, rmdir, unlink, realpath, readdir } from 'node:fs/promises'
import { basename, dirname, resolve, parse } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type {
  FileChangeInput,
  FileChangePreview,
  FileChangeRequest,
  FileChangeDecision,
  FileChangeResult
} from '../../shared/file-approval-types'
import { sensitiveDocumentPath } from '../local-document-reader'
import { auditEvent } from './security-audit'

const MAX_BYTES = 64 * 1024
const hash = (text: string): string => createHash('sha256').update(text).digest('hex')
interface Snapshot {
  identity: string
  content?: string
  directory: boolean
}
interface Pending {
  ownerId: number
  request: FileChangeRequest
  snapshots: Map<string, Snapshot>
  parents: Map<string, string>
  state: 'pending' | 'queued' | 'applying' | 'finished'
  canceled: boolean
  authorize: (path: string) => Promise<string>
  isCurrent: () => boolean
  finish: (result: FileChangeResult) => void
}

/** Reject symlinks at every path component, not just at the leaf. */
async function noSymlinks(path: string): Promise<void> {
  let current = parse(path).root
  for (const segment of path.slice(current.length).split('/').filter(Boolean)) {
    current = resolve(current, segment)
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw new Error('Symbolic links are not writable')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' && current === path) return
      throw error
    }
  }
}
async function snapshot(path: string): Promise<Snapshot> {
  await noSymlinks(path)
  let file
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return { identity: 'absent', directory: false }
    throw error
  }
  try {
    const info = await file.stat()
    if (info.isDirectory())
      return {
        identity: `directory:${info.dev}:${info.ino}:${info.mtimeMs}:${JSON.stringify(await readdir(path))}`,
        directory: true
      }
    if (!info.isFile() || info.nlink !== 1 || info.size > MAX_BYTES)
      throw new Error('Review requires a regular, non-hardlinked UTF-8 file of at most 64 KiB')
    const buffer = Buffer.alloc(MAX_BYTES + 1)
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0)
    if (bytesRead > MAX_BYTES) throw new Error('File grew beyond review limit')
    const content = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, bytesRead))
    if (content.includes('\0')) throw new Error('Binary file changes require manual handling')
    return {
      identity: `${info.dev}:${info.ino}:${info.mode}:${info.mtimeMs}:${hash(content)}`,
      content,
      directory: false
    }
  } finally {
    await file.close()
  }
}
function fullDiff(path: string, before: string, after: string): string {
  return [
    `--- ${path}`,
    `+++ ${path}`,
    `@@ -1,${before.split('\n').length} +1,${after.split('\n').length} @@`,
    ...before.split('\n').map((line) => `-${line}`),
    ...after.split('\n').map((line) => `+${line}`)
  ].join('\n')
}

export class FileChangeApprovalService {
  private pending = new Map<string, Pending>()
  constructor(private queue: <T>(key: string, work: () => Promise<T>) => Promise<T>) {}

  async request(input: {
    ownerId: number
    runId: string
    chatTabId?: string
    cwd: string
    reason: string
    changes: FileChangeInput[]
    authorize: (path: string) => Promise<string>
    isCurrent: () => boolean
    signal?: AbortSignal
    publish: (request: FileChangeRequest) => void
    ttlMs?: number
  }): Promise<FileChangeResult> {
    if (
      !Array.isArray(input.changes) ||
      !input.changes.length ||
      input.changes.length > 16 ||
      !input.reason?.trim()
    )
      throw new Error('Provide a reason and 1–16 exact file changes')
    if (this.pending.size >= 32) throw new Error('Too many pending file reviews')
    const snapshots = new Map<string, Snapshot>()
    const parents = new Map<string, string>()
    const normalize = async (value: string): Promise<string> => {
      if (
        typeof value !== 'string' ||
        !value ||
        value.length > 4096 ||
        value.includes('\0') ||
        value.split(/[\\/]/).includes('..')
      )
        throw new Error('Invalid file path')
      const path = resolve(input.cwd, value)
      if (sensitiveDocumentPath(path)) throw new Error('Sensitive files require manual handling')
      await noSymlinks(path)
      const parent = await input.authorize(dirname(path))
      if (parent !== dirname(path) || (await realpath(parent)) !== parent)
        throw new Error('Parent path changed')
      const parentInfo = await lstat(parent)
      if (!parentInfo.isDirectory()) throw new Error('Parent must be a directory')
      parents.set(parent, `${parentInfo.dev}:${parentInfo.ino}`)
      const normalized = resolve(parent, basename(path))
      if (
        [...snapshots.keys()].some(
          (existing) =>
            existing === normalized ||
            existing.startsWith(normalized + '/') ||
            normalized.startsWith(existing + '/')
        )
      )
        throw new Error('Overlapping changes require separate reviews')
      snapshots.set(normalized, await snapshot(normalized))
      return normalized
    }
    const changes: FileChangePreview[] = []
    for (const raw of input.changes) {
      if (
        !['create', 'update', 'overwrite', 'delete', 'move', 'mkdir', 'rmdir'].includes(
          raw.operation
        )
      )
        throw new Error('Unsupported file operation')
      const path = await normalize(raw.path)
      const before = snapshots.get(path)!
      const absent = before.identity === 'absent'
      if (['create', 'mkdir'].includes(raw.operation) !== absent)
        throw new Error('Operation does not match the current file state')
      if (before.directory !== (raw.operation === 'rmdir') && !absent)
        throw new Error('Operation does not match file type')
      let content = raw.content
      if (['create', 'update', 'overwrite'].includes(raw.operation)) {
        if (
          typeof content !== 'string' ||
          Buffer.byteLength(content) > MAX_BYTES ||
          content.includes('\0')
        )
          throw new Error('Invalid or oversized new content')
      } else content = undefined
      const destination =
        raw.operation === 'move' ? await normalize(raw.destination ?? '') : undefined
      if (destination && snapshots.get(destination)!.identity !== 'absent')
        throw new Error('Move destination must be absent; overwriting needs a separate review')
      changes.push({
        path,
        operation: raw.operation,
        content,
        destination,
        before: before.content,
        beforeHash: hash(before.identity),
        afterHash: hash(content ?? (destination ? (before.content ?? '') : '')),
        diff: fullDiff(
          path,
          before.content ?? '',
          content ?? (destination ? (before.content ?? '') : '')
        ),
        strongApproval: ['update', 'overwrite', 'delete', 'rmdir', 'move'].includes(raw.operation)
      })
    }
    if (Buffer.byteLength(JSON.stringify(changes)) > 512 * 1024)
      throw new Error('Batch exceeds the complete review limit; split it')
    const request: FileChangeRequest = {
      id: randomUUID(),
      runId: input.runId,
      chatTabId: input.chatTabId,
      reason: input.reason.slice(0, 2000),
      changes,
      digest: hash(JSON.stringify(changes)),
      expiresAt: Date.now() + Math.min(input.ttlMs ?? 300000, 300000),
      rollback:
        'The complete original contents are included in this review. Copy them before approval if a persistent backup is needed. Batch changes stop on the first failure and report every applied path.'
    }
    auditEvent({
      sessionId: input.runId,
      actor: 'agent',
      eventType: 'file_change_request',
      summary: `${request.id}: ${changes.length} file(s)`
    })
    return new Promise((resolveResult) => {
      const finish = (result: FileChangeResult): void => {
        if (pending.state === 'finished') return
        pending.state = 'finished'
        clearTimeout(timer)
        input.signal?.removeEventListener('abort', abort)
        this.pending.delete(request.id)
        resolveResult(result)
      }
      const abort = (): void => {
        pending.canceled = true
        if (pending.state === 'pending')
          finish({
            id: request.id,
            ok: false,
            applied: [],
            error: 'File review canceled or expired'
          })
      }
      const timer = setTimeout(abort, Math.max(0, request.expiresAt - Date.now()))
      const pending: Pending = {
        ownerId: input.ownerId,
        request,
        snapshots,
        parents,
        state: 'pending',
        canceled: false,
        authorize: input.authorize,
        isCurrent: input.isCurrent,
        finish
      }
      this.pending.set(request.id, pending)
      input.signal?.addEventListener('abort', abort, { once: true })
      if (input.signal?.aborted || !input.isCurrent()) return abort()
      try {
        input.publish(structuredClone(request))
      } catch {
        abort()
      }
    })
  }

  async decide(ownerId: number, decision: FileChangeDecision): Promise<{ ok: boolean }> {
    const pending = this.pending.get(decision?.id)
    if (
      !pending ||
      pending.state !== 'pending' ||
      pending.ownerId !== ownerId ||
      pending.request.digest !== decision.digest ||
      typeof decision.approved !== 'boolean' ||
      !Array.isArray(decision.strongPaths) ||
      decision.strongPaths.some((path) => typeof path !== 'string') ||
      (decision.note !== undefined && typeof decision.note !== 'string')
    )
      return { ok: false }
    const { request } = pending
    const requiredPaths = new Set(
      request.changes.filter((change) => change.strongApproval).map((change) => change.path)
    )
    const approvedPaths = new Set(decision.strongPaths)
    if (
      decision.approved &&
      (approvedPaths.size !== decision.strongPaths.length ||
        approvedPaths.size !== requiredPaths.size ||
        [...approvedPaths].some((path) => !requiredPaths.has(path)))
    )
      return { ok: false }
    pending.state = 'queued' // Consume BEFORE waiting for the mutation queue; retain lifecycle tracking.
    if (!decision.approved) {
      auditEvent({
        sessionId: request.runId,
        actor: 'user',
        eventType: 'file_change_rejection',
        summary: request.id
      })
      pending.finish({
        id: request.id,
        ok: false,
        applied: [],
        error: `Operator rejected/revise: ${(decision.note ?? '').slice(0, 2000)}`
      })
      return { ok: true }
    }
    const applied: string[] = []
    const touched: string[] = []
    try {
      await this.queue('moxun-file-approval', async () => {
        pending.state = 'applying'
        const check = async (): Promise<void> => {
          if (
            pending.canceled ||
            Date.now() >= request.expiresAt ||
            !pending.isCurrent() ||
            hash(JSON.stringify(request.changes)) !== request.digest
          )
            throw new Error('File approval expired or run changed')
          for (const [path, identity] of pending.parents) {
            await noSymlinks(path)
            const info = await lstat(path)
            if (`${info.dev}:${info.ino}` !== identity || !info.isDirectory())
              throw new Error('Parent directory changed after review')
          }
          for (const [path, before] of pending.snapshots) {
            if (
              resolve(await pending.authorize(dirname(path)), basename(path)) !== path ||
              (await snapshot(path)).identity !== before.identity
            )
              throw new Error('File or path changed after review; request a new approval')
          }
        }
        await check()
        auditEvent({
          sessionId: request.runId,
          actor: 'user',
          eventType: 'file_change_approval',
          summary: request.id
        })
        for (const change of request.changes) {
          await check()
          const path = change.path
          // Record potentially touched paths before the first side effect, including partial writes.
          touched.push(path)
          if (change.destination) touched.push(change.destination)
          if (change.operation === 'mkdir') await mkdir(path, { mode: 0o700 })
          else if (change.operation === 'rmdir') await rmdir(path)
          else if (change.operation === 'delete') await unlink(path)
          else {
            const target = change.destination ?? path
            const create = change.operation === 'create' || change.operation === 'move'
            const file = await open(
              target,
              constants.O_RDWR |
                constants.O_NOFOLLOW |
                (create ? constants.O_CREAT | constants.O_EXCL : 0),
              0o600
            )
            try {
              if (!create) {
                const info = await file.stat()
                if (!info.isFile() || info.nlink !== 1 || info.size > MAX_BYTES)
                  throw new Error('File type changed')
                const old = pending.snapshots.get(path)!
                const current = `${info.dev}:${info.ino}:${info.mode}:${info.mtimeMs}:${hash(await file.readFile('utf8'))}`
                if (current !== old.identity)
                  throw new Error('File changed while opening for write')
              }
              const bytes = Buffer.from(change.content ?? change.before ?? '', 'utf8')
              let written = 0
              while (written < bytes.length) {
                const count = (await file.write(bytes, written, bytes.length - written, written))
                  .bytesWritten
                if (!count) throw new Error('File write made no progress')
                written += count
              }
              await file.truncate(bytes.length)
              await file.sync()
            } finally {
              await file.close()
            }
            if (hash((await snapshot(target)).content ?? '') !== change.afterHash)
              throw new Error('Write verification failed')
            if (change.operation === 'move') {
              if ((await snapshot(path)).identity !== pending.snapshots.get(path)!.identity)
                throw new Error('Move source changed; destination was created but source retained')
              await unlink(path)
            }
          }
          pending.snapshots.delete(path)
          if (change.destination) pending.snapshots.delete(change.destination)
          const actual = await snapshot(path)
          if (
            ['delete', 'move', 'rmdir'].includes(change.operation) &&
            actual.identity !== 'absent'
          )
            throw new Error('Removal verification failed')
          if (change.operation === 'mkdir' && !actual.directory)
            throw new Error('Directory verification failed')
          applied.push(path)
          auditEvent({
            sessionId: request.runId,
            actor: 'system',
            eventType: 'file_change_applied',
            summary: `${request.id}: ${change.operation}`
          })
        }
      })
      pending.finish({ id: request.id, ok: true, applied, touched })
    } catch (error) {
      pending.finish({
        id: request.id,
        ok: false,
        applied,
        touched,
        error: error instanceof Error ? error.message : String(error)
      })
    }
    return { ok: true }
  }
}
