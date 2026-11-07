import { type FormEvent, type KeyboardEvent, useRef } from 'react'
import { ArchiveIcon, TriangleAlertIcon } from 'lucide-react'

import { ImeSafeInput } from '@renderer/components/ImeSafeFields'
import { Button } from '@renderer/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '@renderer/components/ui/field'
import { Input } from '@renderer/components/ui/input'
import { useAppModalA11y } from '@renderer/hooks/useAppModalA11y'
import type { Dictionary } from '@renderer/i18n'

export interface CloseTabsConfirmRequest {
  mode: 'tab' | 'other-tabs' | 'all-tabs'
  tabId: string
  dontAskAgain: boolean
}

export interface PasswordPromptRequest {
  tabId: string
  title: string
  prompt: string
}

export function CloseTabsConfirmModal({
  request,
  t,
  onCancel,
  onConfirm,
  onDontAskAgainChange
}: {
  request: CloseTabsConfirmRequest | null
  t: Dictionary
  onCancel: () => void
  onConfirm: () => void
  onDontAskAgainChange: (checked: boolean) => void
}): React.JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null)
  const overlayRef = useAppModalA11y(Boolean(request), { onEscape: onCancel, panelRef })

  if (!request) return null

  return (
    <div
      ref={overlayRef}
      className="app-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 overscroll-contain"
      role="dialog"
      aria-modal="true"
      aria-labelledby="close-tabs-confirm-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div
        ref={panelRef}
        className="app-modal-panel w-full max-w-md overflow-hidden rounded-xl border bg-background"
      >
        <div className="app-modal-header flex items-start gap-3 border-b px-4 py-3">
          {request.mode === 'tab' ? (
            <ArchiveIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          ) : (
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
          )}
          <div className="min-w-0">
            <h2 id="close-tabs-confirm-title" className="text-sm font-semibold">
              {request.mode === 'tab' ? t.confirm.closeTabsTitle : t.common.close}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {request.mode === 'tab'
                ? t.confirm.closeTab
                : request.mode === 'other-tabs'
                  ? t.confirm.closeOtherTabs
                  : t.confirm.closeAllTabs}
            </p>
          </div>
        </div>
        <div className="space-y-4 px-4 py-4">
          <label
            htmlFor="close-tabs-dont-ask"
            className="flex items-center gap-3 rounded-md border bg-muted/10 p-3 text-sm"
          >
            <Input
              id="close-tabs-dont-ask"
              type="checkbox"
              checked={request.dontAskAgain}
              onChange={(event) => onDontAskAgainChange(event.target.checked)}
              className="size-4 shrink-0 accent-primary"
            />
            <span>{t.confirm.dontAskAgain}</span>
          </label>
        </div>
        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
          <Button type="button" variant="outline" onClick={onCancel}>
            {t.common.cancel}
          </Button>
          <Button
            type="button"
            variant={request.mode === 'tab' ? 'default' : 'destructive'}
            onClick={onConfirm}
          >
            {request.mode === 'tab' ? t.confirm.closeTabsTitle : t.common.close}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Operator-only SSH password prompt in the conversation pane. */
export function PasswordPromptInlineCard({
  request,
  t,
  value,
  error,
  inputRef,
  onChange,
  onCancel,
  onSubmit
}: {
  request: PasswordPromptRequest
  t: Dictionary
  value: string
  error: string
  inputRef: React.Ref<HTMLInputElement>
  onChange: (value: string) => void
  onCancel: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}): React.JSX.Element {
  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>): void {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    onCancel()
  }

  return (
    <form
      onSubmit={onSubmit}
      onKeyDown={handleKeyDown}
      className="min-w-0 rounded-md border border-border/70 border-l-2 border-l-primary bg-card"
    >
      <div className="flex items-start justify-between gap-3 px-3 py-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-foreground">
            <TriangleAlertIcon className="size-3.5 text-amber-500" aria-hidden="true" />
            <span>{t.terminal.passwordPromptTitle}</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{request.title}</p>
        </div>
        <div className="shrink-0 text-[10px] text-muted-foreground">{t.input.approvalPending}</div>
      </div>

      <div className="space-y-2.5 border-t border-border/40 px-3 py-2.5 text-[11px]">
        <pre className="overflow-auto rounded-md bg-muted/25 p-2 font-mono whitespace-pre-wrap break-words">
          {request.prompt}
        </pre>
        <Field>
          <FieldLabel htmlFor="terminal-password-inline-input">
            {t.terminal.passwordPromptLabel}
          </FieldLabel>
          <ImeSafeInput
            id="terminal-password-inline-input"
            ref={inputRef}
            type="password"
            value={value}
            onValueChange={onChange}
            autoComplete="current-password"
            className="h-9"
          />
          <FieldDescription>{t.terminal.passwordPromptDescription}</FieldDescription>
        </Field>
        {error ? (
          <div
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {error}
          </div>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="submit" size="sm">
            {t.terminal.passwordPromptSubmit}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            {t.common.cancel}
          </Button>
        </div>
      </div>
    </form>
  )
}
