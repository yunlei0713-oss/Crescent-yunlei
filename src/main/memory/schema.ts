import type { DatabaseSync } from 'node:sqlite'

/** This database has its own migration version, independent of the conversation store. */
export function migrateMemoryEvidence(db: DatabaseSync): void {
  const version = Number(db.prepare('PRAGMA user_version').get()?.user_version ?? 0)
  if (version === 1) return
  if (version !== 0) throw new Error('Unsupported memory database version')
  db.exec('BEGIN IMMEDIATE')
  try {
    db.exec(`
      ALTER TABLE memory_items ADD COLUMN kind TEXT NOT NULL DEFAULT 'legacy';
      ALTER TABLE memory_items ADD COLUMN observed_at TEXT;
      ALTER TABLE memory_items ADD COLUMN valid_from TEXT;
      ALTER TABLE memory_items ADD COLUMN valid_to TEXT;
      ALTER TABLE memory_items ADD COLUMN uncertainty TEXT;
      ALTER TABLE memory_items ADD COLUMN supersedes_id TEXT REFERENCES memory_items(id) ON DELETE SET NULL;
      CREATE TABLE memory_evidence (
        memory_id TEXT NOT NULL REFERENCES memory_items(id) ON DELETE CASCADE,
        conversation_id TEXT NOT NULL,
        tab_id TEXT NOT NULL,
        log_id INTEGER NOT NULL,
        source_hash TEXT NOT NULL,
        source_revision TEXT NOT NULL,
        role TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        scope TEXT NOT NULL,
        quote TEXT NOT NULL,
        PRIMARY KEY(memory_id,conversation_id,tab_id,log_id,quote)
      );
      CREATE INDEX idx_memory_evidence_conversation ON memory_evidence(conversation_id,memory_id);
      CREATE INDEX idx_learning_items_memory ON learning_items(id);
      CREATE INDEX idx_memory_relation_target ON memory_relation(target,relation,source);
      CREATE TABLE reflection_inputs (
        key TEXT PRIMARY KEY,
        created_at TEXT NOT NULL
      );
      PRAGMA user_version=1;
    `)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function migrateMemoryCleanupQueue(db: DatabaseSync): void {
  if (
    db.prepare("SELECT value FROM app_metadata WHERE key='schema.memory-cleanup'").get()?.value ===
    '2'
  )
    return
  db.exec('BEGIN IMMEDIATE')
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS conversation_memory_cleanup (
      conversation_id TEXT PRIMARY KEY,
      removed INTEGER NOT NULL DEFAULT 0
    );
    DROP TRIGGER IF EXISTS memory_cleanup_update;
    DROP TRIGGER IF EXISTS memory_cleanup_log_delete;
    CREATE TRIGGER memory_cleanup_update AFTER UPDATE OF text,kind,created_at,run_id ON agent_logs
    WHEN OLD.conversation_id IS NOT NULL AND
      (OLD.text IS NOT NEW.text OR OLD.kind IS NOT NEW.kind OR OLD.run_id IS NOT NEW.run_id OR OLD.created_at IS NOT NEW.created_at) BEGIN
      INSERT INTO conversation_memory_cleanup(conversation_id) VALUES(OLD.conversation_id)
      ON CONFLICT(conversation_id) DO NOTHING;
    END;
    CREATE TRIGGER memory_cleanup_log_delete AFTER DELETE ON agent_logs
    WHEN OLD.conversation_id IS NOT NULL BEGIN
      INSERT INTO conversation_memory_cleanup(conversation_id) VALUES(OLD.conversation_id)
      ON CONFLICT(conversation_id) DO NOTHING;
    END;
    CREATE TRIGGER IF NOT EXISTS memory_cleanup_conversation_delete AFTER DELETE ON conversations BEGIN
      INSERT INTO conversation_memory_cleanup VALUES(OLD.conversation_id,1)
      ON CONFLICT(conversation_id) DO UPDATE SET removed=1;
    END;
    INSERT INTO app_metadata VALUES('schema.memory-cleanup','2',datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at;`)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
