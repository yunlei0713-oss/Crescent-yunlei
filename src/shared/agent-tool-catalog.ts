import type { ToolCatalogEntry } from './agent-types'

/** Reviewed host tools only; the runtime independently enforces this boundary. */
export const BUILT_IN_TOOL_CATALOG: ToolCatalogEntry[] = [
  ...[
    'read',
    'code_search',
    'symbol_lookup',
    'dependency_trace',
    'impact_analysis',
    'memory_search',
    'history_search',
    'observe_terminal',
    'wait_terminal_command',
    'get_terminal_command_result',
    'get_terminal_session_status',
    'list_active_terminal_commands'
  ].map(
    (name): ToolCatalogEntry => ({
      name,
      method: 'get',
      path: `pi://moxun/${name}`,
      description: 'Read authorized, bounded, redacted evidence.',
      source: 'built-in',
      risk: 'low',
      requiresApproval: false,
      external: false,
      stateChanging: false
    })
  ),
  {
    name: 'propose_command',
    method: 'post',
    path: 'pi://moxun/propose_command',
    description:
      'Suggest one to three useful next-direction choices, target-bound and manually copied/typed by the operator.',
    source: 'built-in',
    risk: 'low',
    requiresApproval: false,
    external: false,
    stateChanging: false
  },
  {
    name: 'request_terminal_command',
    method: 'post',
    path: 'pi://moxun/request_terminal_command',
    description:
      'Request one native approval for a supported command in the current visible collaboration terminal.',
    source: 'built-in',
    risk: 'low',
    requiresApproval: true,
    external: false,
    stateChanging: false
  },
  {
    name: 'cancel_terminal_command',
    method: 'post',
    path: 'pi://moxun/cancel_terminal_command',
    description:
      'Cancel a pending request or request operator-confirmed interruption in the visible terminal.',
    source: 'built-in',
    risk: 'low',
    requiresApproval: true,
    external: false,
    stateChanging: true
  },
  {
    name: 'request_file_change',
    method: 'post',
    path: 'pi://moxun/request_file_change',
    description:
      'Request exact one-time file Diff approval; verify paths, hashes and actual results.',
    source: 'built-in',
    risk: 'high',
    requiresApproval: true,
    external: false,
    stateChanging: true
  },
  {
    name: 'subagent',
    method: 'post',
    path: 'pi://moxun/subagent',
    description: 'Delegate read-only analysis; children have no terminal or file mutation access.',
    source: 'built-in',
    risk: 'low',
    requiresApproval: false,
    external: false,
    stateChanging: false
  },
  ...['create-skill', 'create-sop'].map(
    (name): ToolCatalogEntry => ({
      name,
      method: 'post',
      path: `pi://moxun/${name}`,
      description: 'Prepare a knowledge draft for separate operator confirmation.',
      source: 'built-in',
      risk: 'medium',
      requiresApproval: false,
      external: false,
      stateChanging: false
    })
  )
]
