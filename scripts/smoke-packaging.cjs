#!/usr/bin/env node
/**
 * Checks the macOS Intel release artifact layout.
 * Usage: node scripts/smoke-packaging.cjs [artifactDir]
 */
const fs = require('node:fs')
const path = require('node:path')

const MAC_DMG = /^moxun-(.+)-x64\.dmg$/
const MAC_ZIP = /^moxun-(.+)-x64-mac\.zip$/
const PACKAGE_EXTENSION = /\.(dmg|zip|pkg|exe|msi|AppImage|deb|snap|rpm)$/i
const METADATA_EXTENSION = /\.(yml|blockmap)$/i

/**
 * @param {string[]} files
 * @param {Record<string, number>} [sizesByName]
 */
function evaluatePackagingArtifacts(files, sizesByName = {}) {
  const errors = []
  const dmgs = files.map((name) => MAC_DMG.exec(name)).filter(Boolean)
  const zips = files.map((name) => MAC_ZIP.exec(name)).filter(Boolean)
  if (dmgs.length !== 1 || zips.length !== 1 || dmgs[0][1] !== zips[0][1])
    errors.push('Expected one moxun-<version>-x64.dmg and one matching moxun-<version>-x64-mac.zip')
  if (!files.includes('latest-mac.yml')) errors.push('Expected latest-mac.yml updater metadata')

  for (const name of files) {
    const isPackage = PACKAGE_EXTENSION.test(name)
    if (isPackage && !MAC_DMG.test(name) && !MAC_ZIP.test(name))
      errors.push(`Unexpected package for the macOS Intel release: ${name}`)
    if (!isPackage && !METADATA_EXTENSION.test(name)) continue
    const size = sizesByName[name]
    if (typeof size === 'number' && size < 64)
      errors.push(`Artifact too small (${size} bytes): ${name}`)
  }

  return { ok: errors.length === 0, errors }
}

function runSmokePackaging(artifactDir) {
  const files = fs.existsSync(artifactDir)
    ? fs
        .readdirSync(artifactDir)
        .filter((name) => fs.statSync(path.join(artifactDir, name)).isFile())
    : []
  if (!files.length) return { ok: false, errors: [`No files found in ${artifactDir}`], files }

  const sizesByName = Object.fromEntries(
    files.map((name) => [name, fs.statSync(path.join(artifactDir, name)).size])
  )
  return { ...evaluatePackagingArtifacts(files, sizesByName), files }
}

function main() {
  const artifactDir = path.resolve(process.argv[2] || 'dist')
  const result = runSmokePackaging(artifactDir)

  if (result.files.length) {
    console.log(`[smoke:packaging] Checking ${result.files.length} file(s) in ${artifactDir}`)
    for (const name of result.files) console.log(`  - ${name}`)
  }

  if (!result.ok) {
    console.error('[smoke:packaging] FAILED')
    for (const error of result.errors) console.error(`  • ${error}`)
    process.exit(1)
  }

  console.log('[smoke:packaging] OK (macOS Intel)')
}

module.exports = { evaluatePackagingArtifacts, runSmokePackaging }

if (require.main === module) main()
