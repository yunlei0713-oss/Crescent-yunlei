import { Button } from './ui/button'
import { ThemeSwitcher } from './ThemeSwitcher'
import { WhalePetPortrait } from './WhalePetPortrait'
import type { Dictionary } from '@renderer/i18n'

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
    </footer>
  )
}
