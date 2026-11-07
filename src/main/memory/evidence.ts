import type { DatabaseSync } from 'node:sqlite'
import type { MemoryEvidence } from '../../shared/knowledge'
import {
  exactHistoryLog,
  historicalText,
  historyHash,
  redactHistory
} from '../sqlite/context-checkpoints'

export interface ObservationSource {
  id: number
  tabId: string
  logId: number
  role: string
  at: string
  hash: string
  text: string
}
export interface ObservationCitation {
  source: ObservationSource
  quote: string
}
export const REFLECTION_SUPPORT = 'supports-reflection'

export function checkedEvidence(
  history: DatabaseSync,
  evidence: Record<string, unknown>
): MemoryEvidence | undefined {
  const conversationId = String(evidence.conversation_id)
  const sourceTabId = String(evidence.tab_id)
  const logId = Number(evidence.log_id)
  const log = exactHistoryLog(history, conversationId, sourceTabId, logId)
  if (!log || historyHash(log) !== evidence.source_hash) return
  const quote = String(evidence.quote)
  if (!historicalText(log).includes(quote)) return
  return {
    conversationId,
    sourceTabId,
    logId,
    role: log.kind,
    observedAt: log.createdAt,
    scope: redactHistory(String(evidence.scope)),
    excerpt: redactHistory(quote),
    redacted: true
  }
}

/** Raw history commits first. Ack the persistent cleanup only after memory.db commits. */
export function reconcileMemoryEvidence(db: DatabaseSync, history: DatabaseSync): void {
  const rows = history
    .prepare('SELECT * FROM conversation_memory_cleanup ORDER BY rowid LIMIT 256')
    .all()
  for (const { conversation_id, removed } of rows) {
    const conversationId = String(conversation_id)
    db.exec('BEGIN IMMEDIATE')
    try {
      const sources = db
        .prepare('SELECT rowid,* FROM memory_evidence WHERE conversation_id=?')
        .all(conversationId)
      const deleteEvidence = db.prepare('DELETE FROM memory_evidence WHERE rowid=?')
      const affected = new Set<string>()
      for (const source of sources) {
        if (!removed && checkedEvidence(history, source)) continue
        deleteEvidence.run(Number(source.rowid))
        affected.add(String(source.memory_id))
      }
      for (const id of affected) {
        // A reflection may paraphrase the removed evidence even if other supports remain.
        db.prepare(
          `DELETE FROM memory_items WHERE id IN
          (SELECT target FROM memory_relation WHERE source=? AND relation=?)`
        ).run(id, REFLECTION_SUPPORT)
        const remaining = db
          .prepare(
            'SELECT conversation_id FROM memory_evidence WHERE memory_id=? ORDER BY observed_at DESC LIMIT 1'
          )
          .get(id)
        if (!remaining) db.prepare('DELETE FROM memory_items WHERE id=?').run(id)
        else
          db.prepare(
            `UPDATE memory_items SET source=?, status=CASE WHEN status='approved' THEN 'candidate' ELSE status END WHERE id=?`
          ).run(remaining.conversation_id, id)
      }
      if (removed) {
        // Legacy material extracted only from this source has no message-level proof.
        db.prepare(
          `DELETE FROM memory_items WHERE kind='legacy' AND source=?
          AND NOT EXISTS(SELECT 1 FROM learning_items l WHERE l.id=memory_items.id AND l.tab_id<>?)`
        ).run(conversationId, conversationId)
        db.prepare(
          `UPDATE memory_items SET source=COALESCE(
          (SELECT tab_id FROM learning_items l WHERE l.id=memory_items.id AND l.tab_id<>? ORDER BY tab_id LIMIT 1),''),
          status=CASE WHEN status='approved' THEN 'candidate' ELSE status END
          WHERE kind='legacy' AND source=?`
        ).run(conversationId, conversationId)
        db.prepare('DELETE FROM learning_items WHERE tab_id=?').run(conversationId)
        db.prepare('DELETE FROM learning WHERE tab_id=?').run(conversationId)
      }
      pruneUnsupportedReflections(db)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    history
      .prepare('DELETE FROM conversation_memory_cleanup WHERE conversation_id=?')
      .run(conversationId)
  }
}

export function pruneUnsupportedReflections(db: DatabaseSync): void {
  db.prepare(
    `DELETE FROM memory_items WHERE kind='reflection' AND
    (SELECT count(*) FROM memory_relation r WHERE r.target=memory_items.id AND r.relation=?)<2`
  ).run(REFLECTION_SUPPORT)
  db.prepare(
    `UPDATE memory_items SET status='candidate' WHERE kind='reflection' AND status='approved' AND
    EXISTS(SELECT 1 FROM memory_relation r JOIN memory_items o ON o.id=r.source
      WHERE r.target=memory_items.id AND r.relation=? AND o.status<>'approved')`
  ).run(REFLECTION_SUPPORT)
}
