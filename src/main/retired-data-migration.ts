import { lstatSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { getCrescentDir } from './crescent-paths'

/** Remove only retired command-directory files, never follow links or recurse. */
export function removeRetiredCommandDirectory(root = getCrescentDir()): void {
  if (!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink())
    throw new Error('Migration requires a real application data directory')
  for (const name of ['command-directory.json', 'command-directory.json.previous']) {
    try {
      const path = join(root, name)
      const stat = lstatSync(path)
      if (!stat.isFile() && !stat.isSymbolicLink())
        throw new Error('Retired data path is not a file')
      unlinkSync(path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        console.warn(`[migration] Could not remove ${name}`, error)
    }
  }
}
