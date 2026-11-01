import { execFile } from 'node:child_process'
import type { ITermSessionSummary } from '../../../shared/external-terminal'
import { assertOperatorTerminalAccess } from '../../security/capability-enforcement'

// JXA uses iTerm's installed scripting dictionary. Arguments travel over stdin,
// never through shell interpolation or the process command line (typed secrets).
const SCRIPT = String.raw`
function perform(request) {
  var app = Application('com.googlecode.iterm2');
  if (request.action === 'create') {
    var created = app.createWindowWithDefaultProfile({command: request.command});
    app.activate();
    return {id: created.currentSession().id()};
  }
  if (!app.running()) {
    if (request.action === 'list') return [];
    throw new Error('ITERM_NOT_RUNNING');
  }
  var result = [];
  var windows = app.windows() || [];
  for (var w = 0; w < windows.length; w++) {
    // iTerm can retain an empty window after its last session exits. JXA
    // returns null for that collection rather than an empty array.
    var tabs = windows[w].tabs() || [];
    for (var t = 0; t < tabs.length; t++) {
      var sessions = tabs[t].sessions() || [];
      for (var p = 0; p < sessions.length; p++) {
        var session = sessions[p];
        var id = session.id();
        if (request.action === 'list') {
          result.push({id: id, name: session.name(), window: w + 1, tab: t + 1, pane: p + 1,
            columns: session.columns(), rows: session.rows()});
        } else if (id === request.id) {
          if (request.action === 'read') return {text: session.text(), columns: session.columns(), rows: session.rows()};
          if (request.action === 'size') return {columns: session.columns(), rows: session.rows()};
          if (request.action === 'focus') { windows[w].select(); tabs[t].select(); session.select(); app.activate(); }
          return {ok: true};
        }
      }
    }
  }
  if (request.action === 'list') return result;
  throw new Error('ITERM_SESSION_MISSING');
}
`

export function assertITermSessionId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9:-]{1,160}$/.test(value))
    throw new Error('Invalid iTerm session ID')
}

export function itermRequest<T>(
  request: Record<string, unknown>,
  signal?: AbortSignal
): Promise<T> {
  assertOperatorTerminalAccess()
  if (!['list', 'create', 'read', 'size', 'focus'].includes(String(request.action)))
    return Promise.reject(new Error('Unsupported iTerm operation; terminal input is user-owned'))
  if (process.platform !== 'darwin') return Promise.reject(new Error('iTerm requires macOS'))
  return new Promise((resolve, reject) => {
    const child = execFile(
      '/usr/bin/osascript',
      ['-l', 'JavaScript', '-'],
      { timeout: 15000, maxBuffer: 1024 * 1024, signal },
      (error, stdout, stderr) => {
        if (error) {
          // Never echo generated source or input text into errors/logs.
          const detail = `${stderr} ${error.message}`
          const reason = /-1743|not authorized|not permitted/i.test(detail)
            ? 'ITERM_AUTOMATION_DENIED: 请在系统设置 → 隐私与安全性 → 自动化中允许墨巡控制 iTerm。'
            : /ITERM_SESSION_MISSING|ITERM_NOT_RUNNING/.test(detail)
              ? 'ITERM_SESSION_MISSING: iTerm 会话已关闭，请重新选择。'
              : /-10814|Application can.t be found|application.*not.*found/i.test(detail)
                ? 'ITERM_NOT_INSTALLED: 未找到 iTerm，请先安装 iTerm2。'
                : 'ITERM_UNAVAILABLE: 无法连接 iTerm，请检查自动化授权并重试。'
          reject(new Error(reason))
          return
        }
        try {
          resolve(JSON.parse(stdout.trim()) as T)
        } catch {
          reject(new Error('ITERM_INVALID_RESPONSE: Invalid iTerm response'))
        }
      }
    )
    child.stdin?.on('error', () => {})
    child.stdin?.end(
      `${SCRIPT}\nfunction run() { return JSON.stringify(perform(${JSON.stringify(request)})); }`
    )
  })
}

export function listITermSessions(): Promise<ITermSessionSummary[]> {
  return itermRequest({ action: 'list' })
}

export function focusITermSession(id: string): Promise<{ ok: true }> {
  assertITermSessionId(id)
  return itermRequest({ action: 'focus', id })
}
