import { isAgentProviderEnabled } from '../../../shared/agent-providers'
import type { AgentConfig } from '../../../shared/agent-types'
export const CLOSE_TERMINAL_CONFIRM_STORAGE_KEY = 'crescent.closeTerminalConfirmEnabled'

export function hasConfiguredModelSelection(config: AgentConfig): boolean {
  const providerId = config.providerId?.trim()
  const model = config.model.trim()
  if (!providerId || !model) return false

  return config.providers.some(
    (provider) =>
      isAgentProviderEnabled(provider) &&
      provider.id === providerId &&
      provider.models.some((candidate) => candidate.id === model)
  )
}
