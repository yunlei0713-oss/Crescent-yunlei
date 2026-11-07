import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { AgentTurnDraft, AgentTurnSummary } from '../../shared/agent-turn-queue'

interface TurnRow {
  sequence: number
  id: string
  conversation_id: string
  owner: string
  payload: string
  status: AgentTurnSummary['status']
  created_at: number
  error?: string
}
type TurnSnapshot = AgentTurnDraft & {
  bindings?: string
  files?: string
  projectRoot?: string
  bindingOwner?: string
  projectSince?: string
  terminalConfirmation?: string
}

/** SQLite is authoritative for ordering, recovery and the single in-flight turn per conversation. */
export class AgentTurnQueue {
  private launched = new Set<string>()

  constructor(private readonly db: DatabaseSync) {
    db.exec(`CREATE TABLE IF NOT EXISTS agent_turn_queue (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
      conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
      owner TEXT NOT NULL, payload TEXT NOT NULL, priority INTEGER NOT NULL,
      status TEXT NOT NULL, created_at INTEGER NOT NULL, error TEXT
    );
    CREATE INDEX IF NOT EXISTS agent_turn_order ON agent_turn_queue(conversation_id,status,priority,sequence);
    CREATE UNIQUE INDEX IF NOT EXISTS agent_turn_running ON agent_turn_queue(conversation_id) WHERE status='running';
    UPDATE agent_turn_queue SET status='waiting',error=NULL WHERE status IN ('queued','running')`)
  }

  enqueue(
    conversation: string,
    owner: string,
    draft: TurnSnapshot,
    priority = false
  ): AgentTurnSummary {
    const id = `turn-${randomUUID()}`
    const createdAt = Date.now()
    const count = this.db
      .prepare(
        "SELECT count(*) AS n FROM agent_turn_queue WHERE conversation_id=? AND status IN ('queued','waiting','running')"
      )
      .get(conversation)
    if (Number(count?.n) >= 30) throw new Error('Conversation queue is full (30 turns)')
    const { lastInsertRowid } = this.db
      .prepare(
        "INSERT INTO agent_turn_queue(id,conversation_id,owner,payload,priority,status,created_at) VALUES(?,?,?,?,?,'queued',?)"
      )
      .run(id, conversation, owner, JSON.stringify(draft), Number(priority), createdAt)
    return {
      id,
      createdAt,
      sequence: Number(lastInsertRowid),
      status: 'queued',
      text: draft.originalInput.slice(0, 240)
    }
  }

  list(conversation: string, owner?: string): AgentTurnSummary[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM (
      SELECT * FROM agent_turn_queue WHERE conversation_id=? ORDER BY (status IN ('queued','waiting','running')) DESC, sequence DESC LIMIT 60
    ) ORDER BY priority DESC,sequence`
      )
      .all(conversation) as unknown as TurnRow[]
    return rows.map((row) => ({
      id: row.id,
      sequence: row.sequence,
      createdAt: row.created_at,
      status: owner && row.status === 'queued' && row.owner !== owner ? 'waiting' : row.status,
      text: (JSON.parse(row.payload) as TurnSnapshot).originalInput.slice(0, 240),
      error: row.error ?? undefined
    }))
  }

  claim(conversation: string, owner: string): (TurnSnapshot & { id: string }) | undefined {
    const row = this.db
      .prepare(
        `UPDATE agent_turn_queue SET status='running' WHERE sequence=(
      SELECT sequence FROM agent_turn_queue WHERE conversation_id=? AND status IN ('queued','waiting')
      ORDER BY priority DESC,sequence LIMIT 1
    ) AND status='queued' AND owner=? AND NOT EXISTS (
      SELECT 1 FROM agent_turn_queue WHERE conversation_id=? AND status='running'
    ) RETURNING *`
      )
      .get(conversation, owner, conversation) as unknown as TurnRow | undefined
    return row ? { ...(JSON.parse(row.payload) as TurnSnapshot), id: row.id } : undefined
  }

  start(id: string, conversation: string, owner: string): TurnSnapshot | undefined {
    if (this.launched.has(id)) return
    const row = this.db
      .prepare(
        "SELECT payload FROM agent_turn_queue WHERE id=? AND conversation_id=? AND owner=? AND status='running'"
      )
      .get(id, conversation, owner)
    if (!row) return
    this.launched.add(id)
    return JSON.parse(String(row.payload)) as TurnSnapshot
  }

  running(conversation: string): boolean {
    return Boolean(
      this.db
        .prepare("SELECT 1 FROM agent_turn_queue WHERE conversation_id=? AND status='running'")
        .get(conversation)
    )
  }

  resume(conversation: string, owner: string): void {
    this.db
      .prepare(
        "UPDATE agent_turn_queue SET owner=?,status='queued' WHERE conversation_id=? AND status IN ('waiting','queued')"
      )
      .run(owner, conversation)
  }

  release(owner: string): void {
    const rows = this.db
      .prepare("SELECT id FROM agent_turn_queue WHERE owner=? AND status='running'")
      .all(owner)
    for (const row of rows) {
      // Running Pi work remains in flight until Main teardown completes.
      if (!this.launched.has(String(row.id))) this.recoverClaim(String(row.id), owner)
    }
    this.db
      .prepare("UPDATE agent_turn_queue SET status='waiting' WHERE owner=? AND status='queued'")
      .run(owner)
  }

  recoverClaim(id: string, owner: string): void {
    if (this.launched.has(id)) return
    this.db
      .prepare(
        "UPDATE agent_turn_queue SET status='waiting' WHERE id=? AND owner=? AND status='running'"
      )
      .run(id, owner)
  }

  remove(conversation: string, id: string): boolean {
    return Boolean(
      this.db
        .prepare(
          "UPDATE agent_turn_queue SET status='canceled',payload=json_object('originalInput',substr(json_extract(payload,'$.originalInput'),1,240)) WHERE conversation_id=? AND id=? AND status IN ('queued','waiting')"
        )
        .run(conversation, id).changes
    )
  }

  finish(id: string, status: 'completed' | 'failed' | 'canceled', error?: string): void {
    this.launched.delete(id)
    this.db
      .prepare(
        "UPDATE agent_turn_queue SET status=?,error=?,payload=json_object('originalInput',substr(json_extract(payload,'$.originalInput'),1,240)) WHERE id=? AND status='running'"
      )
      .run(status, error ?? null, id)
    this.db.exec(`DELETE FROM agent_turn_queue WHERE sequence IN (
      SELECT q.sequence FROM agent_turn_queue q
      WHERE q.status IN ('completed','failed','canceled') AND q.sequence <=
        (SELECT max(sequence)-60 FROM agent_turn_queue WHERE conversation_id=q.conversation_id)
    )`)
  }
}
