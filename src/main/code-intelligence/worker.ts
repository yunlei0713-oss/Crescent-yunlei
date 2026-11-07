import { parseCode } from './parser'
import type { ParseIndexFile } from './parser-protocol'

const port = process.parentPort
port.on('message', ({ data }: { data: ParseIndexFile }) => {
  const { id, path, text } = data
  void parseCode(path, text).then(
    (parsed) => port.postMessage({ id, parsed }),
    () => port.postMessage({ id })
  )
})
