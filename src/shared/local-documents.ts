export const PDF_PREVIEW_RANGE_BYTES = 64 * 1024
export const PDF_PREVIEW_MAX_BYTES = 32 * 1024 * 1024

export interface PdfPreviewSource {
  size: number
  cursor: string
  header: Uint8Array
}

export interface PdfPreviewRange {
  path: string
  cursor: string
  begin: number
  end: number
}

export type DocumentReadOperation = 'inspect' | 'read_range' | 'search' | 'tail' | 'structure'

export interface LocalDocumentRequest {
  path: string
  operation?: DocumentReadOperation
  offset?: number
  byteOffset?: number
  byteLength?: number
  cursor?: string
  limit?: number
  query?: string
  queryMode?: 'literal' | 'regex'
  contextLines?: number
}

export interface LocalDocumentPage {
  path: string
  encoding: string
  lines: Array<{
    line: number
    text: string
    byteOffset?: number
    continued?: boolean
    structure?: 'heading' | 'table'
    contextBefore?: Array<{ line: number; text: string }>
  }>
  hasMore: boolean
  scannedLines: number
  identity?: string
  size?: number
  mtime?: string
  byteOffset?: number
  /** Relative line numbers when a raw byte range or tail starts away from the beginning. */
  relativeLines?: boolean
  nextCursor?: string
  truncatedReason?: 'output-budget' | 'scan-budget' | 'page-budget' | 'long-line'
  totalPages?: number
  estimatedLines?: number
  textLayer?: 'present' | 'absent' | 'unknown'
}

export interface LocalDocumentNode {
  path: string
  name: string
  directory: boolean
}
export const LOCAL_DOCUMENT_PAGE_BYTES = 50000
