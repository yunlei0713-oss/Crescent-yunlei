import { createHash, randomUUID } from 'node:crypto'
import {
  isPendingManagedCommand,
  type ManagedCommandResult,
  type ManagedCommandState,
  type ManagedExecutionState,
  type ManagedShellTarget,
  type ManagedTerminalIdentity
} from '../../../shared/managed-terminal'
import { redactSensitiveText } from '../../../shared/secret-redaction'
import { TerminalTextStream } from '../terminal-text-stream'

import {
  COMMAND_MARKER,
  PROMPT_MARKER,
  commandLine,
  localBashPrompt,
  newShellNonce,
  readyMarker,
  reviewedShellExpression,
  type SshShellCapability
} from './shell-adapter'

const MAX_OUTPUT = 4096
const START_TIMEOUT_MS = 3000
const RUN_TIMEOUT_MS = 5000
const PROMPT_TIMEOUT_MS = 3000
const MAX_RECENT_RESULTS = 32
const PRIVATE_KEY_START = /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/
const PRIVATE_KEY_END = /-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----/
export type RecordManagedCommand = (result: ManagedCommandResult) => void

export interface ManagedApprovalTarget extends ManagedTerminalIdentity, ManagedShellTarget {
  commandId: string
  approvalId: string
  commandHash: string
  command: string
  expiresAt: number
}

interface Command {
  envelope: string
  approval: ManagedApprovalTarget
  abort: AbortController
  resolve: (result: ManagedCommandResult) => void
  timer?: ReturnType<typeof setTimeout>
  startedAt?: number
  exitCode?: number
  output: string
  outputTruncated?: boolean
  insidePrivateKey?: boolean
  cancelRequested?: boolean
  record?: RecordManagedCommand
}

/** Arbitrary terminal input irrevocably removes authority for the current binding. */
export class ManagedCommandExecutor {
  private readonly promptNonce: string
  private sawPrompt = false
  private usablePrompt = false
  private authorityLost = false
  private active?: Command
  private readonly results = new Map<string, ManagedCommandResult>()
  private readonly listeners = new Set<(result: ManagedCommandResult) => void>()
  private state: ManagedExecutionState = 'starting'
  private readonly stream = new TerminalTextStream(
    (line) => {
      const command = this.active
      if (command?.startedAt !== undefined && command.exitCode === undefined)
        this.appendOutput(command, line + '\n')
    },
    (sequence) => this.control(sequence)
  )

  constructor(
    private readonly target: ManagedTerminalIdentity & ManagedShellTarget,
    private readonly write: (input: string) => void,
    private readonly onState: () => void,
    private readonly ssh?: SshShellCapability
  ) {
    this.promptNonce = ssh?.nonce ?? newShellNonce()
    if (ssh) {
      // Main already observed this exact prompt before the operator confirmation.
      this.usablePrompt = true
      this.state = 'ready'
    }
  }

  get prompt(): string {
    return localBashPrompt(this.promptNonce)
  }

  get shellTarget(): ManagedShellTarget {
    return { ...this.target }
  }

  get executionState(): ManagedExecutionState {
    return this.state
  }

  get canRun(): boolean {
    return !this.authorityLost && this.usablePrompt && !this.active
  }

  acceptOutput(data: string): void {
    if (!this.authorityLost) this.stream.write(data)
  }

  loseAuthority(reason: ManagedCommandResult['reason'] = 'authority-lost'): void {
    if (this.authorityLost) return
    this.authorityLost = true
    this.usablePrompt = false
    const command = this.active
    if (command) {
      const state = this.state === 'approval-pending' ? 'rejected' : 'unknown'
      command.abort.abort()
      this.finish(command, state, reason)
    }
    if (this.state !== 'unknown') this.setState('manual-only')
  }

  getResult(commandId: string): ManagedCommandResult {
    const result = this.results.get(commandId)
    if (!result) throw new Error('Unknown managed command')
    return structuredClone(result)
  }

  hasResult(commandId: string): boolean {
    return this.results.has(commandId)
  }

  activeResults(): ManagedCommandResult[] {
    return Array.from(this.results.values())
      .filter(({ state }) => isPendingManagedCommand(state) || state === 'unknown')
      .map(({ output: _output, ...result }) => structuredClone(result))
  }

  async waitForResult(
    commandId: string,
    waitMs: number,
    signal: AbortSignal
  ): Promise<ManagedCommandResult> {
    if (!Number.isInteger(waitMs) || waitMs < 0 || waitMs > 30_000)
      throw new Error('Invalid managed command wait')
    signal.throwIfAborted()
    const current = this.getResult(commandId)
    if (!waitMs || !isPendingManagedCommand(current.state)) return current
    return new Promise((resolve, reject) => {
      const cleanup = (): void => {
        clearTimeout(timer)
        this.listeners.delete(onResult)
        signal.removeEventListener('abort', onAbort)
      }
      const onResult = (next: ManagedCommandResult): void => {
        if (next.commandId !== commandId) return
        cleanup()
        resolve(structuredClone(next))
      }
      const onAbort = (): void => {
        cleanup()
        reject(signal.reason)
      }
      const timer = setTimeout(() => onResult(this.getResult(commandId)), waitMs)
      this.listeners.add(onResult)
      signal.addEventListener('abort', onAbort, { once: true })
    })
  }

  cancel(commandId: string, interrupt: () => void): ManagedCommandResult {
    const current = this.getResult(commandId)
    const command = this.active
    if (!command || command.approval.commandId !== commandId || command.cancelRequested)
      return current
    if (current.state === 'approval-pending') {
      command.abort.abort()
      this.finish(command, 'rejected')
    } else if (
      (current.state === 'running' || current.state === 'timed-out-running') &&
      command.exitCode === undefined
    ) {
      command.cancelRequested = true
      if (!this.publish(command, current.state)) {
        this.loseAuthority('audit-unavailable')
      } else {
        clearTimeout(command.timer)
        command.timer = setTimeout(() => this.loseAuthority(), PROMPT_TIMEOUT_MS)
        try {
          interrupt()
        } catch {
          this.loseAuthority()
        }
      }
    }
    return this.getResult(commandId)
  }

  async run(
    input: string,
    approve: (target: ManagedApprovalTarget, signal: AbortSignal) => Promise<boolean>,
    isCurrent: () => boolean,
    signal: AbortSignal,
    record?: RecordManagedCommand
  ): Promise<ManagedCommandResult> {
    if (!this.canRun || !isCurrent() || signal.aborted)
      throw new Error('The approved local shell is not ready or visible.')
    if (typeof input !== 'string' || input.length > 120)
      throw new Error('Invalid managed terminal command.')
    const expression = reviewedShellExpression(input)
    const commandId = randomUUID()
    const abort = new AbortController()
    const approval = Object.freeze({
      ...this.target,
      commandId,
      approvalId: randomUUID(),
      commandHash: createHash('sha256').update(input).digest('hex'),
      command: input,
      expiresAt: Date.now() + 60_000
    })
    let resolve!: Command['resolve']
    const result = new Promise<ManagedCommandResult>((settle) => {
      resolve = settle
    })
    const command: Command = {
      approval,
      envelope: [
        approval.terminalSessionId,
        approval.sessionGeneration,
        commandId,
        newShellNonce(),
        approval.shellGeneration
      ]
        .filter((value) => value !== undefined)
        .join(';'),
      abort,
      resolve,
      output: '',
      record
    }
    this.active = command
    this.setState('approval-pending')
    if (!this.publish(command, 'approval-pending')) {
      this.finish(command, 'rejected', 'audit-unavailable')
      return result
    }
    const cancel = (): void => {
      if (this.active !== command) return
      if (this.state === 'approval-pending') {
        abort.abort()
        this.finish(command, 'rejected')
      } else command.resolve(this.getResult(commandId))
    }
    signal.addEventListener('abort', cancel, { once: true })
    const approvalTimer = setTimeout(cancel, 60_000)
    try {
      let approved = false
      try {
        approved = await approve(approval, abort.signal)
      } catch {
        // Cancellation or unavailable operator UI leaves the PTY untouched.
      } finally {
        clearTimeout(approvalTimer)
      }
      if (this.active !== command) return result
      if (!approved || signal.aborted || !isCurrent() || Date.now() >= approval.expiresAt) {
        this.finish(command, 'rejected')
        return result
      }

      if (
        approval.commandHash !== createHash('sha256').update(input).digest('hex') ||
        !this.publish(command, 'approved') ||
        !this.publish(command, 'dispatched')
      ) {
        this.finish(command, 'rejected', 'audit-unavailable')
        return result
      }
      this.usablePrompt = false
      this.sawPrompt = false
      this.setState('dispatched')
      command.timer = setTimeout(() => this.loseAuthority(), START_TIMEOUT_MS)
      try {
        this.write(commandLine(expression, command.envelope, this.ssh?.guard))
      } catch {
        this.loseAuthority()
      }
      return await result
    } finally {
      signal.removeEventListener('abort', cancel)
    }
  }

  private control(sequence: string): void {
    if (sequence === PROMPT_MARKER) {
      this.sawPrompt = true
      return
    }
    const command = this.active
    if (sequence === readyMarker(this.promptNonce) && this.sawPrompt) {
      this.sawPrompt = false
      if (command && this.state === 'approval-pending') return
      if (command && command.exitCode === undefined) {
        this.loseAuthority()
        return
      }
      this.usablePrompt = true
      if (command) {
        this.finish(
          command,
          command.cancelRequested && command.exitCode === 130
            ? 'interrupted'
            : command.exitCode === 0
              ? 'completed-success'
              : 'completed-failure'
        )
      } else this.setState('ready')
      return
    }
    if (!command || this.state === 'approval-pending') return
    if (
      sequence === `${COMMAND_MARKER}start;${command.envelope}\x07` &&
      command.startedAt === undefined
    ) {
      command.startedAt = Date.now()
      this.stream.clearLine()
      clearTimeout(command.timer)
      this.setState('running')
      if (!this.publish(command, 'running')) {
        this.loseAuthority('audit-unavailable')
        return
      }
      command.timer = setTimeout(() => {
        this.setState('timed-out-running')
        if (!this.publish(command, 'timed-out-running')) {
          this.loseAuthority('audit-unavailable')
          return
        }
        command.resolve(this.getResult(command.approval.commandId))
      }, RUN_TIMEOUT_MS)
      return
    }
    const prefix = `${COMMAND_MARKER}end;${command.envelope};`
    if (
      command.startedAt === undefined ||
      command.exitCode !== undefined ||
      !sequence.startsWith(prefix) ||
      !sequence.endsWith('\x07')
    )
      return
    const code = sequence.slice(prefix.length, -1)
    if (!/^(0|[1-9]\d{0,2})$/.test(code) || Number(code) > 255) return
    this.appendOutput(command, this.stream.line)
    command.exitCode = Number(code)
    clearTimeout(command.timer)
    command.timer = setTimeout(() => this.loseAuthority(), PROMPT_TIMEOUT_MS)
  }

  private appendOutput(command: Command, text: string): void {
    if (command.insidePrivateKey) {
      if (PRIVATE_KEY_END.test(text)) command.insidePrivateKey = false
      return
    }
    if (PRIVATE_KEY_START.test(text)) command.insidePrivateKey = !PRIVATE_KEY_END.test(text)
    text = redactSensitiveText(text)
    command.outputTruncated ||= command.output.length + text.length > MAX_OUTPUT
    command.output = (command.output + text).slice(-MAX_OUTPUT)
  }

  private finish(
    command: Command,
    state: Exclude<ManagedCommandState, 'approved'>,
    reason?: ManagedCommandResult['reason']
  ): void {
    clearTimeout(command.timer)
    this.active = undefined
    const saved = this.publish(command, state, reason)
    if (!saved && state !== 'rejected') {
      this.authorityLost = true
      this.usablePrompt = false
      this.publish(command, 'unknown', 'audit-unavailable')
    }
    const result = this.getResult(command.approval.commandId)
    this.setState(state === 'rejected' ? 'ready' : saved ? state : 'unknown')
    command.resolve(result)
  }

  private publish(
    command: Command,
    state: ManagedCommandState,
    reason?: ManagedCommandResult['reason']
  ): boolean {
    const confirmed =
      state === 'completed-success' || state === 'completed-failure' || state === 'interrupted'
    const finishedAt = isPendingManagedCommand(state) ? undefined : Date.now()
    const result: ManagedCommandResult = {
      commandId: command.approval.commandId,
      approvalId: command.approval.approvalId,
      commandHash: command.approval.commandHash,
      target: { ...this.target },
      state,
      reason,
      cancelRequested: command.cancelRequested,
      startedAt: command.startedAt,
      finishedAt,
      durationMs:
        finishedAt !== undefined && command.startedAt !== undefined
          ? finishedAt - command.startedAt
          : undefined,
      exitCode: confirmed ? command.exitCode : undefined,
      output: confirmed ? redactSensitiveText(command.output) : undefined,
      outputTruncated: confirmed ? command.outputTruncated : undefined,
      taskVerified: false
    }
    let saved = true
    try {
      command.record?.(result)
    } catch {
      saved = false
    }
    if (!saved && state !== 'unknown' && state !== 'rejected') return false
    this.results.set(result.commandId, result)
    while (this.results.size > MAX_RECENT_RESULTS) {
      const oldest = this.results.keys().next().value
      if (oldest === undefined) break
      this.results.delete(oldest)
    }
    for (const listener of this.listeners) listener(result)
    return saved
  }

  private setState(state: ManagedExecutionState): void {
    this.state = state
    this.onState()
  }
}
