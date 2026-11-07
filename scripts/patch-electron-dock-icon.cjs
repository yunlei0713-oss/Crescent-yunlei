#!/usr/bin/env node
// Brand the native development bundle BEFORE launch, including minimized-window badges.
// A runtime app.dock.setIcon() cannot replace the native bundle's IconServices identity.
const path = require('node:path')
const { patchMacosAppIcon } = require('./patch-macos-app-icon.cjs')

function patchElectronDockIcon(root = path.resolve(__dirname, '..'), options = {}) {
  if (process.platform !== 'darwin') return
  const electronApp = path.join(root, 'node_modules/electron/dist/Electron.app')
  const result = patchMacosAppIcon(electronApp, path.join(root, 'build/icon.icns'), {
    refreshLaunchServices: options.refreshLaunchServices !== false,
    bundleValues: {
      CFBundleName: '墨巡',
      CFBundleDisplayName: '墨巡',
      // Development identity changes must never move existing user data.
      CFBundleIdentifier: 'com.moxun.dev'
    }
  })
  console.info(
    `[patch-electron-dock-icon] ${result.changed ? 'updated' : 'current'} 墨巡 (${result.iconName})`
  )
  return result
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
