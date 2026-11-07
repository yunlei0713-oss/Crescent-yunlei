export interface LocalProject {
  id: string
  name: string
  root: string
}

export interface ProjectAssociationState {
  conversationId: string
  association: 'linked' | 'unlinked'
  projectId?: string
  project?: LocalProject
  directory: 'not-activated' | 'authorized' | 'stale' | 'missing' | 'denied'
  index: 'not-indexed' | 'indexing' | 'ready' | 'partial' | 'failed'
}

export interface ProjectAssociationAction {
  conversationId: string
  action: 'attach' | 'switch' | 'detach' | 'revalidate' | 'rebind'
  projectId?: string
}
