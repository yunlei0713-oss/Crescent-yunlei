import type { AgentRunStep } from './terminal-tabs'
import { AGENT_RUN_STREAM_MAX_CHARS, clampAgentText } from './agent-text-limits'

/** Text and reasoning are independent Pi content blocks, not alternating paragraphs. */
export function appendAgentStreamDelta(
  steps: AgentRunStep[],
  kind: 'message' | 'thought',
  text: string,
  streamId: string | undefined,
  createId: () => string
): AgentRunStep[] {
  if (!text) return steps
  let target = -1
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i]
    if (!streamId && step.kind !== 'message' && step.kind !== 'thought') break
    if (
      step.kind === kind &&
      (streamId ? step.streamId === streamId : !step.streamId && step.phase === 'streaming')
    ) {
      target = i
      break
    }
  }
  if (target >= 0) {
    const previous = steps[target] as Extract<AgentRunStep, { kind: 'message' | 'thought' }>
    const next = [...steps]
    next[target] = {
      ...previous,
      text: clampAgentText(previous.text + text, AGENT_RUN_STREAM_MAX_CHARS),
      phase: 'streaming'
    }
    return next
  }
  return [
    ...steps,
    {
      id: createId(),
      kind,
      streamId,
      text: clampAgentText(text, AGENT_RUN_STREAM_MAX_CHARS),
      phase: 'streaming'
    }
  ]
}

/** Repair the specific legacy short-prefix split for display; keep stored traces intact. */
export function coalesceLegacyMessageFragments(steps: AgentRunStep[]): AgentRunStep[] {
  const result: AgentRunStep[] = []
  for (const step of steps) {
    const previous = result[result.length - 1]
    if (
      step.kind === 'message' &&
      previous?.kind === 'message' &&
      !step.streamId &&
      !previous.streamId &&
      typeof previous.seq === 'number' &&
      typeof step.seq === 'number' &&
      step.seq > previous.seq + 1 &&
      /^[\p{L}\p{N}]{1,8}$/u.test(previous.text) &&
      step.text &&
      !/^[\r\n#>`~*-]/.test(step.text)
    ) {
      result[result.length - 1] = {
        ...previous,
        text: previous.text + step.text,
        phase: step.phase
      }
    } else {
      result.push(step)
    }
  }
  return result
}
