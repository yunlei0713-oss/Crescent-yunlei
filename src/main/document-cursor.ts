import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { lstat } from 'node:fs/promises'
import type { BigIntStats } from 'node:fs'
import type { LocalDocumentRequest } from '../shared/local-documents'

const cursorKey = randomBytes(32)

export async function documentRootIdentity(path: string): Promise<string> {
  const stat = await lstat(path, { bigint: true })
  if (!stat.isDirectory()) throw new Error('Document root is unavailable')
  return JSON.stringify([path, String(stat.dev), String(stat.ino)])
}

export function documentIdentity(path: string, stat: BigIntStats): string {
  return createHash('sha256')
    .update(
      JSON.stringify([path, stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].map(String))
    )
    .digest('hex')
}

export interface DocumentPosition {
  byte: number
  line: number
  part?: boolean
  privateKey?: boolean
  withhold?: boolean
  relative?: boolean
  end?: number
}

function searchIdentity(input: LocalDocumentRequest): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        input.operation ?? 'read_range',
        input.query ?? '',
        input.queryMode ?? 'literal'
      ])
    )
    .digest('hex')
}

export function encodeDocumentCursor(
  identity: string,
  input: LocalDocumentRequest,
  position: DocumentPosition
): string {
  const body = Buffer.from(
    JSON.stringify({ identity, query: searchIdentity(input), position })
  ).toString('base64url')
  return body + '.' + createHmac('sha256', cursorKey).update(body).digest('hex')
}

export function decodeDocumentCursor(
  identity: string,
  input: LocalDocumentRequest
): DocumentPosition | undefined {
  if (input.cursor === undefined) return
  if (
    typeof input.cursor !== 'string' ||
    input.cursor.length > 800 ||
    !/^[\w-]+\.[a-f0-9]{64}$/.test(input.cursor)
  )
    throw new Error('Invalid document cursor')
  const [body, signature] = input.cursor.split('.')
  const expected = createHmac('sha256', cursorKey).update(body).digest()
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex')))
    throw new Error('Invalid document cursor')
  const decoded = JSON.parse(Buffer.from(body, 'base64url').toString()) as {
    identity: string
    query: string
    position: DocumentPosition
  }
  if (decoded.identity !== identity) throw new Error('Document changed; restart the read')
  if (decoded.query !== searchIdentity(input))
    throw new Error('Document cursor does not match this operation/query')
  return decoded.position
}
