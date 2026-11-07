import type { FileHandle } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { redactSensitiveText } from '../shared/secret-redaction'
import {
  LOCAL_DOCUMENT_PAGE_BYTES,
  type LocalDocumentPage,
  type LocalDocumentRequest
} from '../shared/local-documents'
import {
  decodeDocumentCursor,
  encodeDocumentCursor,
  type DocumentPosition
} from './document-cursor'

const CHUNK = 64 * 1024
const FRAGMENT = 16 * 1024
const MAX_SCAN_BYTES = 256 * 1024 * 1024
const BEGIN_KEY = /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/
const END_KEY = /-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----/
// A random offset may be inside a PEM block whose header lies outside the look-behind.
const PEM_BODY = /^[A-Za-z0-9+/]{24,}={0,2}$/
// eslint-disable-next-line no-control-regex -- reject binary text controls.
const CONTROL = /[\u0000-\u0008\u000e-\u001f]/u

type Encoding = 'utf-8' | 'utf-16le' | 'utf-16be'

function textOf(bytes: Buffer, decoder: TextDecoder): string {
  const value = decoder.decode(bytes)
  if (CONTROL.test(value)) throw new Error('Binary/control data is not a text document')
  return value
}

function safeText(
  original: string,
  key: boolean | undefined,
  withhold: boolean | undefined,
  raw: boolean
): string {
  if (key) return '[REDACTED PRIVATE KEY]'
  if (withhold) return '[Sensitive line withheld]'
  return raw ? original : redactSensitiveText(original)
}

function newline(bytes: Buffer, start: number, encoding: Encoding): number {
  if (encoding === 'utf-8') return bytes.indexOf(10, start)
  const first = encoding === 'utf-16le' ? 10 : 0
  const second = encoding === 'utf-16le' ? 0 : 10
  for (let i = start; i + 1 < bytes.length; i += 2)
    if (bytes[i] === first && bytes[i + 1] === second) return i
  return -1
}

function boundary(bytes: Buffer, end: number, encoding: Encoding): number {
  if (encoding === 'utf-8') {
    while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--
  } else {
    end -= end % 2
    const unit = end >= 2 ? bytes[encoding === 'utf-16le' ? end - 1 : end - 2] : 0
    if (unit >= 0xd8 && unit <= 0xdb) end -= 2
  }
  return end
}

async function prefix(file: FileHandle, from: number, length: number): Promise<Buffer> {
  const bytes = Buffer.alloc(length)
  const { bytesRead } = await file.read(bytes, 0, length, from)
  return bytes.subarray(0, bytesRead)
}

async function randomStart(
  file: FileHandle,
  requested: number,
  size: number,
  first: number,
  encoding: Encoding,
  tailLines?: number
): Promise<DocumentPosition> {
  let start = Math.max(first, Math.min(requested, size))
  if (encoding !== 'utf-8') start += (start - first) % 2
  const ahead = await prefix(file, start, 4)
  if (encoding === 'utf-8') {
    let i = 0
    while (i < ahead.length && (ahead[i] & 0xc0) === 0x80) i++
    start += i
  } else {
    const high = ahead[encoding === 'utf-16le' ? 1 : 0]
    if (high >= 0xdc && high <= 0xdf) start += 2
  }
  const beforeStart = Math.max(first, start - 2 * CHUNK)
  const window = await prefix(file, beforeStart, start - beforeStart)
  const unit = encoding === 'utf-8' ? 1 : 2
  let localStart = window.length
  if (tailLines) {
    const cuts: number[] = []
    let i = -unit
    while ((i = newline(window, i + unit, encoding)) >= 0) {
      if (i + unit === window.length) break
      cuts.push(i + unit)
      if (cuts.length > tailLines) cuts.shift()
    }
    localStart = cuts.length === tailLines ? cuts[0] : 0
    start = beforeStart + localStart
  }
  const marker = (text: string): Buffer => {
    const bytes = Buffer.from(text, encoding === 'utf-8' ? 'utf8' : 'utf16le')
    return encoding === 'utf-16be' ? bytes.swap16() : bytes
  }
  const preceding = window.subarray(0, localStart)
  const startKey = preceding.lastIndexOf(marker('-----BEGIN '))
  const endKey = preceding.lastIndexOf(marker('-----END '))
  const lastPrivate = preceding.lastIndexOf(marker('PRIVATE KEY-----'))
  const startsPrivate = lastPrivate > startKey && lastPrivate - startKey < 96 && startKey > endKey
  const part =
    start > first &&
    (preceding.length < unit ||
      newline(preceding, preceding.length - unit, encoding) !== preceding.length - unit)
  return { byte: start, line: 1, relative: start > first, part, privateKey: startsPrivate }
}

function matcher(input: LocalDocumentRequest): ((text: string) => boolean) | undefined {
  if (input.operation === 'structure') return (line) => /^\s{0,3}#{1,6}\s+\S/.test(line)
  if (!input.query) return
  if (input.queryMode !== 'regex') {
    const term = input.query.toLowerCase()
    return (text) => text.toLowerCase().includes(term)
  }
  // Deliberately support a linear bounded subset. Groups, alternation, backreferences,
  // quantifiers and lookarounds require a different regex engine to guarantee a time bound.
  if (input.query.length > 200 || /[(){}*+?|]|\\[1-9]/.test(input.query))
    throw new Error(
      'Regex supports character classes, escapes and anchors; groups and quantifiers are disabled'
    )
  const re = new RegExp(input.query, 'iu')
  return (text) => re.test(text)
}

// A newline-aligned UTF-8 batch without matches or PEM markers needs no per-line work.
// Fall back to the normal scanner for invalid data, long lines and possible matches.
function countUnmatchedLines(bytes: Buffer, decoder: TextDecoder, term: string): number {
  let text: string
  try {
    text = textOf(bytes, decoder)
  } catch {
    return 0
  }
  if (text.includes('-----') || text.toLowerCase().includes(term)) return 0
  let lines = 0
  let from = 0
  for (let end = text.indexOf('\n'); end !== -1; end = text.indexOf('\n', from)) {
    // Each UTF-16 code unit accounts for at most three UTF-8 bytes.
    if ((end - from) * 3 > FRAGMENT) return 0
    lines++
    from = end + 1
  }
  return lines
}

export async function readLocalText(
  file: FileHandle,
  metadata: { path: string; identity: string; size: number; mtime: string },
  input: LocalDocumentRequest,
  signal?: AbortSignal,
  raw = false
): Promise<LocalDocumentPage> {
  const header = await prefix(file, 0, 4)
  const encoding =
    header[0] === 0xff && header[1] === 0xfe
      ? 'utf-16le'
      : header[0] === 0xfe && header[1] === 0xff
        ? 'utf-16be'
        : 'utf-8'
  const first =
    encoding !== 'utf-8'
      ? 2
      : header[0] === 0xef && header[1] === 0xbb && header[2] === 0xbf
        ? 3
        : 0
  const decoder = new TextDecoder(encoding, { fatal: true, ignoreBOM: true })
  const result: LocalDocumentPage = {
    ...metadata,
    encoding,
    lines: [],
    hasMore: false,
    scannedLines: 0
  }
  const unit = encoding === 'utf-8' ? 1 : 2
  const { size, identity } = metadata
  const limit = input.limit ?? 200
  const offset = input.offset ?? 1
  if (input.operation === 'inspect') {
    const sample = await prefix(file, first, Math.min(8196, size - first))
    const cut =
      sample.length + first < size
        ? boundary(sample, Math.max(0, sample.length - 4), encoding)
        : sample.length
    const text = textOf(sample.subarray(0, cut), decoder)
    const breaks = text.split('\n').length - 1
    if (breaks)
      result.estimatedLines = Math.max(breaks, Math.round((breaks * (size - first)) / cut))
    return result
  }
  const saved = decodeDocumentCursor(identity, input)
  const tail = input.operation === 'tail'
  const start =
    saved ??
    (tail || input.byteOffset !== undefined
      ? await randomStart(
          file,
          tail ? size : input.byteOffset!,
          size,
          first,
          encoding,
          tail ? limit : undefined
        )
      : { byte: first, line: 1 })
  const position = { ...start }
  const end = Math.min(
    size,
    saved?.end ?? (input.byteLength ? start.byte + input.byteLength : size)
  )
  position.end = end
  result.byteOffset = start.byte
  result.relativeLines = start.relative || undefined
  const matches = matcher(input)
  const batchTerm =
    encoding === 'utf-8' &&
    input.operation === 'search' &&
    input.queryMode !== 'regex' &&
    !input.contextLines &&
    !start.relative &&
    end === size
      ? input.query?.toLowerCase()
      : undefined
  const deadline = performance.now() + 4500
  let bytes = Buffer.byteLength(JSON.stringify(result)) + 1024
  const window = Buffer.alloc(CHUNK + FRAGMENT + 4)
  let buffered = 0
  const context: Array<{ line: number; text: string }> = []
  let positionRead = start.byte
  let previous = ''
  const finish = (reason?: LocalDocumentPage['truncatedReason']): LocalDocumentPage => {
    if (reason && position.byte < end) {
      result.hasMore = true
      result.truncatedReason = reason
      result.nextCursor = encodeDocumentCursor(identity, input, position)
    }
    return result
  }
  while (positionRead < end || buffered) {
    signal?.throwIfAborted()
    if (positionRead < end) {
      const { bytesRead } = await file.read(
        window,
        buffered,
        Math.min(CHUNK, size - positionRead),
        positionRead
      )
      if (!bytesRead) throw new Error('Document changed while reading')
      positionRead += bytesRead
      buffered += bytesRead
    }
    const pending = window.subarray(0, buffered)
    let at = 0
    if (batchTerm && !position.part && !position.privateKey) {
      const batchEnd = pending.lastIndexOf(10) + 1
      if (batchEnd) {
        const skipped = countUnmatchedLines(pending.subarray(0, batchEnd), decoder, batchTerm)
        if (skipped) {
          position.line += skipped
          result.scannedLines = position.line - 1
          position.byte += batchEnd
          at = batchEnd
        }
      }
    }
    while (at < pending.length && position.byte < end) {
      const nl = newline(pending, at, encoding)
      const available = (nl < 0 ? pending.length : nl) - at
      const budget = Math.min(FRAGMENT, end - position.byte)
      const fragment = available > budget
      if (nl < 0 && !fragment && positionRead < size && positionRead < end) break
      const cut = fragment ? at + boundary(pending.subarray(at), budget, encoding) : at + available
      if (cut === at && fragment) return result
      const completeLine = !fragment && (nl >= 0 || positionRead >= size)
      const next = cut + (completeLine && nl >= 0 ? unit : 0)
      const original = textOf(pending.subarray(at, cut), decoder).replace(/\r$/, '')
      const beginKey = !raw && BEGIN_KEY.test(previous + original)
      const endKey = !raw && END_KEY.test(previous + original)
      const key =
        !raw &&
        (position.privateKey || beginKey || (start.relative && PEM_BODY.test(original.trim())))
      const redact =
        !raw &&
        (position.withhold ||
          ((fragment || position.part) &&
            /(?:pass(?:word|phrase)?|token|secret|api[_-]?key|authorization|credential|private key)/i.test(
              original
            )))
      if (
        position.line >= offset &&
        (!matches ||
          (!key &&
            !redact &&
            (matches(original) || (position.part && previous && matches(previous + original)))))
      ) {
        const line = {
          line: position.line,
          text: safeText(original, key, redact, raw),
          ...(context.length ? { contextBefore: [...context] } : {}),
          ...(fragment || position.part || start.relative
            ? { byteOffset: position.byte, continued: fragment || undefined }
            : {})
        }
        const added = Buffer.byteLength(JSON.stringify(line)) + 1
        if (result.lines.length >= limit || bytes + added > LOCAL_DOCUMENT_PAGE_BYTES)
          return finish(position.part ? 'long-line' : 'output-budget')
        result.lines.push(line)
        bytes += added
      }
      if (matches && input.contextLines && completeLine) {
        context.push({
          line: position.line,
          text: safeText(original, key, redact, raw).slice(0, 240)
        })
        if (context.length > input.contextLines) context.shift()
      }
      result.scannedLines = position.line
      position.byte += next - at
      position.privateKey = !endKey && (position.privateKey || beginKey)
      position.part = !completeLine
      position.withhold = !completeLine && redact
      if (completeLine) {
        position.line++
        previous = ''
      } else previous = original.slice(-Math.max(128, input.query?.length ?? 0))
      at = next
      if (result.lines.length >= limit && position.byte < end)
        return finish(fragment ? 'long-line' : 'output-budget')
    }
    window.copyWithin(0, at, buffered)
    buffered -= at
    if (position.byte >= end || (positionRead >= size && !buffered)) break
    if (performance.now() >= deadline || position.byte - start.byte >= MAX_SCAN_BYTES)
      return finish('scan-budget')
  }
  if (tail && start.relative && result.lines.length < limit && !result.truncatedReason)
    result.truncatedReason = 'scan-budget'
  return result
}
