import type { GuidedOpsState } from '../../../shared/guided-ops-types'

const stateLabels: Record<GuidedOpsState, [zh: string, en: string]> = {
  ANALYZING: ['分析中', 'Analyzing'],
  ANALYZING_NEXT: ['分析下一步', 'Analyzing the next step'],
  PROPOSAL_READY: ['建议已准备', 'Suggestion ready'],
  WAITING_OPERATOR: ['等待人工操作', 'Waiting for the operator'],
  COMMAND_RUNNING: ['观察到命令提交', 'Command submission observed'],
  OBSERVING: ['观察输出', 'Observing output'],
  EVIDENCE_READY: ['结果证据已就绪', 'Evidence ready'],
  COMPLETED: ['已结束', 'Completed'],
  INTERRUPTED: ['已打断 / 目标变化', 'Interrupted or goal changed'],
  OBSERVATION_UNCERTAIN: ['命令边界 / 结果不确定', 'Command boundary or outcome uncertain']
}

export function guidedOpsStateLabel(state: GuidedOpsState, zh: boolean): string {
  return stateLabels[state]?.[zh ? 0 : 1] ?? state
}
