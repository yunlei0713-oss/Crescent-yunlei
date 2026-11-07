import type { AgentRuntimeAdapter, AgentRuntimeSession } from '../types'
import { mapPiSessionEventToAgentEvents } from '../../pi-event-bridge'
import { syncCrescentProvidersToModelRuntime } from '../../pi-model-runtime'
import type { PiSdkFacade } from './loader'
import { assertAgentTools } from '../../../security/agent-capability-policy'
import { withAgentCapabilities } from '../../../security/capability-enforcement'

type Options = NonNullable<Parameters<PiSdkFacade['createAgentSession']>[0]>

export function createPiRuntime(pi: PiSdkFacade): AgentRuntimeAdapter<Options> {
  return {
    id: 'pi',
    async listModels(config) {
      const runtime = await syncCrescentProvidersToModelRuntime(config)
      return runtime.getAvailable()
    },
    async createSession(options) {
      if (!options.tools) throw new Error('Host tool allowlist is required')
      assertAgentTools(options.tools)
      assertAgentTools((options.customTools ?? []).map((tool) => tool.name))
      // Never fall through to Pi's built-in implementations, even for `read`.
      const customNames = new Set((options.customTools ?? []).map((tool) => tool.name))
      if (options.tools.some((name) => !customNames.has(name)))
        throw new Error('Every active tool must have a reviewed host implementation')
      const { session } = await withAgentCapabilities(() => pi.createAgentSession(options))
      assertAgentTools(session.getActiveToolNames())
      const adapter: AgentRuntimeSession = {
        get messages() {
          return session.messages
        },
        get model() {
          return session.model
        },
        get isStreaming() {
          return session.isStreaming
        },
        get isCompacting() {
          return session.isCompacting
        },
        prompt: (text, images) => {
          assertAgentTools(session.getActiveToolNames())
          if (images?.length && !session.model?.input.includes('image'))
            throw new Error('Selected model does not support image input')
          return withAgentCapabilities(() =>
            session.prompt(text, { images, expandPromptTemplates: false })
          )
        },
        steer: async (text) => {
          await withAgentCapabilities(() => session.steer(text))
        },
        abort: () => session.abort(),
        waitForIdle: () => session.waitForIdle(),
        abortRetry: () => session.abortRetry(),
        abortCompaction: () => session.abortCompaction(),
        compact: (instructions) => withAgentCapabilities(() => session.compact(instructions)),
        async setModel(model) {
          const resolved = options.modelRuntime?.getModel(model.provider, model.id)
          if (!resolved) throw new Error(`Runtime model unavailable: ${model.provider}/${model.id}`)
          await session.setModel(resolved)
        },
        setThinkingLevel: (level) => session.setThinkingLevel(level),
        setActiveToolsByName: (names) => {
          assertAgentTools(names)
          if (names.some((name) => !customNames.has(name)))
            throw new Error('Tool has no reviewed host implementation')
          session.setActiveToolsByName(names)
        },
        getActiveToolNames: () => session.getActiveToolNames(),
        getSessionStats: () => session.getSessionStats(),
        getContextUsage: () => session.getContextUsage(),
        getContext: () => session.sessionManager.buildSessionContext().messages,
        getRevision: () => session.sessionManager.getLeafId() ?? undefined,
        subscribe: (listener, meta) => {
          let messageSequence = 0
          return session.subscribe((event) => {
            if (event.type === 'message_start') messageSequence += 1
            listener({
              events: mapPiSessionEventToAgentEvents(event, {
                ...meta,
                streamMessageId: `${meta.runId}:message:${messageSequence}`
              }),
              usageChanged: ['compaction_end', 'turn_end', 'message_end'].includes(event.type),
              retryError: event.type === 'auto_retry_start' ? event.errorMessage : undefined,
              compactionStart: event.type === 'compaction_start' ? event.reason : undefined,
              compaction:
                event.type === 'compaction_end'
                  ? { reason: event.reason, aborted: event.aborted, result: event.result }
                  : undefined
            })
          })
        },
        dispose: () => session.dispose()
      }
      return adapter
    }
  }
}
