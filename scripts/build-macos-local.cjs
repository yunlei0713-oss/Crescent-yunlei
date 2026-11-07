const { spawnSync } = require('node:child_process')
const { resolve, relative, isAbsolute } = require('node:path')
const fs = require('node:fs')
const { homedir } = require('node:os')
const { createHash } = require('node:crypto')
const root = resolve(__dirname, '..')
const requested = process.argv[2] || 'x64'
const output = resolve(root, process.env.CRESCENT_LOCAL_BUILD_DIR || 'dist/local-macos')
const outputRelative = relative(resolve(root, 'dist'), output)
if (outputRelative.startsWith('..') || isAbsolute(outputRelative))
  throw new Error('Local artifacts must remain under dist/')
if (requested !== 'x64' || process.argv.length > 3)
  throw new Error('Only macOS Intel (x64) packaging is supported')
const env = {
  ...process.env,
  CSC_IDENTITY_AUTO_DISCOVERY: 'false',
  npm_config_cache: resolve(root, 'out/implementation/npm-cache')
}
// Prevent inherited signing secrets/configuration from changing the explicitly unsigned mode.
for (const key of [
  'CSC_LINK',
  'CSC_KEY_PASSWORD',
  'APPLE_ID',
  'APPLE_APP_SPECIFIC_PASSWORD',
  'APPLE_API_KEY',
  'APPLE_API_KEY_ID',
  'APPLE_API_ISSUER'
])
  delete env[key]
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
const electronOptions = []
if (env.CRESCENT_OFFLINE_BUILD === '1') {
  const version = require(resolve(root, 'node_modules/electron/package.json')).version
  const cache = env.ELECTRON_CACHE || resolve(homedir(), 'Library/Caches/electron')
  const files = fs.readdirSync(cache, { recursive: true }).map(String)
  const filename = `electron-v${version}-darwin-x64.zip`
  const expected = require(resolve(root, 'node_modules/electron/checksums.json'))[filename]
  const archive = files
    .filter((file) => file.endsWith(filename))
    .map((file) => resolve(cache, file))
    .find((file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex') === expected)
  if (!archive) throw new Error(`Offline Electron cache missing for ${version} darwin-x64`)
  // A cached ZIP alone does not prevent @electron/get from fetching SHASUMS.
  // Its checksum is verified above against the installed Electron manifest.
  electronOptions.push(`-c.electronDist=${archive}`)
  if (
    !fs.existsSync(
      resolve(
        env.ELECTRON_BUILDER_CACHE || resolve(homedir(), 'Library/Caches/electron-builder'),
        'dmg-builder@1.2.5'
      )
    )
  )
    throw new Error('Offline DMG tooling cache is missing')
}
run('npm', ['run', 'verify:local'])
run(process.execPath, [
  resolve(root, 'node_modules/electron-builder/cli.js'),
  '--mac',
  '--x64',
  '--publish',
  'never',
  '-c.mac.identity=null',
  '-c.mac.notarize=false',
  '-c.mac.hardenedRuntime=false',
  ...electronOptions,
  `-c.directories.output=${resolve(output, 'x64')}`
])
