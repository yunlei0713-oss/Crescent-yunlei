const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const { homedir } = require('node:os')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const { Arch } = require('builder-util')
const { patchMacosAppIcon } = require('./patch-macos-app-icon.cjs')

const run = promisify(execFile)

async function prepareEsbuildPackage(projectDir, version, arch) {
  const lock = JSON.parse(await fs.readFile(path.join(projectDir, 'package-lock.json'), 'utf8'))
  const entry = Object.entries(lock.packages).find(
    ([name, metadata]) => name.endsWith(`/@esbuild/darwin-${arch}`) && metadata.version === version
  )
  if (!entry) throw new Error(`No locked esbuild ${version} darwin-${arch} prebuild`)
  const metadata = entry[1]
  if (!metadata.resolved.startsWith('https://registry.npmjs.org/@esbuild/')) {
    throw new Error('Expected an official npm esbuild tarball')
  }
  const cache = path.join(
    projectDir,
    'node_modules',
    '.cache',
    'crescent-native',
    `esbuild-${version}-${arch}`
  )
  await fs.mkdir(cache, { recursive: true })
  const archive = path.join(cache, 'package.tgz')
  const [algorithm, expected] = metadata.integrity.split('-')
  try {
    await fs.access(archive)
  } catch {
    const digest = Buffer.from(expected, 'base64').toString('hex')
    const npmCache =
      process.env.npm_config_cache || process.env.NPM_CONFIG_CACHE || path.join(homedir(), '.npm')
    const cachedArchive = path.join(
      npmCache,
      '_cacache',
      'content-v2',
      algorithm,
      digest.slice(0, 2),
      digest.slice(2, 4),
      digest.slice(4)
    )
    let restored = false
    try {
      await fs.copyFile(cachedArchive, archive)
      restored = true
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    if (!restored && process.env.CRESCENT_OFFLINE_BUILD === '1')
      throw new Error(
        `Offline cache missing: esbuild ${version} darwin-${arch}; prepare the locked tarball before disconnecting.`
      )
    if (!restored)
      await run('curl', [
        '--fail',
        '--silent',
        '--show-error',
        '--location',
        '--retry',
        '2',
        '--connect-timeout',
        '15',
        '--max-time',
        '120',
        '--output',
        archive,
        metadata.resolved
      ])
  }
  const actual = crypto
    .createHash(algorithm)
    .update(await fs.readFile(archive))
    .digest('base64')
  if (actual !== expected)
    throw new Error(`Integrity mismatch for esbuild ${version} darwin-${arch}`)
  await run('tar', ['-xzf', archive, '-C', cache])
  const source = path.join(cache, 'package')
  const pkg = JSON.parse(await fs.readFile(path.join(source, 'package.json'), 'utf8'))
  if (pkg.version !== version || pkg.name !== `@esbuild/darwin-${arch}`) {
    throw new Error('Unexpected esbuild prebuild package')
  }
  return source
}

module.exports = async function prepareMacosNative(context) {
  if (context.electronPlatformName !== 'darwin') return
  const arch = Arch[context.arch]
  if (arch !== 'x64') throw new Error('Only macOS Intel (x64) packaging is supported')
  // afterPack runs before signing and before DMG/ZIP read the bundle. Preserve
  // the release appId/data identity, but invalidate the legacy icon filename.
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  const icon = patchMacosAppIcon(appPath, path.join(context.packager.projectDir, 'build/icon.icns'))
  console.log(`[mac-icon] packaged native icon: ${icon.iconName}`)
  const modules = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    'Contents',
    'Resources',
    'app.asar.unpacked',
    'node_modules'
  )
  const esbuild = path.join(modules, 'esbuild')
  const version = JSON.parse(await fs.readFile(path.join(esbuild, 'package.json'), 'utf8')).version
  const binary = path.join(esbuild, 'bin', 'esbuild')
  // Pi loads from app.asar.unpacked. Select the target prebuild rather than the
  // packaging host's binary, including when an Apple Silicon runner builds x64.
  const source = await prepareEsbuildPackage(context.packager.projectDir, version, arch)
  await fs.cp(source, path.join(modules, '@esbuild', `darwin-${arch}`), { recursive: true })
  await fs.copyFile(path.join(modules, '@esbuild', `darwin-${arch}`, 'bin', 'esbuild'), binary)
  await fs.chmod(binary, 0o755)
  const result = await run('lipo', ['-archs', binary])
  if (result.stdout.trim() !== 'x86_64')
    throw new Error('Expected an Intel-only esbuild executable')
  console.log(`[mac-native] esbuild ${version}: Intel x64 executable and Darwin prebuild ready`)
}
