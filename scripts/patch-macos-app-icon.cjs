// Run before launch/signing. Dock window badges resolve the native bundle icon,
// independently of the running application image set by app.dock.setIcon().
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { execFileSync } = require('node:child_process')

function patchMacosAppIcon(appPath, source, options = {}) {
  const resources = path.join(appPath, 'Contents/Resources')
  const plist = path.join(appPath, 'Contents/Info.plist')
  const bytes = fs.readFileSync(source)
  if (bytes.subarray(0, 4).toString() !== 'icns' || bytes.readUInt32BE(4) !== bytes.length)
    throw new Error('Expected a complete native ICNS icon')
  const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 16)
  const iconName = `moxun-${digest}.icns`
  let changed = false
  const readValue = (key) => {
    try {
      return execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plist], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim()
    } catch {
      return undefined
    }
  }
  const previous = readValue('CFBundleIconFile')
  const names = new Set([iconName, 'electron.icns', 'icon.icns'])
  // Older generated names may still be cached by IconServices. Keep aliases
  // consistent without touching document-type icons or other app resources.
  for (const name of fs.readdirSync(resources))
    if (/^moxun-[a-f0-9]{16}\.icns$/.test(name)) names.add(name)
  // Replace the builder's/default/previously referenced file too. Never leave
  // the old moon artwork behind a still-resolvable native icon alias.
  if (previous && path.basename(previous) === previous)
    names.add(previous.endsWith('.icns') ? previous : `${previous}.icns`)
  for (const name of names) {
    const file = path.join(resources, name)
    if (!fs.existsSync(file) || !fs.readFileSync(file).equals(bytes)) {
      fs.writeFileSync(file, bytes)
      changed = true
    }
  }
  // An asset-catalog name takes precedence over CFBundleIconFile on macOS.
  if (readValue('CFBundleIconName') !== undefined) {
    execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Delete :CFBundleIconName', plist], {
      stdio: 'pipe'
    })
    changed = true
  }
  const values = { ...options.bundleValues, CFBundleIconFile: iconName }
  for (const [key, value] of Object.entries(values)) {
    const current = readValue(key)
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
    fs.utimesSync(appPath, now, now)
  }
  // Refresh even if bytes are current: another installed app with the legacy
  // bundle ID can have replaced Launch Services' cached registration.
  if (options.refreshLaunchServices) {
    const lsregister =
      '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'
    if (fs.existsSync(lsregister)) {
      try {
        execFileSync(lsregister, ['-f', appPath], { stdio: 'pipe', timeout: 5000 })
      } catch {
        console.warn('[mac-icon] Launch Services refresh unavailable; bundle updated.')
      }
    }
  }
  return { iconName, changed }
}

module.exports = { patchMacosAppIcon }
