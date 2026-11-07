const MAX_LINE = 16000
const UNCERTAIN_LINE = '[Edited terminal line withheld]'

/** Horizontal terminal edits only. Never claim to reconstruct wrapped/full-screen output. */
export class TerminalTextStream {
  private cells: string[] = []
  private cursor = 0
  private uncertain = false
  private overflow = false
  private complexColumns = false
  private escape = ''
  private discardEscape = false

  constructor(
    private readonly onLine: (line: string) => void,
    private readonly onControl?: (sequence: string) => void,
    private readonly onChange?: (lineTail: string) => void
  ) {}

  get line(): string {
    return this.overflow
      ? '[Long line withheld]'
      : this.uncertain
        ? UNCERTAIN_LINE
        : this.cells.join('')
  }

  clearLine(): void {
    this.cells = []
    this.cursor = 0
    this.uncertain = false
    this.overflow = false
    this.complexColumns = false
  }

  reset(): void {
    this.clearLine()
    this.escape = ''
    this.discardEscape = false
  }

  flushLine(): void {
    const line = this.line
    this.clearLine()
    this.onLine(line)
  }

  write(data: string): void {
    for (const char of data) {
      if (this.escape) {
        this.escape += char
        const prefix = this.escape.slice(0, 2)
        if (['\x1b]', '\x1bP', '\x1b_', '\x1b^'].includes(prefix)) {
          if ((prefix === '\x1b]' && char === '\x07') || this.escape.endsWith('\x1b\\')) {
            if (!this.discardEscape) this.onControl?.(this.escape)
            this.escape = ''
            this.discardEscape = false
          }
        } else if (prefix === '\x1b[') {
          if (this.escape.length > 2 && /[@-~]/.test(char)) {
            if (this.discardEscape) this.uncertain = true
            else {
              this.edit(this.escape)
              this.onControl?.(this.escape)
            }
            this.escape = ''
            this.discardEscape = false
            this.notifyChange()
          }
        } else if (/[()*+\-./]/.test(prefix[1])) {
          // Character-set designation has one more byte, not printable text.
          if (this.escape.length === 3) this.escape = ''
        } else if (this.escape.length >= 2) {
          this.uncertain = true
          this.escape = ''
        }
        if (this.escape.length > 2048) {
          this.discardEscape = true
          this.escape = prefix + (char === '\x1b' ? char : '')
        }
        continue
      }
      const overwriting = this.cursor < this.cells.length
      const wasOverflow = this.overflow
      if (char === '\x1b') this.escape = char
      else if (char === '\n') this.flushLine()
      else if (char === '\r') this.cursor = 0
      else if (char === '\b') {
        this.checkColumnWidth()
        this.cursor = Math.max(0, this.cursor - 1)
      } else if (char >= ' ' && char !== '\x7f' && !(char >= '\x80' && char <= '\x9f')) {
        this.put(char)
      } else if (char === '\t') this.put(char)
      else if (char !== '\x07') this.uncertain = true
      // The colon already matches a secret prompt before any trailing spaces.
      // PEM boundaries end in hyphens. Scan edits and newly overflowing lines too.
      if (
        overwriting ||
        (!wasOverflow && this.overflow) ||
        char === ':' ||
        char === '：' ||
        char === '-'
      )
        this.notifyChange()
    }
  }

  private put(char: string): void {
    if (this.cursor >= MAX_LINE) {
      this.overflow = true
      return
    }
    // CR followed by LF is ordinary output, including Unicode. Only an actual
    // overwrite needs display-column reconstruction.
    if (this.cursor < this.cells.length) this.checkColumnWidth()
    while (this.cells.length < this.cursor) this.cells.push(' ')
    this.cells[this.cursor++] = char
    this.complexColumns ||= char < ' ' || char > '~'
  }

  private notifyChange(): void {
    if (!this.onChange) return
    // Secret prompts are suffix patterns. Do not materialize/scan a growing
    // 16K line on every byte; full-line redaction still happens at flush.
    this.onChange(
      this.overflow
        ? '[Long line withheld]'
        : this.uncertain
          ? UNCERTAIN_LINE
          : this.cells.slice(-256).join('')
    )
  }

  private checkColumnWidth(): void {
    // Cursor arguments count display columns, not code points. Withhold edits
    // involving tabs/wide/combining characters rather than inventing a command.
    if (this.complexColumns) this.uncertain = true
  }

  private edit(sequence: string): void {
    const body = sequence.slice(2, -1)
    const final = sequence.at(-1)
    if (final === 'm' || /^[?\d;]*[hl]$/.test(sequence.slice(2))) return
    if (final === 'J' && (body === '' || body === '0') && this.cursor === 0) {
      // Erasing to the end of the screen at column zero also clears this line.
      this.clearLine()
      return
    }
    if (!/^\d*$/.test(body)) {
      this.uncertain = true
      return
    }
    this.checkColumnWidth()
    const count = Math.min(MAX_LINE, Number(body) || 1)
    if (final === 'D') this.cursor = Math.max(0, this.cursor - count)
    else if (final === 'C') this.cursor = Math.min(MAX_LINE, this.cursor + count)
    else if (final === 'G' || final === '`') this.cursor = count - 1
    else if (final === 'P') this.cells.splice(this.cursor, count)
    else if (final === '@') {
      while (this.cells.length < this.cursor) this.cells.push(' ')
      this.cells.splice(this.cursor, 0, ...Array<string>(count).fill(' '))
      if (this.cells.length > MAX_LINE) this.uncertain = true
      this.cells.length = Math.min(this.cells.length, MAX_LINE)
    } else if (final === 'X') {
      for (let index = this.cursor; index < Math.min(MAX_LINE, this.cursor + count); index++)
        if (index < this.cells.length) this.cells[index] = ' '
    } else if (final === 'K') {
      const mode = Number(body)
      if (mode === 0) this.cells.length = Math.min(this.cells.length, this.cursor)
      else if (mode === 1) {
        for (let index = 0; index <= this.cursor && index < MAX_LINE; index++)
          this.cells[index] = ' '
      } else if (mode === 2) this.cells = []
      else this.uncertain = true
    } else this.uncertain = true // Vertical movement, reflow and unknown edits.
  }
}

/** Plain cache evidence with the same edit semantics as the live observer, no OSC replay. */
export function renderedTerminalText(data: string): string {
  const lines: string[] = []
  const stream = new TerminalTextStream((line) => lines.push(line))
  stream.write(data)
  return lines.length ? lines.join('\n') + '\n' + stream.line : stream.line
}
