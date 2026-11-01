export type FileChangeOperation =
  | 'create'
  | 'update'
  | 'overwrite'
  | 'delete'
  | 'move'
  | 'mkdir'
  | 'rmdir'
export interface FileChangeInput {
  path: string
  operation: FileChangeOperation
  content?: string
  destination?: string
}
export interface FileChangePreview extends FileChangeInput {
  before?: string
  beforeHash: string
  afterHash: string
  diff: string
  strongApproval: boolean
}
export interface FileChangeRequest {
  id: string
  runId: string
  chatTabId?: string
  reason: string
  changes: FileChangePreview[]
  digest: string
  expiresAt: number
  rollback: string
}
export interface FileChangeDecision {
  id: string
  digest: string
  approved: boolean
  strongPaths: string[]
  note?: string
}
export interface FileChangeResult {
  id: string
  ok: boolean
  applied: string[]
  /** May include partial/unverified changes after a failure. */
  touched?: string[]
  error?: string
}
