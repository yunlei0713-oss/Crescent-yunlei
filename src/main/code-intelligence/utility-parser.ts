import { utilityProcess } from 'electron'
import { join } from 'node:path'
import { IndexParserUnavailable, type IndexParser, type ParsedIndexFile } from './parser-protocol'

export function openIndexParser(signal?: AbortSignal): IndexParser {
  signal?.throwIfAborted()
  const child = utilityProcess.fork(join(__dirname, 'code-index-worker.js'), [], {
    serviceName: 'MoXun Code Index',
    env: { PATH: '/usr/bin:/bin' },
    stdio: 'ignore'
  })
  let nextId = 0
  let closed = false
  let pending:
    | {
        id: number
        resolve: (value: ParsedIndexFile | undefined) => void
        reject: (error: unknown) => void
        timer: ReturnType<typeof setTimeout>
      }
    | undefined

  const close = (): void => {
    if (closed) return
    closed = true
    signal?.removeEventListener('abort', close)
    if (pending) {
      const { reject, timer } = pending
      pending = undefined
      clearTimeout(timer)
      reject(signal?.aborted ? signal.reason : new IndexParserUnavailable())
    }
    if (child.pid !== undefined) child.kill()
  }
  signal?.addEventListener('abort', close, { once: true })
  child.once('spawn', () => {
    if (closed) child.kill()
  })
  child.once('exit', close)
  child.once('error', close)
  child.on('message', (result: { id: number; parsed?: ParsedIndexFile }) => {
    if (!pending || result?.id !== pending.id) return
    const { resolve, timer } = pending
    pending = undefined
    clearTimeout(timer)
    resolve(result.parsed)
  })

  return {
    parse(path, text) {
      signal?.throwIfAborted()
      if (closed || pending) throw new IndexParserUnavailable()
      const id = ++nextId
      return new Promise((resolve, reject) => {
        pending = { id, resolve, reject, timer: setTimeout(close, 5000) }
        try {
          child.postMessage({ id, path, text })
        } catch {
          close()
        }
      })
    },
    close
  }
}
