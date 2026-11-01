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
  const external = {
    provider: 'iterm2' as const,
    kind: 'shared' as const,
    sessionId: '',
    columns: input.cols,
    rows: input.rows
  }
  const syncSize = async (): Promise<void> => {
    try {
      const size = await itermRequest<{ columns: number; rows: number }>({
        action: 'size',
        id: external.sessionId
      })
      if (stopped) return
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
      sizeTimer = setTimeout(() => void syncSize(), 1000)
    } catch {
      // The internal PTY survives closing iTerm. Reopen explicitly from the pane.
    }
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
        if (external.sessionId) {
          try {
            await focusITermSession(external.sessionId)
            clearTimeout(sizeTimer)
            await syncSize()
            return
          } catch (error) {
            // A closed iTerm view can leave nc's socket half-open. UUID liveness,
            // not client truthiness, decides whether to reopen the same PTY.
            if (!(error instanceof Error) || !error.message.includes('ITERM_SESSION_MISSING'))
              throw error
            client?.destroy()
            client = undefined
          }
        }
        clearTimeout(sizeTimer)
        const created = await itermRequest<{ id: string }>({
          action: 'create',
          command: `/bin/bash ${shellQuote(scriptPath)}`
        })
        external.sessionId = created.id
        events.onExternalBinding?.({ ...external })
        if (stopped) throw new Error('Terminal disconnected')
        if (!client)
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
        await syncSize()
      })().finally(() => {
        opening = undefined
      })
      return opening
    },
    kill: () => {
      dispose()
      pty.kill()
    }
  }
}
