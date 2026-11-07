import type { DatabaseSync } from 'node:sqlite'
import { isPendingManagedCommand, type ManagedCommandResult } from '../../shared/managed-terminal'
import { redactSensitiveText } from '../../shared/secret-redaction'

export function migrateManagedCommandAudit(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS managed_command_audit_v1 (
      sequence INTEGER PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      command_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      actor TEXT NOT NULL,
      result_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_managed_command_audit_lookup
      ON managed_command_audit_v1 (conversation_id, command_id, sequence);
  `)
}

export function recordManagedCommand(
  db: DatabaseSync,
  conversationId: string,
  result: ManagedCommandResult
): void {
  const actor =
    result.state === 'approval-pending' ? 'agent' : result.state === 'approved' ? 'user' : 'system'
  const metadata = {
    ...result,
    target: {
      ...result.target,
      cwd: redactSensitiveText(result.target.cwd),
      host: redactSensitiveText(result.target.host)
    },
    output: undefined
  }
  db.prepare(
    `INSERT INTO managed_command_audit_v1
       (conversation_id, command_id, timestamp, actor, result_json) VALUES (?, ?, ?, ?, ?)`
  ).run(conversationId, result.commandId, Date.now(), actor, JSON.stringify(metadata))
}

/** Called only when Main has no in-memory result for this conversation and command. */
export function readManagedCommandHistory(
  db: DatabaseSync,
  conversationId: string,
  commandId: string
): ManagedCommandResult {
  const row = db
    .prepare(
      `SELECT result_json FROM managed_command_audit_v1
     WHERE conversation_id = ? AND command_id = ? ORDER BY sequence DESC LIMIT 1`
    )
    .get(conversationId, commandId)
  if (!row) throw new Error('Unknown managed command')
  const result = JSON.parse(String(row.result_json)) as ManagedCommandResult
  if (!isPendingManagedCommand(result.state)) return result
  const recovered: ManagedCommandResult = {
    ...result,
    state: 'unknown',
    reason: 'restart',
    finishedAt: Date.now()
  }
  recordManagedCommand(db, conversationId, recovered)
  return recovered
}

export function hasManagedCommandHistory(db: DatabaseSync, conversationId: string): boolean {
  return Boolean(
    db
      .prepare('SELECT 1 FROM managed_command_audit_v1 WHERE conversation_id = ? LIMIT 1')
      .get(conversationId)
  )
}
