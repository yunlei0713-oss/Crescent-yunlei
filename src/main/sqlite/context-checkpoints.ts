import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { StoredAgentLogEntry } from '../../shared/agent-types'
import { redactSensitiveText } from '../../shared/secret-redaction'

export type CheckpointQuality = 'passed' | 'partial' | 'failed'
type FactKind =
  | 'goal'
  | 'constraint'
  | 'decision'
  | 'fact'
  | 'pending'
  | 'blocker'
  | 'next'
  | 'error'
type Operation = 'proposed' | 'attempted' | 'failed' | 'succeeded' | 'verified' | 'unknown'
type Reference = { tabId: string; logId: number; hash: string }
type Fact = {
  kind: FactKind
  text: string
  role: string
  at: string
  source: Reference
  operation?: Operation
  identifiers: string[]
}
export interface PreservationManifest {
  version: 1
  facts: Fact[]
}
export interface CheckpointAttempt {
  id: string
  conversationId: string
  revision: string
  manifest: PreservationManifest
  started: number
}

export function redactHistory(text: string): string {
  return redactSensitiveText(text)
    .replace(
      /((?:\b(?:otp|passcode|pin)|验证码)\s*[:=：]\s*)(?:"[^"]*"|'[^']*'|[^\s;,]+)/gi,
      '$1[REDACTED]'
    )
    .replace(
      /((?:--(?:password|passwd|token|api-key|secret)|\bsshpass\s+-p)\s+)(?:"[^"]*"|'[^']*'|[^\s;]+)/gi,
      '$1[REDACTED]'
    )
}

/** Project the stored UI formats to visible prose; omit reasoning, embedded tool payloads and refs. */
export function historicalText(log: StoredAgentLogEntry): string {
  if (log.kind === 'user' || log.kind === 'user-supplement')
    return redactHistory(log.text.replace(/^<!--crescent-refs:[^\r\n]*?-->\r?\n?/, ''))
  if (log.kind === 'assistant' && log.text.startsWith('CRESCENT_RUN_V2\n')) {
    try {
      const { result, error } = JSON.parse(log.text.split('\n', 2)[1])
      return redactHistory([result, error].filter((value) => typeof value === 'string').join('\n'))
    } catch {
      return ''
    }
  }
  return redactHistory(log.text)
}

export function historyHash(log: StoredAgentLogEntry): string {
  return createHash('sha256')
    .update(
      JSON.stringify([log.tabId, log.logId, log.kind, log.createdAt, log.runId ?? null, log.text])
    )
    .digest('hex')
}

const factLabels: Array<[FactKind, RegExp]> = [
  ['constraint', /不要|禁止|只检查|仅|不得|务必|\b(?:must not|do not|only|never)\b/i],
  ['decision', /决定|确认采用|改为|\b(?:decided|decision|switch to)\b/i],
  ['blocker', /阻塞|等待|\b(?:blocked|blocker|waiting for)\b/i],
  ['pending', /待验证|未验证|尚未|待办|\b(?:pending|unverified|todo)\b/i],
  ['next', /下一步|\bnext (?:step|action)\b/i],
  ['error', /失败|错误|\b(?:error|failed|SQLSTATE|E[A-Z]{3,})\b/i],
  ['goal', /目标|\b(?:goal|objective|task)\b/i]
]

function operationFor(text: string, role: string): Operation {
  if (/^\s*(?:建议|请执行|准备执行|suggest|propose|try running)/i.test(text)) return 'proposed'
  // Assistant assertions alone never certify a historical operation.
  if (
    role !== 'user' ||
    /未(?:执行|验证|成功)|尚未|如果|假设|可能|\b(?:not|if|may|might|would)\b/i.test(text)
  )
    return 'unknown'
  if (/^\s*(?:执行失败|已失败|execution failed|failed)\b|^\s*(?:执行失败|已失败)/i.test(text))
    return 'failed'
  if (/^\s*(?:已验证|验证通过|verified\b)/i.test(text)) return 'verified'
  if (/^\s*(?:执行成功|已执行成功|command succeeded\b)/i.test(text)) return 'succeeded'
  if (/^\s*(?:已尝试|已执行|attempted\b|ran\b)/i.test(text)) return 'attempted'
  return 'unknown'
}

export function makeManifest(logs: StoredAgentLogEntry[]): PreservationManifest {
  const facts: Fact[] = []
  for (const log of logs) {
    if (!['user', 'user-supplement', 'assistant', 'error'].includes(log.kind)) continue
    const redacted = historicalText(log)
    const source = { tabId: log.tabId, logId: log.logId, hash: historyHash(log) }
    let retained = 0
    for (const line of redacted.split(/\r?\n/)) {
      for (const part of line.split(/(?<=[。！？])\s*|\s*；\s*/u)) {
        const text = part.trim()
        if (!text || text.length > 700 || retained >= 8) continue
        const identifiers = [
          ...new Set(
            text.match(
              /`[^`\n]{1,300}`|\b(?:\d{1,3}\.){3}\d{1,3}(?:(?::\d+)|(?:\/\d+))?|\b(?:v?\d+(?:\.\d+)+|\d{2,5}|SQLSTATE\s+[\w]+|E[A-Z]{3,})\b|(?:\/[\w.-]+)+/g
            ) ?? []
          )
        ]
          .filter((identifier) => identifier.length <= 302)
          .slice(0, 16)
        const label = factLabels.find(([, pattern]) => pattern.test(text))?.[0]
        const operation = operationFor(text, log.kind)
        if (log.kind === 'assistant' && !identifiers.length && operation !== 'proposed') continue
        const kind =
          log.kind === 'error'
            ? 'error'
            : (label ??
              (log.kind === 'user' &&
              retained === 0 &&
              !identifiers.length &&
              operation === 'unknown'
                ? 'goal'
                : 'fact'))
        facts.push({
          kind,
          text,
          role: log.kind,
          at: log.createdAt,
          source,
          operation,
          identifiers
        })
        retained++
      }
    }
  }
  // Keep the initial goal and give each category room, even during a long error burst.
  const first = facts.find((fact) => fact.kind === 'goal' && fact.role === 'user')
  const selected = new Set<Fact>(first ? [first] : [])
  for (const kind of [
    'goal',
    'constraint',
    'decision',
    'fact',
    'error',
    'pending',
    'blocker',
    'next'
  ]) {
    for (const fact of facts.filter((entry) => entry.kind === kind).slice(-6)) selected.add(fact)
  }
  return { version: 1, facts: facts.filter((fact) => selected.has(fact)) }
}

export function parseManifest(json: string): PreservationManifest {
  const value = JSON.parse(json) as PreservationManifest
  if (
    value?.version !== 1 ||
    !Array.isArray(value.facts) ||
    value.facts.length > 49 ||
    value.facts.some(
      (fact) =>
        !fact ||
        !['goal', 'constraint', 'decision', 'fact', 'error', 'pending', 'blocker', 'next'].includes(
          fact.kind
        ) ||
        !['user', 'user-supplement', 'assistant', 'error'].includes(fact.role) ||
        !['proposed', 'attempted', 'failed', 'succeeded', 'verified', 'unknown'].includes(
          fact.operation ?? ''
        ) ||
        typeof fact.text !== 'string' ||
        fact.text.length > 700 ||
        typeof fact.at !== 'string' ||
        fact.at.length > 64 ||
        typeof fact.source?.tabId !== 'string' ||
        fact.source.tabId.length > 300 ||
        !Number.isSafeInteger(fact.source?.logId) ||
        !/^[a-f0-9]{64}$/.test(fact.source?.hash) ||
        !Array.isArray(fact.identifiers) ||
        fact.identifiers.length > 16 ||
        fact.identifiers.some((id) => typeof id !== 'string' || id.length > 302)
    )
  )
    throw new Error('Invalid preservation manifest')
  return value
}

export function migrateCheckpoints(db: DatabaseSync): void {
  db.exec('PRAGMA foreign_keys=ON')
  if (
    db.prepare("SELECT value FROM app_metadata WHERE key='schema.context-checkpoints'").get()
      ?.value === '3'
  )
    return
  db.exec('BEGIN IMMEDIATE')
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS conversation_history_revisions (
        conversation_id TEXT PRIMARY KEY REFERENCES conversations(conversation_id) ON DELETE CASCADE,
        revision INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS conversation_checkpoints (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
        source_revision TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('building','ready','partial','failed','interrupted')),
        reason TEXT NOT NULL,
        structured_json TEXT NOT NULL,
        summary_text TEXT NOT NULL DEFAULT '',
        validation_json TEXT,
        tokens_before INTEGER,
        tokens_after INTEGER,
        context_window INTEGER,
        elapsed_ms INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_checkpoints_conversation
        ON conversation_checkpoints(conversation_id, created_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_checkpoints_active_revision
        ON conversation_checkpoints(conversation_id,source_revision) WHERE status IN ('building','ready','partial');
      DROP TRIGGER IF EXISTS context_log_insert;
      CREATE TRIGGER context_log_insert AFTER INSERT ON agent_logs
      WHEN NEW.conversation_id IS NOT NULL AND NEW.kind IN ('user','user-supplement','assistant','error','output') BEGIN
        INSERT INTO conversation_history_revisions VALUES(NEW.conversation_id,1)
        ON CONFLICT(conversation_id) DO UPDATE SET revision=revision+1;
      END;
      DROP TRIGGER IF EXISTS context_log_update;
      DROP TRIGGER IF EXISTS context_log_delete;
      CREATE TRIGGER context_log_update AFTER UPDATE OF text,kind,run_id,created_at ON agent_logs
      WHEN OLD.conversation_id IS NOT NULL AND
        (OLD.kind IN ('user','user-supplement','assistant','error','output') OR NEW.kind IN ('user','user-supplement','assistant','error','output')) AND
        (OLD.text IS NOT NEW.text OR OLD.kind IS NOT NEW.kind OR OLD.run_id IS NOT NEW.run_id OR OLD.created_at IS NOT NEW.created_at) BEGIN
        INSERT INTO conversation_history_revisions VALUES(OLD.conversation_id,1)
        ON CONFLICT(conversation_id) DO UPDATE SET revision=revision+1;
        DELETE FROM conversation_checkpoints WHERE conversation_id=OLD.conversation_id AND
          EXISTS(SELECT 1 FROM json_each(structured_json,'$.facts') WHERE
            json_extract(value,'$.source.tabId')=OLD.tab_id AND json_extract(value,'$.source.logId')=OLD.log_id);
      END;
      CREATE TRIGGER context_log_delete AFTER DELETE ON agent_logs
      WHEN OLD.conversation_id IS NOT NULL AND OLD.kind IN ('user','user-supplement','assistant','error','output') BEGIN
        INSERT INTO conversation_history_revisions VALUES(OLD.conversation_id,1)
        ON CONFLICT(conversation_id) DO UPDATE SET revision=revision+1;
        DELETE FROM conversation_checkpoints WHERE conversation_id=OLD.conversation_id AND
          EXISTS(SELECT 1 FROM json_each(structured_json,'$.facts') WHERE
            json_extract(value,'$.source.tabId')=OLD.tab_id AND json_extract(value,'$.source.logId')=OLD.log_id);
      END;
      INSERT INTO app_metadata VALUES('schema.context-checkpoints','3',datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at;
    `)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function recoverCheckpoints(db: DatabaseSync): void {
  db.exec(
    'UPDATE conversation_checkpoints SET status=\'interrupted\', validation_json=\'{"quality":"failed","reason":"restart"}\',updated_at=datetime(\'now\') WHERE status=\'building\''
  )
}

export function historyRevision(db: DatabaseSync, conversationId: string): string {
  const row = db
    .prepare(
      `SELECT c.created_at, COALESCE(r.revision,0) AS revision FROM conversations c
    LEFT JOIN conversation_history_revisions r USING(conversation_id) WHERE c.conversation_id=?`
    )
    .get(conversationId)
  return row ? JSON.stringify(['context-v1', row.created_at, row.revision]) : 'missing'
}

const LOG_COLUMNS =
  'tab_id AS tabId,log_id AS logId,kind,text,created_at AS createdAt,run_id AS runId'

export function exactHistoryLog(
  db: DatabaseSync,
  conversationId: string,
  tabId: string,
  logId: number
): StoredAgentLogEntry | undefined {
  return db
    .prepare(
      `SELECT ${LOG_COLUMNS} FROM agent_logs WHERE conversation_id=? AND tab_id=? AND log_id=?`
    )
    .get(conversationId, tabId, logId) as unknown as StoredAgentLogEntry | undefined
}

export function beginCheckpoint(
  db: DatabaseSync,
  conversationId: string,
  reason: string,
  tokens: number | null,
  contextWindow: number | undefined
): CheckpointAttempt | undefined {
  const revision = historyRevision(db, conversationId)
  if (revision === 'missing') return
  if (
    db
      .prepare(
        "SELECT 1 FROM conversation_checkpoints WHERE conversation_id=? AND source_revision=? AND status IN ('building','ready','partial')"
      )
      .get(conversationId, revision)
  )
    return
  const recent = db
    .prepare(
      `SELECT ${LOG_COLUMNS} FROM agent_logs WHERE conversation_id=?
    AND kind IN ('user','user-supplement','assistant','error') ORDER BY log_id DESC,tab_id DESC LIMIT 160`
    )
    .all(conversationId)
    .reverse() as unknown as StoredAgentLogEntry[]
  const initial = db
    .prepare(
      `SELECT ${LOG_COLUMNS} FROM agent_logs WHERE conversation_id=? AND kind='user' ORDER BY log_id,tab_id LIMIT 1`
    )
    .get(conversationId) as unknown as StoredAgentLogEntry | undefined
  if (initial && !recent.some((log) => log.tabId === initial.tabId && log.logId === initial.logId))
    recent.unshift(initial)
  const manifest = makeManifest(recent)
  const json = JSON.stringify(manifest)
  parseManifest(json)
  const attempt = { id: randomUUID(), conversationId, revision, manifest, started: Date.now() }
  const now = new Date(attempt.started).toISOString()
  db.prepare(
    `INSERT INTO conversation_checkpoints
    (id,conversation_id,source_revision,status,reason,structured_json,tokens_before,context_window,created_at,updated_at)
    VALUES(?,?,?,'building',?,?,?,?,?,?)`
  ).run(attempt.id, conversationId, revision, reason, json, tokens, contextWindow ?? null, now, now)
  db.prepare(
    `DELETE FROM conversation_checkpoints WHERE conversation_id=? AND id NOT IN
    (SELECT id FROM conversation_checkpoints WHERE conversation_id=? ORDER BY created_at DESC,rowid DESC LIMIT 12)`
  ).run(conversationId, conversationId)
  return attempt
}

function containsIdentifier(text: string, identifier: string): boolean {
  if (identifier.startsWith('`')) return text.includes(identifier)
  let start = text.indexOf(identifier)
  while (start >= 0) {
    const previous = text[start - 1] ?? ''
    const suffix = text.slice(start + identifier.length, start + identifier.length + 2)
    if (!/[\w./-]/.test(previous) && !/^(?:[\w/-]|\.\w)/.test(suffix)) return true
    start = text.indexOf(identifier, start + identifier.length)
  }
  return false
}

export function completeCheckpoint(
  db: DatabaseSync,
  attempt: CheckpointAttempt,
  result: { summary: string; tokensBefore: number; estimatedTokensAfter?: number } | undefined,
  retainedText: string,
  interrupted = false
): { quality: CheckpointQuality; reason?: string; missing: number; checkpointId?: string } {
  const changed = historyRevision(db, attempt.conversationId) !== attempt.revision
  const missingSources = attempt.manifest.facts.filter(({ source }) => {
    const row = exactHistoryLog(db, attempt.conversationId, source.tabId, source.logId)
    return !row || historyHash(row) !== source.hash
  })
  const summary = redactHistory(result?.summary ?? '').trim()
  const combined = summary + '\n' + retainedText
  const missingFacts = attempt.manifest.facts.filter(
    ({ text, identifiers }) =>
      !combined.includes(text) ||
      identifiers.some((identifier) => !containsIdentifier(combined, identifier))
  )
  const reason = interrupted
    ? 'interrupted'
    : changed
      ? 'source-changed'
      : missingSources.length
        ? 'source-unavailable'
        : !summary
          ? 'no-summary'
          : !attempt.manifest.facts.length
            ? 'no-evidence'
            : undefined
  const quality: CheckpointQuality = reason ? 'failed' : missingFacts.length ? 'partial' : 'passed'
  const status = interrupted ? 'interrupted' : quality === 'passed' ? 'ready' : quality
  const missing = missingFacts.length
  const updated = db
    .prepare(
      `UPDATE conversation_checkpoints SET status=?,summary_text=?,validation_json=?,
    tokens_before=COALESCE(?,tokens_before),tokens_after=?,elapsed_ms=?,updated_at=? WHERE id=? AND status='building'`
    )
    .run(
      status,
      reason
        ? ''
        : attempt.manifest.facts
            .slice(-8)
            .map(({ text }) => '- ' + text)
            .join('\n')
            .slice(0, 2200),
      JSON.stringify({
        quality,
        reason,
        missing: missingFacts.map(({ kind, source }) => ({
          kind,
          tabId: source.tabId,
          logId: source.logId
        }))
      }),
      result?.tokensBefore ?? null,
      result?.estimatedTokensAfter ?? null,
      Date.now() - attempt.started,
      new Date().toISOString(),
      attempt.id
    )
  return { quality, reason, missing, checkpointId: updated.changes ? attempt.id : undefined }
}

export function latestContextCheckpoint(
  db: DatabaseSync,
  conversationId: string
): PreservationManifest | undefined {
  const rows = db
    .prepare(
      `SELECT structured_json FROM conversation_checkpoints WHERE conversation_id=?
    AND status IN ('ready','partial') ORDER BY created_at DESC,rowid DESC LIMIT 4`
    )
    .all(conversationId)
  for (const row of rows) {
    const manifest = parseManifest(String(row.structured_json))
    const valid = manifest.facts.every(({ source }) => {
      const log = exactHistoryLog(db, conversationId, source.tabId, source.logId)
      return log && historyHash(log) === source.hash
    })
    if (valid) return manifest
  }
  return undefined
}

/** Reads only a bounded cold-start window, without relying on a renderer-generated transcript. */
export function recentContextSources(db: DatabaseSync, conversationId: string, through: string) {
  return db
    .prepare(
      `SELECT ${LOG_COLUMNS} FROM agent_logs WHERE conversation_id=? AND created_at<=?
    AND kind IN ('user','user-supplement','assistant','error') ORDER BY log_id DESC,tab_id DESC LIMIT 18`
    )
    .all(conversationId, through) as unknown as StoredAgentLogEntry[]
}
