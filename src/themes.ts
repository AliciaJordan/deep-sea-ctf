/** Product theme catalog for the Deep Sea CTF Abyss palette. */

export const THEMES = [
  {
    id: 'abyss',
    label: 'Abyss',
    description: 'Deep-water blue, sonar amber, and solved-contact teal.',
  },
] as const

export type ThemeId = (typeof THEMES)[number]['id']

/** Read the active theme id from <html data-theme>. */
export function getActiveTheme(): ThemeId {
  if (typeof document === 'undefined') return 'abyss'
  const id = document.documentElement.getAttribute('data-theme') as ThemeId | null
  return id ?? 'abyss'
}

/** Look up a theme entry by id, or fall back to the product theme. */
export function getTheme(id: string) {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0]
}
