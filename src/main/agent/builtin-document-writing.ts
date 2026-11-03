import { app } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SKILL_CONTENT_MAX_CHARS, type SkillPromptPart } from '../../shared/agent-run-prompt'
import { writeSystemLog } from '../logging'

/** Electron's fs resolves unpacked resources through app.asar in packaged apps. */
export async function withDocumentWritingSkill(
  skills: SkillPromptPart[] = [],
  enabled: boolean
): Promise<SkillPromptPart[]> {
  if (!enabled) return skills
  const path = join(app.getAppPath(), 'resources', 'skills', 'document-writing', 'SKILL.md')
  if (skills.some((skill) => skill.name === 'document-writing' || skill.path === path))
    return skills
  try {
    const content = (await readFile(path, 'utf8')).trim()
    if (!content || content.length > SKILL_CONTENT_MAX_CHARS) {
      throw new Error(`Expected 1-${SKILL_CONTENT_MAX_CHARS} characters, got ${content.length}`)
    }
    return [...skills, { name: 'document-writing', path, content }]
  } catch (error) {
    writeSystemLog('warn', `Built-in document-writing skill unavailable: ${path}: ${String(error)}`)
    return skills
  }
}
