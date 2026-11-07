import type { TerminalObservation } from '../../../shared/terminal-observation-types'

export type ShellProtocol = 'osc133' | 'osc633'

export function parseShellMarker(
  sequence: string
): { protocol: ShellProtocol; event: string; exitCode?: number } | undefined {
  // eslint-disable-next-line no-control-regex -- OSC shell integration framing.
  const marker = /^\x1b\](133|633);([ABCD])(?:;(-?\d+))?(?:\x07|\x1b\\)$/.exec(sequence)
  if (!marker || (marker[3] !== undefined && marker[2] !== 'D')) return
  const code = marker[3] === undefined ? undefined : Number(marker[3])
  return {
    protocol: marker[1] === '133' ? 'osc133' : 'osc633',
    event: marker[2],
    exitCode: Number.isSafeInteger(code) ? code : undefined
  }
}

export function canAnalyzeCommandGroup(latest: TerminalObservation): boolean {
  return (
    latest.groupState !== 'incomplete' &&
    latest.confidence === 'structured' &&
    ['completed', 'failed', 'finished-unknown'].includes(latest.status)
  )
}
