import type { TerminalEvidence, TerminalIdentity } from '../../../shared/terminal-observation-types'
import { TerminalObserver, terminalIdentityKey } from './terminal-observer'
import { TerminalObservationGrants } from './observation-grants'
import { evidenceNotifications } from './evidence-notifications'

const observers = new Map<string, TerminalObserver>()
const samplingStops = new Map<string, () => void>()
export const observationGrants = new TerminalObservationGrants((key) => {
  evidenceNotifications.invalidate(key)
  observers.delete(key)
  samplingStops.get(key)?.()
})
export function bindObservationSampling(key: string, stop: () => void): void {
  samplingStops.set(key, stop)
}
function observer(key: string, identity: TerminalIdentity): TerminalObserver {
  let value = observers.get(key)
  if (!value) {
    if (observers.size >= 100) observers.delete(observers.keys().next().value!)
    value = new TerminalObserver()
    observers.set(key, value)
  }
  if (terminalIdentityKey(value.evidence().identity) !== terminalIdentityKey(identity))
    evidenceNotifications.invalidate(key)
  value.bind(identity)
  return value
}
/** Refresh host metadata without revoking a same-terminal grant or its history. */
export function refreshTerminalObservation(key: string, identity: TerminalIdentity): void {
  if (observationGrants.active(key, identity) && observers.has(key)) observer(key, identity)
}
export function observeTerminal(
  key: string,
  identity: TerminalIdentity,
  kind: 'input' | 'output' | 'snapshot',
  data: string,
  completeLinesOnly = false
): void {
  if (!observationGrants.active(key, identity)) return
  try {
    const value = observer(key, identity)
    if (kind === 'input') value.inputData(data)
    else if (kind === 'snapshot') value.snapshotData(data, completeLinesOnly)
    else value.outputData(data)
    evidenceNotifications.update(
      key,
      value.evidence(),
      kind === 'input',
      kind === 'input' && /[\r\n]/.test(data)
    )
  } catch {
    observers.get(key)?.fail()
  }
}
export function terminalEvidence(
  key: string,
  identity: TerminalIdentity,
  contextChars?: number
): TerminalEvidence {
  if (!observationGrants.active(key, identity)) {
    return {
      identity,
      available: false,
      observations: [],
      retention: 'Terminal observation is not authorized or is paused. No evidence retained.'
    }
  }
  return observer(key, identity).evidence(contextChars)
}
export function forgetTerminalEvidence(key: string): void {
  observationGrants.revoke(key)
  samplingStops.delete(key)
  evidenceNotifications.forget(key)
}
