import { randomUUID } from 'node:crypto'
import { constants, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { access, lstat, realpath } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { BrowserWindow, dialog, type WebContents } from 'electron'
import { getCrescentDir } from './crescent-paths'
import { remapMovedDataPath } from './moxun-data-migration'
import { rendererIpc } from './ipc-security'
import { withDocumentOwner } from './local-document-ipc'
import { LocalDocumentReader, sensitiveDocumentPath } from './local-document-reader'
import { getDatabase, resolveConversationId } from './crescent-sqlite'
import { ensureConversation } from './sqlite/conversations'
import { readProjectAssociation, writeProjectAssociation } from './sqlite/project-association'
import { documentRootIdentity } from './document-cursor'
import { codeIntelligence } from './code-intelligence/service'
import type {
  LocalProject,
  ProjectAssociationAction,
  ProjectAssociationState
} from '../shared/projects'

type RegisteredProject = LocalProject & { rootIdentity?: string }

/** Only native directory selection creates a persistent project grant. */
export class ProjectRegistry {
  constructor(private readonly file = join(getCrescentDir(), 'projects.json')) {}

  list(): RegisteredProject[] {
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
      return {
        id: value.id,
        name: value.name,
        root: remapMovedDataPath(value.root),
        rootIdentity: typeof value.rootIdentity === 'string' ? value.rootIdentity : undefined
      }
    })
  }

  async validate(root: string): Promise<string> {
    if (sensitiveDocumentPath(root) || !(await lstat(root)).isDirectory())
      throw new Error('Project must be an accessible local directory, not a symlink')
    const canonical = await realpath(root)
    if (canonical !== root)
      throw new Error('Project directory moved or became a symlink; open it again')
    await access(canonical, constants.R_OK | constants.X_OK)
    await new LocalDocumentReader([canonical]).authorize(canonical)
    return canonical
  }

  private save(projects: RegisteredProject[]): void {
    const temporary = `${this.file}.${randomUUID()}.tmp`
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 })
    writeFileSync(temporary, JSON.stringify(projects), { mode: 0o600 })
    renameSync(temporary, this.file)
  }

  async rebind(
    id: string,
    root: string,
    expectedRoot: string,
    assertCurrent: () => void
  ): Promise<LocalProject> {
    await this.validate(root)
    const fingerprint = await documentRootIdentity(root)
    assertCurrent()
    const projects = this.list()
    const previous = projects.find((project) => project.id === id)
    if (!previous || previous.root !== expectedRoot) throw new Error('Project root changed')
    if (projects.some((project) => project.id !== id && project.root === root))
      throw new Error(
        'This directory already belongs to another project. Switch to that project instead.'
      )
    const project = { ...previous, root, name: basename(root), rootIdentity: fingerprint }
    this.save(projects.map((item) => (item.id === id ? project : item)))
    return project
  }

  async addSelected(root: string, assertCurrent: () => void = () => {}): Promise<LocalProject> {
    await this.validate(root)
    const fingerprint = await documentRootIdentity(root)
    assertCurrent()
    const projects = this.list()
    const existing = projects.find((project) => project.root === root)
    if (existing) {
      if (existing.rootIdentity && existing.rootIdentity !== fingerprint)
        throw new Error('Project directory changed. Rebind it from the linked conversation.')
      if (existing.rootIdentity) return existing
      const updated = { ...existing, rootIdentity: fingerprint }
      this.save(projects.map((item) => (item.id === existing.id ? updated : item)))
      return updated
    }
    if (projects.length >= 64) throw new Error('Maximum 64 projects')
    const project = { id: randomUUID(), name: basename(root), root, rootIdentity: fingerprint }
    this.save([...projects, project])
    return project
  }

  async resolve(id: unknown): Promise<LocalProject> {
    if (typeof id !== 'string' || id.length > 100) throw new Error('Invalid project ID')
    const project = this.list().find((entry) => entry.id === id)
    if (!project) throw new Error('Project is unavailable; open its directory from the sidebar')
    await this.validate(project.root)
    if (project.rootIdentity && (await documentRootIdentity(project.root)) !== project.rootIdentity)
      throw new Error('Project directory identity changed. Choose the directory again.')
    return project
  }
}

const registry = new ProjectRegistry()

const activations = new WeakMap<WebContents, Map<string, string>>()
const changing = new Set<string>()

async function activate(
  owner: WebContents,
  project: LocalProject,
  assertCurrent: () => void
): Promise<void> {
  const binding = await documentRootIdentity(project.root)
  if ('rootIdentity' in project && project.rootIdentity && project.rootIdentity !== binding)
    throw new Error('Project directory identity changed. Choose the directory again.')
  assertCurrent()
  let current = activations.get(owner)
  if (!current) {
    current = new Map()
    activations.set(owner, current)
    const clear = (): void => {
      owner.removeListener('did-start-navigation', clear)
      owner.removeListener('destroyed', clear)
      activations.delete(owner)
    }
    owner.once('did-start-navigation', clear)
    owner.once('destroyed', clear)
  }
  current.set(project.id, binding)
}

export function projectAssociationChanging(id: string): boolean {
  return changing.has(id)
}

export function assertProjectIdle(id: string): void {
  if (projectAssociationChanging(id)) throw new Error('Conversation project is being updated.')
}

export async function resolveProjectForOwner(
  owner: WebContents,
  id: unknown
): Promise<RegisteredProject> {
  return withDocumentOwner(owner, async (assertCurrent) => {
    const project = await registry.resolve(id)
    const previous = activations.get(owner)?.get(project.id)
    if (
      previous &&
      JSON.parse(previous)[0] === project.root &&
      previous !== (await documentRootIdentity(project.root))
    )
      throw new Error('Project directory identity changed. Revalidate it in the sidebar.')
    await activate(owner, project, assertCurrent)
    return { ...project, rootIdentity: activations.get(owner)?.get(project.id) }
  })
}

/** Renderer project browsing uses a separate directory scope, never Agent grants. */
export async function activatedProjectRoot(
  owner: WebContents,
  root: string
): Promise<string | undefined> {
  const project = registry
    .list()
    .find((item) => item.root === root && activations.get(owner)?.has(item.id))
  return project ? (await resolveProjectForOwner(owner, project.id)).root : undefined
}

async function association(owner: WebContents, id: string): Promise<ProjectAssociationState> {
  const { projectId } = readProjectAssociation(getDatabase(), id)
  const state: ProjectAssociationState = {
    conversationId: id,
    projectId,
    association: projectId ? 'linked' : 'unlinked',
    directory: 'not-activated',
    index: 'not-indexed'
  }
  if (!projectId) return state
  const project = registry.list().find((item) => item.id === projectId)
  if (!project) return { ...state, directory: 'missing' }
  state.project = project
  try {
    await registry.resolve(project.id)
    const current = activations.get(owner)?.get(projectId)
    if (current)
      state.directory =
        current === (await documentRootIdentity(project.root)) ? 'authorized' : 'stale'
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    state.directory =
      code === 'ENOENT' || code === 'ENOTDIR'
        ? 'missing'
        : code === 'EACCES' || code === 'EPERM'
          ? 'denied'
          : 'stale'
  }
  try {
    const status = codeIntelligence().status(project.root)
    state.index = status.indexing
      ? 'indexing'
      : status.failed
        ? 'failed'
        : !status.updatedAt
          ? 'not-indexed'
          : status.limited || status.skipped || status.errors || status.symbolOnly
            ? 'partial'
            : 'ready'
  } catch {
    state.index = 'failed'
  }
  return state
}

function scope(id: unknown): string {
  if (typeof id !== 'string' || !id.trim() || id.length > 150)
    throw new Error('Invalid conversation ID')
  return resolveConversationId(id)
}

async function chooseRoot(owner: WebContents): Promise<string | undefined> {
  const window = BrowserWindow.fromWebContents(owner)
  if (!window) throw new Error('Project window is unavailable')
  const result = await dialog.showOpenDialog(window, {
    title: '选择本地项目目录 / Select local project directory',
    properties: ['openDirectory']
  })
  const selected = result.canceled ? undefined : result.filePaths[0]
  if (!selected) return
  if ((await lstat(selected)).isSymbolicLink()) throw new Error('Project cannot be a symlink')
  return realpath(selected)
}

export function registerProjectIpc(
  isBusy: (id: string) => boolean = () => false,
  resetContext: (id: string) => Promise<void> = async () => {}
): void {
  rendererIpc.handle('projects:list', () => registry.list())
  rendererIpc.handle('projects:activate', (event, id: unknown) =>
    resolveProjectForOwner(event.sender, id)
  )
  rendererIpc.handle('projects:association', (event, id: unknown) =>
    association(event.sender, scope(id))
  )
  rendererIpc.handle('projects:open', (event) =>
    withDocumentOwner(event.sender, async (assertCurrent) => {
      const root = await chooseRoot(event.sender)
      if (!root) return
      const project = await registry.addSelected(root, assertCurrent)
      await activate(event.sender, project, assertCurrent)
      return project
    })
  )
  rendererIpc.handle('projects:associate', async (event, input: ProjectAssociationAction) => {
    const id = scope(input?.conversationId)
    const owner = event.sender
    if (isBusy(id) || changing.has(id))
      throw new Error('Wait for the current conversation turn to finish.')
    changing.add(id)
    try {
      return await withDocumentOwner(owner, async (assertCurrent) => {
        const db = getDatabase()
        const old = readProjectAssociation(db, id).projectId
        switch (input.action) {
          case 'revalidate': {
            await resolveProjectForOwner(owner, old)
            break
          }
          case 'rebind': {
            const project = registry.list().find((item) => item.id === old)
            if (!project || !old) throw new Error('No linked project')
            const root = await chooseRoot(owner)
            if (!root) break
            const affected = db
              .prepare('SELECT conversation_id AS id FROM conversations WHERE project_id=?')
              .all(old)
              .map((row) => String(row.id))
            if (affected.some(isBusy) || affected.some((key) => key !== id && changing.has(key)))
              throw new Error('Another conversation is using this project')
            for (const key of affected) changing.add(key)
            try {
              for (const key of affected) await resetContext(key)
              const updated = await registry.rebind(old, root, project.root, assertCurrent)
              for (const key of affected) writeProjectAssociation(db, key, old, old, true)
              await activate(owner, updated, assertCurrent)
            } finally {
              for (const key of affected) if (key !== id) changing.delete(key)
            }
            break
          }
          case 'attach':
          case 'switch':
          case 'detach': {
            if (input.action === 'attach' && old) throw new Error('Conversation is already linked')
            if (input.action === 'switch' && !old) throw new Error('Conversation project changed')
            const next =
              input.action === 'detach' ? undefined : await registry.resolve(input.projectId)
            if (old === next?.id) break
            if (input.action === 'switch') {
              const window = BrowserWindow.fromWebContents(owner)
              if (!window) throw new Error('Project window is unavailable')
              const choice = await dialog.showMessageBox(window, {
                type: 'question',
                message: `将此对话切换到 ${next?.name}？ / Switch this conversation to ${next?.name}?`,
                buttons: ['切换 / Switch', '取消 / Cancel'],
                cancelId: 1,
                defaultId: 1
              })
              if (choice.response !== 0) break
            }
            if (next) await activate(owner, next, assertCurrent)
            await resetContext(id)
            assertCurrent()
            ensureConversation(db, id)
            writeProjectAssociation(db, id, old, next?.id)
            break
          }
          default:
            throw new Error('Invalid project action')
        }
        return association(owner, id)
      })
    } finally {
      changing.delete(id)
    }
  })
}
