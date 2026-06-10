/** Formats a USD amount as a rounded dollar string, e.g. `$1,250`. */
export function money(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}
