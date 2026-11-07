import { randomUUID } from 'node:crypto'
import type {
  TerminalEvidence,
  TerminalIdentity,
  TerminalObservation
} from '../../../shared/terminal-observation-types'
import { redactSensitiveText } from '../../../shared/secret-redaction'
import { parseShellMarker, type ShellProtocol } from './command-observation'
import { TerminalTextStream } from '../terminal-text-stream'
import { hasLikelyShellPrompt } from '../command-interrupt'
import { findNewestPromptSignal } from '../../../shared/terminal-prompt-host'
import {
  normalizeTerminalContextChars,
  terminalObservationBindingKey
} from '../../../shared/terminal-observation-types'

const MAX_OUTPUT = 16000
const MAX_RETAINED_CHARS = 64000
const RUN_UNCONFIRMED_MS = 5 * 60 * 1000
const RETENTION_MS = 30 * 60 * 1000
// Command names and ordinary log mentions are not evidence of a secret prompt.
const SENSITIVE_PROMPT =
  /(?:password|passphrase|verification code|one.time(?: code)?|\botp\b|密码|口令|验证码)[^\n:：]{0,80}[:：]\s*$/i
const PASTE_BEGIN = '\x1b[200~'
const PASTE_END = '\x1b[201~'

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
  private binding?: string
  private records: TerminalObservation[] = []
  private current?: TerminalObservation
  private input = ''
  private atPrompt = false
  private sensitive = false
  private uncertainInput = false
  private alternateScreen = false
  private submittedPrompt?: string
  private pastedGroup?: string
  private pastePrefix = ''
  private pasteActive = false
  private pasteDraft = false
  private osc633Prompt = false
  private osc633Ready = false
  private readonly output = new TerminalTextStream(
    (line) => this.appendLine(line),
    (sequence) => {
      const marker = parseShellMarker(sequence)
      if (marker) this.marker(marker.protocol, marker.event, marker.exitCode)
      if (/\?(?:1049|1047|47)h$/.test(sequence)) {
        this.alternateScreen = true
        this.submittedPrompt = undefined
        this.atPrompt = false
        if (!this.current) this.begin('interactive')
        if (this.current) this.current.status = 'interactive'
      }
      if (/\?(?:1049|1047|47)l$/.test(sequence)) this.alternateScreen = false
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

  bind(identity: TerminalIdentity): boolean {
    const binding = terminalObservationBindingKey(identity)
    const bindingChanged = this.binding !== binding
    const hostChanged = this.identity?.host !== identity.host
    if (this.identity) {
      if (bindingChanged) this.reset()
      else if (hostChanged) {
        // Keep host-labelled history, but never splice a command/partial line or
        // trusted prompt from the old shell into the new shell. Secret suppression
        // survives an unverified host transition until a trustworthy OSC prompt.
        const sensitive = this.sensitive || this.privateKey
        const records = this.records
        if (this.current && !this.current.finishedAt) {
          this.current.status = 'session-lost'
          this.current.finishedAt = Date.now()
        }
        this.reset()
        this.records = records
        this.sensitive = sensitive
      }
    }
    this.binding = binding
    this.identity = { ...identity }
    return bindingChanged || hostChanged
  }
  private reset(): void {
    this.records = []
    this.current = undefined
    this.submittedPrompt = this.pastedGroup = undefined
    this.pastePrefix = ''
    this.pasteActive = this.pasteDraft = false
    this.osc633Prompt = this.osc633Ready = false
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
    const eventId = randomUUID()
    this.current = {
      ...this.identity,
      eventId,
      commandId: status === 'submitted' ? eventId : undefined,
      commandGroupId: status === 'submitted' ? (this.pastedGroup ?? eventId) : undefined,
      groupState:
        status === 'submitted' ? (this.pastedGroup ? 'incomplete' : 'pending') : undefined,
      source: 'terminal-stream',
      command,
      output: '',
      startedAt: Date.now(),
      status,
      boundary: 'uncertain',
      confidence: 'uncertain',
      sensitive: this.sensitive,
      redacted: true
    }
    this.records.push(this.current)
    this.records = this.records
      .filter((record) => Date.now() - record.startedAt < RETENTION_MS)
      .slice(-20)
  }
  private observePasteFrame(data: string): boolean {
    const framed = this.pastePrefix + data
    const begin = framed.lastIndexOf(PASTE_BEGIN)
    const end = framed.lastIndexOf(PASTE_END)
    this.pastePrefix = ''
    for (let length = PASTE_BEGIN.length - 1; length > 0; length--) {
      if (
        framed.endsWith(PASTE_BEGIN.slice(0, length)) ||
        framed.endsWith(PASTE_END.slice(0, length))
      ) {
        this.pastePrefix = framed.slice(-length)
        break
      }
    }
    if (begin >= 0) {
      this.pastedGroup = randomUUID()
      this.pasteDraft = true
    }
    if (begin >= 0 || end >= 0) this.pasteActive = begin > end
    return this.pasteActive || Boolean(this.pastePrefix) || begin >= 0 || end >= 0
  }

  inputData(data: string, previousPrompt?: string): void {
    if (this.current?.status === 'prompt-returned') {
      this.current = undefined
      this.submittedPrompt = undefined
      this.output.clearLine()
    }
    // Without an observed OSC prompt, input may be a password or an interactive program.
    // No raw input is retained in that case, even temporarily.
    if (!this.sensitive && this.observePasteFrame(data)) {
      this.uncertainInput = true
      this.input = ''
      return
    }
    if (this.pasteDraft) {
      this.uncertainInput = true
      if (data.includes('\x03') || data.includes('\x04')) {
        this.pastedGroup = undefined
        this.pasteDraft = false
      } else if (/[\r\n]/.test(data)) this.pasteDraft = false
    } else if (/[\r\n][\s\S]*\S/.test(data)) {
      this.pastedGroup = randomUUID()
    } else if (this.atPrompt && /[\r\n]/.test(data)) this.pastedGroup = undefined
    if (!this.atPrompt || this.sensitive) {
      this.input = ''
      if (data.includes('\x03')) this.submittedPrompt = undefined
      if (
        !this.submittedPrompt &&
        !this.sensitive &&
        !this.current?.sensitive &&
        !this.alternateScreen &&
        previousPrompt &&
        /[\r\n]/.test(data) &&
        !/[\r\n][\s\S]*\S/.test(data) &&
        hasLikelyShellPrompt(previousPrompt) &&
        findNewestPromptSignal(previousPrompt, 1)?.kind === 'host'
      ) {
        this.submittedPrompt = previousPrompt.trimEnd()
        this.output.clearLine()
        this.begin('unknown')
        return
      }
      if (/[\r\n]/.test(data) && !this.sensitive && !this.current) this.begin('unknown')
      if (
        data.includes('\x03') &&
        this.current?.confidence === 'structured' &&
        !this.current.sensitive &&
        !this.alternateScreen
      ) {
        this.current.status = 'interrupted'
        this.current.finishedAt = Date.now()
        this.current.groupState = 'incomplete'
        this.current = undefined
      }
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
    this.current.source = 'snapshot'
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
    if (this.current?.status === 'prompt-returned') {
      // A matching tail can be the first chunk of an ordinary output line.
      this.current.status = 'unknown'
      this.current.boundary = 'uncertain'
      this.current.finishedAt = undefined
    }
    if (data && this.current?.confidence === 'snapshot') {
      // A shared cache is one snapshot, not the confidence of all future PTY
      // output. Start a separate uncertain/OSC stream; preserve sensitive-state
      // suppression until a trustworthy prompt resets it.
      this.sensitive ||= this.current.sensitive
      this.current = undefined
    }
    this.output.write(data)
    if (
      this.submittedPrompt &&
      this.current?.status === 'unknown' &&
      !this.sensitive &&
      this.output.line.trimEnd() === this.submittedPrompt
    ) {
      this.current.status = 'prompt-returned'
      this.current.boundary = 'prompt'
      this.current.finishedAt = Date.now()
    }
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
  private marker(protocol: ShellProtocol, marker: string, exitCode?: number): void {
    if (protocol === 'osc633') {
      if (marker === 'A') this.osc633Prompt = true
      if (marker === 'B' && this.osc633Prompt) {
        this.osc633Ready = true
        this.osc633Prompt = false
      }
      if (!this.osc633Ready && marker !== 'A') return
    }
    const activeProtocol =
      this.current?.confidence === 'structured' ? this.current.boundary : undefined
    if (activeProtocol && activeProtocol !== protocol) return
    this.submittedPrompt = undefined
    if (marker === 'A') {
      this.flushLine()
      if (this.current && !this.current.finishedAt) {
        this.current.status = activeProtocol ? 'finished-unknown' : 'unknown'
        this.current.groupState = 'incomplete'
        this.current.finishedAt = Date.now()
      }
      this.current = undefined
      this.atPrompt = false
    } else if (marker === 'B' && !activeProtocol) {
      this.output.clearLine()
      this.atPrompt = !this.alternateScreen
      this.sensitive = false
      this.uncertainInput = false
      this.input = ''
    } else if (marker === 'C' && !activeProtocol) {
      this.output.clearLine()
      if (!this.current || !['submitted', 'interactive'].includes(this.current.status))
        this.begin('running')
      if (this.current) {
        this.current.boundary = protocol
        this.current.source = protocol
        this.current.confidence = 'structured'
        this.current.commandId = this.current.eventId
        this.current.commandGroupId = this.pastedGroup ?? this.current.eventId
        this.current.groupState = this.pastedGroup ? 'incomplete' : 'pending'
        if (this.current.status !== 'interactive') this.current.status = 'running'
      }
      this.atPrompt = false
    } else if (marker === 'D' && this.current) {
      this.flushLine()
      this.current.exitCode = activeProtocol ? exitCode : undefined
      this.current.status = !activeProtocol
        ? 'unknown'
        : exitCode === undefined
          ? 'finished-unknown'
          : exitCode === 0
            ? 'completed'
            : 'failed'
      if (this.current.groupState === 'pending') this.current.groupState = 'finished'
      this.current.finishedAt = Date.now()
      this.current = undefined
      this.atPrompt = false
    }
  }
  /** Main-only view for notifications, which never expose terminal text. */
  latestObservation(): TerminalObservation | undefined {
    const latest = this.records.at(-1)
    if (!this.unavailable && latest && Date.now() - latest.startedAt < RETENTION_MS) return latest
    return undefined
  }

  confirmOperatorFinished(): boolean {
    const latest = this.latestObservation()
    if (!latest || latest.sensitive || !latest.output.trim()) return false
    const eventId = randomUUID()
    this.records.push({
      ...latest,
      eventId,
      commandId: undefined,
      commandGroupId: latest.commandGroupId,
      groupState: latest.groupState,
      command: undefined,
      output: '',
      exitCode: undefined,
      status: 'finished-unknown',
      confidence: 'uncertain',
      boundary: 'user-confirmation',
      source: 'user-confirmation',
      startedAt: Date.now(),
      finishedAt: Date.now()
    })
    return true
  }

  notificationObservation(): TerminalObservation | undefined {
    return !this.atPrompt && this.output.line.trim() ? undefined : this.latestObservation()
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
    let remaining = budget - JSON.stringify(evidence).length
    for (let index = this.records.length - 1; index >= 0; index--) {
      const copy = { ...this.records[index] }
      if (copy.status === 'running' && Date.now() - copy.startedAt >= RUN_UNCONFIRMED_MS)
        copy.status = 'timeout-unconfirmed'
      const comma = evidence.observations.length ? 1 : 0
      const size = JSON.stringify(copy).length + comma
      if (size > remaining) {
        // Fit the newest evidence even when escaping expands a long output line.
        const fits = (): boolean => JSON.stringify(copy).length + comma <= remaining
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
      remaining -= size
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
