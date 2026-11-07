import { AsyncResource } from 'node:async_hooks'
import { hostname } from 'node:os'
import { randomUUID } from 'node:crypto'
import { assertOperatorTerminalAccess } from '../../security/capability-enforcement'
import type {
  ManagedCommandResult,
  ManagedTerminalAttachment,
  ManagedTerminalIdentity,
  ManagedTerminalSnapshot
} from '../../../shared/managed-terminal'
import { createPtySession } from '../session/pty-session'
import {
  ManagedCommandExecutor,
  type ManagedApprovalTarget,
  type RecordManagedCommand
} from './command-executor'
import { TerminalOutputBuffer } from './output-buffer'
import { SshShellProbe } from './shell-adapter'
import type {
  TerminalExitNotification,
  TerminalSession,
  TerminalTransportInput
} from '../session/types'

const OUTPUT_HIGH_WATER = 256 * 1024
const MAX_INPUT_BYTES = 64 * 1024
const MAX_SESSIONS = 16

interface Session {
  identity: ManagedTerminalIdentity
  transport: TerminalSession
  executor?: ManagedCommandExecutor
  sshProbe?: SshShellProbe
  sshActivated?: boolean
  output: TerminalOutputBuffer
  paused: boolean
  exit?: TerminalExitNotification
  attachment?: {
    id: string
    owner: object
    notify?: () => boolean
    notified: boolean
    delivered: number
  }
}

/** Owns native sessions independently of windows. An owner is a Main-created document identity. */
export class ManagedTerminalSessions {
  private readonly sessions = new Map<string, Session>()
  // Created by Electron Main before tool execution. Only the reviewed executor below receives
  // this narrow write closure. Legacy raw transports continue to reject the Agent origin.
  private readonly approvedDispatch = new AsyncResource('ManagedTerminalApprovedDispatch')
  private generation = 0
  private stopped = false

  create(
    input: Omit<TerminalTransportInput, 'sessionId'>,
    collaboration = false
  ): ManagedTerminalIdentity {
    assertOperatorTerminalAccess()
    if (this.stopped || this.sessions.size >= MAX_SESSIONS)
      throw new Error('Managed terminal session unavailable')
    const identity = {
      terminalSessionId: randomUUID(),
      sessionGeneration: ++this.generation
    }
    const executor = collaboration
      ? new ManagedCommandExecutor(
          { ...identity, cwd: input.cwd, host: hostname() },
          (bytes) =>
            this.approvedDispatch.runInAsyncScope(() => {
              void transport.write(bytes)
            }),
          () => {
            const session = this.sessions.get(identity.terminalSessionId)
            if (session) this.notify(session)
          }
        )
      : undefined
    if (executor && !['darwin', 'linux'].includes(process.platform))
      throw new Error('Managed local Bash collaboration is unavailable on this platform')
    const acceptData = (data: string): void => {
      const session = this.sessions.get(identity.terminalSessionId)
      if (!session || session.exit) return
      session.output.push(data)
      if (session.sshProbe) {
        if (this.isSshForeground(session)) session.sshProbe.acceptOutput(data)
        else session.sshProbe = undefined
      }
      if (session.sshActivated && !this.isSshForeground(session))
        session.executor?.loseAuthority('transport-lost')
      session.executor?.acceptOutput(data)
      if (
        !session.paused &&
        session.attachment?.notify &&
        session.output.cursor - session.attachment.delivered >= OUTPUT_HIGH_WATER
      ) {
        session.transport.pauseOutput?.()
        session.paused = true
      }
      this.notify(session)
    }
    const transport = createPtySession(
      executor
        ? {
            ...input,
            sessionId: identity.sessionGeneration,
            shell: '/bin/bash',
            args: ['--noprofile', '--norc', '-i'],
            env: {
              HOME: input.cwd,
              PATH: '/usr/bin:/bin',
              TERM: 'xterm-256color',
              LC_ALL: process.platform === 'darwin' ? 'en_US.UTF-8' : 'C.UTF-8',
              PS1: executor.prompt,
              HISTFILE: '/dev/null',
              HISTSIZE: '0',
              INPUTRC: '/dev/null'
            }
          }
        : { ...input, sessionId: identity.sessionGeneration },
      {
        onData: acceptData,
        onDisplay: acceptData,
        onPrompt: () => {},
        onExit: (exit) => {
          const session = this.sessions.get(identity.terminalSessionId)
          if (session) {
            session.exit = exit
            session.executor?.loseAuthority('shell-exited')
            this.notify(session)
          }
        }
      }
    )
    this.sessions.set(identity.terminalSessionId, {
      identity,
      transport,
      executor,
      output: new TerminalOutputBuffer(),
      paused: false
    })
    return { ...identity }
  }

  /** The caller must authorize this document for this particular session before attaching. */
  attach(
    identity: ManagedTerminalIdentity,
    owner: object,
    notify?: () => boolean
  ): ManagedTerminalAttachment {
    assertOperatorTerminalAccess()
    const session = this.requireSession(identity)
    if (session.attachment && session.attachment.owner !== owner)
      throw new Error('Managed terminal is already attached')
    session.attachment ??= {
      id: randomUUID(),
      owner,
      notify,
      notified: false,
      delivered: session.output.cursor
    }
    return { ...session.identity, attachmentId: session.attachment.id }
  }

  detach(owner: object): void {
    assertOperatorTerminalAccess()
    for (const session of this.sessions.values()) {
      if (session.attachment?.owner === owner) {
        session.sshProbe = undefined
        session.attachment = undefined
        this.resume(session)
      }
    }
  }

  read(
    attachment: ManagedTerminalAttachment,
    owner: object,
    cursor: number,
    allowSshProbe = false
  ): ManagedTerminalSnapshot {
    const session = this.requireAttachment(attachment, owner)
    if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > session.output.cursor)
      throw new Error('Invalid managed terminal cursor')
    if (session.attachment) {
      session.attachment.notified = false
      session.attachment.delivered = session.output.cursor
    }
    this.resume(session)
    return {
      ...session.output.read(cursor),
      executionState: session.executor?.executionState,
      shellTarget: session.executor?.shellTarget,
      canProbeSsh:
        allowSshProbe && !session.sshActivated && !session.exit && this.isSshForeground(session),
      sshProbe: session.sshProbe?.target ? 'confirm' : session.sshProbe ? 'waiting' : undefined,
      exit: session.exit ? { ...session.exit } : undefined
    }
  }

  write(attachment: ManagedTerminalAttachment, owner: object, data: string): void {
    const session = this.requireLiveAttachment(attachment, owner)
    if (typeof data !== 'string' || Buffer.byteLength(data) > MAX_INPUT_BYTES)
      throw new Error('Invalid managed terminal input')
    if (data) {
      session.sshProbe?.acceptInput()
      session.executor?.loseAuthority()
    }
    void session.transport.write(data)
  }

  interrupt(attachment: ManagedTerminalAttachment, owner: object): void {
    const session = this.requireLiveAttachment(attachment, owner)
    session.sshProbe = undefined
    session.executor?.loseAuthority()
    session.transport.interrupt()
  }

  resize(attachment: ManagedTerminalAttachment, owner: object, cols: number, rows: number): void {
    const session = this.requireLiveAttachment(attachment, owner)
    if (
      !Number.isInteger(cols) ||
      cols < 2 ||
      cols > 1000 ||
      !Number.isInteger(rows) ||
      rows < 2 ||
      rows > 500
    )
      throw new Error('Invalid managed terminal dimensions')
    session.transport.resize(cols, rows)
  }

  end(identity: ManagedTerminalIdentity): void {
    assertOperatorTerminalAccess()
    const session = this.sessions.get(identity.terminalSessionId)
    if (!session || session.identity.sessionGeneration !== identity.sessionGeneration) return
    this.sessions.delete(identity.terminalSessionId)
    session.executor?.loseAuthority()
    if (!session.exit) {
      this.resume(session)
      session.transport.kill()
    }
  }

  stop(): void {
    assertOperatorTerminalAccess()
    this.stopped = true
    for (const { identity } of this.sessions.values()) {
      try {
        this.end(identity)
      } catch (error) {
        console.warn('Managed terminal shutdown failed', error)
      }
    }
  }

  canExecute(identity: ManagedTerminalIdentity): boolean {
    const session = this.sessions.get(identity.terminalSessionId)
    return Boolean(
      session?.identity.sessionGeneration === identity.sessionGeneration &&
      session.attachment &&
      !session.exit &&
      (!session.sshActivated || this.isSshForeground(session)) &&
      session.executor?.canRun
    )
  }

  commandStatus(identity: ManagedTerminalIdentity) {
    const session = this.requireSession(identity)
    const executor = session.executor
    if (session.sshActivated && !this.isSshForeground(session))
      executor?.loseAuthority('transport-lost')
    return {
      identity: { ...session.identity },
      shellTarget: executor?.shellTarget,
      executionState: executor?.executionState ?? 'manual-only',
      shellExited: Boolean(session.exit),
      attached: Boolean(session.attachment),
      canRequest: this.canExecute(identity),
      activeCommands: executor?.activeResults() ?? []
    }
  }

  executeReviewed(
    identity: ManagedTerminalIdentity,
    command: string,
    approve: (target: ManagedApprovalTarget, signal: AbortSignal) => Promise<boolean>,
    visible: () => boolean,
    signal: AbortSignal,
    record?: RecordManagedCommand
  ): Promise<ManagedCommandResult> {
    const session = this.requireSession(identity)
    const attachment = session.attachment
    const executor = session.executor
    if (!attachment || !executor || session.exit)
      throw new Error('No live collaboration terminal is attached')
    return executor.run(
      command,
      approve,
      () =>
        this.sessions.get(identity.terminalSessionId) === session &&
        session.attachment === attachment &&
        session.executor === executor &&
        !session.exit &&
        (!session.sshActivated || this.isSshForeground(session)) &&
        visible(),
      signal,
      record
    )
  }

  prepareSshProbe(attachment: ManagedTerminalAttachment, owner: object): string {
    const session = this.requireLiveAttachment(attachment, owner)
    if (session.sshActivated || !this.isSshForeground(session))
      throw new Error('No supported foreground SSH session')
    session.executor?.loseAuthority()
    session.sshProbe = new SshShellProbe()
    this.notify(session)
    return session.sshProbe.bootstrap
  }

  prepareSshActivation(attachment: ManagedTerminalAttachment, owner: object) {
    const session = this.requireLiveAttachment(attachment, owner)
    const probe = session.sshProbe
    const capability = probe?.result
    if (!capability || !this.isSshForeground(session))
      throw new Error('SSH shell probe is missing or expired')
    return {
      target: capability.target,
      activate: (): void => {
        if (
          this.requireLiveAttachment(attachment, owner) !== session ||
          session.sshActivated ||
          session.sshProbe !== probe ||
          probe?.result !== capability ||
          !this.isSshForeground(session)
        )
          throw new Error('SSH shell changed before confirmation')
        session.sshProbe = undefined
        session.sshActivated = true
        session.executor = new ManagedCommandExecutor(
          { ...session.identity, ...capability.target, shellGeneration: ++this.generation },
          (bytes) =>
            this.approvedDispatch.runInAsyncScope(() => {
              void session.transport.write(bytes)
            }),
          () => this.notify(session),
          capability
        )
        this.notify(session)
      }
    }
  }

  private isSshForeground(session: Session): boolean {
    try {
      return session.transport.foregroundCommand?.() === 'ssh'
    } catch {
      return false
    }
  }

  commandExecutor(
    identity: ManagedTerminalIdentity,
    commandId: string
  ): ManagedCommandExecutor | undefined {
    const session = this.sessions.get(identity.terminalSessionId)
    if (
      session?.identity.sessionGeneration === identity.sessionGeneration &&
      session.executor?.hasResult(commandId)
    ) {
      if (session.sshActivated && !this.isSshForeground(session))
        session.executor.loseAuthority('transport-lost')
      return session.executor
    }
    return undefined
  }

  prepareCancellation(
    identity: ManagedTerminalIdentity,
    commandId: string
  ): () => ManagedCommandResult {
    const session = this.requireSession(identity)
    const executor = this.commandExecutor(identity, commandId)
    const attachment = session.attachment
    if (!executor || !attachment || session.exit)
      throw new Error('No live managed command for this session')
    return () => {
      if (
        this.requireSession(identity) !== session ||
        session.attachment !== attachment ||
        session.executor !== executor ||
        session.exit ||
        (session.sshActivated && !this.isSshForeground(session))
      )
        throw new Error('Managed terminal changed during cancellation approval')
      return executor.cancel(commandId, () =>
        this.approvedDispatch.runInAsyncScope(() => session.transport.interrupt())
      )
    }
  }

  revokeExecution(identity: ManagedTerminalIdentity): void {
    this.sessions.get(identity.terminalSessionId)?.executor?.loseAuthority()
  }

  private resume(session: Session): void {
    if (!session.paused) return
    session.paused = false
    if (!session.exit) session.transport.resumeOutput?.()
  }

  private notify(session: Session): void {
    const attachment = session.attachment
    if (attachment?.notify && !attachment.notified) attachment.notified = attachment.notify()
  }

  assertAttached(attachment: ManagedTerminalAttachment, owner: object): void {
    this.requireAttachment(attachment, owner)
  }

  private requireSession(identity: ManagedTerminalIdentity): Session {
    const session = this.sessions.get(identity?.terminalSessionId)
    if (!session || session.identity.sessionGeneration !== identity.sessionGeneration)
      throw new Error('Stale or unknown managed terminal session')
    return session
  }

  private requireAttachment(attachment: ManagedTerminalAttachment, owner: object): Session {
    assertOperatorTerminalAccess()
    const session = this.requireSession(attachment)
    if (
      !session.attachment ||
      session.attachment.owner !== owner ||
      session.attachment.id !== attachment.attachmentId
    )
      throw new Error('Stale or unauthorized managed terminal attachment')
    return session
  }

  private requireLiveAttachment(attachment: ManagedTerminalAttachment, owner: object): Session {
    const session = this.requireAttachment(attachment, owner)
    if (session.exit) throw new Error('Managed terminal shell exited')
    return session
  }
}
