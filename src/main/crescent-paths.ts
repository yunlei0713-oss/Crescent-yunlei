import { homedir } from 'os'
import { join, resolve } from 'path'

export const MOXUN_DATA_DIRECTORY = '.moxun'
export const MOXUN_PROFILE_DIRECTORY = 'MoXun'

export function getDataDirectoryOverride(): string | undefined {
  return process.env.MOXUN_DATA_DIR?.trim() || process.env.CRESCENT_DATA_DIR?.trim()
}

export function getCrescentDir(): string {
  const override = getDataDirectoryOverride()
  return override ? resolve(override) : join(homedir(), MOXUN_DATA_DIRECTORY)
}

export function getCrescentConfigPath(): string {
  return join(getCrescentDir(), 'config.json')
}

export function getCrescentMemoryPath(): string {
  return join(getCrescentDir(), 'memory.json')
}

export function getCrescentAttachmentsDir(): string {
  return join(getCrescentDir(), 'attachments')
}

export function getCrescentWikiDir(): string {
  return join(getCrescentDir(), 'wiki')
}

export function getCrescentLogsDir(): string {
  const override = process.env.MOXUN_LOG_DIR?.trim() || process.env.CRESCENT_LOG_DIR?.trim()
  if (override) return resolve(override)
  return join(getCrescentDir(), 'logs')
}

export const CRESCENT_USER_SKILLS_TILDE = '~/.moxun/skills'
export const GLOBAL_AGENT_SKILLS_TILDE = '~/.agents/skills'

export function getCrescentUserSkillsDir(): string {
  return join(getCrescentDir(), 'skills')
}

export function getGlobalAgentSkillsDir(): string {
  return join(homedir(), '.agents', 'skills')
}

export function getCrescentDatabasePath(): string {
  return join(getCrescentDir(), 'crescent.db')
}
