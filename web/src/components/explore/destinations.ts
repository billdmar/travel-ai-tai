// Curated metadata for the Explore gallery + per-destination landing pages.
//
// Each entry's `slug` maps 1:1 to a bundled .webp in assets/destinations, so
// `matchDestinationAsset(slug)` (and the live image service, keyed on `query`)
// always resolves a frame. This is editorial copy for the discovery surface —
// it is NOT the LLM recommendation contract (DestinationRecommendation), which
// stays server-owned. Vibes power the Explore filter.

export type Vibe =
  | 'Coastal'
  | 'City'
  | 'Mountains'
  | 'Culture'
  | 'Wildlife'
  | 'Food'

export interface CuratedDestination {
  /** Bundled-asset slug + URL route param (/destination/:slug). */
  slug: string
  name: string
  country: string
  /** Query handed to the live image service / asset matcher. */
  query: string
  /** Short editorial line shown on the gallery card. */
  tagline: string
  /** Best window to visit, mirrors DestinationRecommendation.best_season. */
  bestSeason: string
  /** Filterable vibes — first one is treated as the card's accent label. */
  vibes: Vibe[]
  /** Two-to-three sentence story for the immersive landing page. */
  story: string[]
}

export const VIBES: Vibe[] = [
  'Coastal',
  'City',
  'Mountains',
  'Culture',
  'Wildlife',
  'Food',
]

// Order here is the gallery's default order — a deliberate editorial rhythm
// rather than alphabetical.
export const DESTINATIONS: CuratedDestination[] = [
  {
    slug: 'kyoto',
    name: 'Kyoto',
    country: 'Japan',
    query: 'Kyoto, Japan',
    tagline: 'Temple gardens, tea houses, and quiet lantern-lit lanes.',
    bestSeason: 'Late March–April (cherry blossom) or November (autumn leaves)',
    vibes: ['Culture', 'Food', 'City'],
    story: [
      'Kyoto rewards the slow traveler. A thousand years of capital life left it dense with shrines, moss gardens, and machiya townhouses that now hold tiny coffee bars and kaiseki counters.',
      'Mornings belong to the temples before the crowds — Fushimi Inari’s vermilion gates, the raked gravel at Ryoan-ji. Afternoons drift toward Nishiki Market and the willow-lined canals of Gion.',
      'Come for the seasons: blossoms in spring, fiery maples in autumn, each turning the same streets into something new.',
    ],
  },
  {
    slug: 'santorini',
    name: 'Santorini',
    country: 'Greece',
    query: 'Santorini, Greece',
    tagline: 'Whitewashed cliffs falling into a flooded caldera.',
    bestSeason: 'May–June or September (warm, fewer crowds)',
    vibes: ['Coastal', 'Food'],
    story: [
      'Santorini is the rim of a drowned volcano, its villages clinging to cliffs that drop straight into impossibly blue water.',
      'Days move between cave-pool terraces, black-sand beaches, and clifftop tavernas pouring crisp Assyrtiko grown in the island’s ashy soil.',
      'Everyone gathers in Oia for the sunset, but the quieter villages of Pyrgos and Megalochori hold the island’s older, slower heart.',
    ],
  },
  {
    slug: 'patagonia',
    name: 'Patagonia',
    country: 'Argentina & Chile',
    query: 'Patagonia mountains',
    tagline: 'Granite spires, glacier blue, and wind off the ice fields.',
    bestSeason: 'November–March (Southern Hemisphere summer)',
    vibes: ['Mountains', 'Wildlife'],
    story: [
      'At the bottom of the Americas, Patagonia is a country of weather — sun, sleet, and gale often in a single afternoon, all of it lit against the granite towers of Torres del Paine and Fitz Roy.',
      'Trails thread past hanging glaciers and turquoise tarns; guanacos graze the steppe while condors ride the thermals overhead.',
      'It is a place for walking far and arriving somewhere that feels like the edge of the map.',
    ],
  },
  {
    slug: 'marrakech',
    name: 'Marrakech',
    country: 'Morocco',
    query: 'Marrakech, Morocco',
    tagline: 'Souks, riads, and the call to prayer over a rose-red medina.',
    bestSeason: 'March–May or October–November (mild days)',
    vibes: ['Culture', 'Food', 'City'],
    story: [
      'Marrakech is a city of thresholds — step through an unassuming door and a riad opens around a citrus courtyard, cool and still amid the heat.',
      'The medina’s souks coil through leather, spice, and lantern light toward the Jemaa el-Fnaa, which transforms at dusk into a theatre of food stalls and storytellers.',
      'Beyond the walls, the Atlas Mountains and the Agafay desert are a short drive into another silence entirely.',
    ],
  },
  {
    slug: 'reykjavik',
    name: 'Reykjavík',
    country: 'Iceland',
    query: 'Reykjavik Iceland',
    tagline: 'A small capital at the edge of fire, ice, and the aurora.',
    bestSeason: 'June–August (midnight sun) or Sept–March (northern lights)',
    vibes: ['Coastal', 'Mountains'],
    story: [
      'Reykjavík is the world’s northernmost capital, a low-slung, colorful town that serves as base camp for an island built by volcanoes and glaciers.',
      'Within an hour you can stand in the rift between continents, soak in a geothermal lagoon, or watch waterfalls thunder off the Golden Circle.',
      'In winter the dark sky becomes a canvas for the aurora; in summer the sun barely sets at all.',
    ],
  },
  {
    slug: 'bali',
    name: 'Bali',
    country: 'Indonesia',
    query: 'Bali, Indonesia',
    tagline: 'Rice terraces, temple smoke, and surf on the reef.',
    bestSeason: 'April–October (dry season)',
    vibes: ['Coastal', 'Culture'],
    story: [
      'Bali layers everything at once — emerald rice terraces stepping down volcanic slopes, sea temples on black rock, and an unhurried Hindu rhythm of daily offerings.',
      'The south brings surf and beach clubs; Ubud, inland, is all jungle, craft, and yoga shalas; the north and east stay quiet and wild.',
      'It is an island that asks you to slow your pace to match its own.',
    ],
  },
  {
    slug: 'banff',
    name: 'Banff',
    country: 'Canada',
    query: 'Banff, Canada',
    tagline: 'Glacial lakes the color of mineral glass, ringed by peaks.',
    bestSeason: 'June–September (hiking) or December–March (snow)',
    vibes: ['Mountains', 'Wildlife'],
    story: [
      'Banff sits in the heart of the Canadian Rockies, where lakes like Louise and Moraine hold an unreal, mineral-fed turquoise beneath sheer stone walls.',
      'Trails climb to teahouses and high passes; the Icefields Parkway strings together glaciers and waterfalls for hours of jaw-dropping driving.',
      'Elk wander the townsite at dusk, and the dark mountain sky fills with stars.',
    ],
  },
  {
    slug: 'lisbon',
    name: 'Lisbon',
    country: 'Portugal',
    query: 'Lisbon, Portugal',
    tagline: 'Tiled facades, hilltop miradouros, and fado after dark.',
    bestSeason: 'March–May or September–October',
    vibes: ['City', 'Coastal', 'Food'],
    story: [
      'Lisbon spills over seven hills toward the Tagus, its trams rattling past azulejo-tiled buildings bleached by the Atlantic light.',
      'Wander Alfama’s tangle of lanes to a viewpoint, eat a custard tart still warm from the oven, and let the evening drift into a fado house.',
      'The coast and the wild cliffs of Sintra and Cascais are a half-hour train ride away.',
    ],
  },
  {
    slug: 'queenstown',
    name: 'Queenstown',
    country: 'New Zealand',
    query: 'Queenstown New Zealand',
    tagline: 'Alpine lake, jagged Remarkables, adrenaline on tap.',
    bestSeason: 'December–February (summer) or June–August (ski)',
    vibes: ['Mountains', 'Coastal'],
    story: [
      'Cradled by Lake Wakatipu and the saw-toothed Remarkables, Queenstown is New Zealand’s adventure capital — bungy, jet boats, and paragliding all within reach.',
      'But it is just as easy to slow down: vineyard lunches in Gibbston, lakeside walks, and day trips to the fjords of Milford Sound.',
      'Every direction out of town opens onto another stretch of the country’s outsized scenery.',
    ],
  },
  {
    slug: 'cape-town',
    name: 'Cape Town',
    country: 'South Africa',
    query: 'Cape Town, South Africa',
    tagline: 'Where the mountain meets two oceans and the winelands.',
    bestSeason: 'November–March (warm, dry summer)',
    vibes: ['Coastal', 'City', 'Wildlife'],
    story: [
      'Cape Town unfolds beneath Table Mountain, a flat-topped massif you can ride a cable car up for the whole peninsula at your feet.',
      'Beaches curl along both the Atlantic and False Bay; the Cape of Good Hope drama lies an hour south past penguin colonies and fynbos.',
      'Inland, the Stellenbosch and Franschhoek winelands offer some of the world’s most scenic tasting tables.',
    ],
  },
  {
    slug: 'kerala',
    name: 'Kerala',
    country: 'India',
    query: 'Kerala backwaters India',
    tagline: 'Backwater houseboats, spice hills, and Ayurvedic calm.',
    bestSeason: 'September–March (post-monsoon, cooler)',
    vibes: ['Coastal', 'Culture'],
    story: [
      'Kerala is India at its most lush — a green ribbon of coast where a network of backwater canals carries houseboats past paddy fields and coconut palms.',
      'Climb into the Western Ghats for tea and spice plantations wrapped in mist, then return to the coast for Kathakali theatre and a fresh-caught seafood thali.',
      'It moves to the slow tempo of water and rain.',
    ],
  },
  {
    slug: 'kruger',
    name: 'Kruger',
    country: 'South Africa',
    query: 'Kruger safari South Africa',
    tagline: 'Dawn drives and the Big Five across open bushveld.',
    bestSeason: 'May–September (dry season, best game viewing)',
    vibes: ['Wildlife'],
    story: [
      'Kruger is one of Africa’s great wildlife stages — vast bushveld where elephant herds, lion prides, and the rest of the Big Five move across the dry-season plains.',
      'Days start before dawn for the cool-hour game drives and end around the fire as the bush comes alive with sound.',
      'Whether self-driving the public roads or in a private reserve, every track holds the possibility of a sighting.',
    ],
  },
  {
    slug: 'rome',
    name: 'Rome',
    country: 'Italy',
    query: 'Rome, Italy',
    tagline: 'Layered ruins, baroque fountains, and dinner in a piazza.',
    bestSeason: 'April–June or September–October',
    vibes: ['City', 'Culture', 'Food'],
    story: [
      'Rome wears three thousand years at once — a Roman temple becomes a church becomes a piazza, all still in daily use.',
      'Walk from the Colosseum through the Forum to the Pantheon, then lose the map entirely in Trastevere’s lanes for cacio e pepe and a glass of Frascati.',
      'The city is best taken on foot, fountain to fountain, gelato in hand.',
    ],
  },
  {
    slug: 'hanoi',
    name: 'Hanoi',
    country: 'Vietnam',
    query: 'Hanoi, Vietnam',
    tagline: 'Old Quarter chaos, lakeside calm, and street-food legend.',
    bestSeason: 'October–December or March–April (mild, dry)',
    vibes: ['City', 'Food', 'Culture'],
    story: [
      'Hanoi hums — motorbikes streaming through the Old Quarter’s thirty-six trade streets, vendors crouched over pho and bun cha at dawn.',
      'Between the energy are pockets of stillness: the willow-fringed Hoan Kiem Lake, colonial boulevards, and the centuries-old Temple of Literature.',
      'It is the gateway to Halong Bay and the terraced north, but a city worth lingering in for its food alone.',
    ],
  },
  {
    slug: 'edinburgh',
    name: 'Edinburgh',
    country: 'Scotland',
    query: 'Edinburgh, Scotland',
    tagline: 'A castle on a crag, closes and crags, and single malt.',
    bestSeason: 'May–September (long days) or August (festivals)',
    vibes: ['City', 'Culture'],
    story: [
      'Edinburgh stacks its history vertically — a medieval Old Town of steep closes beneath the castle, and an elegant Georgian New Town just across the gardens.',
      'Climb the volcanic Arthur’s Seat for the whole city laid out to the firth, then warm up in a snug with a dram.',
      'In August the whole place becomes the world’s largest arts festival; the rest of the year it keeps a brooding, literary calm.',
    ],
  },
  {
    slug: 'porto',
    name: 'Porto',
    country: 'Portugal',
    query: 'Porto, Portugal',
    tagline: 'River-mouth bridges, port cellars, and tiled churches.',
    bestSeason: 'May–September',
    vibes: ['City', 'Food', 'Coastal'],
    story: [
      'Porto tumbles down to the Douro in a cascade of terracotta roofs and tiled facades, its riverfront Ribeira a UNESCO-listed warren of color.',
      'Cross the iron Dom Luís bridge to the port lodges of Vila Nova de Gaia for a tasting, then follow the river inland into terraced vineyard country.',
      'It is unpolished, generous, and one of Europe’s best-value city breaks.',
    ],
  },
  {
    slug: 'oaxaca',
    name: 'Oaxaca',
    country: 'Mexico',
    query: 'Oaxaca, Mexico',
    tagline: 'Mole, mezcal, and markets in a high colonial valley.',
    bestSeason: 'October–April (dry) — late Oct for Día de Muertos',
    vibes: ['Food', 'Culture'],
    story: [
      'Oaxaca is Mexico’s culinary and craft heartland — a colonial city of pastel stone where the cuisine runs deep into seven moles and the mezcal is poured from small family palenques.',
      'Markets overflow with chiles and chocolate; the surrounding valleys hold Zapotec ruins at Monte Albán and weaving villages.',
      'During Día de Muertos the whole city becomes marigolds, candlelight, and remembrance.',
    ],
  },
  {
    slug: 'dubrovnik',
    name: 'Dubrovnik',
    country: 'Croatia',
    query: 'Dubrovnik, Croatia',
    tagline: 'Marble streets inside walls above the Adriatic.',
    bestSeason: 'May–June or September (warm, calmer)',
    vibes: ['Coastal', 'City', 'Culture'],
    story: [
      'Dubrovnik’s Old Town is a near-perfect walled city of polished limestone streets and red roofs, ringed by ramparts you can walk for the full sweep of the Adriatic.',
      'Swim straight off the rocks below the walls, take a boat to the green island of Lokrum, and watch the stone glow at golden hour.',
      'Beyond the crowds of high summer, the shoulder seasons return the city to its quiet, sun-warmed self.',
    ],
  },
  {
    slug: 'tokyo',
    name: 'Tokyo',
    country: 'Japan',
    query: 'Tokyo, Japan',
    tagline: 'Neon density and pocket calm in the world’s great metropolis.',
    bestSeason: 'March–May (blossom) or October–November',
    vibes: ['City', 'Food', 'Culture'],
    story: [
      'Tokyo is a city of layers — hyper-modern crossings and towers stacked over centuries-old shrines, hidden gardens, and tiny six-seat counters serving the best meal of your life.',
      'Each neighborhood is its own world: the youth color of Harajuku, the lantern-lit izakaya alleys of Shinjuku, the old-town calm of Yanaka.',
      'It rewards the curious endlessly, and is impossibly easy to get around.',
    ],
  },
  {
    slug: 'barcelona',
    name: 'Barcelona',
    country: 'Spain',
    query: 'Barcelona, Spain',
    tagline: 'Gaudí curves, Gothic lanes, and the beach in the city.',
    bestSeason: 'May–June or September–October',
    vibes: ['City', 'Coastal', 'Food'],
    story: [
      'Barcelona pairs Mediterranean ease with bold imagination — Gaudí’s undulating facades and the still-rising Sagrada Família set against a working beach and a maze-like Gothic Quarter.',
      'Graze through the Boqueria and tapas bars of El Born, then catch the sea breeze on a long lunch by the water.',
      'It is a city that lives outdoors, late, and well.',
    ],
  },
]

/** Lookup a curated destination by its slug (URL param). */
export function getDestinationBySlug(slug: string): CuratedDestination | undefined {
  const key = slug.toLowerCase().trim()
  return DESTINATIONS.find((d) => d.slug === key)
}
