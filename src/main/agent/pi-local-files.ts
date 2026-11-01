import { localDocumentError } from '../local-document-errors'
import { Type } from 'typebox'
import { lstat } from 'node:fs/promises'
import type { PiSdkFacade } from './pi-sdk'
import { getPtyBashExecContext } from './pi-terminal-bash'
import { localDocumentReaderForOwner } from '../local-document-ipc'
import { fileChangeApprovals } from './file-approval-service'
import { safeWebContentsSend } from '../safe-ipc-send'

export function createLocalFileTools(pi: PiSdkFacade, cwd: string, sessionKey: string) {
  const read = pi.defineTool({
    name: 'read',
    label: 'Read local document',
    description:
      'Read/list/search local client files and directories (absolute paths or workspace-relative paths; ~ means the client home) only, independently of the SSH bash target. Authorized workspace/selected roots only; bounded UTF-8/UTF-16 lines with citations. Reject secrets, symlinks and binaries. Never auto-upload an entire large file.',
    parameters: Type.Object({
      path: Type.String({ maxLength: 4096 }),
      offset: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000000 })),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
      query: Type.Optional(Type.String({ maxLength: 200 }))
    }),
    executionMode: 'sequential',
    async execute(_id, params, signal) {
      const context = getPtyBashExecContext(sessionKey)
      if (!context || context.webContents.isDestroyed())
        throw new Error('No active local document scope')
      const reader = await localDocumentReaderForOwner(context.webContents.id, cwd)
      let result
      try {
        const path = await reader.resolvePath(params.path, cwd)
        if ((await lstat(path)).isDirectory()) {
          const entries = await reader.list(path, signal)
          let hasMore = entries.length === 200
          while (Buffer.byteLength(JSON.stringify({ path, entries })) > 45000 && entries.length) {
            entries.pop()
            hasMore = true
          }
          return {
            content: [
              { type: 'text', text: JSON.stringify({ path, entries, limit: 200, hasMore }) }
            ],
            details: { path, directory: true, hasMore }
          }
        }
        result = await reader.read({ ...params, path }, signal)
      } catch (error) {
        throw localDocumentError(error)
      }
      while (Buffer.byteLength(JSON.stringify(result)) > 50000 && result.lines.length) {
        result.lines.pop()
        result.hasMore = true
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        details: { path: result.path, directory: false, hasMore: result.hasMore }
      }
    }
  })
  const request = pi.defineTool({
    name: 'request_file_change',
    label: 'Request exact file review',
    description:
      'Request a one-time human review of complete local UTF-8 file changes (64 KiB/file, 16 files). Main generates the full Diff and verifies approved paths and hashes. No terminal access. Existing-file changes require individual confirmation. Parent directories must exist. Never claim success unless the result confirms it.',
    parameters: Type.Object({
      reason: Type.String({ minLength: 1, maxLength: 2000 }),
      changes: Type.Array(
        Type.Object({
          path: Type.String({ maxLength: 4096 }),
          operation: Type.Union(
            ['create', 'update', 'overwrite', 'delete', 'move', 'mkdir', 'rmdir'].map((value) =>
              Type.Literal(
                value as 'create' | 'update' | 'overwrite' | 'delete' | 'move' | 'mkdir' | 'rmdir'
              )
            )
          ),
          content: Type.Optional(Type.String({ maxLength: 65536 })),
          destination: Type.Optional(Type.String({ maxLength: 4096 }))
        }),
        { minItems: 1, maxItems: 16 }
      )
    }),
    executionMode: 'sequential',
    async execute(_id, params, signal) {
      const context = getPtyBashExecContext(sessionKey)
      if (!context || context.webContents.isDestroyed())
        throw new Error('No active file review scope')
      const reader = await localDocumentReaderForOwner(context.webContents.id, cwd)
      const result = await fileChangeApprovals.request({
        ...params,
        cwd,
        ownerId: context.webContents.id,
        runId: context.runId,
        chatTabId: context.chatTabId,
        authorize: (path) => reader.authorize(path),
        isCurrent: () =>
          getPtyBashExecContext(sessionKey)?.runId === context.runId &&
          !context.webContents.isDestroyed(),
        signal: AbortSignal.any(
          [signal, context.signal].filter((value): value is AbortSignal => Boolean(value))
        ),
        publish: (request) => {
          if (!safeWebContentsSend(context.webContents, 'agent:file-change-request', request))
            throw new Error('File review window is unavailable')
        }
      })
      safeWebContentsSend(context.webContents, 'agent:file-change-result', result)
      return { content: [{ type: 'text', text: JSON.stringify(result) }], details: result }
    }
  })
  return [read, request]
}
