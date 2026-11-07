import { randomUUID } from 'node:crypto'
import type { TerminalIdentity } from '../../../shared/terminal-observation-types'
import type {
  TerminalObservationMode,
  TerminalObservationGrant
} from '../../../shared/external-terminal'
import { assertOperatorTerminalAccess } from '../../security/capability-enforcement'
import { terminalObservationBindingKey } from '../../../shared/terminal-observation-types'

/** Main owns grants. Agent/tool payloads and persisted settings never grant access. */
export class TerminalObservationGrants {
  private grants = new Map<
    string,
    { binding: string; id: string; grant: TerminalObservationGrant }
  >()
  constructor(private readonly invalidate: (key: string) => void) {}

  authorize(
    key: string,
    identity: TerminalIdentity,
    mode: TerminalObservationMode,
    capability: TerminalObservationGrant['capability'],
    options: { waitForLogin?: boolean } = {}
  ): TerminalObservationGrant | undefined {
    assertOperatorTerminalAccess()
    if (mode !== 'off' && mode !== 'live' && mode !== 'context-live')
      throw new Error('Invalid observation mode')
    this.revoke(key)
    if (mode === 'off') return undefined
    if (!identity.ownerId || !identity.itermSessionId || !identity.sessionGeneration)
      throw new Error('Observation requires a live owner and exact iTerm session')
    const waitForLogin = Boolean(options.waitForLogin)
    if (waitForLogin && (!identity.connectionId || capability !== 'structured-stream'))
      throw new Error('Pending observation requires a saved shared-terminal connection')
    if (this.grants.size >= 100) throw new Error('Too many observation grants')
    const grant: TerminalObservationGrant = {
      mode,
      status: waitForLogin ? 'pending' : 'active',
      startedAt: Date.now(),
      capability
    }
    this.grants.set(key, {
      binding: terminalObservationBindingKey(identity),
      id: randomUUID(),
      grant
    })
    return { ...grant }
  }

  read(key: string, identity: TerminalIdentity): TerminalObservationGrant | undefined {
    const entry = this.grants.get(key)
    if (!entry) return undefined
    if (
      entry.grant.status !== 'expired' &&
      entry.binding !== terminalObservationBindingKey(identity)
    ) {
      entry.grant.status = 'expired'
      this.invalidate(key)
    }
    return { ...entry.grant }
  }

  /** Consume the operator's one-shot consent only after Main verifies this connection's login. */
  completeLogin(key: string, identity: TerminalIdentity): TerminalObservationGrant | undefined {
    assertOperatorTerminalAccess()
    const grant = this.read(key, identity)
    if (grant?.status !== 'pending') return undefined
    return this.authorize(key, identity, grant.mode, grant.capability)
  }

  hasGrant(key: string): boolean {
    return this.grants.has(key)
  }

  activeGrantId(key: string, identity: TerminalIdentity): string | undefined {
    return this.active(key, identity) ? this.grants.get(key)?.id : undefined
  }

  active(key: string, identity: TerminalIdentity): boolean {
    return this.read(key, identity)?.status === 'active'
  }

  pause(key: string, identity: TerminalIdentity): void {
    assertOperatorTerminalAccess()
    const grant = this.read(key, identity)
    if (!grant || grant.status !== 'active') throw new Error('No active observation grant')
    this.grants.get(key)!.grant.status = 'paused'
    this.invalidate(key)
  }

  revoke(key: string): void {
    this.grants.delete(key)
    this.invalidate(key)
  }
}
