import type { TerminalEvidence, TerminalIdentity } from '../../../shared/terminal-observation-types'
import { TerminalObserver } from './terminal-observer'
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
  if (value.bind(identity)) evidenceNotifications.invalidate(key)
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
  options?: { completeLinesOnly?: boolean; previousPrompt?: string }
): void {
  if (!observationGrants.active(key, identity)) return
  try {
    const value = observer(key, identity)
    if (kind === 'input') {
      value.inputData(data, options?.previousPrompt)
      evidenceNotifications.consume(key)
    } else {
      if (kind === 'snapshot') value.snapshotData(data, options?.completeLinesOnly)
      else value.outputData(data)
      evidenceNotifications.update(key, identity, value.notificationObservation())
    }
  } catch {
    observers.get(key)?.fail()
    evidenceNotifications.invalidate(key)
  }
}
export function confirmTerminalFinished(key: string, identity: TerminalIdentity): boolean {
  if (!observationGrants.active(key, identity)) return false
  const confirmed = observers.get(key)?.confirmOperatorFinished() ?? false
  if (confirmed) evidenceNotifications.consume(key)
  return confirmed
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
