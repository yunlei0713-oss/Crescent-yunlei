import type { FileHandle } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { redactSensitiveText } from '../shared/secret-redaction'
import { decodeDocumentCursor, encodeDocumentCursor } from './document-cursor'
import {
  LOCAL_DOCUMENT_PAGE_BYTES,
  type LocalDocumentPage,
  type LocalDocumentRequest
} from '../shared/local-documents'

interface ZipEntry {
  path: string
  compressedSize: number
  uncompressedSize: number
  offsetToLocalFileHeader: number
  compressionMethod: number
  flags: number
  stream(): Readable
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const unzipper = require('unzipper') as {
  Open: {
    custom(
      source: { size(): Promise<number>; stream(offset: number, length?: number): Readable },
      options: { tailSize: number }
    ): Promise<{ files: ZipEntry[] }>
  }
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sax = require('sax') as {
  parser(strict: boolean): {
    ondoctype: () => void
    onopentag: (node: { name: string; attributes: Record<string, string> }) => void
    onclosetag: (name: string) => void
    ontext: (value: string) => void
    oncdata: (value: string) => void
    write(value: string): unknown
    close(): void
  }
}
const MAX_ARCHIVE = 128 * 1024 * 1024
const MAX_XML = 32 * 1024 * 1024
const MAX_ENTRIES = 2048
const MAX_RATIO = 250

async function documentEntry(
  file: FileHandle,
  size: number,
  signal?: AbortSignal
): Promise<{ entry: ZipEntry; closeSources: () => void }> {
  if (size < 22 || size > MAX_ARCHIVE)
    throw new Error('Invalid DOCX archive or exceeds 128 MiB limit')
  const tail = Buffer.alloc(Math.min(size, 65557))
  const { bytesRead } = await file.read(tail, 0, tail.length, size - tail.length)
  if (bytesRead !== tail.length) throw new Error('DOCX changed during reading')
  let end = tail.length - 22
  for (; end >= 0; end--) {
    if (
      tail.readUInt32LE(end) === 0x06054b50 &&
      end + 22 + tail.readUInt16LE(end + 20) === tail.length
    )
      break
  }
  if (end < 0) throw new Error('Invalid DOCX central directory')
  const count = tail.readUInt16LE(end + 10)
  const directorySize = tail.readUInt32LE(end + 12)
  const directoryOffset = tail.readUInt32LE(end + 16)
  const eocd = size - tail.length + end
  if (
    tail.readUInt16LE(end + 4) ||
    tail.readUInt16LE(end + 6) ||
    tail.readUInt16LE(end + 8) !== count ||
    count < 1 ||
    count > MAX_ENTRIES ||
    directorySize > 4 * 1024 * 1024 ||
    directoryOffset + directorySize !== eocd
  )
    throw new Error('DOCX central directory exceeds safe limits')
  const directory = Buffer.alloc(directorySize)
  if ((await file.read(directory, 0, directorySize, directoryOffset)).bytesRead !== directorySize)
    throw new Error('DOCX central directory changed during reading')
  let cursor = 0
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > directory.length || directory.readUInt32LE(cursor) !== 0x02014b50)
      throw new Error('Invalid DOCX central directory entry')
    const local = directory.readUInt32LE(cursor + 42)
    const compressed = directory.readUInt32LE(cursor + 20)
    if (local + 30 + compressed > directoryOffset || directory.readUInt16LE(cursor + 34))
      throw new Error('Invalid DOCX local entry range')
    cursor +=
      46 +
      directory.readUInt16LE(cursor + 28) +
      directory.readUInt16LE(cursor + 30) +
      directory.readUInt16LE(cursor + 32)
  }
  if (cursor !== directory.length) throw new Error('Invalid DOCX central directory length')
  signal?.throwIfAborted()
  const sources = new Set<Readable>()
  const closeSources = (): void => {
    for (const source of sources) source.destroy()
  }
  async function* bytes(offset: number, length?: number): AsyncGenerator<Buffer> {
    if (offset === eocd) {
      yield tail.subarray(end)
      return
    }
    if (offset === directoryOffset && length === undefined) {
      yield directory
      return
    }
    const stop = Math.min(directoryOffset, offset + (length ?? directoryOffset))
    while (offset < stop) {
      signal?.throwIfAborted()
      const chunk = Buffer.alloc(Math.min(65536, stop - offset))
      const { bytesRead } = await file.read(chunk, 0, chunk.length, offset)
      if (!bytesRead) throw new Error('DOCX changed during reading')
      offset += bytesRead
      yield chunk.subarray(0, bytesRead)
    }
  }
  const archive = await unzipper.Open.custom(
    {
      size: async () => size,
      stream: (offset, length) => {
        const stream = Readable.from(bytes(offset, length), { objectMode: false })
        // unzipper's internal central directory pipe does not forward every source error.
        stream.on('error', () => {})
        sources.add(stream)
        stream.once('close', () => sources.delete(stream))
        return stream
      }
    },
    { tailSize: size - eocd }
  )
  if (
    archive.files.length !== count ||
    archive.files.some(
      ({ path }) =>
        !path ||
        path.includes('\0') ||
        path.includes('\\') ||
        /^(?:[A-Za-z]:|\/)/.test(path) ||
        path.split('/').includes('..')
    )
  )
    throw new Error('DOCX has invalid entry paths')
  const entries = archive.files.filter((entry) => entry.path === 'word/document.xml')
  const entry = entries[0]
  if (
    entries.length !== 1 ||
    entry.uncompressedSize > MAX_XML ||
    entry.compressedSize < 1 ||
    entry.uncompressedSize / entry.compressedSize > MAX_RATIO ||
    entry.offsetToLocalFileHeader + 30 + entry.compressedSize > directoryOffset ||
    entry.flags & 1 ||
    ![0, 8].includes(entry.compressionMethod)
  )
    throw new Error('Invalid DOCX document XML or unsafe compression ratio/size')
  return { entry, closeSources }
}

export async function readDocx(
  file: FileHandle,
  metadata: { path: string; size: number; identity: string; mtime: string },
  input: LocalDocumentRequest,
  signal?: AbortSignal
): Promise<LocalDocumentPage> {
  if (
    input.byteOffset !== undefined ||
    input.byteLength !== undefined ||
    input.operation === 'tail'
  )
    throw new Error('DOCX supports paragraph ranges, literal search and structure')
  if (input.queryMode === 'regex') throw new Error('DOCX supports literal search')
  const { entry, closeSources } = await documentEntry(file, metadata.size, signal)
  const result: LocalDocumentPage = {
    ...metadata,
    encoding: 'docx',
    lines: [],
    hasMore: false,
    scannedLines: 0
  }
  if (input.operation === 'inspect') {
    closeSources()
    return result
  }
  const offset = decodeDocumentCursor(metadata.identity, input)?.line ?? input.offset ?? 1
  let paragraph = ''
  let inText = false
  let heading = false
  let tableDepth = 0
  let inPrivateKey = false
  let bytes = Buffer.byteLength(JSON.stringify(result)) + 1024
  const parser = sax.parser(true)
  const decoder = new TextDecoder('utf-8', { fatal: true })
  const query = input.query?.toLowerCase()
  const line = (raw: string): void => {
    if (result.hasMore) return
    const index = ++result.scannedLines
    let text: string
    if (inPrivateKey || /-----BEGIN .*PRIVATE KEY-----/.test(raw)) {
      inPrivateKey = !/-----END .*PRIVATE KEY-----/.test(raw)
      text = '[REDACTED PRIVATE KEY]'
    } else text = redactSensitiveText(raw)
    if (
      index < offset ||
      (query && !text.toLowerCase().includes(query)) ||
      (input.operation === 'structure' && !heading && !tableDepth)
    )
      return
    const item = {
      line: index,
      text,
      ...(input.operation === 'structure'
        ? { structure: heading ? ('heading' as const) : ('table' as const) }
        : {})
    }
    const added = Buffer.byteLength(JSON.stringify(item)) + 1
    if (result.lines.length >= (input.limit ?? 200) || bytes + added > LOCAL_DOCUMENT_PAGE_BYTES) {
      result.hasMore = true
      result.truncatedReason = 'output-budget'
      result.nextCursor = encodeDocumentCursor(metadata.identity, input, { byte: 0, line: index })
      return
    }
    bytes += added
    result.lines.push(item)
  }
  const append = (text: string): void => {
    paragraph += text
    const pieces = paragraph.split('\n')
    paragraph = pieces.pop() ?? ''
    for (const piece of pieces) line(piece)
    // Very large paragraphs are split into bounded display rows, including SAX text flushes.
    while (paragraph.length > 6000) {
      let end = 6000
      const char = paragraph.charCodeAt(end - 1)
      if (char >= 0xd800 && char <= 0xdbff) end--
      line(paragraph.slice(0, end))
      paragraph = paragraph.slice(end)
    }
  }
  parser.ondoctype = () => {
    throw new Error('DOCX XML document type is not supported')
  }
  parser.onopentag = ({ name, attributes }) => {
    if (name === 'w:p') heading = false
    if (name === 'w:tbl') tableDepth++
    if (
      name === 'w:outlineLvl' ||
      (name === 'w:pStyle' && /^(?:heading|title)/i.test(attributes['w:val'] ?? ''))
    )
      heading = true
    if (name === 'w:t' || name === 'w:delText') inText = name === 'w:t'
    else if (name === 'w:tab') append('\t')
    else if (name === 'w:br' || name === 'w:cr') append('\n')
  }
  parser.ontext = parser.oncdata = (value) => {
    if (inText) append(value)
  }
  parser.onclosetag = (name) => {
    if (name === 'w:tbl') tableDepth = Math.max(0, tableDepth - 1)
    if (name === 'w:t' || name === 'w:delText') inText = false
    if (name === 'w:p') {
      line(paragraph)
      paragraph = ''
    }
  }
  let total = 0
  const stream = entry.stream()
  const abort = (): void => {
    stream.destroy()
  }
  signal?.addEventListener('abort', abort, { once: true })
  try {
    for await (const chunk of stream) {
      signal?.throwIfAborted()
      total += chunk.length
      if (total > MAX_XML || total > entry.uncompressedSize)
        throw new Error('DOCX document XML exceeds declared size or read limit')
      parser.write(decoder.decode(chunk, { stream: true }))
      if (result.hasMore) return result
    }
    signal?.throwIfAborted()
    if (total !== entry.uncompressedSize) throw new Error('DOCX document XML size mismatch')
    parser.write(decoder.decode())
    parser.close()
    return result
  } finally {
    signal?.removeEventListener('abort', abort)
    stream.destroy()
    closeSources()
  }
}
