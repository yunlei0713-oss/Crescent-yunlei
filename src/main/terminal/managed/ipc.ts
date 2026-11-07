import {
  BrowserWindow,
  clipboard,
  dialog,
  type IpcMainInvokeEvent,
  type WebContents
} from 'electron'
import { safeWebContentsSend } from '../../safe-ipc-send'
import { managedTerminalIpc, reserveManagedTerminalRenderer } from '../../ipc-security'
import type {
  ManagedTerminalAttachment,
  ManagedTerminalIdentity
} from '../../../shared/managed-terminal'
import type { ManagedTerminalSessions } from './session-manager'

interface TerminalDocumentBinding {
  identity: ManagedTerminalIdentity
  url: string
  owner: object
  ready: boolean
  contents: WebContents
}

/** BrowserWindow Main code assigns the session. The Renderer never chooses a PTY. */
export class ManagedTerminalIpc {
  private readonly bindings = new WeakMap<WebContents, TerminalDocumentBinding>()

  constructor(private readonly sessions: ManagedTerminalSessions) {}

  bind(contents: WebContents, url: string, identity: ManagedTerminalIdentity): void {
    if (this.bindings.has(contents)) throw new Error('Managed terminal window already bound')
    reserveManagedTerminalRenderer(contents)
    const binding = { identity: { ...identity }, url, owner: {}, ready: false, contents }
    this.bindings.set(contents, binding)
    const detach = (): void => {
      this.sessions.detach(binding.owner)
      binding.owner = {}
      binding.ready = false
    }
    contents.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) detach()
    })
    contents.on('did-frame-navigate', (_event, frameUrl, _status, _text, isMainFrame) => {
      if (isMainFrame) binding.ready = frameUrl === url
    })
    contents.on('render-process-gone', detach)
    contents.once('destroyed', () => {
      detach()
      this.bindings.delete(contents)
    })
  }

  register(
    onEnd?: (identity: ManagedTerminalIdentity) => void,
    canCollaborate: (identity: ManagedTerminalIdentity) => boolean = () => false
  ): void {
    const ipc = managedTerminalIpc((event) => this.authorize(event))
    ipc.handle('managed-terminal:attach', ({ identity, owner, contents }) =>
      this.sessions.attach(identity, owner, () =>
        safeWebContentsSend(contents, 'managed-terminal:changed')
      )
    )
    ipc.handle(
      'managed-terminal:read',
      ({ owner, identity }, attachment: ManagedTerminalAttachment, cursor: number) =>
        this.sessions.read(attachment, owner, cursor, canCollaborate(identity))
    )
    ipc.handle(
      'managed-terminal:write',
      ({ owner }, attachment: ManagedTerminalAttachment, data: string) =>
        this.sessions.write(attachment, owner, data)
    )
    ipc.handle('managed-terminal:interrupt', ({ owner }, attachment: ManagedTerminalAttachment) =>
      this.sessions.interrupt(attachment, owner)
    )
    ipc.handle(
      'managed-terminal:resize',
      ({ owner }, attachment: ManagedTerminalAttachment, cols: number, rows: number) =>
        this.sessions.resize(attachment, owner, cols, rows)
    )
    ipc.handle(
      'managed-terminal:close-window',
      (binding, attachment: ManagedTerminalAttachment) => {
        this.sessions.assertAttached(attachment, binding.owner)
        BrowserWindow.fromWebContents(binding.contents)?.close()
      }
    )
    ipc.handle(
      'managed-terminal:copy',
      (binding, attachment: ManagedTerminalAttachment, text: string) => {
        this.requireFocused(binding, attachment)
        if (typeof text !== 'string') throw new Error('Invalid clipboard text')
        clipboard.writeText(text)
      }
    )
    ipc.handle('managed-terminal:paste', (binding, attachment: ManagedTerminalAttachment) => {
      this.requireFocused(binding, attachment)
      const text = clipboard.readText()
      if (Buffer.byteLength(text) > 60 * 1024) throw new Error('Clipboard text is too large')
      return text
    })
    ipc.handle('managed-terminal:ssh-probe', (binding, attachment: ManagedTerminalAttachment) => {
      this.requireFocused(binding, attachment)
      if (!canCollaborate(binding.identity)) throw new Error('SSH collaboration unavailable')
      clipboard.writeText(this.sessions.prepareSshProbe(attachment, binding.owner))
    })
    ipc.handle(
      'managed-terminal:ssh-confirm',
      async (binding, attachment: ManagedTerminalAttachment) => {
        const window = this.requireFocused(binding, attachment)
        if (!canCollaborate(binding.identity)) throw new Error('SSH collaboration unavailable')
        const { target, activate } = this.sessions.prepareSshActivation(attachment, binding.owner)
        const zh = binding.url.endsWith('?lang=zh-CN')
        const { response } = await dialog.showMessageBox(window, {
          type: 'warning',
          message: zh
            ? '确认当前 SSH Shell 用于逐条审批协作？'
            : 'Use this SSH shell for reviewed commands?',
          detail: [
            `${target.user}@${target.host} · ${target.shell} ${target.version}`,
            target.cwd,
            zh
              ? '请核对当前可见终端、SSH 主机和目录。仅在可信 Bash/Zsh 提示符下确认。'
              : 'Check the visible terminal, SSH host, and directory. Confirm only at a trusted Bash or Zsh prompt.'
          ].join('\n'),
          buttons: zh ? ['取消', '确认会话'] : ['Cancel', 'Confirm shell'],
          defaultId: 0,
          cancelId: 0,
          noLink: true
        })
        if (response === 1 && canCollaborate(binding.identity)) activate()
      }
    )
    ipc.handle('managed-terminal:end', async (binding, attachment: ManagedTerminalAttachment) => {
      const window = this.requireFocused(binding, attachment)
      const zh = binding.url.endsWith('?lang=zh-CN')
      const result = await dialog.showMessageBox(window, {
        type: 'warning',
        message: zh ? '结束当前终端会话？' : 'End this terminal session?',
        detail: zh ? 'Shell 和前台任务会退出。' : 'The shell and its foreground tasks will stop.',
        buttons: zh ? ['取消', '结束会话'] : ['Cancel', 'End session'],
        defaultId: 0,
        cancelId: 0
      })
      if (result.response !== 1) return
      this.sessions.assertAttached(attachment, binding.owner)
      this.sessions.end(binding.identity)
      onEnd?.(binding.identity)
      if (!window.isDestroyed()) window.close()
    })
  }

  private requireFocused(
    binding: TerminalDocumentBinding,
    attachment: ManagedTerminalAttachment
  ): BrowserWindow {
    this.sessions.assertAttached(attachment, binding.owner)
    const window = BrowserWindow.fromWebContents(binding.contents)
    if (!window?.isFocused()) throw new Error('Terminal window is not focused')
    return window
  }

  private authorize(event: IpcMainInvokeEvent): TerminalDocumentBinding {
    const binding = this.bindings.get(event.sender)
    const frame = event.senderFrame
    if (
      !binding?.ready ||
      event.sender.isDestroyed() ||
      !frame ||
      frame !== event.sender.mainFrame ||
      frame.url !== binding.url
    )
      throw new Error('Untrusted managed terminal IPC sender')
    return binding
  }
}
