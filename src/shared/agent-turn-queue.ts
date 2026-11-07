import type { AgentRunInput } from './agent-types'

export interface AgentMessageReferences {
  skills: Array<{ id: string; name: string }>
  wiki: Array<{ id: string; title: string }>
  tools: Array<{ id: string; name: string; source: 'mcp' | 'built-in' | 'openapi' }>
  paths: Array<{ id: string; name: string; kind: 'file' | 'directory' }>
}

export interface AgentTurnDraft {
  request: AgentRunInput
  originalInput: string
  displayInput: string
  references?: AgentMessageReferences
  skipUserLog?: boolean
}

export interface AgentTurnSummary {
  id: string
  sequence: number
  status: 'queued' | 'waiting' | 'running' | 'completed' | 'failed' | 'canceled'
  text: string
  createdAt: number
  error?: string
}

export interface ClaimedAgentTurn extends AgentTurnDraft {
  id: string
}
