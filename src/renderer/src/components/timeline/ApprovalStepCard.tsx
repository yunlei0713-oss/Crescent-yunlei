import type { Dictionary } from '@renderer/i18n'
import type { AgentRunStep } from '@renderer/lib/terminal-tabs'
import { CommandBlock } from './CommandBlock'

/** Historical audit data only; never offer approval, execution or whitelist controls. */
export function ApprovalStepCard({
  step,
  t
}: {
  step: Extract<AgentRunStep, { kind: 'approval' }>
  t: Dictionary
  onResolve?: (requestId: string, approved: boolean, note?: string) => void
  onAddToWhitelist?: (command: string) => void
}): React.JSX.Element {
  const zh = t.locale === 'zh-CN'
  return (
    <details className="min-w-0 text-xs text-muted-foreground">
      <summary className="cursor-pointer">
        {zh
          ? '历史命令审计（只读，不能执行）'
          : 'Historical command audit (read-only, no execution)'}
      </summary>
      <div className="space-y-2 py-2">
        <CommandBlock command={step.command} t={t} tone="audit" />
        {step.auditSummary ? <p>{step.auditSummary}</p> : null}
        {step.operationReason ? <p>{step.operationReason}</p> : null}
        {step.impactAnalysis ? <p>{step.impactAnalysis}</p> : null}
        {step.note || step.rejectionReason ? <p>{step.note || step.rejectionReason}</p> : null}
      </div>
    </details>
  )
}
