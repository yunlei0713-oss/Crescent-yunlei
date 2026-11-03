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
    'observe_terminal'
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
