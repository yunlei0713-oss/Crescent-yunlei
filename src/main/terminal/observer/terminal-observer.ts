import { randomUUID } from 'node:crypto'
import type {
  TerminalEvidence,
  TerminalIdentity,
  TerminalObservation
} from '../../../shared/terminal-observation-types'
import { redactSensitiveText } from '../../../shared/secret-redaction'
import { TerminalTextStream } from '../terminal-text-stream'
import {
  normalizeTerminalContextChars,
  terminalObservationBindingKey
} from '../../../shared/terminal-observation-types'

const MAX_OUTPUT = 16000
const MAX_RETAINED_CHARS = 64000
const RETENTION_MS = 30 * 60 * 1000
// Command names and ordinary log mentions are not evidence of a secret prompt.
const SENSITIVE_PROMPT =
  /(?:password|passphrase|verification code|one.time(?: code)?|\botp\b|密码|口令|验证码)[^\n:：]{0,80}[:：]\s*$/i
export function terminalIdentityKey(identity: TerminalIdentity): string {
  return JSON.stringify([
    identity.ownerId,
    identity.conversationId,
    identity.itermSessionId,
    identity.tabId,
    identity.sessionGeneration,
    identity.connectionId,
    identity.host
  ])
}

/** Pure observer: no terminal handles, shell injection, execution callbacks or IO dependencies. */
export class TerminalObserver {
  private identity?: TerminalIdentity
  private records: TerminalObservation[] = []
  private current?: TerminalObservation
  private input = ''
  private atPrompt = false
  private sensitive = false
  private uncertainInput = false
  private alternateScreen = false
  private readonly output = new TerminalTextStream(
    (line) => this.appendLine(line),
    (sequence) => {
      // eslint-disable-next-line no-control-regex -- OSC 133 is a terminal control protocol.
      const marker = /^\x1b\]133;([ABCD])(?:;(-?\d+))?(?:\x07|\x1b\\)$/.exec(sequence)
      if (marker) this.marker(marker[1], marker[2])
      if (/\?1049h$/.test(sequence)) {
        this.alternateScreen = true
        this.atPrompt = false
        if (!this.current) this.begin('interactive')
        if (this.current) this.current.status = 'interactive'
      }
      if (/\?1049l$/.test(sequence)) this.alternateScreen = false
    },
    (line) => {
      if (/-----BEGIN .*PRIVATE KEY-----/.test(line)) this.privateKey = true
      if (SENSITIVE_PROMPT.test(line) || line === '[Long line withheld]') {
        this.sensitive = true
        this.atPrompt = false
        this.input = ''
        if (this.current) this.current.sensitive = true
      }
    }
  )
  private privateKey = false
  private unavailable = false

  bind(identity: TerminalIdentity): void {
    if (this.identity) {
      if (terminalObservationBindingKey(this.identity) !== terminalObservationBindingKey(identity))
        this.reset()
      else if (this.identity.host !== identity.host) {
        // Keep host-labelled history, but never splice a command/partial line or
        // trusted prompt from the old shell into the new shell. Secret suppression
        // survives an unverified host transition until a trustworthy OSC prompt.
        const sensitive = this.sensitive || this.privateKey
        const records = this.records
        if (this.current && !this.current.finishedAt) {
          this.current.status = 'unknown'
          this.current.finishedAt = Date.now()
        }
        this.reset()
        this.records = records
        this.sensitive = sensitive
      }
    }
    this.identity = { ...identity }
  }
  private reset(): void {
    this.records = []
    this.current = undefined
    this.input = ''
    this.output.reset()
    this.alternateScreen = false
    this.atPrompt = this.sensitive = this.uncertainInput = this.privateKey = false
    this.unavailable = false
  }
  fail(): void {
    this.reset()
    this.unavailable = true
  }
  private begin(status: TerminalObservation['status'], command?: string): void {
    if (!this.identity) return
    this.current = {
      ...this.identity,
      eventId: randomUUID(),
      command,
      output: '',
      startedAt: Date.now(),
      status,
      boundary: this.atPrompt ? 'osc133' : 'uncertain',
      confidence: this.atPrompt ? 'structured' : 'uncertain',
      sensitive: this.sensitive,
      redacted: true
    }
    this.records.push(this.current)
    this.records = this.records
      .filter((record) => Date.now() - record.startedAt < RETENTION_MS)
      .slice(-20)
  }
  inputData(data: string): void {
    // Without an observed OSC prompt, input may be a password or an interactive program.
    // No raw input is retained in that case, even temporarily.
    if (!this.atPrompt || this.sensitive) {
      this.input = ''
      if (/[\r\n]/.test(data) && !this.sensitive && !this.current) this.begin('unknown')
      if (data.includes('\x03') && this.current) this.current.status = 'unknown'
      return
    }
    if (data.includes('\x1b') || data.includes('\t')) {
      this.uncertainInput = true
      this.input = ''
    }
    if (/[\r\n][\s\S]*\S/.test(data)) {
      // A pasted block can contain shell continuations or subsequent interactive
      // credentials. Analyze its visible output, never call its first line the full command.
      this.uncertainInput = true
      this.input = ''
    }
    for (const char of data) {
      if (char === '\r' || char === '\n') {
        const command = this.uncertainInput ? undefined : redactSensitiveText(this.input)
        this.begin('submitted', command || undefined)
        this.atPrompt = false
        this.input = ''
        break // Multi-line paste is not parsed as independent commands.
      }
      if (char === '\x03' || char === '\x04') {
        this.input = ''
        this.atPrompt = false
        break
      }
      if (char === '\x7f' || char === '\b') this.input = [...this.input].slice(0, -1).join('')
      else if (!this.uncertainInput && char >= ' ' && this.input.length < 4096) this.input += char
      else if (char < ' ' || this.input.length >= 4096) {
        this.uncertainInput = true
        this.input = ''
      }
    }
  }
  snapshotData(data: string, completeLinesOnly = false): void {
    // Screen text is not a control protocol: never parse OSC or infer commands/exit codes.
    this.reset()
    this.begin('unknown')
    if (!this.current) return
    this.current.confidence = 'snapshot'
    this.current.boundary = 'uncertain'
    // Scan/redact the full source first; a partial trailing line may be an
    // unfinished command or secret. Never expose it as cache evidence.
    const safe = redactSensitiveText(data)
    const complete = completeLinesOnly ? safe.slice(0, safe.lastIndexOf('\n') + 1) : safe
    const bounded = complete.slice(-MAX_OUTPUT)
    this.current.output =
      SENSITIVE_PROMPT.test(data) || /-----BEGIN .*PRIVATE KEY-----/.test(data)
        ? '[Sensitive screen content withheld]'
        : bounded
    this.current.sensitive = this.current.output === '[Sensitive screen content withheld]'
  }
  outputData(data: string): void {
    if (data && this.current?.confidence === 'snapshot') {
      // A shared cache is one snapshot, not the confidence of all future PTY
      // output. Start a separate uncertain/OSC stream; preserve sensitive-state
      // suppression until a trustworthy prompt resets it.
      this.sensitive ||= this.current.sensitive
      this.current = undefined
    }
    this.output.write(data)
  }
  private flushLine(): void {
    this.output.flushLine()
  }
  private appendLine(line: string): void {
    // A readline redraw/wrap can emit LF before the operator submits. Those
    // apparent complete lines are still editable input, not output evidence.
    if (this.atPrompt) return
    if (SENSITIVE_PROMPT.test(line)) this.sensitive = true
    if (/-----BEGIN .*PRIVATE KEY-----/.test(line)) this.privateKey = true
    const text =
      this.privateKey || this.sensitive ? '[Sensitive content withheld]' : redactSensitiveText(line)
    if (/-----END .*PRIVATE KEY-----/.test(line)) this.privateKey = false
    if (!this.current && line.trim()) this.begin('unknown')
    if (this.current) this.current.output = (this.current.output + text + '\n').slice(-MAX_OUTPUT)
    this.trimRecords()
  }
  private marker(marker: string, code?: string): void {
    if (marker === 'A') {
      this.flushLine()
      if (this.current && !this.current.finishedAt) this.current.status = 'unknown'
      this.current = undefined
      this.atPrompt = false
    } else if (marker === 'B') {
      this.output.clearLine() // Prompt itself is not command output.
      this.atPrompt = !this.alternateScreen
      this.sensitive = false
      this.uncertainInput = false
      this.input = ''
    } else if (marker === 'C') {
      // Pre-execution marks the end of the editable echo. Never attach a draft
      // (or a history/completion redraw) to the command's output evidence.
      this.output.clearLine()
      if (!this.current) this.begin('running')
      if (this.current) {
        this.current.boundary = 'osc133'
        this.current.confidence = 'structured'
        if (this.current.status !== 'interactive') this.current.status = 'running'
      }
      this.atPrompt = false
    } else if (marker === 'D' && this.current) {
      this.flushLine()
      const exitCode = code === undefined ? undefined : Number(code)
      // A D without a prior C does not establish a reliable completion boundary.
      const reliable =
        this.current.boundary === 'osc133' &&
        ['running', 'interactive'].includes(this.current.status)
      this.current.exitCode = reliable && Number.isSafeInteger(exitCode) ? exitCode : undefined
      this.current.status =
        this.current.exitCode === undefined
          ? 'unknown'
          : this.current.exitCode === 0
            ? 'completed'
            : 'failed'
      this.current.finishedAt = Date.now()
      this.current = undefined
      this.atPrompt = false
    }
  }
  evidence(contextChars?: number): TerminalEvidence {
    this.records = this.records
      .filter((record) => Date.now() - record.startedAt < RETENTION_MS)
      .slice(-20)
    this.trimRecords()
    // Budget includes metadata and JSON escaping, not just raw output length.
    const budget = normalizeTerminalContextChars(contextChars)
    const evidence: TerminalEvidence = {
      identity: this.identity ?? { tabId: '', sessionGeneration: 0 },
      available: !this.unavailable && Boolean(this.identity?.sessionGeneration),
      observations: [],
      retention: `Memory only: 20 events, 16K characters/event, 64K total, 30 minutes; context capped at ${budget} serialized characters. SSH hops and return to local retain host-labelled evidence in this terminal; cleared on terminal binding change or close. Host labels are prompt observations, not verified server identity. Incomplete lines and uncertain/sensitive input are withheld. Any command vocabulary and complex output can be analyzed; interactive screens are partial text, not a reliable screen reconstruction or completion proof.`
    }
    for (const record of [...this.records].reverse()) {
      const copy = structuredClone(record)
      const fits = (): boolean =>
        JSON.stringify({ ...evidence, observations: [copy, ...evidence.observations] }).length <=
        budget
      if (!fits()) {
        // Fit the newest evidence even when escaping expands a long output line.
        const output = copy.output
        let low = 0,
          high = output.length
        copy.output = '[Output truncated]\n'
        if (!fits()) break
        while (low < high) {
          const middle = Math.ceil((low + high) / 2)
          copy.output = '[Output truncated]\n' + output.slice(-middle)
          if (fits()) low = middle
          else high = middle - 1
        }
        copy.output = '[Output truncated]\n' + (low ? output.slice(-low) : '')
        evidence.observations.unshift(copy)
        break
      }
      evidence.observations.unshift(copy)
    }
    return evidence
  }
  private trimRecords(): void {
    let size = this.records.reduce(
      (sum, record) => sum + (record.output?.length ?? 0) + (record.command?.length ?? 0),
      0
    )
    while (size > MAX_RETAINED_CHARS && this.records.length > 1) {
      const removed = this.records.shift()!
      size -= (removed.output?.length ?? 0) + (removed.command?.length ?? 0)
    }
  }
}
