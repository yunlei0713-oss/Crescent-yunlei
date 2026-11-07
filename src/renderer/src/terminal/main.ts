import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import type { ManagedExecutionState } from '../../../shared/managed-terminal'
import type { ManagedTerminalBridge } from '../../../preload/terminal'
import '@xterm/xterm/css/xterm.css'
import './terminal.css'

declare global {
  interface Window {
    managedTerminal: ManagedTerminalBridge
  }
}

const zh = new URLSearchParams(location.search).get('lang') === 'zh-CN'
const label = (chinese: string, english: string): string => (zh ? chinese : english)
const executionLabels: Record<ManagedExecutionState, [string, string]> = {
  starting: ['正在验证本地 Shell…', 'Verifying the local shell…'],
  ready: [
    '本地协作 · 逐条审批 · 键入后转人工',
    'Local collaboration · approval required · typing takes over'
  ],
  'approval-pending': ['等待命令审批', 'Waiting for command approval'],
  dispatched: ['已发送 · 等待开始标记', 'Dispatched · waiting for start marker'],
  running: ['Agent 命令运行中', 'Agent command running'],
  'timed-out-running': ['等待超时 · 命令仍可能运行', 'Wait expired · command may still be running'],
  'completed-success': [
    '命令退出码 0 · 业务结果待验证',
    'Command exited 0 · task verification pending'
  ],
  'completed-failure': ['命令返回非零退出码', 'Command returned a nonzero exit code'],
  interrupted: ['命令中断，Shell 已恢复', 'Command interrupted and shell ready'],
  unknown: ['命令结果未知 · 仅人工操作', 'Command result unknown · manual input only'],
  'manual-only': ['人工已接管 · 本会话仅人工操作', 'Operator took over · manual input only']
}
const bridge = window.managedTerminal
const container = document.querySelector<HTMLElement>('#terminal')!
const status = document.querySelector<HTMLElement>('#status')!
const search = document.querySelector<HTMLInputElement>('#search')!
const session = document.querySelector<HTMLElement>('#session')!
const sshCollaboration = document.querySelector<HTMLButtonElement>('#ssh-collaboration')!
document.documentElement.lang = zh ? 'zh-CN' : 'en'
document.title = label('墨巡终端', 'MoXun Terminal')
search.placeholder = label('搜索滚屏', 'Find in terminal')
search.setAttribute('aria-label', search.placeholder)

const fit = new FitAddon()
const find = new SearchAddon()
const term = new Terminal({
  allowProposedApi: true,
  disableStdin: true,
  cursorBlink: !matchMedia('(prefers-reduced-motion: reduce)').matches,
  fontFamily: 'Menlo, Monaco, monospace',
  fontSize: 13,
  scrollback: 5000,
  theme: {
    background: '#191c1c',
    foreground: '#e8ebe8',
    cursor: '#13c2c2',
    selectionBackground: '#285c5b'
  },
  linkHandler: { activate: () => {} }
})
term.loadAddon(fit)
term.loadAddon(find)
term.loadAddon(new Unicode11Addon())
term.unicode.activeVersion = '11'
term.open(container)

async function start(): Promise<void> {
  const attachment = await bridge.attach()
  session.textContent = label('本地启动的 PTY', 'Locally started PTY')
  session.title = attachment.terminalSessionId
  let cursor = 0
  let initialReplay = true
  let replayGap = false
  let exited = false
  let dirty = false
  let scheduled = 0
  let sizeFrame = 0
  let reading = false
  let previousSize = ''
  let confirmSsh = false

  const reportError = (): void => {
    status.textContent = label(
      '终端操作失败，请重新打开窗口。',
      'Terminal operation failed. Reopen the window to reconnect.'
    )
  }

  const drain = async (): Promise<void> => {
    scheduled = 0
    reading = true
    dirty = false
    try {
      const snapshot = await bridge.read(attachment, cursor)
      confirmSsh = snapshot.sshProbe === 'confirm'
      sshCollaboration.hidden = !snapshot.canProbeSsh
      sshCollaboration.textContent = confirmSsh
        ? label('确认 SSH 会话', 'Confirm SSH shell')
        : label('复制 SSH 探测命令', 'Copy SSH probe')
      const remote = snapshot.shellTarget?.transport === 'ssh' ? snapshot.shellTarget : undefined
      if (remote) {
        session.textContent = `SSH · ${remote.user}@${remote.host}`
        session.title = remote.cwd
      }
      cursor = snapshot.cursor
      if (snapshot.truncated) {
        replayGap = true
        term.options.disableStdin = true
        term.reset()
      }
      if (snapshot.data) await new Promise<void>((resolve) => term.write(snapshot.data, resolve))
      exited = Boolean(snapshot.exit)
      initialReplay = false
      term.options.disableStdin = exited
      const running =
        remote && snapshot.executionState === 'ready'
          ? label('SSH 协作 · 逐条审批', 'SSH collaboration · approval required')
          : snapshot.executionState
            ? label(...executionLabels[snapshot.executionState])
            : label('人工操作 · 已连接', 'Manual input · connected')
      status.textContent = snapshot.exit
        ? label('Shell 已退出 · 退出码 ', 'Shell exited · exit code ') + snapshot.exit.exitCode
        : replayGap
          ? label(
              '已恢复近期输出 · 更早输出已截断',
              'Recent output restored · older output truncated'
            )
          : running
    } catch {
      reportError()
    } finally {
      reading = false
      if (dirty) scheduleRead()
    }
  }

  const scheduleRead = (): void => {
    dirty = true
    if (!scheduled && !reading) scheduled = requestAnimationFrame(() => void drain())
  }

  const resize = (): void => {
    if (sizeFrame) return
    sizeFrame = requestAnimationFrame(() => {
      sizeFrame = 0
      fit.fit()
      const size = `${term.cols}x${term.rows}`
      if (!exited && previousSize !== size) {
        previousSize = size
        void bridge.resize(attachment, term.cols, term.rows).catch(reportError)
      }
    })
  }

  const unsubscribe = bridge.onChanged(scheduleRead)
  const observer = new ResizeObserver(resize)
  observer.observe(container)

  term.onData((data) => {
    // xterm may emit protocol responses during replay. Only live data can flow back to the PTY.
    if (!initialReplay && !term.options.disableStdin)
      void bridge.write(attachment, data).catch(reportError)
  })

  const copy = (): void => {
    const selection = term.getSelection()
    if (selection) void bridge.copy(attachment, selection).catch(reportError)
  }
  const paste = (): void => {
    if (term.options.disableStdin) return
    void bridge
      .paste(attachment)
      .then((text) => {
        if (!term.options.disableStdin) term.paste(text)
        term.focus()
      })
      .catch(reportError)
  }

  const action = (id: string, text: string, run: () => void | Promise<void>): void => {
    const button = document.querySelector<HTMLButtonElement>('#' + id)!
    button.textContent = text
    button.addEventListener('click', () => void Promise.resolve().then(run).catch(reportError))
  }
  action('copy', label('复制', 'Copy'), copy)
  action('paste', label('粘贴', 'Paste'), paste)
  action('clear', label('清屏', 'Clear'), () => {
    term.clear()
    term.focus()
  })
  action('interrupt', label('中断', 'Interrupt'), async () => {
    if (!exited) await bridge.interrupt(attachment)
    term.focus()
  })
  action('ssh-collaboration', label('复制 SSH 探测命令', 'Copy SSH probe'), async () => {
    if (confirmSsh) await bridge.confirmSsh(attachment)
    else {
      await bridge.probeSsh(attachment)
      status.textContent = label(
        '已复制探测命令。仅在当前可信 SSH 提示符粘贴并按回车。',
        'Probe copied. Paste and press Enter only at the current trusted SSH prompt.'
      )
    }
    term.focus()
  })
  action('close', label('关闭窗口', 'Close window'), () => bridge.close(attachment))
  action('end', label('结束会话', 'End session'), () => bridge.end(attachment))

  search.addEventListener('input', () => {
    if (search.value) find.findNext(search.value, { incremental: true })
    else find.clearDecorations()
  })
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') term.focus()
    if (event.key === 'Enter' && search.value) {
      if (event.shiftKey) find.findPrevious(search.value)
      else find.findNext(search.value)
    }
  })
  term.attachCustomKeyEventHandler((event) => {
    if (event.type !== 'keydown' || !event.metaKey) return true
    if (event.key === 'f') search.focus()
    else if (event.key === 'c') copy()
    else if (event.key === 'v') paste()
    else if (['+', '=', '-'].includes(event.key)) {
      term.options.fontSize = Math.max(
        9,
        Math.min(28, (term.options.fontSize ?? 13) + (event.key === '-' ? -1 : 1))
      )
      resize()
    } else return true
    event.preventDefault()
    return false
  })
  window.addEventListener(
    'pagehide',
    () => {
      unsubscribe()
      observer.disconnect()
      cancelAnimationFrame(scheduled)
      cancelAnimationFrame(sizeFrame)
      term.dispose()
    },
    { once: true }
  )

  scheduleRead()
  resize()
  term.focus()
}

void start().catch(() => {
  status.textContent = label(
    '无法连接终端，请重新打开窗口。',
    'Could not attach. Reopen the terminal window.'
  )
})
