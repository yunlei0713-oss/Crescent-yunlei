#!/usr/bin/env node
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { readFileSync, statSync } = require('node:fs')
const { join, resolve } = require('node:path')
const asar = require('@electron/asar')

const buildEntries = [
  'out/main/index.js',
  'out/main/code-index-worker.js',
  'out/preload/index.js',
  'out/preload/terminal.js',
  'out/renderer/index.html',
  'out/renderer/terminal.html'
]
const notices = [
  'resources/licenses/xterm/xterm.txt',
  'resources/licenses/xterm/addon-fit-and-unicode11.txt',
  'resources/licenses/xterm/addon-search.txt'
]

function checkMacApp(appPath, workspace) {
  const contents = join(appPath, 'Contents')
  const resources = join(contents, 'Resources')
  const archive = join(resources, 'app.asar')
  const native = join(resources, 'app.asar.unpacked/node_modules/node-pty/prebuilds/darwin-x64')
  const plist = join(contents, 'Info.plist')
  const executable = execFileSync(
    '/usr/libexec/PlistBuddy',
    ['-c', 'Print CFBundleExecutable', plist],
    { encoding: 'utf8' }
  ).trim()
  assert.ok(executable && !executable.includes('/'))
  for (const binary of [
    join(contents, 'MacOS', executable),
    join(native, 'pty.node'),
    join(native, 'spawn-helper')
  ]) {
    const description = execFileSync('/usr/bin/file', ['-b', binary], { encoding: 'utf8' })
    assert.match(description, /Mach-O 64-bit .* x86_64/, binary)
  }
  assert.ok(
    statSync(join(native, 'spawn-helper')).mode & 0o111,
    'node-pty spawn-helper must be executable'
  )

  const files = new Set(asar.listPackage(archive).map((file) => file.replace(/^[/\\]/, '')))
  for (const name of [...buildEntries, ...notices]) assert.ok(files.has(name), 'Missing ' + name)
  const chatHtml = asar.extractFile(archive, 'out/renderer/index.html').toString()
  const terminalHtml = asar.extractFile(archive, 'out/renderer/terminal.html').toString()
  const terminalAsset = /src="\.\/(assets\/terminal-[^"]+\.js)"/.exec(terminalHtml)?.[1]
  assert.ok(terminalAsset, 'Independent terminal entry must point to its compiled JS')
  assert.ok(files.has('out/renderer/' + terminalAsset), 'Missing compiled terminal JS')
  assert.ok(!chatHtml.includes(terminalAsset), 'Chat must not load the terminal renderer')
  if (workspace) {
    for (const name of [...buildEntries, ...notices, 'out/renderer/' + terminalAsset])
      assert.ok(
        asar.extractFile(archive, name).equals(readFileSync(join(workspace, name))),
        'Stale packaged file ' + name
      )
  }
}

if (require.main === module) {
  if (!process.argv[2] || process.argv.length > 4) {
    console.error('Usage: node scripts/smoke-macos-app.cjs /path/to/墨巡.app [workspace-root]')
    process.exitCode = 2
  } else {
    checkMacApp(resolve(process.argv[2]), process.argv[3] ? resolve(process.argv[3]) : undefined)
    console.log('macOS Intel bundle contents and native architecture verified.')
  }
}

module.exports = { checkMacApp }
