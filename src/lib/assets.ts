const flags = import.meta.glob<string>('/node_modules/country-flag-icons/3x2/*.svg', { eager: true, query: '?url', import: 'default' })
export function flagUrl(country: string): string | undefined {
  return flags[`/node_modules/country-flag-icons/3x2/${country}.svg`]
}
