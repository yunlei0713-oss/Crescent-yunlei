import { dialog, type WebContents } from 'electron'
import { realpath, stat, lstat } from 'node:fs/promises'
import { rendererIpc } from './ipc-security'
import { LocalDocumentReader, sensitiveDocumentPath } from './local-document-reader'
import type { LocalDocumentRequest, PdfPreviewRange } from '../shared/local-documents'
import { readAgentConfig } from './crescent-store'
import { resolveAgentWorkspaceCwd } from './agent/pi-cwd'
import { resolveProjectForOwner } from './projects'
import { localDocumentError } from './local-document-errors'
const grants = new Map<number, Set<string>>()
const attachmentGrants = new Map<number, Set<string>>()
const pending = new Map<string, AbortController>()

/** Capture the initiating document before any chooser or filesystem await. */
export async function withDocumentOwner<T>(
  owner: WebContents,
  action: (assertCurrent: () => void) => Promise<T>
): Promise<T> {
  let invalidated = owner.isDestroyed()
  const invalidate = (): void => {
    invalidated = true
  }
  const assertCurrent = (): void => {
    if (invalidated || owner.isDestroyed()) throw new Error('Document owner closed or navigated')
  }
  owner.once('destroyed', invalidate)
  owner.once('did-start-navigation', invalidate)
  try {
    assertCurrent()
    const result = await action(assertCurrent)
    assertCurrent()
    return result
  } finally {
    owner.removeListener('destroyed', invalidate)
    owner.removeListener('did-start-navigation', invalidate)
  }
}
export async function localDocumentReaderForOwner(
  ownerId: number,
  workspace?: string,
  attachments: readonly string[] = [],
  projectRootIdentity?: string
): Promise<LocalDocumentReader> {
  const exact = attachmentGrants.get(ownerId)
  const selected = [
    ...(grants.get(ownerId) ?? []),
    ...attachments.filter((path) => exact?.has(path))
  ]
  try {
    return new LocalDocumentReader(
      [workspace ?? resolveAgentWorkspaceCwd(readAgentConfig()), ...selected],
      workspace && projectRootIdentity
        ? { path: workspace, identity: projectRootIdentity }
        : undefined
    )
  } catch (error) {
    // A stale/inaccessible workspace must not revoke the window's selected directories.
    if (selected.length) return new LocalDocumentReader(selected)
    throw localDocumentError(error)
  }
}
export async function grantLocalDocumentPath(
  owner: WebContents,
  requestedPath: string,
  attachment = false
): Promise<void> {
  return withDocumentOwner(owner, async (assertCurrent) => {
    if ((await lstat(requestedPath)).isSymbolicLink())
      throw new Error('Selected document root cannot be a symlink')
    const root = await realpath(requestedPath)
    if (sensitiveDocumentPath(requestedPath) || sensitiveDocumentPath(root))
      throw new Error('Sensitive paths cannot be granted to document tools')
    assertCurrent()
    if (!grants.has(owner.id)) {
      const cleanup = (): void => {
        owner.removeListener('destroyed', cleanup)
        owner.removeListener('did-start-navigation', cleanup)
        grants.delete(owner.id)
        attachmentGrants.delete(owner.id)
        for (const [key, controller] of pending)
          if (key.startsWith(`${owner.id}:`)) {
            controller.abort()
            pending.delete(key)
          }
      }
      owner.once('destroyed', cleanup)
      owner.once('did-start-navigation', cleanup)
      grants.set(owner.id, new Set())
    }
    const grantsForWindow = attachment
      ? (attachmentGrants.get(owner.id) ?? new Set<string>())
      : grants.get(owner.id)!
    if (grantsForWindow.size >= (attachment ? 256 : 64) && !grantsForWindow.has(root))
      throw new Error('Too many document grants; reopen the window to reset')
    grantsForWindow.add(root)
    if (attachment) {
      grantsForWindow.add(requestedPath)
      attachmentGrants.set(owner.id, grantsForWindow)
    }
  })
}
export function registerLocalDocumentIpc(): void {
  rendererIpc.handle('documents:choose-root', async (event) => {
    return withDocumentOwner(event.sender, async (assertCurrent) => {
      const selection = await dialog.showOpenDialog({
        title: '授权本次窗口读取本地目录（内容可经明确插入发送给模型）',
        properties: ['openDirectory']
      })
      if (selection.canceled || !selection.filePaths[0]) return undefined
      assertCurrent()
      const root = await realpath(selection.filePaths[0])
      if (sensitiveDocumentPath(root) || !(await stat(root)).isDirectory())
        throw new Error('Sensitive/invalid document root')
      assertCurrent()
      await grantLocalDocumentPath(event.sender, selection.filePaths[0])
      return root
    })
  })
  rendererIpc.handle('documents:pdf-preview', async (event, path: unknown) => {
    if (typeof path !== 'string') throw new Error('Invalid PDF path')
    return withDocumentOwner(event.sender, async (assertCurrent) => {
      const reader = await localDocumentReaderForOwner(event.sender.id)
      assertCurrent()
      return reader.openPdfPreview(path)
    })
  })
  rendererIpc.handle('documents:pdf-range', async (event, input?: PdfPreviewRange) => {
    if (typeof input?.path !== 'string') throw new Error('Invalid PDF path')
    return withDocumentOwner(event.sender, async (assertCurrent) => {
      const reader = await localDocumentReaderForOwner(event.sender.id)
      assertCurrent()
      return reader.readPdfPreviewRange(input)
    })
  })
  rendererIpc.handle(
    'documents:list',
    async (event, payload?: { path?: string; projectId?: string }) => {
      if (typeof payload?.path !== 'string') throw new Error('Invalid path')
      const reader = payload.projectId
        ? new LocalDocumentReader([
            (await resolveProjectForOwner(event.sender, payload.projectId)).root
          ])
        : await localDocumentReaderForOwner(event.sender.id)
      return reader.list(payload.path)
    }
  )
  rendererIpc.handle(
    'documents:read',
    async (event, payload: LocalDocumentRequest & { requestId: string; projectId?: string }) => {
      if (!payload || !/^[\w-]{1,100}$/.test(payload.requestId))
        throw new Error('Invalid document request')
      const key = `${event.sender.id}:${payload.requestId}`
      if (
        pending.has(key) ||
        [...pending.keys()].filter((item) => item.startsWith(`${event.sender.id}:`)).length >= 4
      )
        throw new Error('Too many document reads')
      const controller = new AbortController()
      pending.set(key, controller)
      const timeout = setTimeout(() => controller.abort(), 10000)
      try {
        return await withDocumentOwner(event.sender, async (assertCurrent) => {
          const reader = payload.projectId
            ? new LocalDocumentReader([
                (await resolveProjectForOwner(event.sender, payload.projectId)).root
              ])
            : await localDocumentReaderForOwner(event.sender.id)
          assertCurrent()
          return reader.read(payload, controller.signal)
        })
      } finally {
        clearTimeout(timeout)
        pending.delete(key)
      }
    }
  )
  rendererIpc.handle('documents:cancel', (event, requestId: unknown) => {
    if (typeof requestId === 'string') pending.get(`${event.sender.id}:${requestId}`)?.abort()
    return { ok: true }
  })
}
