import { ipcRenderer } from 'electron'
import type { LocalProject } from '../../shared/projects'

export const projectsApi = {
  list: (): Promise<LocalProject[]> => ipcRenderer.invoke('projects:list'),
  open: (): Promise<LocalProject | undefined> => ipcRenderer.invoke('projects:open'),
  activate: (id: string): Promise<LocalProject> => ipcRenderer.invoke('projects:activate', id)
}
