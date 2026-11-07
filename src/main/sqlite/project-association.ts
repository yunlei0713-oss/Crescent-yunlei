import type { DatabaseSync } from 'node:sqlite'

export function readProjectAssociation(
  db: DatabaseSync,
  id: string
): { projectId?: string; since?: string } {
  const row = db
    .prepare('SELECT project_id,project_context_since FROM conversations WHERE conversation_id=?')
    .get(id)
  return {
    projectId: typeof row?.project_id === 'string' ? row.project_id : undefined,
    since: typeof row?.project_context_since === 'string' ? row.project_context_since : undefined
  }
}

export function writeProjectAssociation(
  db: DatabaseSync,
  id: string,
  expected?: string,
  projectId?: string,
  resetContext = false
): void {
  if (expected === projectId && !resetContext) return
  db.exec('BEGIN IMMEDIATE')
  try {
    const now = new Date().toISOString()
    const result = db
      .prepare(
        'UPDATE conversations SET project_id=?,project_context_since=?,updated_at=? WHERE conversation_id=? AND project_id IS ?'
      )
      .run(projectId ?? null, now, now, id, expected ?? null)
    if (result.changes !== 1)
      throw new Error('Conversation project changed. Refresh and try again.')
    db.prepare('UPDATE session_tabs SET project_id=? WHERE conversation_id=?').run(
      projectId ?? null,
      id
    )
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
