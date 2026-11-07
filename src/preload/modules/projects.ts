import { ipcRenderer } from 'electron'
import type {
  LocalProject,
  ProjectAssociationAction,
  ProjectAssociationState
} from '../../shared/projects'

export const projectsApi = {
  association: (conversationId: string): Promise<ProjectAssociationState> =>
    ipcRenderer.invoke('projects:association', conversationId),
  associate: (input: ProjectAssociationAction): Promise<ProjectAssociationState> =>
    ipcRenderer.invoke('projects:associate', input),
  list: (): Promise<LocalProject[]> => ipcRenderer.invoke('projects:list'),
  open: (): Promise<LocalProject | undefined> => ipcRenderer.invoke('projects:open'),
  activate: (id: string): Promise<LocalProject> => ipcRenderer.invoke('projects:activate', id)
}
