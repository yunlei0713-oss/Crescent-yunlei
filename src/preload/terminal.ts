import { contextBridge, ipcRenderer } from 'electron'
import type { ManagedTerminalAttachment, ManagedTerminalSnapshot } from '../shared/managed-terminal'

const terminal = {
  attach: (): Promise<ManagedTerminalAttachment> => ipcRenderer.invoke('managed-terminal:attach'),
  read: (attachment: ManagedTerminalAttachment, cursor: number): Promise<ManagedTerminalSnapshot> =>
    ipcRenderer.invoke('managed-terminal:read', attachment, cursor),
  write: (attachment: ManagedTerminalAttachment, data: string): Promise<void> =>
    ipcRenderer.invoke('managed-terminal:write', attachment, data),
  resize: (attachment: ManagedTerminalAttachment, cols: number, rows: number): Promise<void> =>
    ipcRenderer.invoke('managed-terminal:resize', attachment, cols, rows),
  interrupt: (attachment: ManagedTerminalAttachment): Promise<void> =>
    ipcRenderer.invoke('managed-terminal:interrupt', attachment),
  close: (attachment: ManagedTerminalAttachment): Promise<void> =>
    ipcRenderer.invoke('managed-terminal:close-window', attachment),
  end: (attachment: ManagedTerminalAttachment): Promise<void> =>
    ipcRenderer.invoke('managed-terminal:end', attachment),
  copy: (attachment: ManagedTerminalAttachment, text: string): Promise<void> =>
    ipcRenderer.invoke('managed-terminal:copy', attachment, text),
  paste: (attachment: ManagedTerminalAttachment): Promise<string> =>
    ipcRenderer.invoke('managed-terminal:paste', attachment),
  probeSsh: (attachment: ManagedTerminalAttachment): Promise<void> =>
    ipcRenderer.invoke('managed-terminal:ssh-probe', attachment),
  confirmSsh: (attachment: ManagedTerminalAttachment): Promise<void> =>
    ipcRenderer.invoke('managed-terminal:ssh-confirm', attachment),
  onChanged: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('managed-terminal:changed', listener)
    return () => ipcRenderer.removeListener('managed-terminal:changed', listener)
  }
}

export type ManagedTerminalBridge = typeof terminal

contextBridge.exposeInMainWorld('managedTerminal', terminal)
