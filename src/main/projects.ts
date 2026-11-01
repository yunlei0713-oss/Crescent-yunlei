import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { lstat, realpath } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { BrowserWindow, dialog, type WebContents } from 'electron'
import { getCrescentDir } from './crescent-paths'
import { rendererIpc } from './ipc-security'
import { grantLocalDocumentPath, withDocumentOwner } from './local-document-ipc'
import { LocalDocumentReader, sensitiveDocumentPath } from './local-document-reader'
import type { LocalProject } from '../shared/projects'

/** Only native directory selection creates a persistent project grant. */
export class ProjectRegistry {
  constructor(private readonly file = join(getCrescentDir(), 'projects.json')) {}

  list(): LocalProject[] {
    if (!existsSync(this.file)) return []
    const data: unknown = JSON.parse(readFileSync(this.file, 'utf8'))
    if (!Array.isArray(data) || data.length > 64) throw new Error('Invalid project registry')
    return data.map((value) => {
      if (
        !value ||
        typeof value.id !== 'string' ||
        typeof value.name !== 'string' ||
        typeof value.root !== 'string' ||
        value.root.length > 4096
      )
        throw new Error('Invalid project record')
      return { id: value.id, name: value.name, root: value.root }
    })
  }

  async validate(root: string): Promise<string> {
    if (sensitiveDocumentPath(root) || !(await lstat(root)).isDirectory())
      throw new Error('Project must be an accessible local directory, not a symlink')
    const canonical = await realpath(root)
    if (canonical !== root)
      throw new Error('Project directory moved or became a symlink; open it again')
    await new LocalDocumentReader([canonical]).authorize(canonical)
    return canonical
  }

  async addSelected(root: string, assertCurrent: () => void = () => {}): Promise<LocalProject> {
    await this.validate(root)
    assertCurrent()
    const projects = this.list()
    const existing = projects.find((project) => project.root === root)
    if (existing) return existing
    if (projects.length >= 64) throw new Error('Maximum 64 projects')
    const project = { id: randomUUID(), name: basename(root), root }
    const temporary = `${this.file}.${randomUUID()}.tmp`
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 })
    writeFileSync(temporary, JSON.stringify([...projects, project]), { mode: 0o600 })
    renameSync(temporary, this.file)
    return project
  }

  async resolve(id: unknown): Promise<LocalProject> {
    if (typeof id !== 'string' || id.length > 100) throw new Error('Invalid project ID')
    const project = this.list().find((entry) => entry.id === id)
    if (!project) throw new Error('Project is unavailable; open its directory from the sidebar')
    await this.validate(project.root)
    return project
  }
}

const registry = new ProjectRegistry()

export async function resolveProjectForOwner(
  owner: WebContents,
  id: unknown
): Promise<LocalProject> {
  return withDocumentOwner(owner, async (assertCurrent) => {
    const project = await registry.resolve(id)
    assertCurrent()
    await grantLocalDocumentPath(owner, project.root)
    return project
  })
}

export function registerProjectIpc(): void {
  rendererIpc.handle('projects:list', () => registry.list())
  rendererIpc.handle('projects:activate', (event, id: unknown) =>
    resolveProjectForOwner(event.sender, id)
  )
  rendererIpc.handle('projects:open', async (event) => {
    const owner = event.sender
    const window = BrowserWindow.fromWebContents(owner)
    if (!window) throw new Error('Project window is unavailable')
    return withDocumentOwner(owner, async (assertCurrent) => {
      const result = await dialog.showOpenDialog(window, {
        title: '打开本地项目 / Open local project',
        message: 'Agent 可读取此项目；修改文件仍需逐次审批。 / File changes require review.',
        properties: ['openDirectory']
      })
      if (result.canceled || !result.filePaths[0]) return undefined
      assertCurrent()
      const selected = result.filePaths[0]
      if ((await lstat(selected)).isSymbolicLink()) throw new Error('Project cannot be a symlink')
      const root = await realpath(selected)
      assertCurrent()
      await grantLocalDocumentPath(owner, root)
      return registry.addSelected(root, assertCurrent)
    })
  })
}
