import { app } from 'electron'
import { execFile } from 'node:child_process'
import { dirname, resolve } from 'node:path'

// Register only our running bundle so native window badges resolve this
// installation's ICNS. The independent MoXun bundle ID isolates older products.
// Never replace NSApplication's icon with a raw PNG: that bypasses macOS masking.
export async function refreshMacApplicationRegistration(): Promise<void> {
  if (process.platform !== 'darwin' || !app.isPackaged) return
  const bundle = resolve(dirname(process.execPath), '../..')
  if (!bundle.endsWith('.app')) return
  await new Promise<void>((done) => {
    execFile(
      '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister',
      ['-f', bundle],
      { timeout: 5000 },
      (error) => {
        if (error) console.warn('[mac-icon] Could not refresh this application registration.')
        done()
      }
    )
  })
}
