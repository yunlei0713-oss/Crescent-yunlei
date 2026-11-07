import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, readdirSync, renameSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, sep } from 'node:path'
import { MOXUN_DATA_DIRECTORY, MOXUN_PROFILE_DIRECTORY } from './crescent-paths'

const LEGACY_DATA_DIRECTORY = '.crescent'

interface MigrationOptions {
  userHome: string
  appData: string
  migrateData: boolean
  migrateProfile: boolean
}

function statIfPresent(path: string): ReturnType<typeof lstatSync> | undefined {
  try {
    return lstatSync(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return undefined
  }
}

function shouldMove(source: string, target: string): boolean {
  const previous = statIfPresent(source)
  if (!previous) return false
  const current = statIfPresent(target)
  // An empty directory may be created by Electron before Main starts.
  // Never replace a directory containing user files or follow a symlink.
  if (current && (!current.isDirectory() || readdirSync(target).length)) return false
  if (!previous.isDirectory()) throw new Error('旧数据目录不是普通目录，无法自动搬迁。')
  return true
}

function assertLegacyDataClosed(paths: string[]): void {
  const files = paths.filter(existsSync)
  if (process.platform !== 'darwin' || files.length === 0) return
  const result = spawnSync('/usr/sbin/lsof', ['-w', '-t', '--', ...files], {
    encoding: 'utf8',
    timeout: 3000
  })
  if (result.error || (result.status !== 0 && result.status !== 1) || result.stderr?.trim()) {
    throw new Error('无法确认旧版已退出，请完全退出后重试。')
  }
  if (result.stdout?.trim()) throw new Error('旧版仍在使用数据，请完全退出后重试。')
}

/** Move each directory on the same volume before opening either new location. */
export function migrateMoxunDataDirectories({
  userHome,
  appData,
  migrateData,
  migrateProfile
}: MigrationOptions): void {
  if (!migrateData && !migrateProfile) return
  const previousData = join(userHome, LEGACY_DATA_DIRECTORY)
  const previousProfile = ['Crescent', 'crescent']
    .map((name) => join(appData, name))
    .find((path) => statIfPresent(path))
  const dataTarget = join(userHome, MOXUN_DATA_DIRECTORY)
  const profileTarget = join(appData, MOXUN_PROFILE_DIRECTORY)
  const moveData = migrateData && shouldMove(previousData, dataTarget)
  const moveProfile =
    migrateProfile && previousProfile !== undefined && shouldMove(previousProfile, profileTarget)
  if (!moveData && !moveProfile) return

  assertLegacyDataClosed([
    join(previousData, 'crescent.db'),
    ...(previousProfile
      ? [
          join(previousProfile, 'Local Storage', 'leveldb', 'LOCK'),
          join(previousProfile, 'Session Storage', 'LOCK')
        ]
      : [])
  ])
  if (moveData) renameSync(previousData, dataTarget)
  if (moveProfile && previousProfile) renameSync(previousProfile, profileTarget)
}

/** Translate references into the old tree only after that tree has moved. */
export function remapMovedDataPath(value: string, userHome = homedir()): string {
  const previous = join(userHome, LEGACY_DATA_DIRECTORY)
  const previousTilde = `~/${LEGACY_DATA_DIRECTORY}`
  if (
    value !== previous &&
    !value.startsWith(previous + sep) &&
    value !== previousTilde &&
    !value.startsWith(previousTilde + '/')
  )
    return value
  const current = join(userHome, MOXUN_DATA_DIRECTORY)
  if (existsSync(previous) || !existsSync(current)) return value
  return value.startsWith(previousTilde)
    ? `~/${MOXUN_DATA_DIRECTORY}` + value.slice(previousTilde.length)
    : current + value.slice(previous.length)
}
