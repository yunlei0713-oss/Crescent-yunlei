import { spawn as spawnPty } from 'node-pty'
import type { TerminalSession, TerminalSessionEvents, TerminalTransportInput } from './types'
// Native node-pty exit callbacks must run before Electron tears down Node's env.
// Track transports here even after their logical session has been removed.
const pendingExits = new Map<Promise<void>, () => void>()

export async function waitForPtySessionsToExit(): Promise<boolean> {
  const wait = async (milliseconds: number): Promise<void> => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        Promise.all([...pendingExits.keys()]),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, milliseconds)
        })
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
  await wait(1000)
  // A shell can ignore SIGHUP. Escalate only during application shutdown,
  // only for the native transports still owned by this process.
  for (const force of pendingExits.values()) force()
  await wait(2000)
  await new Promise<void>((resolve) => setImmediate(resolve))
  return pendingExits.size === 0
}

export function createPtySession(
  input: TerminalTransportInput,
  events: TerminalSessionEvents
): TerminalSession {
  const pty = spawnPty(input.shell, input.args, {
    name: 'xterm-256color',
    cols: input.cols,
    rows: input.rows,
    cwd: input.cwd,
    env: input.env
  })
  let killed = false
  let exited = false
  let resolveExit!: () => void
  const exit = new Promise<void>((resolve) => {
    resolveExit = resolve
  })
  pendingExits.set(exit, () => {
    try {
      pty.kill('SIGKILL')
    } catch {
      /* The native exit callback may already be queued. */
    }
  })
  const dataDisposable = pty.onData((data) => {
    events.onData(data)
  })
  const exitDisposable = pty.onExit(({ exitCode, signal }) => {
    exited = true
    dataDisposable.dispose()
    exitDisposable.dispose()
    pendingExits.delete(exit)
    resolveExit()
    if (!killed) events.onExit({ exitCode, signal })
  })

  return {
    id: input.sessionId,
    mode: 'pty',
    pid: pty.pid,
    cwd: input.cwd,
    shell: input.shell,
    write: (data) => pty.write(data),
    display: (data) => events.onDisplay(data),
    interrupt: () => pty.write('\x03'),
    resize: (cols, rows) => pty.resize(cols, rows),
    clear: () => pty.clear(),
    kill: () => {
      if (killed || exited) return
      killed = true
      dataDisposable.dispose()
      // Retain the native exit observer until it drains; logical exit waiters
      // have already been settled by TerminalSessionManager.stop().
      pty.kill()
    }
  }
}
