import type { DatabaseSync } from 'node:sqlite'

/** Additive, transactional migration. Legacy columns and message keys remain intact. */
export function migrateConversations(db: DatabaseSync): void {
  db.exec('BEGIN IMMEDIATE')
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS conversations (
      conversation_id TEXT PRIMARY KEY, title TEXT NOT NULL, summary TEXT,
      project_id TEXT, title_locked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT
    )`)
    if (
      !db
        .prepare('PRAGMA table_info(conversations)')
        .all()
        .some((row) => row.name === 'project_context_since')
    )
      db.exec('ALTER TABLE conversations ADD COLUMN project_context_since TEXT')
    for (const table of ['session_tabs', 'agent_logs', 'agent_runs', 'ops_history_records']) {
      const columns = db.prepare(`PRAGMA table_info(${table})`).all()
      if (!columns.some((row) => row.name === 'conversation_id'))
        db.exec(`ALTER TABLE ${table} ADD COLUMN conversation_id TEXT`)
      db.exec(`UPDATE ${table} SET conversation_id = tab_id WHERE conversation_id IS NULL;
        CREATE INDEX IF NOT EXISTS idx_${table}_conversation ON ${table}(conversation_id)`)
    }
    db.exec(`INSERT OR IGNORE INTO conversations
      (conversation_id,title,summary,project_id,title_locked,created_at,updated_at)
      SELECT conversation_id,title,summary,project_id,title_locked,updated_at,updated_at FROM session_tabs;
      INSERT OR IGNORE INTO conversations (conversation_id,title,created_at,updated_at)
      SELECT conversation_id, COALESCE((SELECT substr(text,1,80) FROM agent_logs l
        WHERE l.conversation_id=a.conversation_id AND l.kind='user' ORDER BY log_id LIMIT 1), 'Conversation'),
        MIN(created_at), MAX(updated_at) FROM agent_logs a GROUP BY conversation_id;
      INSERT OR IGNORE INTO conversations (conversation_id,title,created_at,updated_at)
      SELECT conversation_id,substr(input,1,80),MIN(created_at),MAX(updated_at)
        FROM agent_runs GROUP BY conversation_id;
      INSERT OR IGNORE INTO conversations (conversation_id,title,created_at,updated_at)
      SELECT conversation_id,substr(user_goal,1,80),MIN(created_at),MAX(updated_at)
        FROM ops_history_records GROUP BY conversation_id`)
    db.exec(`CREATE TABLE IF NOT EXISTS guided_ops_steps (
      proposal_id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, terminal_tab_id TEXT NOT NULL,
      run_id TEXT NOT NULL, step_number INTEGER NOT NULL, created_at INTEGER NOT NULL,
      goal TEXT NOT NULL, proposal_json TEXT NOT NULL, state TEXT NOT NULL, updated_at INTEGER NOT NULL,
      UNIQUE(conversation_id,step_number), UNIQUE(conversation_id,run_id)
    );
    CREATE INDEX IF NOT EXISTS idx_guided_conversation_cursor ON guided_ops_steps(conversation_id,created_at,proposal_id);
    CREATE INDEX IF NOT EXISTS idx_guided_terminal ON guided_ops_steps(terminal_tab_id,created_at);
    CREATE INDEX IF NOT EXISTS idx_guided_run ON guided_ops_steps(run_id)`)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function conversationIdFor(db: DatabaseSync, id: string): string {
  const row = db.prepare('SELECT conversation_id FROM session_tabs WHERE tab_id=?').get(id)
  return typeof row?.conversation_id === 'string' ? row.conversation_id : id
}

export function ensureConversation(db: DatabaseSync, id: string, title = 'Conversation'): string {
  const conversationId = conversationIdFor(db, id)
  const now = new Date().toISOString()
  db.prepare(
    `INSERT OR IGNORE INTO conversations
    (conversation_id,title,created_at,updated_at) VALUES (?,?,?,?)`
  ).run(conversationId, title, now, now)
  return conversationId
}
