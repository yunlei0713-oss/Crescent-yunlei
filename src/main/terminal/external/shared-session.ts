import type { ExternalTerminalBinding } from '../../../shared/external-terminal'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Socket } from 'node:net'
import { createPtySession } from '../session/pty-session'
import type {
  TerminalSession,
  TerminalSessionEvents,
  TerminalTransportInput
} from '../session/types'
import { focusITermSession, itermRequest } from './iterm'
import { assertOperatorTerminalAccess } from '../../security/capability-enforcement'
import { plainTerminalCache } from './screen'

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** One host-owned PTY, with iTerm as a native view over a private Unix socket. */
export function createSharedITermSession(
  input: TerminalTransportInput,
  events: TerminalSessionEvents,
  onInput: (data: string) => void
): TerminalSession {
  const directory = mkdtempSync(join(tmpdir(), 'mx-'))
  chmodSync(directory, 0o700)
  const socketPath = join(directory, 's')
  const scriptPath = join(directory, 'attach.sh')
  let client: Socket | undefined
  let stopped = false
  let history = ''
  let sizeTimer: ReturnType<typeof setTimeout> | undefined
  let opening: Promise<void> | undefined
  let observationEpoch = 0
  let connected: (() => void) | undefined
  let disconnected: (() => void) | undefined
  const server = createServer((socket) => {
    if (stopped || client) {
      socket.destroy()
      return
    }
    client = socket
    socket.setEncoding('utf8')
    socket.write(history)
    socket.on('data', (data: string) => {
      if (!stopped) {
        try {
          onInput(data)
        } catch {
          socket.destroy()
        }
      }
    })
    socket.on('error', () => socket.destroy())
    socket.on('close', () => {
      if (client === socket) client = undefined
    })
    connected?.()
  })
  // A 0700 parent and 0600 socket keep the bridge local to this OS user.
  const listening = new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(socketPath, () => {
      if (stopped) {
        server.close(() => rmSync(directory, { recursive: true, force: true }))
        reject(new Error('Terminal disconnected'))
        return
      }
      try {
        chmodSync(socketPath, 0o600)
        resolve()
      } catch (error) {
        reject(error)
      }
    })
  })
  void listening.catch(() => {})
  const dispose = (): void => {
    if (stopped) return
    stopped = true
    ++observationEpoch
    clearTimeout(sizeTimer)
    disconnected?.()
    client?.destroy()
    server.close(() => rmSync(directory, { recursive: true, force: true }))
  }
  let pty: TerminalSession
  try {
    // macOS ships bash, stty and nc. No Python, tmux, plugin or runtime download.
    writeFileSync(
      scriptPath,
      `#!/bin/bash\nold=$(/bin/stty -g) || exit 1\ntrap '/bin/stty "$old"; printf "\\033[0m\\033[?25h\\r\\n"' EXIT\n/bin/stty raw -echo\n/usr/bin/nc -U ${shellQuote(socketPath)}\n`,
      { mode: 0o700 }
    )
    pty = createPtySession(
      input,
      {
        ...events,
        onData: (data) => {
          history = (history + data).slice(-240000)
          if (client && client.writableLength < 1024 * 1024) client.write(data)
          else client?.destroy()
          events.onData(data)
        },
        onExit: (event) => {
          dispose()
          events.onExit(event)
        }
      },
      directory
    )
  } catch (error) {
    dispose()
    throw error
  }
  const external: ExternalTerminalBinding = {
    windowState: 'window-closed',
    windowGeneration: 0,
    provider: 'iterm2' as const,
    kind: 'shared' as const,
    sessionId: '',
    columns: input.cols,
    rows: input.rows
  }
  let failures = 0
  let pendingId = ''
  const publishWindow = (state: ExternalTerminalBinding['windowState'], error?: string): void => {
    external.windowState = state
    external.statusError = error
    events.onExternalWindow?.({ ...external })
  }
  const closed = (): void => {
    clearTimeout(sizeTimer)
    ++observationEpoch
    external.sessionId = ''
    client?.destroy()
    client = undefined
    publishWindow('window-closed')
  }
  const missing = (error: unknown): boolean =>
    error instanceof Error && /ITERM_SESSION_MISSING|ITERM_NOT_RUNNING/.test(error.message)
  const syncSize = async (): Promise<void> => {
    const uuid = external.sessionId
    if (stopped || !uuid) return
    try {
      const size = await itermRequest<{ columns: number; rows: number }>({
        action: 'size',
        id: uuid
      })
      if (stopped || external.sessionId !== uuid) return
      failures = 0
      if (external.windowState === 'status-unknown') publishWindow('attached')
      if (
        Number.isInteger(size.columns) &&
        Number.isInteger(size.rows) &&
        size.columns > 0 &&
        size.columns <= 1000 &&
        size.rows > 0 &&
        size.rows <= 500
      ) {
        if (external.columns !== size.columns || external.rows !== size.rows)
          pty.resize(size.columns, size.rows)
        external.columns = size.columns
        external.rows = size.rows
        events.onExternalSize?.(size.columns, size.rows)
      }
    } catch (error) {
      if (stopped || external.sessionId !== uuid) return
      if (missing(error)) {
        closed()
        return
      }
      ++failures
      publishWindow('status-unknown', error instanceof Error ? error.message : 'iTerm unavailable')
    }
    if (!stopped && external.sessionId === uuid)
      sizeTimer = setTimeout(
        () => void syncSize(),
        Math.min(30000, 1000 * 2 ** Math.min(failures, 5))
      )
  }
  const waitForBridge = async (): Promise<void> => {
    if (client) return
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error('iTerm bridge connection timed out'))
      }, 10000)
      const cleanup = (): void => {
        clearTimeout(timer)
        connected = undefined
        disconnected = undefined
      }
      connected = () => {
        cleanup()
        resolve()
      }
      disconnected = () => {
        cleanup()
        reject(new Error('Terminal disconnected'))
      }
    })
  }

  return {
    ...pty,
    external,
    resize: () => {}, // iTerm owns geometry.
    stopObservation: () => {
      ++observationEpoch
    },
    setObservation: async (mode) => {
      assertOperatorTerminalAccess()
      const version = ++observationEpoch
      if (mode !== 'off' && external.windowState !== 'attached')
        throw new Error('No attached iTerm window')
      if (mode !== 'context-live' || stopped) return
      // Inspect the entire retained cache before the Observer redacts and bounds
      // it. It is plain evidence, never a replay of cached OSC control markers.
      const text = plainTerminalCache(history)
      if (!stopped && version === observationEpoch) events.onSnapshot?.(text, true)
    },
    openExternal: () => {
      assertOperatorTerminalAccess()
      if (opening) return opening
      opening = (async () => {
        await listening
        if (stopped) throw new Error('Terminal disconnected')
        clearTimeout(sizeTimer)
        if (external.sessionId) {
          try {
            await focusITermSession(external.sessionId)
            await syncSize()
            if (external.sessionId) return
          } catch (error) {
            if (!missing(error)) {
              publishWindow(
                'status-unknown',
                error instanceof Error ? error.message : 'iTerm unavailable'
              )
              sizeTimer = setTimeout(() => void syncSize(), 5000)
              throw error
            }
            closed()
          }
        }
        publishWindow('reopening')
        try {
          // A late bridge connection must not create a second view after a timeout.
          if (pendingId) {
            try {
              await focusITermSession(pendingId)
            } catch (error) {
              if (!missing(error)) throw error
              pendingId = ''
            }
          }
          if (!pendingId) {
            const created = await itermRequest<{ id: string }>({
              action: 'create',
              command: `/bin/bash ${shellQuote(scriptPath)}`
            })
            if (stopped) throw new Error('Terminal disconnected')
            pendingId = created.id
          }
          await waitForBridge()
          if (stopped) throw new Error('Terminal disconnected')
          external.sessionId = pendingId
          pendingId = ''
          external.windowGeneration = (external.windowGeneration ?? 0) + 1
          publishWindow('attached')
          events.onExternalBinding?.({ ...external })
          await syncSize()
        } catch (error) {
          if (!stopped)
            publishWindow('window-closed', error instanceof Error ? error.message : 'Reopen failed')
          throw error
        }
      })().finally(() => {
        opening = undefined
      })
      return opening
    },
    kill: () => {
      if (stopped) return
      publishWindow('ended')
      dispose()
      pty.kill()
    }
  }
}
