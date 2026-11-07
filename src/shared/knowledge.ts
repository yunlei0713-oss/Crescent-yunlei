export const MEMORY_CATEGORIES = [
  'environment',
  'architecture',
  'operation',
  'troubleshooting',
  'preference'
] as const
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number]
export type MemoryStatus = 'candidate' | 'approved' | 'archived' | 'superseded'
export type MemoryKind = 'legacy' | 'knowledge' | 'observation' | 'reflection'
export interface MemoryEvidence {
  conversationId: string
  sourceTabId: string
  logId: number
  role: string
  observedAt: string
  scope: string
  excerpt: string
  redacted: boolean
  observationId?: string
}
export interface MemoryItem {
  id: string
  title: string
  content: string
  category: MemoryCategory
  status: MemoryStatus
  confidence: number
  source: string
  scope: string
  createdAt: string
  updatedAt: string
  kind?: MemoryKind
  observedAt?: string
  validFrom?: string
  validTo?: string
  uncertainty?: string
  supersedesId?: string
  evidenceCount?: number
  supportIds?: string[]
}
export type MemoryInput = Pick<MemoryItem, 'title' | 'content' | 'category' | 'scope'> & {
  id?: string
  status?: MemoryStatus
  supersedesId?: string
  validTo?: string | null
}
export interface MemorySettings {
  recall: boolean
  autoLearn: boolean
  learningSelection?: MemoryModelSelection
}
export interface MemoryModelSelection {
  providerId: string
  model: string
}
export interface MemoryLearningTarget extends MemoryModelSelection {
  providerName: string
  endpoint: string
  local: boolean
  authorized: boolean
  consentKey: string
}
export interface MemoryLearnOptions {
  selection?: MemoryModelSelection
  targetKey?: string
}
export interface LearningHistory {
  tabId: string
  title: string
  scope: string
  state: 'pending' | 'review' | 'learned' | 'archived' | 'changed'
  learnedAt?: string
}
export interface MemoryRelation {
  source: string
  target: string
  relation: string
}
export interface MemorySnapshot {
  items: MemoryItem[]
  history: LearningHistory[]
  relations: MemoryRelation[]
  settings: MemorySettings
  autoLearnError?: string
}
export type CodeSkipReason =
  | 'file-too-large'
  | 'line-budget'
  | 'unsupported'
  | 'sensitive'
  | 'symlink'
  | 'parse-error'
  | 'global-budget'
  | 'ignored'
  | 'unreadable'
export interface CodeIndexSkip {
  path: string
  reason: CodeSkipReason
  size?: number
}
export interface CodeIndexStatus {
  root: string
  files: number
  symbols: number
  updatedAt?: string
  indexing: boolean
  skipped: number
  errors: number
  limited: boolean
  skipReasons?: Partial<Record<CodeSkipReason, number>>
  symbolOnly?: number
  reused?: number
  parsed?: number
  elapsedMs?: number
  failed?: boolean
}
export interface CodeSymbol {
  path: string
  name: string
  kind: string
  start: number
  end: number
}
export interface CodeReference {
  path: string
  name: string
  kind: string
  line: number
  from?: string
}
export interface CodeHit {
  path: string
  line: number
  text: string
}
