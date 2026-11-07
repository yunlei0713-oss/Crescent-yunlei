const assert = require('node:assert/strict')
const { test } = require('node:test')
const { buildSync } = require('esbuild')
const { join, resolve } = require('node:path')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { DatabaseSync } = require('node:sqlite')

const { outputFiles } = buildSync({
  stdin: {
    contents:
      'export * from "./command-executor"; export * from "./shell-adapter"; export * from "../../sqlite/managed-command-audit"',
    resolveDir: resolve(__dirname, '../src/main/terminal/managed')
  },
  write: false,
  bundle: true,
  platform: 'node',
  format: 'esm'
})
const moduleUrl =
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64')
const osc = (body) => '\x1b]' + body + '\x07'

async function shell() {
  const { ManagedCommandExecutor } = await import(moduleUrl)
  const writes = []
  const target = {
    terminalSessionId: 'terminal-fixture',
    sessionGeneration: 9,
    cwd: '/fixture',
    host: 'local-fixture'
  }
  const executor = new ManagedCommandExecutor(
    target,
    (line) => writes.push(line),
    () => {}
  )
  const nonce = executor.prompt.match(/ready;([0-9a-f]+)/)[1]
  const prompt = osc('133;A') + osc('997;ready;' + nonce)
  const accept = (frame) => {
    for (const part of frame) executor.acceptOutput(part)
  }
  accept(prompt)
  return { executor, target, writes, accept, prompt }
}

const envelope = (write) => write.match(/997;start;([^\\]+)/)[1]
const signals = () => new AbortController().signal

test('matches session/generation, command, nonce, exit status, and next prompt', async () => {
  const { executor, target, writes, accept, prompt } = await shell()
  let approve
  const result = executor.run(
    'false',
    (request) => {
      assert.equal(request.terminalSessionId, target.terminalSessionId)
      assert.equal(request.sessionGeneration, 9)
      assert.match(request.commandHash, /^[a-f0-9]{64}$/)
      assert.equal(request.command, 'false')
      return new Promise((resolve) => {
        approve = resolve
      })
    },
    () => true,
    signals()
  )
  assert.deepEqual(writes, [])
  await assert.rejects(
    executor.run(
      'pwd',
      async () => true,
      () => true,
      signals()
    ),
    /not ready/
  )
  approve(true)
  await Promise.resolve()
  const id = envelope(writes[0])
  accept(osc('997;end;' + id + ';0'))
  accept('997;start;' + id + '\r\n')
  accept(osc('997;start;' + id.replace(';9;', ';8;')))
  assert.equal(executor.executionState, 'dispatched')
  accept(osc('997;start;' + id))
  accept('safe output 中文😀\r\n')
  accept(osc('997;end;' + id + ';256'))
  assert.equal(executor.executionState, 'running')
  accept(osc('997;end;' + id + ';1'))
  assert.equal(executor.canRun, false)
  accept(prompt)
  const completed = await result
  assert.equal(completed.commandId, id.split(';')[2])
  assert.equal(completed.state, 'completed-failure')
  assert.equal(completed.exitCode, 1)
  assert.equal(completed.output, 'safe output 中文😀\n')
  assert.equal(completed.taskVerified, false)
  assert.deepEqual(completed.target, target)
  assert.ok(completed.startedAt <= completed.finishedAt)
  assert.ok(completed.durationMs >= 0)

  assert.equal(executor.canRun, true)
})

test('rejection, invalid grammar, visibility change, and expiry send no bytes', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'] })
  const { executor, writes } = await shell()
  await assert.rejects(
    executor.run(
      'pwd; echo x',
      async () => true,
      () => true,
      signals()
    ),
    /manual/
  )
  const denied = await executor.run(
    'pwd',
    async () => false,
    () => true,
    signals()
  )
  assert.equal(denied.state, 'rejected')
  let visible = true
  const stale = await executor.run(
    'pwd',
    async () => {
      visible = false
      return true
    },
    () => visible,
    signals()
  )
  assert.equal(stale.state, 'rejected')
  const expired = await executor.run(
    'pwd',
    async () => {
      t.mock.timers.tick(60_000)
      return true
    },
    () => true,
    signals()
  )
  assert.equal(expired.state, 'rejected')
  assert.deepEqual(writes, [])
})

test('start-marker timeout and user takeover keep ambiguous commands locked', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { executor, writes, accept, prompt } = await shell()
  const result = executor.run(
    'true',
    async () => true,
    () => true,
    signals()
  )
  await Promise.resolve()
  t.mock.timers.tick(3000)
  assert.equal((await result).state, 'unknown')
  const id = envelope(writes[0])
  accept(osc('997;start;' + id) + osc('997;end;' + id + ';0') + prompt)
  assert.equal(executor.executionState, 'unknown')
  await assert.rejects(
    executor.run(
      'true',
      async () => true,
      () => true,
      signals()
    ),
    /not ready/
  )
  assert.equal(writes.length, 1)

  const manual = await shell()
  const pending = manual.executor.run(
    'pwd',
    async (_target, signal) => {
      manual.executor.loseAuthority()
      assert.equal(signal.aborted, true)
      return true
    },
    () => true,
    signals()
  )
  assert.equal((await pending).state, 'rejected')
  assert.equal(manual.executor.executionState, 'manual-only')
  assert.deepEqual(manual.writes, [])
})

test('soft timeout leaves the running command locked and can accept a later result', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { executor, writes, accept, prompt } = await shell()
  const result = executor.run(
    'true',
    async () => true,
    () => true,
    signals()
  )
  await Promise.resolve()
  const id = envelope(writes[0])
  accept(osc('997;start;' + id))
  t.mock.timers.tick(5000)
  assert.equal((await result).state, 'timed-out-running')
  assert.equal(executor.canRun, false)
  accept(osc('997;end;' + id + ';0') + prompt)
  assert.equal(executor.executionState, 'completed-success')
  assert.equal(executor.canRun, true)
  assert.equal(writes.length, 1)
})

test('wait and query follow the original ID after soft timeout', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { executor, writes, accept, prompt } = await shell()
  const initial = executor.run(
    'true',
    async () => true,
    () => true,
    signals()
  )
  await Promise.resolve()
  const id = envelope(writes[0])
  const commandId = id.split(';')[2]
  assert.equal(executor.getResult(commandId).state, 'dispatched')
  accept(osc('997;start;' + id))
  assert.equal(executor.getResult(commandId).state, 'running')
  t.mock.timers.tick(5000)
  assert.equal((await initial).state, 'timed-out-running')
  assert.equal(executor.canRun, false)
  assert.throws(() => executor.getResult('different-command'), /Unknown/)
  for (let elapsed = 0; elapsed < 600_000; elapsed += 30_000) {
    const polling = executor.waitForResult(commandId, 30_000, signals())
    t.mock.timers.tick(30_000)
    assert.equal((await polling).state, 'timed-out-running')
    assert.equal(executor.canRun, false)
    assert.equal(writes.length, 1)
  }
  const waiting = executor.waitForResult(commandId, 30000, signals())
  accept(osc('997;end;' + id + ';0') + prompt)
  const final = await waiting
  assert.equal(final.commandId, commandId)
  assert.equal(final.exitCode, 0)
  assert.deepEqual(executor.getResult(commandId), final)
  assert.equal(writes.length, 1)
})

test('aborting a wait does not alter the original command or send bytes', async () => {
  const { executor, writes, accept, prompt } = await shell()
  const initial = executor.run(
    'false',
    async () => true,
    () => true,
    signals()
  )
  await Promise.resolve()
  const id = envelope(writes[0])
  const commandId = id.split(';')[2]
  accept(osc('997;start;' + id))
  const waiter = new AbortController()
  const waiting = executor.waitForResult(commandId, 30000, waiter.signal)
  waiter.abort()
  await assert.rejects(waiting, { name: 'AbortError' })
  assert.equal(executor.getResult(commandId).state, 'running')
  assert.equal(executor.canRun, false)
  accept(osc('997;end;' + id + ';1') + prompt)
  assert.equal((await initial).exitCode, 1)
  assert.equal(writes.length, 1)
})

test('cancel is idempotent and requires matching completion and prompt evidence', async () => {
  const { executor, writes, accept, prompt } = await shell()
  const initial = executor.run(
    'true',
    async () => true,
    () => true,
    signals()
  )
  await Promise.resolve()
  const id = envelope(writes[0])
  const commandId = id.split(';')[2]
  accept(osc('997;start;' + id))
  let interrupts = 0
  const interrupt = () => {
    interrupts++
  }
  const pending = executor.cancel(commandId, interrupt)
  assert.equal(pending.state, 'running')
  assert.equal(pending.cancelRequested, true)
  assert.deepEqual(executor.cancel(commandId, interrupt), pending)
  accept(osc('997;end;' + id + ';130'))
  assert.equal(executor.getResult(commandId).state, 'running')
  accept(prompt)
  assert.equal((await initial).state, 'interrupted')
  assert.equal(interrupts, 1)
  assert.equal(writes.length, 1)
})

test('an unavailable journal prevents dispatch', async () => {
  const { executor, writes } = await shell()
  const states = []
  const result = await executor.run(
    'pwd',
    async () => true,
    () => true,
    signals(),
    (row) => {
      states.push(row.state)
      if (row.state === 'dispatched') throw new Error('fixture audit failure')
    }
  )
  assert.deepEqual(states, ['approval-pending', 'approved', 'dispatched', 'rejected'])
  assert.equal(result.state, 'rejected')
  assert.equal(result.reason, 'audit-unavailable')
  assert.deepEqual(writes, [])
})

test('SSH probe requires an exact nonce, shell identity and a subsequent ready prompt', async () => {
  const { SshShellProbe } = await import(moduleUrl)
  const probe = new SshShellProbe()
  const nonce = probe.bootstrap.match(/probe;([0-9a-f]+)/)[1]
  const target = 'zsh;5.9;410;ops;loopback;/fixture'
  probe.acceptOutput('997;probe;' + nonce + ';' + target + '\r\n')
  probe.acceptOutput(osc('997;probe;wrong;' + target) + osc('133;A') + osc('997;ready;' + nonce))
  assert.equal(probe.target, undefined)
  probe.acceptOutput(osc('997;probe;' + nonce + ';' + target))
  assert.equal(probe.target, undefined)
  probe.acceptOutput(osc('133;A') + osc('997;ready;' + nonce))
  assert.deepEqual(probe.target, {
    shell: 'zsh',
    version: '5.9',
    user: 'ops',
    host: 'loopback',
    cwd: '/fixture',
    transport: 'ssh'
  })
  probe.invalidate()
  assert.equal(probe.target, undefined)

  const stale = new SshShellProbe()
  const staleNonce = stale.bootstrap.match(/probe;([0-9a-f]+)/)[1]
  stale.acceptOutput(osc('997;probe;' + staleNonce + ';' + target))
  stale.acceptInput()
  stale.acceptOutput(osc('133;A') + osc('997;ready;' + staleNonce))
  assert.equal(stale.target, undefined)
})

test('SQLite keeps command identity and reconciles an unfinished command after restart', async () => {
  const { migrateManagedCommandAudit, recordManagedCommand, readManagedCommandHistory } =
    await import(moduleUrl)
  const directory = mkdtempSync(join(tmpdir(), 'mx-command-audit-'))
  const path = join(directory, 'audit.sqlite')
  let db
  try {
    db = new DatabaseSync(path)
    migrateManagedCommandAudit(db)
    migrateManagedCommandAudit(db)
    const { executor, writes, accept } = await shell()
    const controller = new AbortController()
    const initial = executor.run(
      'pwd',
      async () => true,
      () => true,
      controller.signal,
      (result) => recordManagedCommand(db, 'chat-fixture', result)
    )
    await Promise.resolve()
    const id = envelope(writes[0])
    const commandId = id.split(';')[2]
    accept(osc('997;start;' + id))
    controller.abort()
    assert.equal((await initial).state, 'running')
    db.close()
    db = new DatabaseSync(path)
    migrateManagedCommandAudit(db)
    assert.throws(() => readManagedCommandHistory(db, 'other-chat', commandId), /Unknown/)
    const recovered = readManagedCommandHistory(db, 'chat-fixture', commandId)
    assert.equal(recovered.commandId, commandId)
    assert.equal(recovered.target.sessionGeneration, 9)
    assert.equal(recovered.state, 'unknown')
    assert.equal(recovered.reason, 'restart')
    assert.equal(recovered.output, undefined)
    assert.equal(recovered.exitCode, undefined)
    assert.deepEqual(readManagedCommandHistory(db, 'chat-fixture', commandId), recovered)
    const events = db
      .prepare('SELECT actor, result_json FROM managed_command_audit_v1 ORDER BY sequence')
      .all()
    assert.deepEqual(
      events.map((event) => event.actor),
      ['agent', 'user', 'system', 'system', 'system']
    )
    assert.deepEqual(
      events.map((event) => JSON.parse(event.result_json).state),
      ['approval-pending', 'approved', 'dispatched', 'running', 'unknown']
    )
    executor.loseAuthority()
  } finally {
    db?.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test('exit 127 requires correlated end and rejects a duplicate success frame', async () => {
  const { executor, writes, accept, prompt } = await shell()
  const pending = executor.run(
    'uname',
    async () => true,
    () => true,
    signals()
  )
  await Promise.resolve()
  const id = envelope(writes[0])
  accept(osc('997;start;' + id) + osc('997;end;' + id + ';127'))
  accept(osc('997;end;' + id + ';0') + prompt)
  assert.equal((await pending).exitCode, 127)
  assert.equal(executor.getResult(id.split(';')[2]).state, 'completed-failure')
})

test('never discloses a private key split across lines or output chunks', async () => {
  const { executor, writes, accept, prompt } = await shell()
  const pending = executor.run(
    'pwd',
    async () => true,
    () => true,
    signals()
  )
  await Promise.resolve()
  const id = envelope(writes[0])
  accept(osc('997;start;' + id))
  accept('-----BEGIN OPENSSH PRIVATE KEY-----\r\n')
  accept('a very large line of canary key material'.repeat(500) + '\r\n')
  accept('private-key-body-canary\r\n')
  accept('-----END OPENSSH PRIVATE KEY-----\r\n')
  accept('safe-following-output\r\n')
  accept(osc('997;end;' + id + ';0') + prompt)
  const result = await pending
  assert.match(result.output, /\[REDACTED\].*\n?safe-following-output/)
  assert.doesNotMatch(result.output, /canary|PRIVATE KEY/)
})
