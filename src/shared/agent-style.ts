export const AGENT_STYLES = ['swift', 'concise', 'guided', 'teach'] as const
export type AgentStyle = (typeof AGENT_STYLES)[number]
export const DEFAULT_AGENT_STYLE: AgentStyle = 'concise'
export const WORKING_STYLE_HEADER = '# Working style'
export const TASK_SHAPED_OUTPUT_HEADER = '# Task-shaped output'
export const CLUSTER_HEALTH_REPORT_TEMPLATE =
  'Status · observed evidence · uncertainty · one recommended next step'

const STYLE_CONTRACTS: Record<AgentStyle, string> = {
  swift: 'Active style: swift. State the judgment and one next suggestion in 1–3 sentences.',
  concise: 'Active style: concise. Briefly explain the evidence and one next suggestion.',
  guided:
    'Active style: guided. Pair with the operator: explain the current hypothesis, goal and one next suggestion.',
  teach:
    'Active style: teach. Explain principles, risks, expected results and how to interpret them. Give one focused step or up to three useful alternative directions, never a batch.'
}

export function isAgentStyle(value: unknown): value is AgentStyle {
  return typeof value === 'string' && (AGENT_STYLES as readonly string[]).includes(value)
}
export function normalizeAgentStyle(value: unknown): AgentStyle {
  return isAgentStyle(value) ? value : DEFAULT_AGENT_STYLE
}
export function resolveShowAgentThinking(_style: AgentStyle, override?: boolean): boolean {
  return typeof override === 'boolean' ? override : false
}
export function buildAgentStyleContract(style: AgentStyle = DEFAULT_AGENT_STYLE): string {
  const resolved = normalizeAgentStyle(style)
  return [
    `${WORKING_STYLE_HEADER}: ${resolved}`,
    STYLE_CONTRACTS[resolved],
    'Style controls expression only. All terminal input is manual; files require human Diff approval. Never execute, batch commands or infer success without evidence.',
    TASK_SHAPED_OUTPUT_HEADER,
    'For Q&A explain directly. For diagnosis call propose_command once with one focused command; for proactive guidance offer one to three relevant choices without padding in that call and wait. For a report summarize only observed evidence and unresolved questions.',
    'Honor a user request to change explanation density for this turn.'
  ].join('\n')
}
