/* CI policy checks; unit tests remain local-only per AGENTS.md. */
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const root = path.resolve(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(file) : [file]
  })
let checks = 0
const check = (condition, message) => {
  assert.ok(condition, message)
  checks++
}
const preload = walk(path.join(root, 'src/preload'))
  .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n')
check(
  !preload.includes("from '@electron-toolkit/preload'"),
  'Preload must not expose unrestricted toolkit IPC'
)
check(!/exposeInMainWorld\([^\n]*ipcRenderer/.test(preload), 'Raw IPC must not be exposed')
for (const file of walk(path.join(root, 'src/main')).filter(
  (file) => file.endsWith('.ts') && !file.endsWith('.test.ts')
)) {
  if (file.endsWith('/ipc-security.ts')) continue
  check(
    !/\bipcMain\.(handle|on)\(/.test(fs.readFileSync(file, 'utf8')),
    `Unvalidated IPC registration: ${file}`
  )
}
check(
  read('src/main/index.ts').includes('initializePrivateFiles()'),
  'Private file initialization is required'
)
check(read('src/main/index.ts').includes('sandbox: true'), 'Renderer sandbox must stay enabled')
check(
  read('src/main/agent/pi-mcp-tools.ts').includes('!authorize'),
  'MCP tools must fail closed without host authorization'
)
check(
  read('src/main/agent/command-approval.ts').includes(
    'pendingCommandApprovals.get(requestId)?.webContents.id !== ownerId'
  ),
  'Command approval must validate its owner'
)
check(
  read('src/main/logging.ts').includes('redactSensitiveText(message)'),
  'Log sink must redact secrets'
)
check(
  !read('src/main/agent/pi-host.ts').includes('createPtyBashToolDefinition'),
  'Main agent must not register bash'
)
check(
  !read('src/main/agent/pi-subagent.ts').includes('createPtyBashToolDefinition'),
  'Children must not register bash'
)
check(
  read('src/main/agent/runtime/pi/runtime.ts').includes('assertAgentTools(options.tools)'),
  'Every runtime must assert host capabilities'
)
check(
  read('src/main/terminal/session/pty-session.ts').includes('assertOperatorTerminalAccess()'),
  'Native PTY must enforce trusted Main origin'
)
check(
  read('src/main/agent/pi-mcp-tools.ts').includes('if (!isReviewedMcpServer(server))'),
  'Unreviewed MCP must not connect or execute'
)
check(
  !read('electron-builder.yml').includes('NSCameraUsageDescription'),
  'Camera permission must not be requested'
)
for (const file of walk(path.join(root, 'src/renderer/src')).filter(
  (file) => /\.[jt]sx?$/.test(file) && !file.endsWith('.test.ts')
)) {
  check(
    !/from ['"](?:node:|electron['"]|fs['"]|child_process['"])/.test(fs.readFileSync(file, 'utf8')),
    `Privileged renderer import: ${file}`
  )
}
check(
  read('src/main/terminal/observer/registry.ts').includes(
    'if (!observationGrants.active(key, identity))'
  ),
  'Observation must be Main-grant gated'
)
check(
  !read('src/main/terminal/external/iterm.ts').includes('session.write('),
  'iTerm automation must not expose input'
)
check(
  read('src/main/terminal/external/observed-session.ts').includes('bindings are read-only'),
  'Existing iTerm bindings must be read-only'
)
check(
  read('src/main/terminal/ipc.ts').includes('dialog.showMessageBox('),
  'Observation authorization must retain Main-owned native consent'
)
check(
  !/isStaticallyReadonly|INTERACTIVE\s*=/.test(
    read('src/main/terminal/observer/terminal-observer.ts')
  ),
  'Terminal analysis must not restrict command vocabulary or infer secret entry from command names'
)
check(
  read('src/main/agent/guided-ops.ts').includes('entry.identityKey') &&
    read('src/main/agent/guided-ops.ts').includes('entry.observationAtStart'),
  'Analysis identity and starting observation must have immutable Main baselines'
)
check(
  read('src/main/agent/guided-ops.ts').includes(
    'suggestionSafety(suggestion.command, suggestion.risk)'
  ) &&
    !read('src/main/agent/guided-ops.ts').includes(
      'Proactive suggestions must be statically read-only'
    ),
  'Static execution policies label suggestion risk, never gate analysis or suggestion text'
)
check(
  read('src/main/agent/guided-ops.ts').includes('Do not include credentials in suggestions'),
  'Complex suggestions must still reject credentials'
)
check(
  read('src/main/agent/ipc.ts').includes(
    'guidedOps.currentRunId(event.sender.id, payload.chatId)'
  ) && !read('src/main/agent/ipc.ts').includes('cancelPiAgentRun(payload.runId, event.sender.id)'),
  'Guided actions must cancel only the Main-owned chat scope'
)
check(
  !/commands:(list|save|undo|preview|execute)/.test(preload),
  'Retired command directory IPC must not return'
)
check(
  !preload.includes('terminal:snapshot'),
  'Renderer must not receive obsolete terminal screen mirrors'
)
check(
  !preload.includes('agent:subagent-status'),
  'Children must not reintroduce docked terminal UI status'
)
check(
  read('src/main/agent/pi-subagent.ts').includes("tools: ['read']"),
  'Child analysis must keep an explicit read-only tool allowlist'
)
const dependencies = JSON.parse(read('package.json')).dependencies
check(
  !/continueWaiting|onInterruptCommand|Ctrl\+C/.test(
    read('src/renderer/src/components/timeline/ToolRows.tsx')
  ),
  'Historical tool rows must not restore terminal execution controls'
)
check(
  !Object.keys(dependencies).some((name) => name.startsWith('@xterm/') || name === 'xterm'),
  'Built-in terminal dependencies must stay retired'
)
console.log(`Security boundary policy: ${checks} checks passed.`)
console.log(
  'Unit tests are local-only. Run npm run test:local before committing; CI does not claim unit-test coverage.'
)
