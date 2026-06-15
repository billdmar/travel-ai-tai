// Bundled destination fallback images + a query→asset matcher.
//
// Vite turns each glob entry into a hashed, lazily-fetchable URL at build time,
// so importing this module is cheap — only the URLs ship, the bytes load on use.

const modules = import.meta.glob('./*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

// Map bare slug ("kyoto") → bundled URL.
const BY_SLUG: Record<string, string> = {}
for (const [path, url] of Object.entries(modules)) {
  const slug = path.replace('./', '').replace('.webp', '')
  BY_SLUG[slug] = url
}

export const GENERIC_FALLBACK = BY_SLUG['generic']

// Aliases let varied queries ("Tokyo, Japan", "kyoto temples") resolve to a
// bundled slug. Keys are matched as case-insensitive substrings of the query.
const ALIASES: Record<string, string> = {
  kyoto: 'kyoto',
  lisbon: 'lisbon',
  reykjavik: 'reykjavik',
  iceland: 'reykjavik',
  queenstown: 'queenstown',
  santorini: 'santorini',
  greece: 'santorini',
  banff: 'banff',
  canada: 'banff',
  marrakech: 'marrakech',
  morocco: 'marrakech',
  tokyo: 'tokyo',
  barcelona: 'barcelona',
  spain: 'barcelona',
  'cape town': 'cape-town',
  patagonia: 'patagonia',
  argentina: 'patagonia',
  chile: 'patagonia',
  bali: 'bali',
  indonesia: 'bali',
  rome: 'rome',
  italy: 'rome',
  oaxaca: 'oaxaca',
  mexico: 'oaxaca',
  hanoi: 'hanoi',
  vietnam: 'hanoi',
  edinburgh: 'edinburgh',
  scotland: 'edinburgh',
  kerala: 'kerala',
  india: 'kerala',
  porto: 'porto',
  portugal: 'porto',
  dubrovnik: 'dubrovnik',
  croatia: 'dubrovnik',
  kruger: 'kruger',
  safari: 'kruger',
}

/**
 * Resolve a free-text query (destination name, image_query, place) to a bundled
 * .webp URL. Falls back to the generic frame when nothing matches.
 */
export function matchDestinationAsset(query: string): string {
  const q = query.toLowerCase().trim()
  if (!q) return GENERIC_FALLBACK

  // Exact slug hit first (e.g. image_query already a slug).
  const slug = q.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  if (BY_SLUG[slug]) return BY_SLUG[slug]

  // Substring alias match (longest alias wins for specificity).
  let best: { url: string; len: number } | null = null
  for (const [alias, target] of Object.entries(ALIASES)) {
    if (q.includes(alias) && (!best || alias.length > best.len)) {
      best = { url: BY_SLUG[target], len: alias.length }
    }
  }
  return best?.url ?? GENERIC_FALLBACK
}
