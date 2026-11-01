import { useId } from 'react'
import type { TerminalObservationMode } from '../../../shared/external-terminal'

export function TerminalObservationChoice({
  value,
  onChange,
  disabled,
  zh
}: {
  value: TerminalObservationMode
  onChange: (mode: TerminalObservationMode) => void
  disabled?: boolean
  zh: boolean
}): React.JSX.Element {
  const name = useId()
  const choices: Array<[TerminalObservationMode, string, string]> = [
    [
      'off',
      zh ? '不参与（默认）' : 'No AI participation (default)',
      zh ? '不读取终端内容。' : 'No terminal content is read.'
    ],
    [
      'live',
      zh ? '从现在开始观察' : 'Observe from now',
      zh ? '确认授权后，只观察可靠新增内容。' : 'After consent, observe reliable new content only.'
    ],
    [
      'context-live',
      zh ? '加入当前上下文并继续观察' : 'Include current context and observe',
      zh
        ? '确认授权后，加入有限快照并继续观察。'
        : 'After consent, include a bounded snapshot and continue.'
    ]
  ]
  return (
    <fieldset disabled={disabled} className="space-y-2 px-4 py-3">
      <legend className="text-xs font-medium">
        {zh ? '本轮 AI 终端协作' : 'AI terminal collaboration for this session'}
      </legend>
      {choices.map(([mode, label, description]) => (
        <label key={mode} className="flex items-start gap-2 text-xs">
          <input
            type="radio"
            name={name}
            value={mode}
            checked={value === mode}
            className="mt-0.5 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            onChange={() => onChange(mode)}
          />
          <span>
            {label}
            <span className="mt-0.5 block leading-relaxed text-muted-foreground">
              {description}
            </span>
          </span>
        </label>
      ))}
      <p className="text-xs leading-relaxed text-muted-foreground">
        {zh
          ? '观察跟随此终端，SSH 换主机或退回本地仍继续；其他终端需独立授权。Agent 不能输入或执行命令。开启观察须原生确认。'
          : 'Observation follows this terminal through SSH hops and return to local; other terminals need separate consent. Agents cannot type or execute commands. Native confirmation is required.'}
      </p>
      <details className="text-xs leading-relaxed text-muted-foreground">
        <summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          {zh ? '观察范围与隐私限制' : 'Observation scope and privacy limits'}
        </summary>
        <p className="mt-1">
          {zh
            ? '已有 iTerm 提供当前可访问文本和后续快照（可能含部分滚屏），不保证完整历史，可能遗漏输出，也不能验证命令退出码。从现在模式保守过滤授权前内容；无可靠新增内容时不提供证据。所有命令由你在 iTerm 输入。'
            : 'Existing iTerm provides snapshots of accessible text, possibly including some scrollback; full history and exit codes are not guaranteed. Observe-from-now conservatively excludes prior content. Type all commands yourself in iTerm.'}
        </p>
        <p className="mt-1">
          {zh
            ? '证据经脱敏，仅有界、短时保留在内存。暂停、撤销或终端绑定变化停止采样并清除证据；恢复需重新授权，暂停内容不回放。请留意跳转主机和本地的机密内容。'
            : 'Evidence is redacted, bounded and short-lived in memory. Pause, revocation or terminal binding changes clear evidence. Resume needs fresh consent; paused content is not replayed. Mind confidential content on other hosts and locally.'}
        </p>
      </details>
    </fieldset>
  )
}
