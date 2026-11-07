import { createHash, randomUUID } from 'node:crypto'
import { setTimeout as delayFor } from 'node:timers/promises'
import { lstat, opendir, realpath } from 'node:fs/promises'
import { join, relative, dirname, resolve, posix } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { openKnowledgeDatabase } from '../knowledge-database'
import { documentRootIdentity } from '../document-cursor'
import { LocalDocumentReader, sensitiveDocumentPath } from '../local-document-reader'
import { codeLanguage } from './language'
import { IndexParserUnavailable, type IndexParser } from './parser-protocol'
import type {
  CodeIndexStatus,
  CodeHit,
  CodeSymbol,
  CodeReference,
  CodeSkipReason,
  CodeIndexSkip
} from '../../shared/knowledge'
import { redactSensitiveText } from '../../shared/secret-redaction'

function redactedSource(text: string): string {
  let privateKey = false
  return text
    .split('\n')
    .map((line) => {
      if (privateKey || /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/.test(line)) {
        privateKey = !/-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----/.test(line)
        return '[REDACTED PRIVATE KEY]'
      }
      return redactSensitiveText(line)
    })
    .join('\n')
}

const FULL_FILE_BYTES = 512 * 1024
const SYMBOL_FILE_BYTES = 1024 * 1024
const PROJECT_BYTES = 32 * 1024 * 1024
const PROJECT_FILES = 2000
const DIRECTORY_ENTRIES = 20000
const FILE_LINES = 10000
const RSS_HEADROOM = 256 * 1024 * 1024
const CACHE_VERSION = 'ast-v3'

const ignored = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  'build',
  'coverage',
  '.venv',
  'venv',
  '__pycache__',
  '.cache'
])
let singleton: CodeIntelligenceService | undefined
export function codeIntelligence(): CodeIntelligenceService {
  return (singleton ??= new CodeIntelligenceService())
}
export class CodeIntelligenceService {
  private db: DatabaseSync
  private jobs = new Map<string, Promise<CodeIndexStatus>>()
  constructor() {
    this.db = openKnowledgeDatabase('code_index.db')
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS files(root TEXT, path TEXT, language TEXT, hash TEXT, content TEXT, symbols TEXT, refs TEXT, updated_at TEXT, PRIMARY KEY(root,path));
      CREATE TABLE IF NOT EXISTS index_metadata(root TEXT PRIMARY KEY, value TEXT NOT NULL);`)
    const columns = new Set(
      this.db
        .prepare('PRAGMA table_info(files)')
        .all()
        .map((row) => row.name)
    )
    for (const [name, type] of [
      ['parse_error', 'INTEGER NOT NULL DEFAULT 0'],
      ['identity', 'TEXT'],
      ['tier', 'TEXT'],
      ['cost', 'INTEGER NOT NULL DEFAULT 0'],
      ['symbol_count', 'INTEGER NOT NULL DEFAULT 0']
    ])
      if (!columns.has(name)) this.db.exec(`ALTER TABLE files ADD COLUMN ${name} ${type}`)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS index_skips(root TEXT,path TEXT,reason TEXT,size INTEGER,PRIMARY KEY(root,path));
      CREATE TEMP TABLE staged_files AS SELECT * FROM files WHERE 0;
      CREATE INDEX temp.staged_root ON staged_files(root,path);
      CREATE TEMP TABLE staged_skips(root TEXT,path TEXT,reason TEXT,size INTEGER,PRIMARY KEY(root,path));
      CREATE TEMP TABLE seen_files(root TEXT,path TEXT,PRIMARY KEY(root,path));
    `)
  }
  status(root: string): CodeIndexStatus {
    const row = this.db.prepare('SELECT value FROM index_metadata WHERE root=?').get(root)
    const stored = row ? JSON.parse(String(row.value)) : {}
    const count = this.db.prepare('SELECT COUNT(*) AS count FROM files WHERE root=?').get(root)
    return {
      root,
      files: Number(count?.count ?? 0),
      symbols: 0,
      skipped: 0,
      errors: 0,
      limited: false,
      ...stored,
      indexing: this.jobs.has(root)
    }
  }
  async index(root: string, signal?: AbortSignal): Promise<CodeIndexStatus> {
    root = await realpath(root)
    if (this.jobs.has(root)) throw new Error('此目录正在索引，请稍后重试')
    if (this.jobs.size >= 1) throw new Error('索引任务繁忙，请稍后重试')
    const job = this.scan(root, signal)
      .catch((error: unknown) => {
        if (!signal?.aborted)
          this.saveStatus(root, { ...this.status(root), indexing: false, failed: true })
        throw error
      })
      .finally(() => this.jobs.delete(root))
    this.jobs.set(root, job)
    return job
  }

  skipped(root: string, after: string): CodeIndexSkip[] {
    if (typeof after !== 'string' || after.length > 4096) throw new Error('Invalid index cursor')
    return this.db
      .prepare(
        'SELECT path,reason,size FROM index_skips WHERE root=? AND path>? ORDER BY path LIMIT 40'
      )
      .all(root, after) as unknown as CodeIndexSkip[]
  }

  private saveStatus(root: string, status: CodeIndexStatus): void {
    this.db
      .prepare(
        'INSERT INTO index_metadata VALUES(?,?) ON CONFLICT(root) DO UPDATE SET value=excluded.value'
      )
      .run(root, JSON.stringify(status))
  }

  private async scan(root: string, signal?: AbortSignal): Promise<CodeIndexStatus> {
    const reader = new LocalDocumentReader([root], {
      path: root,
      identity: await documentRootIdentity(root)
    })
    await reader.authorize(root)
    const job = randomUUID()
    const started = performance.now()
    const now = new Date().toISOString()
    const status: CodeIndexStatus = {
      root,
      files: 0,
      symbols: 0,
      updatedAt: now,
      indexing: false,
      skipped: 0,
      errors: 0,
      limited: false,
      skipReasons: {},
      symbolOnly: 0,
      reused: 0,
      parsed: 0
    }
    let bytes = 0
    let visited = 0
    let memoryLimited = false
    let parser: IndexParser | undefined
    const getParser = async (): Promise<IndexParser> => {
      if (!parser) {
        try {
          if (process.versions.electron) {
            const { openIndexParser } = await import('./utility-parser')
            parser = openIndexParser(signal)
          } else {
            const { parseCode } = await import('./parser')
            parser = {
              parse: (path, text) => parseCode(path, text).catch(() => undefined),
              close: () => {}
            }
          }
        } catch {
          signal?.throwIfAborted()
          throw new IndexParserUnavailable()
        }
      }
      return parser
    }
    const baselineRss = process.memoryUsage.rss()
    async function yieldForMemory(): Promise<void> {
      if (process.memoryUsage.rss() - baselineRss <= RSS_HEADROOM) {
        await new Promise<void>((done) => setImmediate(done))
        return
      }
      // macOS can hold reclaimed native WASM/SQLite pages briefly after a batch.
      // Wait off the Main event loop before reducing the coverage of this scan.
      for (const delay of [150, 350, 650]) {
        await delayFor(delay, undefined, { signal })
        if (process.memoryUsage.rss() - baselineRss <= RSS_HEADROOM) return
      }
      memoryLimited = true
      status.limited = true
    }
    const oldFile = this.db.prepare(
      'SELECT identity,tier,cost,symbol_count,parse_error FROM files WHERE root=? AND path=?'
    )
    const seen = this.db.prepare('INSERT OR IGNORE INTO seen_files VALUES(?,?)')
    const stage = this.db.prepare(
      `INSERT INTO staged_files(root,path,language,hash,content,symbols,refs,updated_at,parse_error,identity,tier,cost,symbol_count)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    const stageSkip = this.db.prepare('INSERT OR IGNORE INTO staged_skips VALUES(?,?,?,?)')
    const skip = (path: string, reason: CodeSkipReason, size?: number): void => {
      if (stageSkip.run(job, path, reason, size ?? null).changes) {
        status.skipped++
        status.skipReasons![reason] = (status.skipReasons![reason] ?? 0) + 1
      }
    }

    const indexFile = async (absolute: string, path: string, language: string): Promise<void> => {
      try {
        await reader.authorize(absolute)
        const metadata = await lstat(absolute, { bigint: true })
        const size = Number(metadata.size)
        if (!metadata.isFile()) return skip(path, 'unreadable')
        if (size > SYMBOL_FILE_BYTES) return skip(path, 'file-too-large', size)
        const tier = size <= FULL_FILE_BYTES ? 'full' : 'symbols'
        const identity = [
          CACHE_VERSION,
          metadata.dev,
          metadata.ino,
          metadata.size,
          metadata.mtimeNs,
          metadata.ctimeNs
        ].join(':')
        const old = oldFile.get(root, path)
        if (old?.identity === identity && old.tier === tier) {
          const cost = Number(old.cost)
          if (bytes + cost > PROJECT_BYTES) return skip(path, 'global-budget', size)
          seen.run(job, path)
          bytes += cost
          status.reused!++
          status.files++
          status.symbols += Number(old.symbol_count)
          if (old.parse_error === 1) {
            status.errors++
            skip(path, 'parse-error', size)
          }
          if (tier === 'symbols') status.symbolOnly!++
          return
        }

        if (memoryLimited) return skip(path, 'global-budget', size)
        const parts: string[] = []
        let cursor: string | undefined
        let lines = 0
        do {
          const page = await reader.read({ path: absolute, cursor, limit: 500 }, signal, {
            rawForIndex: true
          })
          if (page.lines.some((item) => item.byteOffset !== undefined))
            return skip(path, 'line-budget', size)
          lines += page.lines.length
          if (lines > FILE_LINES) return skip(path, 'line-budget', size)
          parts.push(page.lines.map((item) => item.text).join('\n'))
          cursor = page.nextCursor
        } while (cursor)
        const check = await lstat(absolute, { bigint: true })
        if (
          identity !==
          [CACHE_VERSION, check.dev, check.ino, check.size, check.mtimeNs, check.ctimeNs].join(':')
        )
          return skip(path, 'unreadable', size)

        const raw = parts.join('\n')
        const hash = CACHE_VERSION + ':' + createHash('sha256').update(raw).digest('hex')
        const parsed = await (await getParser()).parse(path, raw)
        if (!parsed) {
          status.errors++
          return skip(path, 'parse-error', size)
        }
        status.parsed!++
        if (parsed.errors) {
          status.errors++
          skip(path, 'parse-error', size)
        }
        const content = tier === 'full' ? redactedSource(raw) : ''
        const symbols = JSON.stringify(parsed.symbols)
        const refs = JSON.stringify(parsed.references)
        const cost =
          Buffer.byteLength(content) + Buffer.byteLength(symbols) + Buffer.byteLength(refs)
        if (bytes + cost > PROJECT_BYTES) {
          status.limited = true
          if (!parsed.errors) skip(path, 'global-budget', size)
          return
        }
        stage.run(
          job,
          path,
          language,
          hash,
          content,
          symbols,
          refs,
          now,
          Number(parsed.errors),
          identity,
          tier,
          cost,
          parsed.symbols.length
        )
        seen.run(job, path)
        bytes += cost
        status.files++
        status.symbols += parsed.symbols.length
        if (tier === 'symbols') status.symbolOnly!++
      } catch (error) {
        signal?.throwIfAborted()
        if (error instanceof IndexParserUnavailable || !(error instanceof Error)) throw error
        skip(path, 'unreadable')
      }
    }

    const scan = async (directory: string, depth: number): Promise<void> => {
      if (depth > 24) {
        status.limited = true
        skip(relative(root, directory), 'global-budget')
        return
      }
      await reader.authorize(directory)
      const entries = await opendir(directory)
      for await (const entry of entries) {
        signal?.throwIfAborted()
        const absolute = join(directory, entry.name)
        const path = relative(root, absolute)
        if (++visited > DIRECTORY_ENTRIES) {
          status.limited = true
          skip(path, 'global-budget')
          return
        }
        if (entry.isSymbolicLink()) skip(path, 'symlink')
        else if (sensitiveDocumentPath(absolute)) skip(path, 'sensitive')
        else if (ignored.has(entry.name)) skip(path, 'ignored')
        else if (entry.isDirectory()) await scan(absolute, depth + 1)
        else {
          const language = codeLanguage(absolute)
          if (!entry.isFile() || !language) skip(path, 'unsupported')
          else if (status.files >= PROJECT_FILES || bytes >= PROJECT_BYTES) {
            status.limited = true
            skip(path, 'global-budget')
          } else await indexFile(absolute, path, language)
        }
        if (visited > DIRECTORY_ENTRIES) return
        if (visited % 8 === 0 && !memoryLimited) await yieldForMemory()
      }
    }

    try {
      await scan(root, 0)
      await reader.authorize(root)
      signal?.throwIfAborted()
      status.elapsedMs = Math.round(performance.now() - started)
      this.db.exec('BEGIN IMMEDIATE')
      try {
        this.db
          .prepare(
            'DELETE FROM files WHERE root=? AND path NOT IN (SELECT path FROM seen_files WHERE root=?)'
          )
          .run(root, job)
        this.db
          .prepare(
            `INSERT OR REPLACE INTO files(root,path,language,hash,content,symbols,refs,updated_at,parse_error,identity,tier,cost,symbol_count)
          SELECT ?,path,language,hash,content,symbols,refs,updated_at,parse_error,identity,tier,cost,symbol_count FROM staged_files WHERE root=?`
          )
          .run(root, job)
        this.db.prepare('DELETE FROM index_skips WHERE root=?').run(root)
        this.db
          .prepare(
            'INSERT INTO index_skips SELECT ?,path,reason,size FROM staged_skips WHERE root=?'
          )
          .run(root, job)
        this.saveStatus(root, status)
        this.db.exec('COMMIT')
      } catch (error) {
        this.db.exec('ROLLBACK')
        throw error
      }
      return status
    } finally {
      parser?.close()
      this.db.prepare('DELETE FROM staged_files WHERE root=?').run(job)
      this.db.prepare('DELETE FROM staged_skips WHERE root=?').run(job)
      this.db.prepare('DELETE FROM seen_files WHERE root=?').run(job)
    }
  }
  search(root: string, query: string): CodeHit[] {
    this.validateQuery(query)
    const hits: Array<CodeHit & { score: number }> = []
    const words = query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 24)
    for (const row of this.rows(root)) {
      String(row.content)
        .split('\n')
        .forEach((text, index) => {
          const lower = text.toLowerCase()
          const score = words.reduce(
            (n, word) =>
              n +
              Number(lower.includes(word)) * 2 +
              Number(index === 0 && row.path.toLowerCase().includes(word)),
            0
          )
          if (score) hits.push({ path: row.path, line: index + 1, text: text.slice(0, 400), score })
        })
      if (hits.length > 1000) hits.sort((a, b) => b.score - a.score).splice(200)
    }
    return hits
      .sort((a, b) => b.score - a.score)
      .slice(0, 80)
      .map(({ path, line, text }) => ({ path, line, text }))
  }
  lookup(root: string, query: string): { definitions: CodeSymbol[]; references: CodeReference[] } {
    this.validateQuery(query)
    const definitions: CodeSymbol[] = [],
      references: CodeReference[] = []
    for (const row of this.rows(root, false)) {
      definitions.push(
        ...(JSON.parse(row.symbols) as CodeSymbol[])
          .filter((s) => s.name.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 80 - definitions.length)
      )
      references.push(
        ...(JSON.parse(row.refs) as CodeReference[])
          .filter((r) => r.name.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 120 - references.length)
      )
    }
    return { definitions, references }
  }
  trace(root: string, query: string, reverse = false) {
    this.validateQuery(query)
    const rows = [...this.rows(root, false)]
    const seeds = new Set(
      rows
        .filter(
          (row) =>
            row.path.includes(query) ||
            (JSON.parse(row.symbols) as CodeSymbol[]).some((s) =>
              s.name.toLowerCase().includes(query.toLowerCase())
            )
        )
        .map((row) => row.path)
    )
    if (!seeds.size)
      this.search(root, query)
        .slice(0, 5)
        .forEach((hit) => seeds.add(hit.path))
    const paths = new Set(rows.map((row) => row.path))
    const edges: Array<{ source: string; target: string; line: number; kind: string }> = []
    for (const row of rows)
      for (const ref of JSON.parse(row.refs) as CodeReference[]) {
        if (ref.kind !== 'import') continue
        const base = ref.name.startsWith('.')
          ? posix.normalize(posix.join(dirname(row.path), ref.name))
          : ref.name.startsWith('@renderer/')
            ? 'src/renderer/src/' + ref.name.slice(10)
            : ''
        const target = [
          base,
          ...['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '.py'].map(
            (ext) => base + ext
          )
        ].find((candidate) => paths.has(candidate))
        if (target) edges.push({ source: row.path, target, line: ref.line, kind: 'import' })
      }
    const reached = new Set(seeds),
      result: typeof edges = []
    let frontier = new Set(seeds)
    for (let depth = 0; depth < 5; depth++) {
      const next = new Set<string>()
      for (const edge of edges) {
        const from = reverse ? edge.target : edge.source,
          to = reverse ? edge.source : edge.target
        if (frontier.has(from) && !result.includes(edge) && result.length < 120) {
          result.push(edge)
          if (!reached.has(to)) next.add(to)
          reached.add(to)
        }
      }
      frontier = next
    }
    const degree = new Map<string, number>()
    for (const { source, target } of result) {
      degree.set(source, (degree.get(source) ?? 0) + 1)
      degree.set(target, (degree.get(target) ?? 0) + 1)
    }
    return {
      seeds: [...seeds].slice(0, 20),
      repoMap: rows
        .filter((row) => reached.has(row.path))
        .flatMap((row) =>
          (JSON.parse(row.symbols) as CodeSymbol[]).slice(0, 24).map((symbol) => ({
            symbol,
            score:
              Number(symbol.name.toLowerCase().includes(query.toLowerCase())) * 8 +
              Number(seeds.has(row.path)) * 3 +
              (degree.get(row.path) ?? 0)
          }))
        )
        .sort((a, b) => b.score - a.score)
        .slice(0, 24)
        .map(({ symbol }) => symbol),
      edges: result,
      paths: [...reached].slice(0, 120),
      caveat:
        'Static imports and lexical references only. Dynamic calls and Electron IPC require reading both endpoints; matching names do not prove runtime identity.'
    }
  }
  clear(root: string): void {
    if (this.jobs.has(root)) throw new Error('请先取消索引')
    this.db.prepare('DELETE FROM files WHERE root=?').run(root)
    this.db.prepare('DELETE FROM index_metadata WHERE root=?').run(root)
    this.db.prepare('DELETE FROM index_skips WHERE root=?').run(root)
  }
  private validateQuery(query: string): void {
    if (typeof query !== 'string' || !query.trim() || query.length > 200)
      throw new Error('Invalid code query')
  }
  private rows(
    root: string,
    content = true
  ): Iterable<{ path: string; content: string; symbols: string; refs: string }> {
    return this.db
      .prepare(
        `SELECT path,${content ? 'content' : "'' AS content"},symbols,refs FROM files WHERE root=? ORDER BY path`
      )
      .iterate(resolve(root)) as unknown as Iterable<{
      path: string
      content: string
      symbols: string
      refs: string
    }>
  }
}
