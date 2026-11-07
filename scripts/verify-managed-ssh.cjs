// Isolated macOS fixture. Run with node --test scripts/verify-managed-ssh.cjs.
const assert = require('node:assert/strict')
const { execFileSync, spawn } = require('node:child_process')
const { once } = require('node:events')
const { createConnection, createServer } = require('node:net')
const { mkdtemp, readFile, realpath, rm, symlink, writeFile } = require('node:fs/promises')
const { userInfo } = require('node:os')
const { join, resolve } = require('node:path')
const { test } = require('node:test')
const { setTimeout: delay } = require('node:timers/promises')
const { buildSync } = require('esbuild')

const root = resolve(__dirname, '..')
const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'"

async function eventually(check, label, milliseconds = 7000) {
  const deadline = Date.now() + milliseconds
  while (Date.now() < deadline) {
    const result = check()
    if (result) return result
    await delay(25)
  }
  throw new Error('Timed out waiting for ' + label)
}

async function loopback(directory, shell) {
  const key = join(directory, 'fixture-key')
  const knownHosts = join(directory, 'known_hosts')
  const config = join(directory, 'sshd_config')
  execFileSync('/usr/bin/ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', key])
  const listener = createServer()
  listener.listen(0, '127.0.0.1')
  await once(listener, 'listening')
  const port = listener.address().port
  await new Promise((done) => listener.close(done))
  const [kind, publicKey] = (await readFile(key + '.pub', 'utf8')).split(/\s+/)
  await writeFile(knownHosts, `[127.0.0.1]:${port} ${kind} ${publicKey}\n`)
  const user = userInfo().username
  const remote = shell === 'zsh' ? '/bin/zsh -f -i' : '/bin/bash --noprofile --norc -i'
  await writeFile(
    config,
    [
      `Port ${port}`,
      'ListenAddress 127.0.0.1',
      `HostKey ${key}`,
      `PidFile ${directory}/sshd.pid`,
      `AuthorizedKeysFile ${key}.pub`,
      'StrictModes no',
      'UsePAM no',
      'PasswordAuthentication no',
      'KbdInteractiveAuthentication no',
      'DisableForwarding yes',
      'PermitUserRC no',
      `AllowUsers ${user}`,
      `SetEnv HOME=${directory} ZDOTDIR=${directory} BASH_ENV=/dev/null HISTFILE=/dev/null`,
      `ForceCommand ${remote}`,
      ''
    ].join('\n')
  )
  const daemon = spawn('/usr/sbin/sshd', ['-D', '-e', '-f', config], { stdio: 'ignore' })
  const ready = async () => {
    await once(daemon, 'spawn')
    for (let index = 0; index < 100; index++) {
      if (daemon.exitCode !== null) throw new Error('Loopback daemon exited')
      const socket = createConnection({ host: '127.0.0.1', port })
      try {
        await once(socket, 'connect')
        return
      } catch {
        await delay(30)
      } finally {
        socket.destroy()
      }
    }
    throw new Error('Loopback daemon unavailable')
  }
  const command = [
    '/usr/bin/ssh',
    '-tt',
    '-F',
    '/dev/null',
    '-o',
    'StrictHostKeyChecking=yes',
    '-o',
    'UserKnownHostsFile=' + knownHosts,
    '-o',
    'GlobalKnownHostsFile=/dev/null',
    '-o',
    'IdentityAgent=none',
    '-o',
    'IdentitiesOnly=yes',
    '-o',
    'BatchMode=yes',
    '-o',
    'ConnectTimeout=2',
    '-i',
    key,
    '-p',
    String(port),
    user + '@127.0.0.1'
  ]
    .map(quote)
    .join(' ')
  const launcher = quote('printf "FIXTURE_SSH_PID:%s\\n" "$$"; exec "$@"')
  return { daemon, ready: ready(), command: '/bin/sh -c ' + launcher + ' -- ' + command }
}

module.exports = { loopback, quote }

for (const shell of require.main === module ? ['bash', 'zsh'] : []) {
  test(
    'same visible-session authority over loopback SSH ' + shell,
    { timeout: 45000 },
    async () => {
      const directory = await realpath(await mkdtemp('/private/tmp/mx10ssh.'))
      let server
      let sessions
      let waitForExit
      try {
        await symlink(join(root, 'node_modules'), join(directory, 'node_modules'))
        const outfile = join(directory, 'fixture.cjs')
        buildSync({
          stdin: {
            contents:
              'export * from "./managed/session-manager"; export * from "./session/pty-session"; export * from "../security/capability-enforcement"',
            resolveDir: join(root, 'src/main/terminal')
          },
          outfile,
          bundle: true,
          platform: 'node',
          external: ['node-pty']
        })
        const {
          ManagedTerminalSessions,
          waitForPtySessionsToExit,
          withAgentCapabilities
        } = require(outfile)
        waitForExit = waitForPtySessionsToExit
        server = await loopback(directory, shell)
        await server.ready
        sessions = new ManagedTerminalSessions()
        const identity = sessions.create({ cwd: directory, cols: 160, rows: 30 }, true)
        const owner = {}
        const attachment = sessions.attach(identity, owner)
        const snapshot = () => sessions.read(attachment, owner, 0, true)
        const write = (data) => sessions.write(attachment, owner, data + '\r')
        const run = (command, approve = async () => true) =>
          withAgentCapabilities(() =>
            sessions.executeReviewed(
              identity,
              command,
              approve,
              () => true,
              new AbortController().signal
            )
          )
        await eventually(() => snapshot().executionState === 'ready', 'local prompt')
        write(server.command)
        await eventually(() => snapshot().canProbeSsh, 'foreground ssh')
        write('cd ' + quote(directory) + '; printf "FIXTURE_REMOTE_READY\\n"')
        await eventually(
          () => snapshot().data.includes('\r\nFIXTURE_REMOTE_READY\r\n'),
          'remote prompt'
        )
        const probe = sessions.prepareSshProbe(attachment, owner)
        assert.equal(sessions.canExecute(identity), false)
        assert.throws(() => sessions.prepareSshActivation(attachment, {}), /unauthorized/)
        write(probe)
        await eventually(() => snapshot().sshProbe === 'confirm', 'probed ' + shell + ' prompt')
        const binding = sessions.prepareSshActivation(attachment, owner)
        assert.equal(binding.target.cwd, directory)
        assert.equal(binding.target.shell, shell)
        assert.equal(sessions.canExecute(identity), false)
        binding.activate()
        assert.equal(sessions.canExecute(identity), true)
        const denied = await run('echo NEVER_DISPATCHED_CANARY', async () => false)
        assert.equal(denied.state, 'rejected')
        assert.doesNotMatch(snapshot().data, /NEVER_DISPATCHED_CANARY/)
        assert.throws(() => withAgentCapabilities(() => write('forbidden')), /denied/)
        const pwd = await run('pwd')
        assert.equal(pwd.exitCode, 0)
        assert.equal(pwd.target.transport, 'ssh')
        assert.ok(pwd.target.shellGeneration > identity.sessionGeneration)
        assert.equal(pwd.output.trim(), directory)
        const failure = await run('false')
        assert.equal(failure.exitCode, 1)
        assert.match(snapshot().data, /builtin pwd -P/)
        if (shell === 'bash') {
          const initial = await run('sleep 6')
          assert.equal(initial.state, 'timed-out-running')
          assert.equal(sessions.canExecute(identity), false)
          const executor = sessions.commandExecutor(identity, initial.commandId)
          const final = await executor.waitForResult(
            initial.commandId,
            10000,
            new AbortController().signal
          )
          assert.equal(final.commandId, initial.commandId)
          assert.equal(final.exitCode, 0)
        }
        // Terminate only the loopback client to exercise asynchronous transport loss.
        const pending = run('sleep 20')
        await eventually(() => snapshot().executionState === 'running', 'long remote command')
        const clientPid = snapshot().data.match(/\r\nFIXTURE_SSH_PID:(\d+)\r\n/)?.[1]
        assert.ok(Number(clientPid) > 1)
        process.kill(Number(clientPid), 'SIGTERM')
        const lost = await pending
        assert.equal(lost.state, 'unknown')
        assert.equal(lost.reason, 'transport-lost')
        assert.equal(lost.exitCode, undefined)
        assert.equal(sessions.canExecute(identity), false)
        write('printf "FIXTURE_LOCAL_AFTER_SSH\\n"')
        await eventually(
          () => snapshot().data.includes('\r\nFIXTURE_LOCAL_AFTER_SSH\r\n'),
          'same local shell'
        )
      } finally {
        sessions?.stop()
        if (waitForExit) await waitForExit()
        if (server?.daemon.exitCode === null && server.daemon.signalCode === null) {
          const closed = once(server.daemon, 'close')
          server.daemon.kill()
          await closed
        }
        await rm(directory, { recursive: true, force: true })
      }
    }
  )
}
