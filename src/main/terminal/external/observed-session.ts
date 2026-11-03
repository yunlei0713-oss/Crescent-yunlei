import type { TerminalSession, TerminalSessionEvents } from '../session/types'
import { assertOperatorTerminalAccess } from '../../security/capability-enforcement'
import { focusITermSession, itermRequest } from './iterm'
import { appendedITermScreenLines, normalizeITermScreen } from './screen'
import type { TerminalObservationMode } from '../../../shared/external-terminal'
import { redactSensitiveText } from '../../../shared/secret-redaction'

export interface ITermScreen {
  text: string
  columns: number
  rows: number
}

export function createObservedITermSession(
  sessionId: number,
  id: string,
  initial: ITermScreen,
  events: TerminalSessionEvents
): TerminalSession {
  let stopped = false
  let previous: string | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let livenessTimer: ReturnType<typeof setTimeout> | undefined
  let request = new AbortController()
  let mode: TerminalObservationMode = 'off'
  let epoch = 0
  let reading = Promise.resolve()
  let liveText = ''
  let sensitiveScreen = false
  const external = {
    provider: 'iterm2' as const,
    kind: 'existing' as const,
    sessionId: id,
    columns: initial.columns,
    rows: initial.rows
  }
  const publish = (screen: ITermScreen, version: number): void => {
    if (stopped || version !== epoch || mode === 'off') return
    if (
      Number.isInteger(screen.columns) &&
      Number.isInteger(screen.rows) &&
      screen.columns > 0 &&
      screen.columns <= 1000 &&
      screen.rows > 0 &&
      screen.rows <= 500
    ) {
      external.columns = screen.columns
      external.rows = screen.rows
      events.onExternalSize?.(screen.columns, screen.rows)
    }
    sensitiveScreen ||=
      /password|passphrase|verification code|one.time|\botp\b|密码|口令|验证码|-----BEGIN .*PRIVATE KEY-----/i.test(
        screen.text
      )
    const text = sensitiveScreen
      ? '[Sensitive screen content withheld]'
      : normalizeITermScreen(redactSensitiveText(screen.text))
    if (text !== previous) {
      const appended = previous === undefined ? '' : appendedITermScreenLines(previous, text)
      previous = text
      if (mode === 'live') {
        if (!appended) return
        liveText = `${liveText}\n${appended}`.slice(-16000)
      }
      events.onSnapshot?.(mode === 'live' ? liveText : text)
    }
  }
  let failures = 0
  const missing = (error: unknown): boolean =>
    error instanceof Error && /ITERM_SESSION_MISSING|ITERM_NOT_RUNNING/.test(error.message)
  const fail = (error: unknown): void => {
    if (stopped) return
    stopped = true
    clearTimeout(timer)
    clearTimeout(livenessTimer)
    request.abort()
    events.onDisplay(`\r\n${error instanceof Error ? error.message : 'iTerm disconnected'}\r\n`)
    events.onExit({ exitCode: 1 })
  }
  const poll = (version: number): void => {
    reading = reading.then(async () => {
      if (stopped || version !== epoch || mode === 'off') return
      try {
        failures = 0
        publish(await itermRequest<ITermScreen>({ action: 'read', id }, request.signal), version)
        if (!stopped && version === epoch) timer = setTimeout(() => poll(version), 750)
      } catch (error) {
        if (version === epoch && !request.signal.aborted) {
          if (missing(error)) fail(error)
          else {
            failures++
            events.onExternalWindow?.({
              ...external,
              windowState: 'status-unknown',
              statusError: error instanceof Error ? error.message : 'iTerm unavailable'
            })
            timer = setTimeout(
              () => poll(version),
              Math.min(30000, 750 * 2 ** Math.min(failures, 6))
            )
          }
        }
      }
    })
  }
  const stopObservation = (): void => {
    ++epoch
    clearTimeout(timer)
    request.abort()
    request = new AbortController()
    mode = 'off'
    previous = undefined
    liveText = ''
    sensitiveScreen = false
  }
  const setObservation = async (next: TerminalObservationMode): Promise<void> => {
    assertOperatorTerminalAccess()
    stopObservation()
    const version = epoch
    if (next === 'off') return
    // Baselines share the same queue as polling and metadata checks. Waiting on
    // the queue without adding this read allowed liveness/re-authorization to overlap.
    const starting = reading.then(async () => {
      if (stopped || version !== epoch) return
      const screen = await itermRequest<ITermScreen>({ action: 'read', id }, request.signal)
      if (stopped || version !== epoch) return
      mode = next
      if (next === 'live') {
        sensitiveScreen =
          /password|passphrase|verification code|one.time|\botp\b|密码|口令|验证码|-----BEGIN .*PRIVATE KEY-----/i.test(
            screen.text
          )
        previous = sensitiveScreen
          ? '[Sensitive screen content withheld]'
          : normalizeITermScreen(redactSensitiveText(screen.text))
      } else publish(screen, version)
      timer = setTimeout(() => poll(version), 750)
    })
    // The caller receives initial-read failures; later checks must not inherit
    // a rejected queue (including a read aborted by pause/revoke).
    reading = starting.catch(() => {})
    await starting
  }
  const checkLiveness = (): void => {
    reading = reading.then(async () => {
      if (stopped) return
      const controller = request
      const version = epoch
      try {
        // No content is fetched when observation is off. Session-specific metadata only.
        if (mode === 'off') {
          await itermRequest({ action: 'size', id }, controller.signal)
          failures = 0
          events.onExternalWindow?.({ ...external, windowState: 'attached' })
        }
      } catch (error) {
        if (!controller.signal.aborted && version === epoch) {
          if (missing(error)) fail(error)
          else {
            failures++
            events.onExternalWindow?.({
              ...external,
              windowState: 'status-unknown',
              statusError: error instanceof Error ? error.message : 'iTerm unavailable'
            })
          }
        }
      }
      if (!stopped)
        livenessTimer = setTimeout(
          checkLiveness,
          Math.min(30000, 5000 * 2 ** Math.min(failures, 3))
        )
    })
  }
  livenessTimer = setTimeout(checkLiveness, 5000)
  return {
    id: sessionId,
    mode: 'pty', // The underlying iTerm session is a PTY; capabilities are explicitly separate.
    pid: 0,
    cwd: '',
    shell: 'iTerm (screen snapshots)',
    external,
    openExternal: () => focusITermSession(id).then(() => {}),
    setObservation,
    stopObservation,
    write: () => {
      assertOperatorTerminalAccess()
      throw new Error('Existing iTerm bindings are read-only; type in iTerm')
    },
    display: events.onDisplay,
    interrupt: () => {
      assertOperatorTerminalAccess()
      throw new Error('Existing iTerm bindings cannot interrupt the user shell')
    },
    resize: () => {},
    clear: () => {},
    kill: () => {
      stopped = true
      epoch++
      liveText = ''
      clearTimeout(timer)
      clearTimeout(livenessTimer)
      request.abort()
      // Detach only: this shell and any SSH connection belong to iTerm.
    }
  }
}
