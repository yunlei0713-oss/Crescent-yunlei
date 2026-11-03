import { getDatabase, resolveConversationId } from '../crescent-sqlite'
import { ensureConversation } from './conversations'
import { redactSensitiveText } from '../../shared/secret-redaction'
import type {
  CommandProposal,
  GuidedOpsState,
  GuidedOpsHistoryQuery,
  GuidedOpsHistoryPage
} from '../../shared/guided-ops-types'

export class GuidedOpsRepository {
  append(id: string, runId: string, proposal: CommandProposal): CommandProposal {
    const db = getDatabase()
    const conversationId = ensureConversation(db, id)
    db.exec('BEGIN IMMEDIATE')
    try {
      if (
        db
          .prepare('SELECT 1 FROM guided_ops_steps WHERE conversation_id=? AND run_id=?')
          .get(conversationId, runId)
      )
        throw new Error('Only one proposal per run')
      const row = db
        .prepare(
          'SELECT COALESCE(MAX(step_number),0)+1 AS step FROM guided_ops_steps WHERE conversation_id=?'
        )
        .get(conversationId)
      // Persist a whitelisted projection only. UUIDs/grants/streams are deliberately absent.
      const saved: CommandProposal = {
        ...proposal,
        step: Number(row?.step),
        valid: false,
        target: {
          tabId: proposal.target.tabId,
          sessionGeneration: 0,
          host: proposal.target.host ? redactSensitiveText(proposal.target.host) : undefined,
          cwd: proposal.target.cwd ? redactSensitiveText(proposal.target.cwd) : undefined
        }
      }
      const json = redactSensitiveText(JSON.stringify(saved))
      db.prepare(`INSERT INTO guided_ops_steps VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
        saved.id,
        conversationId,
        proposal.target.tabId,
        runId,
        saved.step,
        saved.createdAt,
        saved.goal,
        json,
        'PROPOSAL_READY',
        Date.now()
      )
      db.exec('COMMIT')
      return { ...proposal, step: saved.step }
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
  update(id: string, state: GuidedOpsState): void {
    getDatabase()
      .prepare('UPDATE guided_ops_steps SET state=?,updated_at=? WHERE proposal_id=?')
      .run(state, Date.now(), id)
  }
  latestGoal(id: string): string {
    const row = getDatabase()
      .prepare(
        'SELECT goal FROM guided_ops_steps WHERE conversation_id=? ORDER BY step_number DESC LIMIT 1'
      )
      .get(resolveConversationId(id))
    return typeof row?.goal === 'string' ? row.goal : ''
  }
  list(query: GuidedOpsHistoryQuery): GuidedOpsHistoryPage {
    if (
      !query ||
      typeof query.conversationId !== 'string' ||
      !query.conversationId.trim() ||
      (query.terminalTabId !== undefined && typeof query.terminalTabId !== 'string') ||
      (query.limit !== undefined && (!Number.isInteger(query.limit) || query.limit < 1)) ||
      (query.beforeCursor &&
        (!Number.isSafeInteger(query.beforeCursor.createdAt) ||
          typeof query.beforeCursor.proposalId !== 'string'))
    )
      throw new Error('Invalid history cursor or scope')
    const db = getDatabase(),
      id = resolveConversationId(query.conversationId)
    const limit = Math.min(100, query.limit ?? 30)
    const filter = query.terminalTabId ? ' AND terminal_tab_id=?' : ''
    const args = query.terminalTabId ? [id, query.terminalTabId] : [id]
    const totalCount = Number(
      db
        .prepare(`SELECT COUNT(*) AS n FROM guided_ops_steps WHERE conversation_id=?${filter}`)
        .get(...args)?.n
    )
    const cursor = query.beforeCursor
    const rows = db
      .prepare(
        `SELECT * FROM guided_ops_steps WHERE conversation_id=?${filter}
      ${cursor ? 'AND (created_at < ? OR (created_at=? AND proposal_id < ?))' : ''}
      ORDER BY created_at DESC,proposal_id DESC LIMIT ?`
      )
      .all(
        ...args,
        ...(cursor ? [cursor.createdAt, cursor.createdAt, cursor.proposalId] : []),
        limit + 1
      )
    const hasMore = rows.length > limit
    const items = rows.slice(0, limit).map((row) => ({
      proposal: JSON.parse(String(row.proposal_json)) as CommandProposal,
      runId: String(row.run_id),
      terminalTabId: String(row.terminal_tab_id),
      state: row.state as GuidedOpsState
    }))
    const last = items.at(-1)?.proposal
    return {
      totalCount,
      items,
      hasMore,
      nextCursor: hasMore && last ? { createdAt: last.createdAt, proposalId: last.id } : undefined
    }
  }
}
export const guidedOpsRepository = new GuidedOpsRepository()
