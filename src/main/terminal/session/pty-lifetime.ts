import { spawn } from 'node:child_process'

/** A private pipe closes even on Main SIGKILL. The detached reaper owns only this
 * newly spawned PTY process group and its optional private socket directory.
 * No command or path is supplied by Renderer/Agent. Normal native exit disarms it.
 */
export function supervisePtyLifetime(
  pid: number,
  onFailure: () => void,
  directory = ''
): () => void {
  // kill(-1) means every permitted process, and kill(0) targets our own group.
  // Never let a malformed native transport turn cleanup into a broad signal.
  if (!Number.isSafeInteger(pid) || pid <= 1 || pid > 0x7fffffff)
    throw new Error('PTY lifetime guard requires a positive child PID greater than 1')
  const reaper = spawn(
    '/bin/sh',
    [
      '-c',
      `
IFS= read -r pid || exit 1
case "$pid" in ''|*[!0-9]*|0|1) exit 1;; esac
if IFS= read -r done; then exit 0; fi
/bin/kill -HUP -- "-$pid" 2>/dev/null
/bin/sleep 1
/bin/kill -KILL -- "-$pid" 2>/dev/null
if [ -n "$1" ]; then /bin/rm -rf -- "$1"; fi
`,
      'moxun-pty-reaper',
      directory
    ],
    { detached: true, stdio: ['pipe', 'ignore', 'ignore'] }
  )
  let disarmed = false
  reaper.once('error', () => {
    if (!disarmed) onFailure()
  })
  reaper.once('exit', () => {
    if (!disarmed) onFailure()
  })
  reaper.stdin.on('error', () => {
    if (!disarmed) onFailure()
  })
  reaper.stdin.write(`${pid}\n`)
  reaper.unref()
  // The guard must not hold Electron open while native shutdown drains.
  ;(reaper.stdin as NodeJS.WritableStream & { unref?: () => void }).unref?.()
  return () => {
    if (disarmed) return
    disarmed = true
    reaper.stdin.end('done\n')
  }
}
