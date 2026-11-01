import { BotIcon, CheckIcon, Trash2Icon, XIcon } from 'lucide-react'

import { Button } from '@renderer/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@renderer/components/ui/field'
import { Input } from '@renderer/components/ui/input'
import { Textarea } from '@renderer/components/ui/textarea'
import type { Dictionary } from '@renderer/i18n'
import { formatProviderModels } from '@renderer/lib/agent-config'
import type { AgentProviderConfig } from '../../../shared/agent-types'

interface ProviderSettingsEditorProps {
  t: Dictionary
  provider: AgentProviderConfig
  providerId: string
  modelsText: string
  canDelete: boolean
  saved: boolean
  onDelete: (providerId: string) => void
  onClose: () => void
  onToggleEnabled: (providerId: string, enabled: boolean) => void
  onUpdate: <K extends keyof AgentProviderConfig>(key: K, value: AgentProviderConfig[K]) => void
  onModelsChange: (value: string) => void
  onSave: () => void | Promise<void>
}

/** Controlled Provider detail UI; draft, identity and persistence stay with the parent owners. */
export function ProviderSettingsEditor({
  t,
  provider,
  providerId,
  modelsText,
  canDelete,
  saved,
  onDelete,
  onClose,
  onToggleEnabled,
  onUpdate,
  onModelsChange,
  onSave
}: ProviderSettingsEditorProps): React.JSX.Element {
  return (
    <div
      id="provider-editor-panel"
      className="app-sheet-detail flex w-[560px] shrink-0 flex-col overflow-hidden rounded-md border bg-background"
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">
            {t.settings.providerList}:{' '}
            {provider.name.trim() || provider.id || t.settings.newProvider}
          </div>
          <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
            {provider.id || providerId}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={!canDelete}
            aria-label={t.settings.deleteProvider}
            title={t.settings.deleteProvider}
            onClick={() => onDelete(providerId)}
          >
            <Trash2Icon aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t.common.close}
            title={t.common.close}
            onClick={onClose}
          >
            <XIcon aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain p-3">
        <FieldGroup className="gap-4">
          <label
            htmlFor="provider-enabled"
            className="flex items-center justify-between gap-3 px-0.5 py-0.5"
          >
            <span className="space-y-0.5">
              <span className="block text-sm font-medium">{t.settings.providerEnabled}</span>
              <FieldDescription>{t.settings.providerEnabledHint}</FieldDescription>
            </span>
            <Input
              id="provider-enabled"
              type="checkbox"
              checked={provider.enabled !== false}
              onChange={(event) => onToggleEnabled(provider.id, event.target.checked)}
              className="size-4 shrink-0 accent-primary"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Field>
              <FieldLabel htmlFor="provider-id">{t.settings.providerId}</FieldLabel>
              <Input
                id="provider-id"
                value={provider.id}
                onChange={(event) => onUpdate('id', event.target.value)}
                placeholder="provider-id…"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="provider-name">{t.settings.providerName}</FieldLabel>
              <Input
                id="provider-name"
                value={provider.name}
                onChange={(event) => onUpdate('name', event.target.value)}
                placeholder={t.settings.providerName}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="provider-base-url">{t.settings.baseUrl}</FieldLabel>
            <Input
              id="provider-base-url"
              value={provider.baseUrl}
              onChange={(event) => onUpdate('baseUrl', event.target.value)}
              placeholder="https://api.deepseek.com…"
            />
            <FieldDescription>{t.settings.baseUrlHint}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="provider-api-key">{t.settings.apiKey}</FieldLabel>
            <Input
              id="provider-api-key"
              type="password"
              value={provider.apiKey ?? ''}
              onChange={(event) => onUpdate('apiKey', event.target.value)}
              placeholder="sk-… or leave blank when env key is available"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="provider-models">{t.settings.providerModels}</FieldLabel>
            <Textarea
              id="provider-models"
              className="min-h-44 resize-y font-mono text-xs"
              value={modelsText}
              onChange={(event) => onModelsChange(event.target.value)}
              placeholder={'deepseek-chat\ndeepseek-reasoner'}
            />
            <FieldDescription>{t.settings.modelListHint}</FieldDescription>
            <FieldDescription>
              {t.locale === 'zh-CN'
                ? '图片输入（imageInput）：按当前供应商声明勾选，或在模型 ID 后添加 | image。未声明时仅接受文本；PDF 仍可提取文本。'
                : 'Image input (imageInput): enable per the provider specification, or append | image to the model ID. Undeclared models accept text, including extracted PDF text.'}
            </FieldDescription>
            {provider.models.map((model) => (
              <label key={model.id} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={model.imageInput === true}
                  onChange={(event) =>
                    onModelsChange(
                      formatProviderModels(
                        provider.models.map((item) =>
                          item.id === model.id
                            ? { ...item, imageInput: event.target.checked }
                            : item
                        )
                      )
                    )
                  }
                />
                <span className="break-all">
                  {model.name || model.id} · {t.locale === 'zh-CN' ? '图片输入' : 'Image input'}
                </span>
              </label>
            ))}
          </Field>
        </FieldGroup>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2 border-t px-3 py-2">
        <Button type="button" onClick={() => void onSave()}>
          {saved ? <CheckIcon data-icon="inline-start" /> : <BotIcon data-icon="inline-start" />}
          {saved ? t.settings.saved : t.settings.saveSettings}
        </Button>
      </div>
    </div>
  )
}
