import type { ArchitectureSpec } from '@shared/architecture-spec'

type DiagramNode = [
  id: string,
  zh: string,
  en: string,
  kind: ArchitectureSpec['nodes'][number]['kind']
]
type DiagramEdge = [from: string, to: string]

// Bilingual presets share topology so neither language can retain a retired execution path.
function diagram(
  english: boolean,
  title: [string, string],
  nodes: DiagramNode[],
  edges: DiagramEdge[]
): ArchitectureSpec {
  return {
    title: title[english ? 1 : 0],
    nodes: nodes.map(([id, zh, en, kind]) => ({ id, label: english ? en : zh, kind })),
    edges: edges.map(([from, to]) => ({ from, to }))
  }
}

function usage(english: boolean): ArchitectureSpec {
  return diagram(
    english,
    ['使用关系', 'Usage'],
    [
      ['user', '用户', 'User', 'client'],
      ['chat', '墨巡聊天', 'MoXun chat', 'frontend'],
      ['iterm', '人工 iTerm 操作', 'Manual iTerm', 'external'],
      ['agent', 'Pi 只读分析与建议', 'Pi analysis and suggestions', 'service'],
      ['grant', '原生观察授权（默认关闭）', 'Native observation consent (off by default)', 'auth'],
      ['evidence', '脱敏、有界、短时证据', 'Redacted bounded evidence', 'data'],
      ['files', '本地文件审批', 'Local file approval', 'auth']
    ],
    [
      ['user', 'chat'],
      ['user', 'iterm'],
      ['chat', 'agent'],
      ['user', 'grant'],
      ['iterm', 'evidence'],
      ['grant', 'evidence'],
      ['evidence', 'agent'],
      ['agent', 'files'],
      ['user', 'files']
    ]
  )
}

function system(english: boolean): ArchitectureSpec {
  return diagram(
    english,
    ['进程边界', 'Process boundaries'],
    [
      ['renderer', 'Renderer 聊天与审批 UI', 'Renderer chat and review UI', 'frontend'],
      ['preload', 'Preload 有类型白名单', 'Typed Preload allowlist', 'ingress'],
      ['main', 'Main sender/frame/payload 校验', 'Main sender/frame/payload validation', 'auth'],
      ['pi', 'Pi 宿主工具 allowlist', 'Pi host tool allowlist', 'service'],
      ['terminal', '人工 SSH/PTY 与 iTerm', 'Manual SSH/PTY and iTerm', 'external'],
      ['observer', '原生授权与证据 owner', 'Native grants and evidence owner', 'auth'],
      ['files', '授权资料与文件审批服务', 'Authorized files and approval service', 'data'],
      ['store', 'SQLite / 配置 / Memory / Skill', 'SQLite / config / memory / Skills', 'data']
    ],
    [
      ['renderer', 'preload'],
      ['preload', 'main'],
      ['main', 'pi'],
      ['main', 'terminal'],
      ['main', 'observer'],
      ['terminal', 'observer'],
      ['observer', 'pi'],
      ['pi', 'files'],
      ['main', 'store']
    ]
  )
}

function terminal(english: boolean): ArchitectureSpec {
  return diagram(
    english,
    ['人工协作流程', 'Manual collaboration'],
    [
      ['problem', '问题与目标信息', 'Problem and target metadata', 'client'],
      ['analysis', '分析（未观察时明确告知）', 'Analysis (state when unobserved)', 'service'],
      ['suggestion', '文字建议与风险说明', 'Text suggestions and risks', 'frontend'],
      ['manual', '用户核对并在 iTerm 执行', 'User reviews and runs in iTerm', 'client'],
      ['consent', '可选原生确认', 'Optional native confirmation', 'auth'],
      ['evidence', '授权证据 / 手动脱敏输出', 'Authorized evidence / redacted input', 'data'],
      ['capture', 'SOP/Skill 草稿', 'SOP/Skill draft', 'queue'],
      ['confirm', '确认后 Main 持久化', 'Main persists after confirmation', 'auth']
    ],
    [
      ['problem', 'analysis'],
      ['analysis', 'suggestion'],
      ['suggestion', 'manual'],
      ['manual', 'evidence'],
      ['consent', 'evidence'],
      ['evidence', 'analysis'],
      ['analysis', 'capture'],
      ['capture', 'confirm']
    ]
  )
}

function tools(english: boolean): ArchitectureSpec {
  return diagram(
    english,
    ['宿主工具边界', 'Host tool boundaries'],
    [
      ['pi', 'Pi 明确 allowlist', 'Explicit Pi allowlist', 'service'],
      ['read', '授权本地读取 / 索引 / Memory', 'Authorized read / index / memory', 'data'],
      ['observe', '已授权观察证据', 'Authorized observation evidence', 'data'],
      ['change', '文件变更提议', 'File change proposal', 'queue'],
      ['approval', '逐文件 Diff 与原生确认', 'Per-file Diff and native confirmation', 'auth'],
      ['child', '只读子任务（无终端）', 'Read-only children (no terminal)', 'service'],
      ['capture', '知识草稿（确认后写入）', 'Knowledge drafts (confirm before write)', 'auth'],
      ['deny', '终端执行 / Agent MCP 拒绝', 'Terminal execution / Agent MCP denied', 'auth']
    ],
    [
      ['pi', 'read'],
      ['pi', 'observe'],
      ['pi', 'change'],
      ['change', 'approval'],
      ['pi', 'child'],
      ['pi', 'capture'],
      ['pi', 'deny']
    ]
  )
}

function children(english: boolean): ArchitectureSpec {
  return diagram(
    english,
    ['只读子任务', 'Read-only subtasks'],
    [
      ['parent', '主会话独立分析任务', 'Parent independent analysis task', 'service'],
      ['child', '宿主只读 child allowlist', 'Host read-only child allowlist', 'auth'],
      ['read', '授权资料与索引', 'Authorized files and index', 'data'],
      ['result', '结论回主会话', 'Conclusion to parent', 'frontend'],
      ['deny', '无终端/SSH/写入/派生', 'No terminal/SSH/writes/children', 'auth']
    ],
    [
      ['parent', 'child'],
      ['child', 'read'],
      ['read', 'result'],
      ['result', 'parent'],
      ['child', 'deny']
    ]
  )
}

function history(english: boolean): ArchitectureSpec {
  return diagram(
    english,
    ['历史恢复', 'History restoration'],
    [
      ['open', '打开历史', 'Open history', 'client'],
      ['chat', '恢复对话（旧审批只读）', 'Restore chat (old approvals read-only)', 'frontend'],
      ['config', '当前保存的连接配置', 'Currently saved connection config', 'data'],
      ['terminal', '人工 iTerm 连接流程', 'Manual iTerm connection flow', 'external'],
      ['off', '观察重置 off；不恢复旧权限', 'Observation off; no old permissions', 'auth']
    ],
    [
      ['open', 'chat'],
      ['chat', 'config'],
      ['config', 'terminal'],
      ['terminal', 'off']
    ]
  )
}

function skills(english: boolean): ArchitectureSpec {
  return diagram(
    english,
    ['确认后沉淀', 'Confirm before capture'],
    [
      ['request', 'create-skill / create-sop 请求', 'create-skill / create-sop request', 'service'],
      ['draft', '会话后台草稿', 'Background session draft', 'queue'],
      ['confirm', '用户确认（取消不写）', 'User confirmation (cancel means no write)', 'auth'],
      ['write', 'Main 写入 Skill/wiki', 'Main writes Skill/wiki', 'data']
    ],
    [
      ['request', 'draft'],
      ['draft', 'confirm'],
      ['confirm', 'write']
    ]
  )
}

function ssh(english: boolean): ArchitectureSpec {
  return diagram(
    english,
    ['人工 SSH 连接', 'Manual SSH connection'],
    [
      ['pick', '用户选择保存连接', 'User selects saved connection', 'client'],
      ['main', 'Main 创建 shared PTY/iTerm', 'Main creates shared PTY/iTerm', 'ingress'],
      ['login', '用户配置的登录动作', 'User-configured login actions', 'auth'],
      ['manual', '用户在 iTerm 操作', 'User operates iTerm', 'external'],
      ['grant', '可选原生观察授权', 'Optional native observation consent', 'auth'],
      ['analysis', 'Agent 仅分析授权证据', 'Agent analyzes authorized evidence only', 'service']
    ],
    [
      ['pick', 'main'],
      ['main', 'login'],
      ['login', 'manual'],
      ['manual', 'grant'],
      ['grant', 'analysis']
    ]
  )
}

function approval(english: boolean): ArchitectureSpec {
  return diagram(
    english,
    ['本地文件审批（不授权终端）', 'Local file approval (no terminal permission)'],
    [
      ['proposal', 'request_file_change 提议', 'request_file_change proposal', 'service'],
      ['diff', '完整 Diff / 逐文件决定', 'Full Diff / per-file decisions', 'frontend'],
      ['native', 'Main 原生确认', 'Main native confirmation', 'auth'],
      ['check', 'owner/run/path/hash/时效校验', 'owner/run/path/hash/expiry checks', 'auth'],
      ['write', '一次性授权写入并验证', 'One-time authorized write and verification', 'data'],
      ['reject', '拒绝/失效：文件字节不变', 'Reject/expire: file bytes unchanged', 'auth']
    ],
    [
      ['proposal', 'diff'],
      ['diff', 'native'],
      ['native', 'check'],
      ['check', 'write'],
      ['diff', 'reject'],
      ['native', 'reject'],
      ['check', 'reject']
    ]
  )
}

export const usageArchitectureZh = usage(false)
export const usageArchitectureEn = usage(true)
export const systemArchitectureZh = system(false)
export const systemArchitectureEn = system(true)
export const workflowArchitectureZh = terminal(false)
export const workflowArchitectureEn = terminal(true)
export const toolsArchitectureZh = tools(false)
export const toolsArchitectureEn = tools(true)
export const subagentsArchitectureZh = children(false)
export const subagentsArchitectureEn = children(true)
export const historyArchitectureZh = history(false)
export const historyArchitectureEn = history(true)
export const skillsArchitectureZh = skills(false)
export const skillsArchitectureEn = skills(true)
export const sshArchitectureZh = ssh(false)
export const sshArchitectureEn = ssh(true)
export const commandReviewArchitectureZh = approval(false)
export const commandReviewArchitectureEn = approval(true)
export const terminalArchitectureZh = terminal(false)
export const terminalArchitectureEn = terminal(true)

/** Retain existing preset names and page URLs while replacing retired architecture. */
export const architectureDiagramPresets: Record<string, ArchitectureSpec> = {
  'usage-zh': usageArchitectureZh,
  'usage-en': usageArchitectureEn,
  'system-zh': systemArchitectureZh,
  'system-en': systemArchitectureEn,
  'workflow-zh': workflowArchitectureZh,
  'workflow-en': workflowArchitectureEn,
  'tools-zh': toolsArchitectureZh,
  'tools-en': toolsArchitectureEn,
  'subagents-zh': subagentsArchitectureZh,
  'subagents-en': subagentsArchitectureEn,
  'history-zh': historyArchitectureZh,
  'history-en': historyArchitectureEn,
  'skills-zh': skillsArchitectureZh,
  'skills-en': skillsArchitectureEn,
  'ssh-zh': sshArchitectureZh,
  'ssh-en': sshArchitectureEn,
  'command-review-zh': commandReviewArchitectureZh,
  'command-review-en': commandReviewArchitectureEn,
  'terminal-zh': terminalArchitectureZh,
  'terminal-en': terminalArchitectureEn
}
