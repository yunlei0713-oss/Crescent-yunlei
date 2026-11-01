import { useRef } from 'react'
import {
  ArrowDownIcon,
  ArrowDownToLineIcon,
  ArrowUpIcon,
  ArrowUpToLineIcon,
  CopyIcon,
  CopyPlusIcon,
  InfoIcon,
  Loader2Icon,
  PencilIcon,
  ServerIcon,
  StarIcon,
  Trash2Icon,
  XIcon
} from 'lucide-react'

import { ConnectionList } from '@renderer/components/ConnectionList'
import { ConnectionOpsFeedbackPanel } from '@renderer/components/ConnectionOpsFeedbackPanel'
import { SkillManageStatus, type SkillManageMessage } from '@renderer/components/StatusIndicators'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@renderer/components/ui/field'
import { Input } from '@renderer/components/ui/input'
import { Textarea } from '@renderer/components/ui/textarea'
import { formatClusterHostPatternError } from '@renderer/hooks/useConnections'
import type { Dictionary } from '@renderer/i18n'
import { cn } from '@renderer/lib/utils'
import type { ConnectionConfig, ConnectionInput } from '../../../shared/agent-types'
import type { ClusterHostPatternValidation } from '../../../shared/connection-state'

type ConnectionFormChange = <K extends keyof ConnectionInput>(
  key: K,
  value: ConnectionInput[K]
) => void

type ConnectionReorderAction = 'up' | 'down' | 'top' | 'bottom'

export function ConnectionManagerModal({
  open,
  connections,
  filteredConnections,
  query,
  selectedConnectionId,
  connectionForm,
  connectionEditing,
  connectionFormOpen,
  connectionImportText,
  connectionSshOptionsText,
  connectionActionsText,
  connectionCommandPreview,
  connectionFormReady,
  clusterHostRegexValidation,
  connectionSaveMessage,
  connectionNameConflict,
  connectionActionBusy = false,
  t,
  formatConnectionTarget,
  onClose,
  onQueryChange,
  onSelectConnection,
  onConnect,
  onCopyConnection,
  onDuplicateConnection,
  onEditConnection,
  onDeleteConnection,
  onToggleFavorite,
  onReorderConnection,
  onImportTextChange,
  onImportConnection,
  onFormChange,
  onSshOptionsTextChange,
  onActionsTextChange,
  onResetForm,
  onStartEditing,
  onSave,
  onRenameNameConflict,
  onOverwriteNameConflict
}: {
  open: boolean
  connections: ConnectionConfig[]
  filteredConnections: ConnectionConfig[]
  query: string
  selectedConnectionId: string
  connectionForm: ConnectionInput
  connectionEditing: boolean
  connectionFormOpen: boolean
  connectionImportText: string
  connectionSshOptionsText: string
  connectionActionsText: string
  connectionCommandPreview: string
  connectionFormReady: boolean
  clusterHostRegexValidation: ClusterHostPatternValidation
  connectionSaveMessage: SkillManageMessage | null
  connectionNameConflict: { name: string } | null
  connectionActionBusy?: boolean
  t: Dictionary
  formatConnectionTarget: (connection: ConnectionConfig) => string
  onClose: () => void
  onQueryChange: (query: string) => void
  onSelectConnection: (connection: ConnectionConfig) => void
  onConnect: (connection: ConnectionConfig) => void
  onCopyConnection: (connection: ConnectionConfig) => void
  onDuplicateConnection: (connection: ConnectionConfig) => void
  onEditConnection: (connection: ConnectionConfig) => void
  onDeleteConnection: (id: string) => void
  onToggleFavorite: (id: string) => void
  onReorderConnection: (id: string, action: ConnectionReorderAction) => void
  onImportTextChange: (value: string) => void
  onImportConnection: () => void
  onFormChange: ConnectionFormChange
  onSshOptionsTextChange: (value: string) => void
  onActionsTextChange: (value: string) => void
  onResetForm: () => void
  onStartEditing: () => void
  onSave: (connectAfterSave: boolean) => void
  onRenameNameConflict: () => void
  onOverwriteNameConflict: () => void
}): React.JSX.Element | null {
  const returnFocus = useRef<HTMLElement | null>(null)

  const selectedConnection = connections.find(
    (connection) => connection.id === selectedConnectionId
  )
  const canEditConnection = !selectedConnection || selectedConnection.source === 'custom'
  const clusterHostRegexInvalid = !clusterHostRegexValidation.ok
  const clusterHostRegexMessage = clusterHostRegexInvalid
    ? formatClusterHostPatternError(clusterHostRegexValidation, t)
    : t.connections.clusterHostRegexDescription
  const canSaveConnection =
    connectionEditing && connectionFormReady && canEditConnection && !connectionActionBusy
  const viewableClass = !connectionEditing ? 'cursor-text select-text' : undefined

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="app-modal-panel max-h-[88vh] w-[calc(100%-2rem)] max-w-5xl gap-0 rounded-xl bg-background"
        onOpenAutoFocus={(event) => {
          returnFocus.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null
          const search = (event.currentTarget as HTMLElement).querySelector<HTMLInputElement>(
            'input'
          )
          if (search) {
            event.preventDefault()
            search.focus()
          }
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          // Connecting can open another dialog. Do not steal its focus.
          if (
            !document.querySelector('[data-slot="dialog-content"][data-state="open"]') &&
            returnFocus.current?.isConnected
          ) {
            returnFocus.current.focus()
          }
        }}
      >
        <div className="app-modal-header flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2.5">
          <div className="min-w-0">
            <DialogTitle className="text-sm font-semibold text-pretty">
              {t.connections.sshConnections}
            </DialogTitle>
            <DialogDescription>{t.connections.sshConnectionsDescription}</DialogDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t.common.close}
            title={t.common.close}
            onClick={onClose}
          >
            <XIcon aria-hidden="true" />
          </Button>
        </div>
        <div
          className={
            connectionFormOpen
              ? 'app-connection-grid grid min-h-0 flex-1 grid-cols-[minmax(280px,0.9fr)_minmax(400px,1.1fr)] overflow-hidden'
              : 'app-connection-grid grid min-h-0 flex-1 grid-cols-1 overflow-hidden'
          }
        >
          <ConnectionList
            className={`min-h-0 bg-muted/10 p-2.5 ${connectionFormOpen ? 'border-r' : ''}`}
            connections={connections}
            filteredConnections={filteredConnections}
            query={query}
            selectedConnectionId={selectedConnectionId}
            t={t}
            showCustomMetadata
            formatConnectionTarget={formatConnectionTarget}
            onQueryChange={onQueryChange}
            onSelectConnection={(connection) => {
              if (connectionActionBusy) return
              onConnect(connection)
              onClose()
            }}
            headerAction={
              <Button type="button" variant="outline" size="xs" onClick={onResetForm}>
                {t.common.new}
              </Button>
            }
            renderConnectionCorner={(connection) =>
              connection.source === 'local' ? null : (
                <div className="flex items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={
                      connection.favorite ? t.connections.unfavorite : t.connections.favorite
                    }
                    title={connection.favorite ? t.connections.unfavorite : t.connections.favorite}
                    onClick={(event) => {
                      event.stopPropagation()
                      onToggleFavorite(connection.id)
                    }}
                  >
                    <StarIcon
                      aria-hidden="true"
                      className={connection.favorite ? 'fill-current text-primary' : undefined}
                    />
                  </Button>
                  {connection.source === 'custom' ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon-xs"
                      aria-label={t.common.delete}
                      title={t.common.delete}
                      onClick={(event) => {
                        event.stopPropagation()
                        onDeleteConnection(connection.id)
                      }}
                    >
                      <Trash2Icon aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
              )
            }
            renderConnectionActions={(connection) => (
              <div className="flex flex-wrap items-center justify-end gap-1">
                {connection.source !== 'local' ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t.connections.moveToTop}
                      title={t.connections.moveToTop}
                      onClick={(event) => {
                        event.stopPropagation()
                        onReorderConnection(connection.id, 'top')
                      }}
                    >
                      <ArrowUpToLineIcon aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t.connections.moveUp}
                      title={t.connections.moveUp}
                      onClick={(event) => {
                        event.stopPropagation()
                        onReorderConnection(connection.id, 'up')
                      }}
                    >
                      <ArrowUpIcon aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t.connections.moveDown}
                      title={t.connections.moveDown}
                      onClick={(event) => {
                        event.stopPropagation()
                        onReorderConnection(connection.id, 'down')
                      }}
                    >
                      <ArrowDownIcon aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t.connections.moveToBottom}
                      title={t.connections.moveToBottom}
                      onClick={(event) => {
                        event.stopPropagation()
                        onReorderConnection(connection.id, 'bottom')
                      }}
                    >
                      <ArrowDownToLineIcon aria-hidden="true" />
                    </Button>
                  </>
                ) : null}
                {connection.source === 'custom' ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t.connections.copyAsJson}
                      title={t.connections.copyAsJson}
                      onClick={(event) => {
                        event.stopPropagation()
                        onCopyConnection(connection)
                      }}
                    >
                      <CopyIcon aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t.connections.duplicateAsNew}
                      title={t.connections.duplicateAsNew}
                      onClick={(event) => {
                        event.stopPropagation()
                        onDuplicateConnection(connection)
                      }}
                    >
                      <CopyPlusIcon aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t.common.edit}
                      title={t.common.edit}
                      onClick={(event) => {
                        event.stopPropagation()
                        onEditConnection(connection)
                      }}
                    >
                      <PencilIcon aria-hidden="true" />
                    </Button>
                  </>
                ) : connection.source === 'ssh-config' ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t.connections.viewDetails}
                    title={t.connections.viewDetails}
                    onClick={(event) => {
                      event.stopPropagation()
                      onSelectConnection(connection)
                    }}
                  >
                    <InfoIcon aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            )}
          />
          {connectionFormOpen ? (
            <div className="min-h-0 overflow-auto overscroll-contain p-3">
              <FieldGroup className="gap-2.5">
                <p className="app-section-label">{t.connections.copiedConnection}</p>
                <Field>
                  <Textarea
                    id="connection-import"
                    name="connection-import"
                    className="min-h-20 resize-y font-mono text-xs"
                    value={connectionImportText}
                    onChange={(event) => onImportTextChange(event.target.value)}
                    placeholder={t.connections.copiedConnectionPlaceholder}
                    aria-label={t.connections.copiedConnection}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={onImportConnection}
                      disabled={!connectionImportText.trim()}
                    >
                      {t.connections.importAsNew}
                    </Button>
                  </div>
                </Field>
                <Field>
                  <FieldLabel htmlFor="connection-name">
                    {t.connections.customConnectionName}
                  </FieldLabel>
                  <Input
                    id="connection-name"
                    name="connection-name"
                    className={cn('h-8', viewableClass)}
                    value={connectionForm.name}
                    onChange={(event) => onFormChange('name', event.target.value)}
                    placeholder={t.connections.namePlaceholder}
                    readOnly={!connectionEditing}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field>
                    <FieldLabel htmlFor="connection-host">{t.connections.host}</FieldLabel>
                    <Input
                      id="connection-host"
                      name="host"
                      className={cn('h-8 font-mono', viewableClass)}
                      value={connectionForm.host}
                      onChange={(event) => onFormChange('host', event.target.value)}
                      placeholder="10.0.0.8…"
                      readOnly={!connectionEditing}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="connection-port">{t.connections.port}</FieldLabel>
                    <Input
                      id="connection-port"
                      name="port"
                      type="number"
                      inputMode="numeric"
                      className={cn('h-8 font-mono tabular-nums', viewableClass)}
                      value={connectionForm.port ?? 22}
                      onChange={(event) => onFormChange('port', Number(event.target.value))}
                      placeholder="22"
                      readOnly={!connectionEditing}
                      autoComplete="off"
                    />
                  </Field>
                </div>
                <Field data-invalid={clusterHostRegexInvalid || undefined}>
                  <FieldLabel htmlFor="connection-cluster-host-regex">
                    {t.connections.clusterHostRegex}
                  </FieldLabel>
                  <Input
                    id="connection-cluster-host-regex"
                    name="cluster-host-regex"
                    className={cn('h-8 font-mono', viewableClass)}
                    value={connectionForm.clusterHostRegex ?? ''}
                    onChange={(event) => onFormChange('clusterHostRegex', event.target.value)}
                    placeholder={t.connections.clusterHostRegexPlaceholder}
                    readOnly={!connectionEditing}
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={clusterHostRegexInvalid || undefined}
                  />
                  <FieldDescription>{clusterHostRegexMessage}</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="connection-user">{t.connections.user}</FieldLabel>
                  <Input
                    id="connection-user"
                    name="username"
                    className={cn('h-8 font-mono', viewableClass)}
                    value={connectionForm.user ?? ''}
                    onChange={(event) => onFormChange('user', event.target.value)}
                    placeholder="root…"
                    readOnly={!connectionEditing}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="connection-password">{t.connections.password}</FieldLabel>
                  <Input
                    id="connection-password"
                    name="connection-password"
                    type="password"
                    className="h-8"
                    value={connectionForm.password ?? ''}
                    onChange={(event) => onFormChange('password', event.target.value)}
                    placeholder={t.connections.passwordPlaceholder}
                    readOnly={!connectionEditing}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="connection-root-password">
                    {t.connections.rootPassword}
                  </FieldLabel>
                  <Input
                    id="connection-root-password"
                    name="connection-root-password"
                    type="password"
                    className="h-8"
                    value={connectionForm.rootPassword ?? ''}
                    onChange={(event) => onFormChange('rootPassword', event.target.value)}
                    placeholder={t.connections.rootPasswordPlaceholder}
                    readOnly={!connectionEditing}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <FieldDescription>{t.connections.rootPasswordDescription}</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="connection-password-env">
                    {t.connections.passwordEnvVar}
                  </FieldLabel>
                  <Input
                    id="connection-password-env"
                    name="connection-password-env"
                    className={cn('h-8 font-mono', viewableClass)}
                    value={connectionForm.passwordEnvVar ?? ''}
                    onChange={(event) => onFormChange('passwordEnvVar', event.target.value)}
                    placeholder={t.connections.passwordEnvVarPlaceholder}
                    readOnly={!connectionEditing}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <FieldDescription>{t.connections.passwordEnvVarDescription}</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="connection-identity">
                    {t.connections.identityFile}
                  </FieldLabel>
                  <Input
                    id="connection-identity"
                    name="identity-file"
                    className={cn('h-8 font-mono', viewableClass)}
                    value={connectionForm.identityFile ?? ''}
                    onChange={(event) => onFormChange('identityFile', event.target.value)}
                    placeholder="~/.ssh/id_rsa…"
                    readOnly={!connectionEditing}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="connection-ssh-options">
                    {t.connections.sshOptions}
                  </FieldLabel>
                  <Textarea
                    id="connection-ssh-options"
                    name="ssh-options"
                    className={cn('min-h-28 resize-y font-mono text-xs', viewableClass)}
                    value={connectionSshOptionsText}
                    onChange={(event) => onSshOptionsTextChange(event.target.value)}
                    readOnly={!connectionEditing}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={
                      '-o HostKeyAlgorithms=+ssh-rsa\n-o PubkeyAcceptedAlgorithms=+ssh-rsa\n-t\n-o PreferredAuthentications=keyboard-interactive,password\n-o PubkeyAuthentication=no'
                    }
                  />
                  <FieldDescription>{t.connections.sshOptionsDescription}</FieldDescription>
                  {connectionCommandPreview && (
                    <pre className="app-code-panel-body overflow-x-auto rounded-md border border-[var(--app-markdown-border)]">
                      {connectionCommandPreview}
                    </pre>
                  )}
                </Field>
                <Field>
                  <FieldLabel htmlFor="connection-actions">{t.connections.loginActions}</FieldLabel>
                  <Textarea
                    id="connection-actions"
                    name="login-actions"
                    className={cn('min-h-32 resize-y font-mono text-xs', viewableClass)}
                    value={connectionActionsText}
                    onChange={(event) => onActionsTextChange(event.target.value)}
                    readOnly={!connectionEditing}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={'your_password\ncd /srv/app\nkubectl get pods'}
                  />
                  <FieldDescription>{t.connections.loginActionsDescription}</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="connection-description">
                    {t.connections.description}
                  </FieldLabel>
                  <Input
                    id="connection-description"
                    name="connection-description"
                    className={cn('h-8', viewableClass)}
                    value={connectionForm.description ?? ''}
                    onChange={(event) => onFormChange('description', event.target.value)}
                    placeholder={t.connections.descriptionPlaceholder}
                    readOnly={!connectionEditing}
                    autoComplete="off"
                  />
                  <FieldDescription>
                    {connectionEditing ? t.connections.storedIn : t.connections.readOnlyHint}
                  </FieldDescription>
                </Field>
              </FieldGroup>
              {selectedConnectionId ? (
                <ConnectionOpsFeedbackPanel
                  key={selectedConnectionId}
                  connectionId={selectedConnectionId}
                  t={t}
                />
              ) : null}
            </div>
          ) : null}
        </div>
        {connectionFormOpen ? (
          <div className="shrink-0 border-t px-4 py-2">
            <SkillManageStatus message={connectionSaveMessage} />
            {connectionNameConflict ? (
              <div className="mt-2 flex items-center justify-end gap-2">
                <Button type="button" variant="outline" size="xs" onClick={onRenameNameConflict}>
                  {t.connections.renameName}
                </Button>
                <Button type="button" size="xs" onClick={onOverwriteNameConflict}>
                  {t.connections.overwriteExisting}
                </Button>
              </div>
            ) : null}
            <div className="mt-2 flex items-center justify-between gap-3">
              <Button type="button" variant="outline" onClick={onResetForm}>
                {t.common.new}
              </Button>
              <div className="flex items-center gap-2">
                {!connectionEditing && connectionForm.id && canEditConnection && (
                  <Button type="button" variant="outline" onClick={onStartEditing}>
                    {t.common.edit}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onSave(false)}
                  disabled={!canSaveConnection}
                >
                  {connectionActionBusy ? (
                    <Loader2Icon className="animate-spin" data-icon="inline-start" />
                  ) : null}
                  {t.common.save}
                </Button>
                <Button type="button" onClick={() => onSave(true)} disabled={!canSaveConnection}>
                  {connectionActionBusy ? (
                    <Loader2Icon className="animate-spin" data-icon="inline-start" />
                  ) : (
                    <ServerIcon data-icon="inline-start" />
                  )}
                  {connectionActionBusy ? t.common.connecting : t.common.saveAndConnect}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
