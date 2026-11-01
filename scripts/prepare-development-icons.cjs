#!/usr/bin/env node
const { generateIcons } = require('./generate-icons.cjs')
const { patchElectronDockIcon } = require('./patch-electron-dock-icon.cjs')

// Both preview/start and dev must update the native bundle before Electron starts.
if (process.platform === 'darwin')
  generateIcons()
    .then(() => patchElectronDockIcon())
    .catch((error) => {
      console.error('[prepare-development-icons]', error)
      process.exitCode = 1
    })
