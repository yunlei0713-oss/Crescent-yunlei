const MAX_REPLAY_UNITS = 512 * 1024

/** Retain chunks without rebuilding a large string on each native PTY callback. */
export class TerminalOutputBuffer {
  private chunks: ({ start: number; data: string } | undefined)[] = []
  private head = 0
  private end = 0

  get cursor(): number {
    return this.end
  }

  push(data: string): void {
    if (!data) return
    const end = this.end + data.length
    let start = Math.max(0, data.length - MAX_REPLAY_UNITS)
    const code = data.charCodeAt(start)
    if (start > 0 && code >= 0xdc00 && code <= 0xdfff) start++
    this.chunks.push({ start: this.end + start, data: data.slice(start) })
    this.end = end
    while ((this.chunks[this.head]?.start ?? end) < end - MAX_REPLAY_UNITS)
      this.chunks[this.head++] = undefined
    if (this.head >= 1024) {
      this.chunks = this.chunks.slice(this.head)
      this.head = 0
    }
  }

  read(cursor: number): { data: string; cursor: number; truncated: boolean } {
    const start = this.chunks[this.head]?.start ?? this.end
    const output: string[] = []
    for (let index = this.head; index < this.chunks.length; index++) {
      const chunk = this.chunks[index]
      if (chunk && chunk.start + chunk.data.length > cursor)
        output.push(chunk.data.slice(Math.max(0, cursor - chunk.start)))
    }
    return { data: output.join(''), cursor: this.end, truncated: cursor < start }
  }
}
