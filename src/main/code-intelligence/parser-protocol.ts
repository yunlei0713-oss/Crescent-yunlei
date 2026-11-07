import type { CodeReference, CodeSymbol } from '../../shared/knowledge'

export interface ParseIndexFile {
  id: number
  path: string
  text: string
}

export interface ParsedIndexFile {
  symbols: CodeSymbol[]
  references: CodeReference[]
  errors: boolean
}

export interface IndexParser {
  parse(path: string, text: string): Promise<ParsedIndexFile | undefined>
  close(): void
}

export class IndexParserUnavailable extends Error {
  constructor() {
    super('代码解析进程不可用，已保留原有索引')
  }
}
