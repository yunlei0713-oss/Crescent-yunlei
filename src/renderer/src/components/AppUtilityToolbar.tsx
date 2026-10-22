import { createLucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from './ui/button'
import { ThemeSwitcher } from './ThemeSwitcher'
import { WhalePetPortrait } from './WhalePetPortrait'
import type { Dictionary } from '@renderer/i18n'

// GitHub was removed from Lucide's current brand set. Preserve the original
// Lucide 0.468.0 geometry (ISC), using the installed factory without downgrading.
const GithubIcon = createLucideIcon('Github', [
  [
    'path',
    {
      d: 'M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4',
      key: 'body'
    }
  ],
  ['path', { d: 'M9 18c-4.51 2-5-2-7-2', key: 'tail' }]
])

export function AppUtilityToolbar({
  t,
  locale,
  petVisible,
  onTogglePet
}: {
  t: Dictionary
  locale: 'zh-CN' | 'en'
  petVisible: boolean
  onTogglePet: () => void
}): React.JSX.Element {
  const en = locale === 'en'
  const petLabel = petVisible
    ? en
      ? 'Hide whale pet'
      : '隐藏桌宠'
    : en
      ? 'Show whale pet'
      : '显示桌宠'
  const githubLabel = en ? 'Open Crescent GitHub repository' : '打开 Crescent GitHub 仓库'
  const openRepository = async (): Promise<void> => {
    try {
      const result = await window.api.app.openExternal('https://github.com/aide-family/Crescent')
      if (!result.ok) throw new Error('open failed')
    } catch {
      toast.error(en ? 'Could not open the GitHub repository.' : '无法打开 GitHub 仓库。')
    }
  }
  return (
    <footer
      className="app-utilitybar app-commandbar flex h-10 shrink-0 items-center gap-0.5 border-t border-border px-2"
      role="toolbar"
      aria-label={en ? 'Application tools' : '应用工具'}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={petLabel}
        title={petLabel}
        aria-pressed={petVisible}
        onClick={onTogglePet}
      >
        <WhalePetPortrait />
      </Button>
      <ThemeSwitcher t={t} placement="top-start" />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={githubLabel}
        title={githubLabel}
        onClick={() => void openRepository()}
      >
        <GithubIcon aria-hidden="true" />
      </Button>
    </footer>
  )
}
