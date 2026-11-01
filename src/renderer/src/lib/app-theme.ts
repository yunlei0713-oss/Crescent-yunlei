import { APP_THEME_IDS, APP_THEMES, type AppThemeId } from './theme-definitions'
export type { AppThemeId } from './theme-definitions'

export const APP_THEME_STORAGE_KEY = 'crescent.app-theme'
export const APP_THEME_CHANGE_EVENT = 'crescent-theme-change'
export const APP_THEME_OPTIONS = APP_THEME_IDS.map((id) => ({
  id,
  accent: APP_THEMES[id].meta.accent
}))
let currentTheme: AppThemeId | undefined
export function migrateAppTheme(stored: unknown): AppThemeId {
  if (APP_THEME_IDS.includes(stored as AppThemeId)) return stored as AppThemeId
  // All four retired appearances were dark, including Route Survey.
  return ['crescent', 'night-shift', 'route-survey', 'ink-signal'].includes(String(stored))
    ? 'ink-wash-dark'
    : 'ink-wash-light'
}

function storedTheme(): AppThemeId {
  try {
    const stored = localStorage.getItem(APP_THEME_STORAGE_KEY)
    const theme = migrateAppTheme(stored)
    if (stored !== theme) {
      try {
        localStorage.setItem(APP_THEME_STORAGE_KEY, theme)
      } catch {
        /* Keep the migrated preference in memory. */
      }
    }
    return theme
  } catch {
    return 'ink-wash-light'
  }
}

export function readAppTheme(): AppThemeId {
  return (currentTheme ??= storedTheme())
}

function applyAppThemeAttribute(theme: AppThemeId): void {
  const root = document.documentElement
  const appearance = APP_THEMES[theme].meta.appearance
  root.classList.toggle('dark', appearance === 'dark')
  root.style.colorScheme = appearance
  root.setAttribute('data-crescent-theme', theme)
}

export function initializeAppTheme(): void {
  applyAppThemeAttribute(readAppTheme())
}

export function saveAppTheme(theme: AppThemeId): void {
  if (!APP_THEME_IDS.includes(theme)) return
  const previous = readAppTheme()
  currentTheme = theme
  applyAppThemeAttribute(theme)
  try {
    localStorage.setItem(APP_THEME_STORAGE_KEY, theme)
  } catch {
    // Keep the current session theme if storage is unavailable.
  }
  if (previous !== theme)
    window.dispatchEvent(new CustomEvent(APP_THEME_CHANGE_EVENT, { detail: { theme } }))
}

export function subscribeAppTheme(listener: () => void): () => void {
  window.addEventListener(APP_THEME_CHANGE_EVENT, listener)
  return () => window.removeEventListener(APP_THEME_CHANGE_EVENT, listener)
}
