/** Hash-only route: no server fallback or router dependency required. */
export function nodeFromHash(hash: string): number | null {
  const match = /^#\/node\/([1-9]\d*)$/.exec(hash)
  if (!match) return null
  const id = Number(match[1])
  return Number.isSafeInteger(id) ? id : null
}
export function nodeHref(id: number) { return '#/node/' + id }
