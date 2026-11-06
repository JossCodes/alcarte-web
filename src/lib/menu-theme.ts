export const MENU_THEMES = ['minimal', 'classic', 'night'] as const

export type MenuTheme = typeof MENU_THEMES[number]

export const MENU_THEME_LABELS: Record<MenuTheme, { title: string; description: string }> = {
  minimal: { title: 'Esencial', description: 'Lista compacta y clara para cartas extensas.' },
  classic: { title: 'Carta', description: 'Composición editorial de lectura cómoda.' },
  night: { title: 'Visual', description: 'Fotografías protagonistas en cuadrícula.' },
}

export function normalizeHexColor(value: string): string | null {
  const color = value.trim()
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : null
}

function luminance(hex: string): number {
  const channels = hex.slice(1).match(/.{2}/g)!.map((channel) => parseInt(channel, 16) / 255)
  const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

export function readableTextOn(hex: string): '#000000' | '#FFFFFF' {
  const color = normalizeHexColor(hex)
  if (!color) return '#000000'
  const lightness = luminance(color)
  const contrastWithBlack = (lightness + 0.05) / 0.05
  const contrastWithWhite = 1.05 / (lightness + 0.05)
  return contrastWithBlack >= contrastWithWhite ? '#000000' : '#FFFFFF'
}

export function menuContrastRatio(hex: string): number {
  const color = normalizeHexColor(hex)
  if (!color) return 1
  const lightness = luminance(color)
  return Math.max((lightness + 0.05) / 0.05, 1.05 / (lightness + 0.05))
}
