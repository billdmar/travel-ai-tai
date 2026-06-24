// Bundled destination fallback images + a query→asset matcher.
//
// Vite turns each glob entry into a hashed, lazily-fetchable URL at build time,
// so importing this module is cheap — only the URLs ship, the bytes load on use.
//
// The library is a curated set of quiet-luxury illustrations (1200×800 .webp,
// each well under ~150KB) covering popular travel destinations. The matcher
// resolves a free-text query (a place name, an LLM `image_query`, a "City,
// Country" string) to the closest bundled slug, falling back to a neutral frame
// so an itinerary always renders photo-rich even with no Unsplash key.

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

/** Every bundled destination slug (excludes the generic fallback frame). */
export const DESTINATION_SLUGS = Object.keys(BY_SLUG)
  .filter((slug) => slug !== 'generic')
  .sort()

// Aliases let varied queries ("Tokyo, Japan", "kyoto temples", "a week in the
// Swiss Alps") resolve to a bundled slug. Keys are matched as case-insensitive
// substrings of the query; the longest matching alias wins, so a specific city
// ("osaka") beats its country ("japan"). Country/region aliases point at the
// most representative bundled destination for that area.
const ALIASES: Record<string, string> = {
  // --- original set (unchanged mappings preserved) ---
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
  marrakesh: 'marrakesh',
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

  // --- new cities ---
  vienna: 'vienna',
  austria: 'vienna',
  chamonix: 'chamonix',
  'mont blanc': 'chamonix',
  paris: 'paris',
  france: 'paris',
  london: 'london',
  england: 'london',
  uk: 'london',
  britain: 'london',
  amsterdam: 'amsterdam',
  netherlands: 'amsterdam',
  holland: 'amsterdam',
  prague: 'prague',
  czech: 'prague',
  venice: 'venice',
  florence: 'florence',
  tuscany: 'florence',
  athens: 'athens',
  istanbul: 'istanbul',
  turkey: 'istanbul',
  dubai: 'dubai',
  'abu dhabi': 'dubai',
  emirates: 'dubai',
  uae: 'dubai',
  petra: 'petra',
  jordan: 'petra',
  cairo: 'cairo',
  egypt: 'cairo',
  'new york': 'new-york',
  nyc: 'new-york',
  manhattan: 'new-york',
  brooklyn: 'new-york',
  'san francisco': 'san-francisco',
  vancouver: 'vancouver',
  rio: 'rio',
  'rio de janeiro': 'rio',
  brazil: 'rio',
  cusco: 'cusco',
  cuzco: 'cusco',
  'machu picchu': 'cusco',
  peru: 'cusco',
  'buenos aires': 'buenos-aires',
  sydney: 'sydney',
  australia: 'sydney',
  auckland: 'auckland',
  'new zealand': 'auckland',
  bangkok: 'bangkok',
  thailand: 'bangkok',
  singapore: 'singapore',
  seoul: 'seoul',
  korea: 'seoul',
  osaka: 'osaka',
  'hong kong': 'hong-kong',
  hongkong: 'hong-kong',
  jaipur: 'jaipur',
  rajasthan: 'jaipur',
  'hoi an': 'hoi-an',
  'chiang mai': 'chiang-mai',
  marseille: 'marseille',
  nice: 'nice',
  riviera: 'nice',
  seville: 'seville',
  sevilla: 'seville',
  madrid: 'madrid',
  copenhagen: 'copenhagen',
  denmark: 'copenhagen',
  stockholm: 'stockholm',
  sweden: 'stockholm',
  oslo: 'oslo',
  norway: 'oslo',
  zurich: 'zurich',
  switzerland: 'zurich',
  swiss: 'zurich',
  interlaken: 'interlaken',
  jungfrau: 'interlaken',
  alps: 'interlaken',
  dublin: 'dublin',
  ireland: 'dublin',
  nairobi: 'nairobi',
  kenya: 'nairobi',
  zanzibar: 'zanzibar',
  tanzania: 'zanzibar',
  phuket: 'phuket',
  maldives: 'maldives',
  havana: 'havana',
  cuba: 'havana',
  'mexico city': 'mexico-city',
  cdmx: 'mexico-city',
  tulum: 'tulum',
  cancun: 'tulum',
  cartagena: 'cartagena',
  colombia: 'cartagena',
  lima: 'lima',

  // --- broad region hints (lowest specificity) ---
  japan: 'tokyo',
}

/**
 * Resolve a free-text query (destination name, image_query, place) to a bundled
 * .webp URL. Falls back to the generic frame when nothing matches.
 *
 * Resolution order:
 *  1. exact slug match (e.g. the query is already a slug like "hong-kong"),
 *  2. longest substring alias match (city beats country for specificity),
 *  3. generic fallback frame.
 */
export function matchDestinationAsset(query: string): string {
  const q = query.toLowerCase().trim()
  if (!q) return GENERIC_FALLBACK

  // Exact slug hit first (e.g. image_query already a slug).
  const slug = q.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  if (BY_SLUG[slug] && slug !== 'generic') return BY_SLUG[slug]

  // Substring alias match (longest alias wins for specificity).
  let best: { url: string; len: number } | null = null
  for (const [alias, target] of Object.entries(ALIASES)) {
    if (q.includes(alias) && (!best || alias.length > best.len)) {
      const url = BY_SLUG[target]
      if (url) best = { url, len: alias.length }
    }
  }
  return best?.url ?? GENERIC_FALLBACK
}
