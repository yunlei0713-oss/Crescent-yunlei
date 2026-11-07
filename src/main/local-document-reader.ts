import { localDocumentError } from './local-document-errors'
import { readPdfText } from './local-pdf-reader'
import { readDocx } from './local-docx-reader'
import { constants } from 'node:fs'
import { open, realpath, lstat, opendir, type FileHandle } from 'node:fs/promises'
import { resolve, relative, isAbsolute, join } from 'node:path'
import { homedir } from 'node:os'
import {
  decodeDocumentCursor,
  documentIdentity,
  documentRootIdentity,
  encodeDocumentCursor
} from './document-cursor'
import { readLocalText } from './local-text-reader'
import {
  PDF_PREVIEW_MAX_BYTES,
  PDF_PREVIEW_RANGE_BYTES,
  type LocalDocumentRequest,
  type LocalDocumentPage,
  type LocalDocumentNode,
  type PdfPreviewSource,
  type PdfPreviewRange
} from '../shared/local-documents'

export function sensitiveDocumentPath(path: string): boolean {
  return /(?:^|[\\/])(?:\.ssh|\.aws|\.gnupg|\.env(?:\.[^\\/]*)?|shadow|credentials(?:\.[^\\/]*)?|id_rsa|id_ed25519)(?:[\\/]|$)|(?:^|[\\/])\.kube[\\/]config$/i.test(
    path
  )
}
function within(root: string, path: string): boolean {
  const rel = relative(root, path)
  return (
    rel === '' ||
    (rel !== '..' && !rel.startsWith('../') && !rel.startsWith('..\\') && !isAbsolute(rel))
  )
}
function systemPath(path: string): string {
  return process.platform === 'darwin' && /^\/(?:var|tmp|etc)(?:\/|$)/.test(path)
    ? '/private' + path
    : path
}
/** All paths are canonicalized against explicitly granted roots. Final symlinks/devices are rejected. */
export class LocalDocumentReader {
  constructor(
    private readonly roots: string[],
    private readonly pinnedRoot?: { path: string; identity: string }
  ) {}
  async resolvePath(path: string, workspace: string): Promise<string> {
    const expanded = path.replace(/^~(?=$|[/\\])/, homedir())
    const primary = resolve(workspace, expanded)
    try {
      return await this.authorize(primary)
    } catch (error) {
      if (isAbsolute(expanded) || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const matches: string[] = []
    for (const root of this.roots) {
      try {
        matches.push(await this.authorize(resolve(root, expanded)))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
    const unique = [...new Set(matches)]
    if (unique.length === 1) return unique[0]
    if (unique.length > 1)
      throw new Error('Ambiguous document path; use the absolute path of the selected directory')
    return this.authorize(primary)
  }
  async authorize(path: string): Promise<string> {
    try {
      return await this.authorizePath(path)
    } catch (error) {
      throw localDocumentError(error)
    }
  }
  private async authorizePath(path: string): Promise<string> {
    if (typeof path !== 'string' || !path || path.length > 4096 || path.includes('\0'))
      throw new Error('Invalid document path')
    if (
      this.pinnedRoot &&
      (await documentRootIdentity(this.pinnedRoot.path)) !== this.pinnedRoot.identity
    )
      throw new Error('Authorized project root changed')
    const absolute = resolve(path)
    if (sensitiveDocumentPath(absolute))
      throw new Error('Sensitive document path is not readable by this tool')
    const stat = await lstat(absolute)
    if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory()))
      throw new Error('Symlinks and special files are not supported')
    const canonical = await realpath(absolute)
    const candidates = await Promise.allSettled(this.roots.map((root) => realpath(root)))
    const roots = candidates.flatMap((candidate, index) =>
      candidate.status === 'fulfilled' && candidate.value === systemPath(resolve(this.roots[index]))
        ? [candidate.value]
        : []
    )
    if (sensitiveDocumentPath(canonical) || !roots.some((root) => within(root, canonical)))
      throw new Error('Document path is outside the authorized roots')
    if (canonical !== systemPath(absolute))
      throw new Error('Symlinks and special files are not supported')
    return canonical
  }
  async list(path: string, signal?: AbortSignal): Promise<LocalDocumentNode[]> {
    try {
      return await this.listDirectory(path, signal)
    } catch (error) {
      throw localDocumentError(error)
    }
  }
  private async listDirectory(path: string, signal?: AbortSignal): Promise<LocalDocumentNode[]> {
    const canonical = await this.authorize(path)
    const directory = await opendir(canonical)
    const nodes: LocalDocumentNode[] = []
    for await (const entry of directory) {
      signal?.throwIfAborted()
      if (nodes.length >= 200) break
      const child = join(canonical, entry.name)
      if (
        entry.isSymbolicLink() ||
        sensitiveDocumentPath(child) ||
        (!entry.isDirectory() && !entry.isFile())
      )
        continue
      nodes.push({ path: child, name: entry.name, directory: entry.isDirectory() })
    }
    return nodes.sort(
      (a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name)
    )
  }
  async openPdfPreview(path: string): Promise<PdfPreviewSource> {
    return this.withPdfPreview(path, async (file, identity, size) => {
      const header = new Uint8Array(Math.min(size, 1024))
      const { bytesRead } = await file.read(header, 0, header.length, 0)
      if (bytesRead !== header.length || !Buffer.from(header).includes('%PDF-'))
        throw new Error('Invalid PDF header')
      const cursor = encodeDocumentCursor(identity, this.pdfPreviewRequest(path), {
        byte: 0,
        line: 1
      })
      return { size, cursor, header }
    })
  }

  async readPdfPreviewRange(input: PdfPreviewRange): Promise<Uint8Array> {
    const { path, begin, end, cursor } = input
    if (
      typeof cursor !== 'string' ||
      !Number.isSafeInteger(begin) ||
      !Number.isSafeInteger(end) ||
      begin < 0 ||
      end <= begin ||
      end - begin > PDF_PREVIEW_RANGE_BYTES
    )
      throw new Error('Invalid PDF preview range')
    return this.withPdfPreview(path, async (file, identity, size) => {
      decodeDocumentCursor(identity, { ...this.pdfPreviewRequest(path), cursor })
      if (end > size) throw new Error('Invalid PDF preview range')
      const data = new Uint8Array(end - begin)
      let offset = 0
      while (offset < data.length) {
        const { bytesRead } = await file.read(data, offset, data.length - offset, begin + offset)
        if (!bytesRead) throw new Error('PDF changed during preview')
        offset += bytesRead
      }
      return data
    })
  }

  private pdfPreviewRequest(path: string): LocalDocumentRequest {
    return { path, operation: 'inspect', query: 'pdf-preview' }
  }

  private async withPdfPreview<T>(
    path: string,
    read: (file: FileHandle, identity: string, size: number) => Promise<T>
  ): Promise<T> {
    const canonical = await this.authorize(path)
    if (!/\.pdf$/i.test(canonical)) throw new Error('Invalid PDF document')
    const file = await open(
      canonical,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
    )
    try {
      const metadata = await file.stat({ bigint: true })
      const size = Number(metadata.size)
      if (!metadata.isFile() || size < 5 || size > PDF_PREVIEW_MAX_BYTES)
        throw new Error('PDF preview limit is 32 MiB')
      const identity = documentIdentity(canonical, metadata)
      const check = async (): Promise<void> => {
        if (
          (await this.authorize(canonical)) !== canonical ||
          documentIdentity(canonical, await lstat(canonical, { bigint: true })) !== identity ||
          documentIdentity(canonical, await file.stat({ bigint: true })) !== identity
        )
          throw new Error('PDF changed during preview')
      }
      await check()
      const result = await read(file, identity, size)
      await check()
      return result
    } finally {
      await file.close()
    }
  }

  async read(
    input: LocalDocumentRequest,
    signal?: AbortSignal,
    internalOptions?: { rawForIndex: true }
  ): Promise<LocalDocumentPage> {
    try {
      return await this.readText(input, signal, internalOptions)
    } catch (error) {
      throw localDocumentError(error)
    }
  }
  private async readText(
    input: LocalDocumentRequest,
    signal?: AbortSignal,
    internalOptions?: { rawForIndex: true }
  ): Promise<LocalDocumentPage> {
    const path = await this.authorize(input.path)
    const offset = input.offset ?? 1
    const limit = input.limit ?? 200
    if (
      !Number.isSafeInteger(offset) ||
      offset < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 500 ||
      (input.query !== undefined && (typeof input.query !== 'string' || input.query.length > 2048))
    )
      throw new Error('Invalid document range/search')
    if (
      (input.contextLines !== undefined &&
        (!Number.isInteger(input.contextLines) ||
          input.contextLines < 0 ||
          input.contextLines > 3)) ||
      (input.operation !== undefined &&
        !['inspect', 'read_range', 'search', 'tail', 'structure'].includes(input.operation)) ||
      (input.queryMode !== undefined && !['literal', 'regex'].includes(input.queryMode)) ||
      (input.byteOffset !== undefined &&
        (!Number.isSafeInteger(input.byteOffset) || input.byteOffset < 0)) ||
      (input.byteLength !== undefined &&
        (!Number.isSafeInteger(input.byteLength) || input.byteLength < 1))
    )
      throw new Error('Invalid document operation')
    signal?.throwIfAborted()
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    try {
      const stat = await file.stat({ bigint: true })
      if (!stat.isFile()) throw new Error('Document must be a regular file')
      const identity = documentIdentity(path, stat)
      const check = async (): Promise<void> => {
        if (
          (await this.authorize(path)) !== path ||
          documentIdentity(path, await lstat(path, { bigint: true })) !== identity ||
          documentIdentity(path, await file.stat({ bigint: true })) !== identity
        )
          throw new Error('Document changed during reading')
      }
      await check()
      const metadata = { path, identity, size: Number(stat.size), mtime: stat.mtime.toISOString() }
      const result = /\.docx$/i.test(path)
        ? await readDocx(file, metadata, input, signal)
        : /\.pdf$/i.test(path)
          ? await readPdfText(
              file,
              metadata,
              input,
              AbortSignal.any([AbortSignal.timeout(8000), ...(signal ? [signal] : [])])
            )
          : await readLocalText(file, metadata, input, signal, internalOptions?.rawForIndex)
      signal?.throwIfAborted()
      await check()
      return { ...result, ...metadata }
    } finally {
      await file.close()
    }
  }
}
