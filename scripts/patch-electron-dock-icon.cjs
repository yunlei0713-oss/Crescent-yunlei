#!/usr/bin/env node
// Brand the native development bundle BEFORE launch, including minimized-window badges.
// A runtime app.dock.setIcon() cannot replace the native bundle's IconServices identity.
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { execFileSync } = require('node:child_process')

function patchElectronDockIcon(root = path.resolve(__dirname, '..'), options = {}) {
  if (process.platform !== 'darwin') return
  const electronApp = path.join(root, 'node_modules/electron/dist/Electron.app')
  const resources = path.join(electronApp, 'Contents/Resources')
  const plist = path.join(electronApp, 'Contents/Info.plist')
  const bytes = fs.readFileSync(path.join(root, 'build/icon.icns'))
  const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 16)
  const iconName = `moxun-${digest}.icns`
  let changed = false

  // Replace the old default as well: no Crescent artwork remains in the active bundle.
  for (const name of [iconName, 'electron.icns']) {
    const file = path.join(resources, name)
    if (!fs.existsSync(file) || !fs.readFileSync(file).equals(bytes)) {
      fs.writeFileSync(file, bytes)
      changed = true
    }
  }
  const values = {
    CFBundleName: '墨巡',
    CFBundleDisplayName: '墨巡',
    // Separate development from old installed Crescent apps without moving user data.
    CFBundleIdentifier: 'com.crescent.moxun.dev',
    CFBundleIconFile: iconName
  }
  for (const [key, value] of Object.entries(values)) {
    let current
    try {
      current = execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plist], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim()
    } catch {
      /* Missing optional plist key. */
    }
    if (current === value) continue
    execFileSync(
      '/usr/libexec/PlistBuddy',
      ['-c', current === undefined ? `Add :${key} string ${value}` : `Set :${key} ${value}`, plist],
      { stdio: 'pipe' }
    )
    changed = true
  }

  if (changed) {
    const now = new Date()
    fs.utimesSync(electronApp, now, now)
    const lsregister =
      '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'
    if (options.refreshLaunchServices !== false && fs.existsSync(lsregister)) {
      try {
        execFileSync(lsregister, ['-f', electronApp], { stdio: 'pipe', timeout: 5000 })
      } catch {
        console.warn(
          '[patch-electron-dock-icon] Launch Services refresh unavailable; bundle updated.'
        )
      }
    }
  }
  console.info(`[patch-electron-dock-icon] ${changed ? 'updated' : 'current'} 墨巡 (${iconName})`)
  return { iconName, changed }
}

module.exports = { patchElectronDockIcon }
if (require.main === module) {
  try {
    patchElectronDockIcon()
  } catch (error) {
    console.error('[patch-electron-dock-icon] Cannot prepare native icon:', error)
    process.exitCode = 1
  }
}
