import { BrowserWindow, dialog, screen, type WebContents } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type {
  ManagedCommandResult,
  ManagedTerminalIdentity
} from '../../../shared/managed-terminal'
import { auditEvent } from '../../security/security-audit'
import { getDatabase } from '../../crescent-sqlite'
import {
  hasManagedCommandHistory,
  readManagedCommandHistory,
  recordManagedCommand
} from '../../sqlite/managed-command-audit'
import { rendererIpc } from '../../ipc-security'
import { resolveShellLaunchConfig } from '../shell'
import { ManagedTerminalIpc } from './ipc'
import { ManagedTerminalSessions } from './session-manager'

interface Collaboration {
  owner: WebContents
  conversationId: string
  locale: 'zh-CN' | 'en'
}

export class ManagedTerminalWindow {
  private readonly sessions = new ManagedTerminalSessions()
  private readonly ipc = new ManagedTerminalIpc(this.sessions)
  private identity?: ManagedTerminalIdentity
  private window?: BrowserWindow
  private bounds?: Electron.Rectangle
  private collaboration?: Collaboration
  private unbindOwner?: () => void

  register(): void {
    this.ipc.register(
      (identity) => {
        if (this.identity?.terminalSessionId !== identity.terminalSessionId) return
        this.identity = undefined
        this.unbindOwner?.()
        this.collaboration = undefined
      },
      (identity) =>
        process.env.MOXUN_EXPERIMENTAL_SSH_COLLABORATION === '1' &&
        this.identity?.terminalSessionId === identity.terminalSessionId &&
        this.identity.sessionGeneration === identity.sessionGeneration &&
        Boolean(this.collaboration && !this.collaboration.owner.isDestroyed() && this.isVisible())
    )
    rendererIpc.handle('terminal:open-managed', (event, locale: unknown) => {
      const chatWindow = BrowserWindow.fromWebContents(event.sender)
      if (!chatWindow?.isFocused()) throw new Error('Chat window is not focused')
      return this.show(locale === 'zh-CN' ? 'zh-CN' : 'en')
    })
    rendererIpc.handle('terminal:open-collaboration', (event, input: unknown) => {
      const request = input as { conversationId?: unknown; locale?: unknown } | undefined
      const conversationId = request?.conversationId
      if (typeof conversationId !== 'string' || !/^[a-zA-Z0-9:_-]{1,180}$/.test(conversationId))
        throw new Error('Invalid collaboration conversation')
      const chatWindow = BrowserWindow.fromWebContents(event.sender)
      if (!chatWindow?.isFocused()) throw new Error('Chat window is not focused')
      const locale = request?.locale === 'zh-CN' ? 'zh-CN' : 'en'
      if (
        this.identity &&
        (this.collaboration?.owner !== event.sender ||
          this.collaboration.conversationId !== conversationId)
      )
        throw new Error(
          locale === 'zh-CN'
            ? '请先结束当前墨巡终端会话，再为此对话打开协作终端。'
            : 'End the current MoXun terminal session before opening collaboration for this conversation.'
        )
      return this.show(locale, { owner: event.sender, conversationId, locale })
    })
  }

  hasSession(): boolean {
    return Boolean(this.identity)
  }

  canExecute(owner: WebContents, conversationId: string): boolean {
    return Boolean(
      this.identity &&
      this.isVisible() &&
      this.collaboration?.owner === owner &&
      this.collaboration.conversationId === conversationId &&
      this.sessions.canExecute(this.identity)
    )
  }

  canAccessCommandHistory(owner: WebContents, conversationId: string): boolean {
    const binding = this.collaboration
    if (binding?.conversationId === conversationId) return binding.owner === owner
    try {
      return hasManagedCommandHistory(getDatabase(), conversationId)
    } catch {
      return false
    }
  }

  commandStatus(owner: WebContents, conversationId: string) {
    const binding = this.collaboration
    if (
      !this.identity ||
      owner.isDestroyed() ||
      binding?.owner !== owner ||
      binding.conversationId !== conversationId
    )
      return { visible: false, canRequest: false, activeCommands: [] }
    const status = this.sessions.commandStatus(this.identity)
    const visible = this.isVisible()
    return { ...status, visible, canRequest: visible && status.canRequest }
  }

  async execute(
    owner: WebContents,
    conversationId: string,
    command: string,
    signal: AbortSignal,
    scopeCurrent: () => boolean
  ): Promise<ManagedCommandResult> {
    const identity = this.identity
    const binding = this.collaboration
    if (!identity || !binding || !this.canExecute(owner, conversationId))
      throw new Error('No approved collaboration terminal for this conversation.')
    const parent = BrowserWindow.fromWebContents(owner)
    if (!parent || parent.isDestroyed()) throw new Error('Chat window is unavailable.')
    let approvedHash: string | undefined
    const audit = (actor: 'agent' | 'user' | 'system', summary: string): void => {
      auditEvent({ sessionId: conversationId, actor, eventType: 'terminal_execution', summary })
    }
    const result = await this.sessions.executeReviewed(
      identity,
      command,
      async (target, approvalSignal) => {
        const zh = binding.locale === 'zh-CN'
        const context = `${target.commandId} ${target.approvalId} ${target.commandHash} ${target.terminalSessionId}:${target.sessionGeneration} ${target.host}`
        audit('agent', `approval requested ${context}`)
        const decision = await dialog.showMessageBox(parent, {
          type: 'question',
          title: zh ? '墨巡 · 终端命令审批' : 'MoXun · Terminal command approval',
          message: zh
            ? '允许这条命令在当前可见终端执行一次？'
            : 'Run this command once in the visible terminal?',
          detail: [
            target.command,
            target.transport === 'ssh'
              ? `SSH ${target.user}@${target.host} · ${target.shell} ${target.version}`
              : `${zh ? '本机' : 'Local host'} ${target.host}`,
            `${zh ? '目录' : 'Directory'} ${target.cwd}`,
            `${zh ? '会话' : 'Session'} ${target.terminalSessionId}:${target.sessionGeneration}`,
            ...(target.shellGeneration
              ? [`${zh ? 'Shell 代次' : 'Shell generation'} ${target.shellGeneration}`]
              : []),
            `${zh ? '审批 ID' : 'Approval ID'} ${target.approvalId}`,
            `SHA-256 ${target.commandHash}`,
            zh
              ? '低风险 · 只读查询或状态测试 · 60 秒内有效'
              : 'Low risk · read-only query or status test · expires in 60 seconds',
            zh
              ? '有限且经脱敏的输出将返回当前 Agent。'
              : 'Bounded, redacted output is returned to the current Agent.'
          ].join('\n'),
          buttons: zh ? ['拒绝', '批准一次'] : ['Deny', 'Approve once'],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
          signal: approvalSignal
        })
        const approved = decision.response === 1 && !approvalSignal.aborted
        audit('user', `${approved ? 'approved' : 'declined'} ${context}`)
        if (approved) approvedHash = target.commandHash
        return approved
      },
      () =>
        this.identity === identity &&
        this.collaboration === binding &&
        !owner.isDestroyed() &&
        this.isVisible() &&
        scopeCurrent(),
      signal,
      (event) => recordManagedCommand(getDatabase(), conversationId, event)
    )
    audit(
      'system',
      `${result.commandId} ${approvedHash ?? 'unapproved'} ${identity.terminalSessionId}:${identity.sessionGeneration} ${result.state} ${result.exitCode ?? ''}`
    )
    return result
  }

  async lookupCommand(
    owner: WebContents,
    conversationId: string,
    commandId: string,
    waitMs: number,
    signal: AbortSignal,
    scopeCurrent: () => boolean
  ): Promise<ManagedCommandResult> {
    this.assertCommandScope(owner, commandId, signal, scopeCurrent)
    const identity = this.identity
    const binding = this.collaboration
    if (binding?.conversationId === conversationId && binding.owner !== owner)
      throw new Error('Managed command belongs to another chat window')
    if (!Number.isInteger(waitMs) || waitMs < 0 || waitMs > 30_000)
      throw new Error('Invalid managed command wait')
    const executor =
      identity && binding?.owner === owner && binding.conversationId === conversationId
        ? this.sessions.commandExecutor(identity, commandId)
        : undefined
    const result = executor
      ? await executor.waitForResult(commandId, waitMs, signal)
      : readManagedCommandHistory(getDatabase(), conversationId, commandId)
    this.assertCommandScope(owner, commandId, signal, scopeCurrent)
    return result
  }

  async cancelCommand(
    owner: WebContents,
    conversationId: string,
    commandId: string,
    signal: AbortSignal,
    scopeCurrent: () => boolean
  ): Promise<ManagedCommandResult> {
    this.assertCommandScope(owner, commandId, signal, scopeCurrent)
    const identity = this.identity
    const binding = this.collaboration
    const terminal = this.window
    const parent = BrowserWindow.fromWebContents(owner)
    if (
      !identity ||
      binding?.owner !== owner ||
      binding.conversationId !== conversationId ||
      !parent ||
      parent.isDestroyed() ||
      !this.isVisible()
    )
      throw new Error('No visible managed terminal for this command')
    const executor = this.sessions.commandExecutor(identity, commandId)
    if (!executor) throw new Error('Unknown managed command')
    const current = executor.getResult(commandId)
    const cancel = this.sessions.prepareCancellation(identity, commandId)
    if (current.state === 'approval-pending') return cancel()
    if (
      current.cancelRequested ||
      (current.state !== 'running' && current.state !== 'timed-out-running')
    )
      return current
    const zh = binding.locale === 'zh-CN'
    const { response } = await dialog.showMessageBox(parent, {
      type: 'warning',
      message: zh ? '向当前可见终端发送一次 Ctrl+C？' : 'Send Ctrl+C once to the visible terminal?',
      detail: `${commandId}\n${current.target.host} · ${current.target.cwd}`,
      buttons: zh ? ['继续等待', '中断命令'] : ['Keep waiting', 'Interrupt command'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      signal
    })
    this.assertCommandScope(owner, commandId, signal, scopeCurrent)
    if (
      response !== 1 ||
      this.window !== terminal ||
      !this.isVisible() ||
      this.identity !== identity ||
      this.collaboration !== binding
    )
      return executor.getResult(commandId)
    return cancel()
  }

  private assertCommandScope(
    owner: WebContents,
    commandId: string,
    signal: AbortSignal,
    scopeCurrent: () => boolean
  ): void {
    signal.throwIfAborted()
    if (
      owner.isDestroyed() ||
      !scopeCurrent() ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(commandId)
    )
      throw new Error('Invalid managed command scope or ID')
  }

  stop(): void {
    this.unbindOwner?.()
    this.collaboration = undefined
    this.sessions.stop()
    this.identity = undefined
  }

  private isVisible(): boolean {
    return Boolean(
      this.window &&
      !this.window.isDestroyed() &&
      this.window.isVisible() &&
      !this.window.isMinimized()
    )
  }

  private async show(locale: 'zh-CN' | 'en', collaboration?: Collaboration): Promise<void> {
    if (this.window && !this.window.isDestroyed()) {
      if (this.window.isMinimized()) this.window.restore()
      this.window.show()
      this.window.focus()
      return
    }

    const existing = this.identity
    const identity =
      existing ??
      this.sessions.create(
        { ...resolveShellLaunchConfig(), cols: 100, rows: 30 },
        Boolean(collaboration)
      )
    this.identity = identity
    if (!existing && collaboration) {
      this.collaboration = collaboration
      const { owner } = collaboration
      const revoke = (): void => {
        this.unbindOwner?.()
        this.collaboration = undefined
        this.sessions.revokeExecution(identity)
      }
      this.unbindOwner = () => {
        owner.removeListener('destroyed', revoke)
        owner.removeListener('render-process-gone', revoke)
        owner.removeListener('did-start-navigation', navigate)
        this.unbindOwner = undefined
      }
      const navigate = (
        details: Electron.Event<Electron.WebContentsDidStartNavigationEventParams>
      ): void => {
        if (details.isMainFrame && !details.isSameDocument) revoke()
      }
      owner.once('destroyed', revoke)
      owner.once('render-process-gone', revoke)
      owner.on('did-start-navigation', navigate)
    }
    const bounds = this.bounds
    const visible =
      bounds &&
      screen
        .getAllDisplays()
        .some(
          ({ workArea }) =>
            bounds.x < workArea.x + workArea.width - 80 &&
            bounds.y < workArea.y + workArea.height - 80 &&
            bounds.x + bounds.width > workArea.x + 80 &&
            bounds.y + bounds.height > workArea.y + 80
        )
    const window = new BrowserWindow({
      ...(visible ? bounds : { width: 960, height: 580 }),
      minWidth: 460,
      minHeight: 260,
      title: locale === 'zh-CN' ? '墨巡终端' : 'MoXun Terminal',
      backgroundColor: '#191c1c',
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/terminal.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        partition: 'moxun-terminal'
      }
    })
    this.window = window
    const devUrl = is.dev ? process.env.ELECTRON_RENDERER_URL : undefined
    const url = devUrl
      ? new URL('terminal.html', devUrl)
      : pathToFileURL(join(__dirname, '../renderer/terminal.html'))
    url.searchParams.set('lang', locale)

    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event) => event.preventDefault())
    window.webContents.session.setPermissionCheckHandler(() => false)
    window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false)
    )
    window.on('close', () => {
      this.bounds = window.getNormalBounds()
    })
    window.once('closed', () => {
      if (this.window === window) this.window = undefined
    })
    window.webContents.on('render-process-gone', () => {
      if (!window.isDestroyed()) window.destroy()
    })
    this.ipc.bind(window.webContents, url.href, identity)
    try {
      await window.loadURL(url.href)
      if (!window.isDestroyed()) window.show()
    } catch (error) {
      if (!window.isDestroyed()) window.destroy()
      if (!existing && this.identity === identity) {
        this.identity = undefined
        this.unbindOwner?.()
        this.collaboration = undefined
        this.sessions.end(identity)
      }
      throw error
    }
  }
}

export const managedTerminalWindow = new ManagedTerminalWindow()
