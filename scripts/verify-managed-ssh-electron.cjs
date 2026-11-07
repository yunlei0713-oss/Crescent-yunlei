// Isolated macOS fixture against npm run build output.
const assert = require('node:assert/strict')
const { once } = require('node:events')
const { setTimeout: delay } = require('node:timers/promises')
const seconds = Number(process.env.MOXUN_SSH_FIXTURE_SECONDS ?? 6)
assert.ok(Number.isInteger(seconds) && seconds >= 6 && seconds <= 120)

if (process.versions.electron) {
  const { app } = require('electron')
  runElectronFixture()
    .then(() => app.quit())
    .catch((error) => {
      console.error(error)
      app.exit(1)
    })
} else {
  const { test } = require('node:test')
  const { spawn } = require('node:child_process')
  const { mkdtemp, realpath, rm } = require('node:fs/promises')
  const { join, resolve } = require('node:path')
  const { loopback, quote } = require('./verify-managed-ssh.cjs')

  test(
    'Electron Pi requests, waits for, and queries one reviewed command in the visible SSH PTY',
    { timeout: seconds * 1000 + 45000 },
    async () => {
      const directory = await realpath(await mkdtemp('/private/tmp/mx10es.'))
      let server
      try {
        server = await loopback(directory, 'bash')
        await server.ready
        const env = Object.fromEntries(
          Object.entries(process.env).filter(
            ([key]) =>
              !/TOKEN|API_KEY|ELECTRON_RUN_AS_NODE|ELECTRON_RENDERER_URL|SSH_AUTH_SOCK/i.test(key)
          )
        )
        const child = spawn(require('electron'), [__filename], {
          env: {
            ...env,
            HOME: directory,
            ZDOTDIR: directory,
            MOXUN_DATA_DIR: join(directory, 'data'),
            MOXUN_USER_DATA_DIR: join(directory, 'profile'),
            MOXUN_ELECTRON_FIXTURE_MAIN: resolve(__dirname, '../out/main/index.js'),
            MOXUN_ELECTRON_FIXTURE_SSH: server.command,
            MOXUN_ELECTRON_FIXTURE_CWD: quote(directory),
            MOXUN_EXPERIMENTAL_SSH_COLLABORATION: '1',
            TERMINAL_AGENT_API_KEY: 'moxun-loopback-fixture'
          }
        })
        let output = ''
        child.stdout.on('data', (chunk) => {
          output += chunk
        })
        child.stderr.on('data', (chunk) => {
          output += chunk
        })
        const timer = setTimeout(() => child.kill('SIGTERM'), seconds * 1000 + 35000)
        try {
          const [code] = await once(child, 'close')
          assert.equal(code, 0, output)
          assert.match(output, /ELECTRON_SSH_OK/)
          process.stdout.write(output.match(/ELECTRON_SSH_OK .*\n/)?.[0] ?? '')
        } finally {
          clearTimeout(timer)
        }
      } finally {
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

async function runElectronFixture() {
  const { app, BrowserWindow, clipboard, dialog } = require('electron')
  const { createServer } = require('node:http')
  const approvals = []
  const results = []
  const calls = []
  let clip = ''
  BrowserWindow.prototype.isFocused = function () {
    return this.isVisible()
  }
  clipboard.writeText = (text) => {
    clip = text
  }
  clipboard.readText = () => clip
  dialog.showMessageBox = async (_parent, options) => {
    approvals.push(options)
    return { response: 1 }
  }
  const server = createServer(async (req, res) => {
    try {
      let raw = ''
      for await (const chunk of req) raw += chunk
      const body = JSON.parse(raw)
      if (!body.stream) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify({
            choices: [
              {
                message: { role: 'assistant', content: '{"title":"Fixture","summary":"Fixture"}' },
                finish_reason: 'stop'
              }
            ]
          })
        )
        return
      }
      const available = body.tools?.map(({ function: tool }) => tool.name) ?? []
      const last = body.messages.at(-1)
      let call
      if (last.role === 'user' && !calls.length)
        call = ['request_terminal_command', { command: 'sleep ' + seconds }]
      if (last.role === 'tool') {
        const result = JSON.parse(last.content)
        results.push(result)
        if (result.state === 'timed-out-running')
          call = ['wait_terminal_command', { commandId: result.commandId, waitMs: 30000 }]
        if (result.state === 'completed-success' && calls.at(-1) === 'wait_terminal_command')
          call = ['get_terminal_command_result', { commandId: result.commandId }]
      }
      const send = (delta, finish_reason) =>
        res.write(
          'data: ' +
            JSON.stringify({
              id: 'fixture',
              object: 'chat.completion.chunk',
              model: 'fixture',
              choices: [{ index: 0, delta, finish_reason }]
            }) +
            '\n\n'
        )
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      if (call) {
        const [name, args] = call
        assert.ok(available.includes(name), JSON.stringify(available))
        calls.push(name)
        send(
          {
            role: 'assistant',
            tool_calls: [
              {
                index: 0,
                id: 'call_' + calls.length,
                type: 'function',
                function: { name, arguments: JSON.stringify(args) }
              }
            ]
          },
          null
        )
        send({}, 'tool_calls')
      } else {
        send({ role: 'assistant', content: 'Fixture completed.' }, null)
        send({}, 'stop')
      }
      res.end('data: [DONE]\n\n')
    } catch (error) {
      console.error(error)
      res.destroy()
    }
  })
  const until = async (check, label) => {
    for (let index = 0; index < 400; index++) {
      const result = await check()
      if (result) return result
      await delay(25)
    }
    throw new Error('Timed out waiting for ' + label)
  }
  require(process.env.MOXUN_ELECTRON_FIXTURE_MAIN)
  await app.whenReady()
  try {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const chat = await until(
      () =>
        BrowserWindow.getAllWindows().find((win) =>
          win.webContents.getURL().endsWith('/index.html')
        ),
      'chat window'
    )
    const js = (win, code) => win.webContents.executeJavaScript(code)
    await until(
      () => js(chat, 'Boolean(window.api && document.querySelector(".app-sidebar"))'),
      'chat ready'
    )
    const config = {
      providers: [
        {
          id: 'fixture',
          name: 'Fixture',
          baseUrl: 'http://127.0.0.1:' + server.address().port + '/v1',
          models: [{ id: 'fixture', reasoning: false }]
        }
      ],
      providerId: 'fixture',
      model: 'fixture',
      mcpServers: [],
      loadGlobalAgentSkills: false,
      workspaceCwd: process.env.HOME
    }
    await js(chat, 'window.api.agent.saveConfig(' + JSON.stringify(config) + ')')
    await js(chat, 'window.api.terminal.openCollaboration("en","fixture-ssh-conversation")')
    const terminal = await until(
      () =>
        BrowserWindow.getAllWindows().find((win) =>
          win.webContents.getURL().includes('/terminal.html')
        ),
      'terminal'
    )
    const lease = JSON.stringify(await js(terminal, 'window.managedTerminal.attach()'))
    // An isolated Electron instance may be backgrounded by the desktop runner.
    terminal.webContents.setBackgroundThrottling(false)
    const status = () => js(terminal, 'document.querySelector("#status").textContent')
    const read = () => js(terminal, 'window.managedTerminal.read(' + lease + ',0)')
    const write = (value) =>
      js(
        terminal,
        'window.managedTerminal.write(' + lease + ',' + JSON.stringify(value + '\r') + ')'
      )
    await until(async () => (await status()).includes('Local collaboration'), 'local Bash')
    await write(process.env.MOXUN_ELECTRON_FIXTURE_SSH)
    await until(async () => (await read()).canProbeSsh, 'foreground SSH')
    await write(
      'cd ' + process.env.MOXUN_ELECTRON_FIXTURE_CWD + '; printf "FIXTURE_REMOTE_READY\\n"'
    )
    await until(
      async () => (await read()).data.includes('\r\nFIXTURE_REMOTE_READY\r\n'),
      'remote Bash'
    )
    const click = () => js(terminal, 'document.querySelector("#ssh-collaboration").click()')
    await click()
    await until(() => clip.includes('997;probe;'), 'probe copied without dispatch')
    assert.equal((await read()).sshProbe, 'waiting')
    await write(clip)
    await until(
      () =>
        js(
          terminal,
          'document.querySelector("#ssh-collaboration").textContent.includes("Confirm")'
        ),
      'probe result'
    )
    await click()
    await until(async () => (await status()).includes('SSH collaboration'), 'explicit SSH approval')
    const input = {
      tabId: 'fixture-ssh-conversation',
      executionTabId: 'fixture-ssh-conversation',
      runId: 'fixture-ssh-run',
      input: 'Run sleep ' + seconds + ' in the visible SSH PTY and wait for its exit.',
      providerId: 'fixture',
      model: 'fixture',
      locale: 'en'
    }
    const run = await js(chat, 'window.api.agent.run(' + JSON.stringify(input) + ')')
    assert.equal(run.ok, true, JSON.stringify(run))
    assert.equal(calls[0], 'request_terminal_command')
    assert.equal(calls.at(-1), 'get_terminal_command_result')
    assert.ok(calls.length >= 3)
    assert.ok(calls.slice(1, -1).every((name) => name === 'wait_terminal_command'))
    assert.ok(results.slice(0, -2).every(({ state }) => state === 'timed-out-running'))
    assert.ok(results.slice(-2).every(({ state }) => state === 'completed-success'))
    assert.equal(new Set(results.map(({ commandId }) => commandId)).size, 1)
    const final = results.at(-1)
    assert.equal(final.exitCode, 0)
    assert.equal(final.target.transport, 'ssh')
    assert.equal(final.target.cwd, process.env.HOME)
    assert.equal(approvals.length, 2)
    assert.match(
      approvals[1].detail,
      /SSH .+@.+\nDirectory .+\nSession .+\nShell generation \d+\nApproval ID .+\nSHA-256 [a-f0-9]{64}/
    )
    assert.ok((await read()).data.includes('/bin/sleep ' + seconds))
    assert.equal(BrowserWindow.getAllWindows().length, 2)
    console.log(
      'ELECTRON_SSH_OK ' +
        JSON.stringify({
          calls,
          states: results.map(({ state }) => state),
          approvalCount: approvals.length,
          durationMs: final.durationMs,
          exitCode: final.exitCode
        })
    )
  } finally {
    server.close()
  }
}
