import { randomUUID } from 'node:crypto'
import type {
  TerminalEvidenceNotice,
  TerminalIdentity,
  TerminalObservation
} from '../../../shared/terminal-observation-types'
import { canAnalyzeCommandGroup } from './command-observation'
import { terminalIdentityKey } from './terminal-observer'

interface Pending {
  identity: TerminalIdentity
  eventId: string
  token: string
  ready: boolean
  claimed: boolean
  timer?: ReturnType<typeof setTimeout>
}

/** Metadata-only notifications after a structured command group boundary. */
export class EvidenceNotifications {
  private pending = new Map<string, Pending>()
  private bindings = new Map<string, (notice: TerminalEvidenceNotice) => void>()
  private lastSent = new Map<string, number>()
  private lastHandledEvent = new Map<string, string>()

  bind(key: string, send: (notice: TerminalEvidenceNotice) => void): void {
    this.bindings.set(key, send)
  }
  /** A manual turn already reads this evidence. */
  consume(key: string): void {
    const pending = this.pending.get(key)
    if (pending) this.lastHandledEvent.set(key, pending.eventId)
    this.invalidate(key)
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
    this.lastHandledEvent.delete(key)
  }
  update(key: string, identity: TerminalIdentity, latest?: TerminalObservation): void {
    if (
      !latest ||
      !canAnalyzeCommandGroup(latest) ||
      terminalIdentityKey(latest) !== terminalIdentityKey(identity) ||
      latest.sensitive
    ) {
      this.invalidate(key)
      return
    }
    const groupId = latest.commandGroupId ?? latest.eventId
    // Prompt redraws can leave the same completed event at the end of the evidence.
    if (this.pending.get(key)?.eventId === groupId || this.lastHandledEvent.get(key) === groupId)
      return
    this.invalidate(key)
    if (
      !latest.output
        .replace(/\[(?:Sensitive[^\]]*|Long line withheld|REDACTED[^\]]*)\]/g, '')
        .trim()
    )
      return
    const pending: Pending = {
      identity: { ...identity },
      eventId: groupId,
      token: randomUUID(),
      ready: false,
      claimed: false
    }
    this.pending.set(key, pending)
    const delay = Math.max(1500, (this.lastSent.get(key) ?? 0) + 8000 - Date.now())
    pending.timer = setTimeout(() => {
      if (this.pending.get(key) !== pending) return
      pending.ready = true
      this.lastHandledEvent.set(key, pending.eventId)
      this.lastSent.set(key, Date.now())
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
