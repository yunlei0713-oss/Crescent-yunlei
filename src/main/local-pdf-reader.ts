import type { FileHandle } from 'node:fs/promises'
import { dirname, join, sep } from 'node:path'
import { redactSensitiveText } from '../shared/secret-redaction'
import { decodeDocumentCursor, encodeDocumentCursor } from './document-cursor'
import {
  LOCAL_DOCUMENT_PAGE_BYTES,
  type LocalDocumentPage,
  type LocalDocumentRequest
} from '../shared/local-documents'

const PDF_RANGE_BUDGET = 32 * 1024 * 1024
const PDF_PAGE_BUDGET = 8
const TEXT_SEGMENT = 6_000

export async function readPdfText(
  file: FileHandle,
  metadata: { path: string; size: number; identity: string; mtime: string },
  input: LocalDocumentRequest,
  signal?: AbortSignal
): Promise<LocalDocumentPage> {
  if (input.byteOffset !== undefined || input.byteLength !== undefined)
    throw new Error('PDF is read by page, not byte ranges')
  if (input.queryMode === 'regex') throw new Error('PDF supports literal search')
  const cursor = decodeDocumentCursor(metadata.identity, input)
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const header = Buffer.alloc(Math.min(1024, metadata.size))
  await file.read(header, 0, header.length, 0)
  if (!header.includes('%PDF-')) throw new Error('Invalid PDF header')
  let read = header.length
  let failure: unknown
  let stopped = false
  let rejectRead: (error: unknown) => void = () => {}
  const failed = new Promise<never>((_resolve, reject) => {
    rejectRead = reject
  })
  void failed.catch(() => {})
  const pending = new Set<Promise<void>>()
  class FileRange extends pdfjs.PDFDataRangeTransport {
    requestDataRange(begin: number, end: number): void {
      if (stopped || failure) return
      const operation = (async () => {
        signal?.throwIfAborted()
        const length = end - begin
        if (begin < 0 || end > metadata.size || length <= 0 || (read += length) > PDF_RANGE_BUDGET)
          throw new Error('PDF range exceeds parsing byte budget')
        const chunk = new Uint8Array(length)
        let offset = 0
        while (offset < length) {
          signal?.throwIfAborted()
          const { bytesRead } = await file.read(chunk, offset, length - offset, begin + offset)
          if (!bytesRead) throw new Error('PDF changed during reading')
          offset += bytesRead
        }
        if (!stopped) this.onDataRange(begin, chunk)
      })().catch((error) => {
        if (!stopped && !failure) {
          failure = error
          rejectRead(error)
        }
      })
      pending.add(operation)
      void operation.finally(() => pending.delete(operation))
    }
    abort(): void {
      stopped = true
    }
  }
  const range = new FileRange(metadata.size, Uint8Array.from(header), true)
  const root = dirname(require.resolve('pdfjs-dist/package.json'))
  const task = pdfjs.getDocument({
    range,
    rangeChunkSize: 65536,
    disableAutoFetch: true,
    disableStream: true,
    standardFontDataUrl: join(root, 'standard_fonts') + sep,
    cMapUrl: join(root, 'cmaps') + sep,
    cMapPacked: true,
    useSystemFonts: false,
    stopAtErrors: true
  })
  const abort = (): void => rejectRead(signal?.reason ?? new Error('PDF read canceled'))
  signal?.addEventListener('abort', abort, { once: true })
  const wait = <T>(promise: Promise<T>): Promise<T> => Promise.race([promise, failed])
  const result: LocalDocumentPage = {
    ...metadata,
    encoding: 'pdf',
    lines: [],
    hasMore: false,
    scannedLines: 0,
    textLayer: 'unknown'
  }
  try {
    signal?.throwIfAborted()
    const pdf = await wait(task.promise)
    result.totalPages = pdf.numPages
    if (input.operation === 'inspect' || input.operation === 'structure') return result
    const first =
      cursor?.line ??
      (input.operation === 'tail'
        ? Math.max(1, pdf.numPages - Math.min(PDF_PAGE_BUDGET, input.limit ?? 1) + 1)
        : (input.offset ?? 1))
    const end = Math.min(pdf.numPages + 1, first + Math.min(PDF_PAGE_BUDGET, input.limit ?? 3))
    let bytes = Buffer.byteLength(JSON.stringify(result)) + 1024
    let found = false
    const query = input.query?.toLowerCase()
    const next = (page: number, part = 0): LocalDocumentPage => {
      result.textLayer = found ? 'present' : 'absent'
      result.hasMore = true
      result.truncatedReason = part ? 'output-budget' : 'page-budget'
      result.nextCursor = encodeDocumentCursor(metadata.identity, input, { byte: part, line: page })
      return result
    }
    for (let number = first; number < end; number++) {
      signal?.throwIfAborted()
      const page = await wait(pdf.getPage(number))
      const stream = page.streamTextContent().getReader()
      const skip = number === first ? (cursor?.byte ?? 0) : 0
      let piece = ''
      let part = 0
      let privateKey = false
      const emit = (): boolean => {
        const current = part++
        const content = piece
        piece = ''
        if (content.trim()) found = true
        const containsKey = privateKey || /-----BEGIN [^\n]{0,80}PRIVATE KEY-----/.test(content)
        if (containsKey) {
          privateKey = !/-----END .*PRIVATE KEY-----/s.test(content)
        }
        const text =
          containsKey || /PRIVATE KEY-----/.test(content)
            ? '[REDACTED PRIVATE KEY]'
            : redactSensitiveText(content)
        if (current < skip || !text.trim() || (query && !text.toLowerCase().includes(query)))
          return true
        const row = { line: number, text }
        const size = Buffer.byteLength(JSON.stringify(row)) + 1
        if (bytes + size > LOCAL_DOCUMENT_PAGE_BYTES) return false
        bytes += size
        result.lines.push(row)
        return true
      }
      try {
        for (;;) {
          const item = await wait(stream.read())
          if (item.done) break
          for (const block of item.value.items) {
            if (!('str' in block)) continue
            const text = block.str + (block.hasEOL ? '\n' : ' ')
            for (let i = 0; i < text.length; ) {
              let length = Math.min(TEXT_SEGMENT - piece.length, text.length - i)
              const char = text.charCodeAt(i + length - 1)
              if (length && char >= 0xd800 && char <= 0xdbff && i + length < text.length) length--
              if (length) {
                piece += text.slice(i, i + length)
                i += length
              }
              if (piece.length >= TEXT_SEGMENT - 1 || !length) {
                if (!emit()) return next(number, part - 1)
              }
            }
          }
        }
        if (piece && !emit()) return next(number, part - 1)
        result.scannedLines = number
      } finally {
        void stream.cancel().catch(() => {})
        page.cleanup()
      }
    }
    if (end <= pdf.numPages) return next(end)
    result.textLayer = found ? 'present' : result.scannedLines > 0 ? 'absent' : 'unknown'
    return result
  } finally {
    stopped = true
    signal?.removeEventListener('abort', abort)
    await task.destroy()
    await Promise.allSettled(pending)
  }
}
