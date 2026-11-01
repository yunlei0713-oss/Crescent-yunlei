import { createHash, randomUUID } from 'node:crypto'
import type {
  TerminalEvidence,
  TerminalEvidenceNotice,
  TerminalIdentity
} from '../../../shared/terminal-observation-types'
import { terminalIdentityKey } from './terminal-observer'

interface Pending {
  identity: TerminalIdentity
  fingerprint: string
  token: string
  ready: boolean
  claimed: boolean
  timer?: ReturnType<typeof setTimeout>
}

/** Metadata-only, quiet-period notifications; no per-chunk model calls or idle polling. */
export class EvidenceNotifications {
  private pending = new Map<string, Pending>()
  private bindings = new Map<string, (notice: TerminalEvidenceNotice) => void>()
  private lastSent = new Map<string, number>()
  private streamSent = new Map<string, string>()

  bind(key: string, send: (notice: TerminalEvidenceNotice) => void): void {
    this.bindings.set(key, send)
  }
  /** A manual turn already reads this evidence; retain its fingerprint for snapshot deduplication. */
  consume(key: string): void {
    const pending = this.pending.get(key)
    if (!pending) return
    clearTimeout(pending.timer)
    pending.timer = undefined
    pending.ready = false
    pending.claimed = true
    this.bindings.get(key)?.({ identity: pending.identity })
  }
  invalidate(key: string): void {
    const previous = this.pending.get(key)
    clearTimeout(previous?.timer)
    this.pending.delete(key)
    if (previous) this.bindings.get(key)?.({ identity: previous.identity })
  }
  forget(key: string): void {
    this.invalidate(key)
    this.bindings.delete(key)
    this.lastSent.delete(key)
    this.streamSent.delete(key)
  }
  update(key: string, evidence: TerminalEvidence, input = false, submitted = false): void {
    if (submitted) this.streamSent.delete(key)
    const latest = evidence.observations.at(-1)
    const stableOutput =
      latest?.confidence === 'snapshot'
        ? latest.output.slice(0, latest.output.lastIndexOf('\n') + 1)
        : (latest?.output ?? '')
    if (
      input ||
      !evidence.available ||
      !latest ||
      terminalIdentityKey(latest) !== terminalIdentityKey(evidence.identity) ||
      latest.sensitive ||
      !['unknown', 'completed', 'failed', 'running', 'interactive'].includes(latest.status) ||
      !stableOutput.trim() ||
      !stableOutput.replace(/\[(?:Sensitive[^\]]*|Long line withheld|REDACTED[^\]]*)\]/g, '').trim()
    ) {
      this.invalidate(key)
      return
    }
    // Completion is new evidence even if a quiet in-progress screen was analyzed earlier.
    const streamKey =
      terminalIdentityKey(evidence.identity) + ':' + latest.eventId + ':' + latest.status
    // An uncertain output stream may be tail/watch. Do not keep asking the
    // model about the same stream; a new manual submission or OSC event resets it.
    if (latest.confidence !== 'snapshot' && this.streamSent.get(key) === streamKey) return
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify([
          terminalIdentityKey(evidence.identity),
          latest.command,
          stableOutput,
          latest.status,
          // Snapshot event IDs change on each read; content is the stable identity.
          latest.confidence === 'snapshot' ? undefined : latest.eventId
        ])
      )
      .digest('hex')
    if (this.pending.get(key)?.fingerprint === fingerprint) return
    this.invalidate(key)
    const pending: Pending = {
      identity: { ...evidence.identity },
      fingerprint,
      token: randomUUID(),
      ready: false,
      claimed: false
    }
    this.pending.set(key, pending)
    const delay = Math.max(1500, (this.lastSent.get(key) ?? 0) + 8000 - Date.now())
    pending.timer = setTimeout(() => {
      if (this.pending.get(key) !== pending) return
      pending.ready = true
      this.lastSent.set(key, Date.now())
      if (latest.confidence !== 'snapshot') this.streamSent.set(key, streamKey)
      this.bindings.get(key)?.({ identity: pending.identity, token: pending.token })
    }, delay)
    pending.timer.unref?.()
  }
  claim(key: string, identity: TerminalIdentity, token: string): boolean {
    const pending = this.pending.get(key)
    if (
      !pending?.ready ||
      pending.claimed ||
      pending.token !== token ||
      terminalIdentityKey(pending.identity) !== terminalIdentityKey(identity)
    )
      return false
    pending.claimed = true
    return true
  }
}

export const evidenceNotifications = new EvidenceNotifications()
