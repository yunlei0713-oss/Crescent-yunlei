import type { ArchitectureKind } from './architecture-spec'

export const APP_THEME_IDS = ['ink-wash-light', 'ink-wash-dark'] as const
export type AppThemeId = (typeof APP_THEME_IDS)[number]
export type DiagramKind = ArchitectureKind | 'decision'
export type KindTone = { fill: string; border: string; glow: string }
export interface CrescentThemeDefinition {
  id: AppThemeId
  meta: { accent: string; appearance: 'light' | 'dark' }
  geometry: { radius: number; radiusSmall: number }
  terminal: Record<(typeof terminalKeys)[number], string>
  chart: { series: readonly string[] }
  diagram: {
    canvas: string
    cluster: string
    grid: string
    text: string
    muted: string
    kinds: Record<DiagramKind, KindTone>
  }
}

const terminalKeys = [
  'background',
  'foreground',
  'cursor',
  'selectionBackground',
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite'
] as const
const kindKeys = [
  'client',
  'frontend',
  'ingress',
  'service',
  'data',
  'auth',
  'external',
  'queue',
  'decision'
] as const satisfies readonly DiagramKind[]

type Palette<Keys extends readonly string[]> = { [Index in keyof Keys]: string }

function defineTheme(
  id: AppThemeId,
  radius: number,
  radiusSmall: number,
  terminalColors: Palette<typeof terminalKeys>,
  canvas: string,
  cluster: string,
  muted: string,
  kindColors: Palette<typeof kindKeys>
): CrescentThemeDefinition {
  const terminal = Object.fromEntries(
    terminalKeys.map((key, i) => [key, terminalColors[i]!])
  ) as CrescentThemeDefinition['terminal']
  const kinds = Object.fromEntries(
    kindKeys.map((kind, i) => {
      const border = kindColors[i]!
      return [kind, { border, fill: `${border}1f`, glow: `${border}33` }]
    })
  ) as Record<DiagramKind, KindTone>
  return {
    id,
    meta: {
      accent: id === 'ink-wash-light' ? '#555D57' : terminal.cursor,
      appearance: id === 'ink-wash-light' ? 'light' : 'dark'
    },
    geometry: { radius, radiusSmall },
    terminal,
    chart: { series: kindColors.slice(0, 8) },
    diagram: {
      canvas,
      cluster,
      grid: `${terminal.cursor}12`,
      text: id === 'ink-wash-light' ? '#171918' : terminal.foreground,
      muted,
      kinds
    }
  }
}

export const APP_THEMES: Record<AppThemeId, CrescentThemeDefinition> = {
  'ink-wash-light': defineTheme(
    'ink-wash-light',
    6,
    3,
    [
      '#171A18',
      '#F1F2ED',
      '#C7CCC3',
      '#363C37',
      '#111312',
      '#F07B7B',
      '#70C493',
      '#E4B66B',
      '#9AB6CB',
      '#C4A6C6',
      '#9BC4BD',
      '#D5D8D1',
      '#A5AAA2',
      '#FF9595',
      '#91D8AB',
      '#F2CB8B',
      '#B8D1E3',
      '#DDC0DF',
      '#BADCD6',
      '#FCFCF9'
    ],
    '#F7F7F3',
    '#F0F0EA',
    '#626964',
    [
      '#454947',
      '#4D6478',
      '#946019',
      '#287A4B',
      '#795C7C',
      '#B43B3B',
      '#626964',
      '#826132',
      '#555D57'
    ]
  ),
  'ink-wash-dark': defineTheme(
    'ink-wash-dark',
    6,
    3,
    [
      '#111312',
      '#F1F2ED',
      '#C7CCC3',
      '#303831',
      '#111312',
      '#F07B7B',
      '#70C493',
      '#E4B66B',
      '#9AB6CB',
      '#C4A6C6',
      '#9BC4BD',
      '#D5D8D1',
      '#A5AAA2',
      '#FF9595',
      '#91D8AB',
      '#F2CB8B',
      '#B8D1E3',
      '#DDC0DF',
      '#BADCD6',
      '#FCFCF9'
    ],
    '#111312',
    '#202421',
    '#A5AAA2',
    [
      '#D5D8D1',
      '#9AB6CB',
      '#E4B66B',
      '#70C493',
      '#C4A6C6',
      '#F07B7B',
      '#A5AAA2',
      '#CCA775',
      '#C7CCC3'
    ]
  )
}

export function getAppThemeDefinition(id: AppThemeId): CrescentThemeDefinition {
  return APP_THEMES[id]
}
export function getAppTerminalTheme(id: AppThemeId): CrescentThemeDefinition['terminal'] {
  return { ...APP_THEMES[id].terminal }
}
export function getChartSeriesColors(id: AppThemeId): readonly string[] {
  return APP_THEMES[id].chart.series
}
