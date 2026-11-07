import { randomBytes } from 'node:crypto'
import type { ManagedShellTarget } from '../../../shared/managed-terminal'
import { TerminalTextStream } from '../terminal-text-stream'

export const COMMAND_MARKER = '\x1b]997;'
export const PROMPT_MARKER = '\x1b]133;A\x07'

export function newShellNonce(): string {
  return randomBytes(24).toString('hex')
}

export function readyMarker(nonce: string): string {
  return COMMAND_MARKER + 'ready;' + nonce + '\x07'
}

export function localBashPrompt(nonce: string): string {
  return '\\[\\e]133;A\\a\\e]997;ready;' + nonce + '\\a\\]moxun bash> '
}

const allowedCommands = new Map([
  ['pwd', 'builtin pwd -P'],
  ['true', 'builtin true'],
  ['false', 'builtin false'],
  ['uname', '/usr/bin/uname'],
  ['uname -s', '/usr/bin/uname -s'],
  ['uname -r', '/usr/bin/uname -r'],
  ['uname -m', '/usr/bin/uname -m']
])

export function reviewedShellExpression(command: string): string {
  const exact = allowedCommands.get(command)
  if (exact) return exact
  const sleep = /^sleep ([1-9][0-9]{0,2})$/.exec(command)?.[1]
  if (sleep && Number(sleep) <= 600) return '/bin/sleep ' + sleep
  const literal = /^echo ([a-zA-Z0-9][a-zA-Z0-9 ._:@/+-]{0,99})$/.exec(command)?.[1]
  if (literal && !/^(bearer\s)|\b(?:sk-|gh[pousr]_|github_pat_|AKIA)/i.test(literal))
    return "builtin printf '%s\\n' '" + literal + "'"
  throw new Error(
    'This command requires manual input. The managed tool supports pwd, true, false, uname, literal echo and bounded sleep.'
  )
}

export function commandLine(expression: string, envelope: string, sshGuard?: string): string {
  const start = "builtin printf '\\033]997;start;" + envelope + "\\007'"
  const end = "builtin printf '\\033]997;end;" + envelope + ";%d\\007'"
  const body = start + '; if ' + expression + '; then ' + end + ' 0; else ' + end + ' "$?"; fi'
  return (sshGuard ? 'if ' + sshGuard + '; then ' + body + '; fi' : body) + '\r'
}

function quote(value: string): string {
  return "'" + value.replaceAll("'", "'\\''") + "'"
}

export interface SshShellCapability {
  target: Required<Omit<ManagedShellTarget, 'shellGeneration'>>
  nonce: string
  guard: string
}

/** Receives only OSC frames from a visible PTY after an operator has requested a probe. */
export class SshShellProbe {
  private readonly nonce = newShellNonce()
  private readonly expiresAt = Date.now() + 60_000
  private candidate?: { target: SshShellCapability['target']; pid: string }
  private capability?: SshShellCapability
  private sawPrompt = false
  private invalid = false
  private readonly stream = new TerminalTextStream(
    () => {},
    (frame) => this.control(frame)
  )

  get bootstrap(): string {
    // The operator pastes this at the current SSH prompt. It only changes variables
    // in that shell and prepends the transient marker to the existing prompt.
    const frame = '\\033]133;A\\007\\033]997;ready;' + this.nonce + '\\007'
    const emit = "builtin printf '\\033]997;probe;" + this.nonce + ";%s;%s;%s;%s;%s;%s\\007'"
    const report = '"$$" "${USER-}" "${HOSTNAME:-${HOST-}}" "$(builtin pwd -P)"'
    return [
      'if [[ $- == *i* && -n "${SSH_TTY-}" && -n "${SSH_CONNECTION-}"',
      '&& -z "${TMUX-}${STY-}" && "$(/usr/bin/tty)" == "$SSH_TTY" ]]; then',
      'if [[ -n "${BASH_VERSION-}" ]]; then __moxun_ssh_scope=' +
        this.nonce +
        '; PS1=' +
        quote('\\[\\e]133;A\\a\\e]997;ready;' + this.nonce + '\\a\\]') +
        '"$PS1"; ' +
        emit +
        ' bash "$BASH_VERSION" ' +
        report +
        ';',
      'elif [[ -n "${ZSH_VERSION-}" ]]; then __moxun_ssh_scope=' +
        this.nonce +
        "; PS1=$'%{" +
        frame +
        "%}'" +
        '"$PS1"; ' +
        emit +
        ' zsh "$ZSH_VERSION" ' +
        report +
        '; fi; fi'
    ].join(' ')
  }

  get target(): SshShellCapability['target'] | undefined {
    return this.result?.target
  }

  get result(): SshShellCapability | undefined {
    return !this.invalid && Date.now() < this.expiresAt ? this.capability : undefined
  }

  invalidate(): void {
    this.invalid = true
    this.candidate = undefined
    this.capability = undefined
  }

  acceptOutput(data: string): void {
    if (!this.invalid && Date.now() < this.expiresAt && !this.capability) this.stream.write(data)
  }

  acceptInput(): void {
    if (this.candidate || this.capability) this.invalidate()
  }

  private control(frame: string): void {
    const prefix = COMMAND_MARKER + 'probe;' + this.nonce + ';'
    if (frame.startsWith(prefix) && frame.endsWith('\x07')) {
      const fields = frame.slice(prefix.length, -1).split(';')
      const [shell, version, pid, user, host, cwd] = fields
      this.sawPrompt = false
      this.candidate = undefined
      if (
        fields.length !== 6 ||
        (shell !== 'bash' && shell !== 'zsh') ||
        !/^[0-9][a-zA-Z0-9.()+_-]{0,63}$/.test(version) ||
        !/^[1-9][0-9]{0,10}$/.test(pid) ||
        !/^[a-zA-Z0-9_.-]{1,64}$/.test(user) ||
        !/^[a-zA-Z0-9_.-]{1,255}$/.test(host) ||
        !/^\/[a-zA-Z0-9._/@ +()-]{0,768}$/.test(cwd)
      )
        return
      this.candidate = { target: { shell, version, user, host, cwd, transport: 'ssh' }, pid }
    } else if (frame === PROMPT_MARKER) {
      this.sawPrompt = true
    } else if (frame === readyMarker(this.nonce) && this.sawPrompt && this.candidate) {
      const { target, pid } = this.candidate
      this.capability = {
        target,
        nonce: this.nonce,
        // A disconnected transport or different remote shell must not run the business command.
        guard: [
          '[[ "$$" == ' + pid,
          '&& "${__moxun_ssh_scope-}" == ' + this.nonce,
          '&& -n "${SSH_TTY-}" && -n "${SSH_CONNECTION-}"',
          '&& -z "${TMUX-}${STY-}" && "$(/usr/bin/tty)" == "$SSH_TTY"',
          '&& "${USER-}" == ' + quote(target.user),
          '&& "${HOSTNAME:-${HOST-}}" == ' + quote(target.host),
          '&& "$(builtin pwd -P)" == ' + quote(target.cwd) + ' ]]'
        ].join(' ')
      }
    }
  }
}
