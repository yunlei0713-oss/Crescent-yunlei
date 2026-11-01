import { projectsApi } from './modules/projects'
import { knowledgeApi } from './modules/knowledge'
import { documentsApi } from './modules/documents'
import { appApi } from './modules/app'
import { terminalApi } from './modules/terminal'
import { agentApi } from './modules/agent'
import { connectionsApi } from './modules/connections'
import { storageApi } from './modules/storage'
import { updateApi } from './modules/update'
import { whaleMonitorApi } from './modules/whaleMonitor'

export const api = {
  projects: projectsApi,
  knowledge: knowledgeApi,
  documents: documentsApi,
  app: appApi,
  terminal: terminalApi,
  agent: agentApi,
  connections: connectionsApi,
  storage: storageApi,
  update: updateApi,
  whaleMonitor: whaleMonitorApi
}
