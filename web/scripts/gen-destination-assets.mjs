/**
 * Generates the bundled destination fallback images as .webp.
 *
 * These are the OFFLINE fallback rendered by <DestinationImage> when the live
 * /api/v1/images endpoint returns fallback:true or a null URL. They are not
 * photographs — they are elegant, palette-matched gradient "frames" with a
 * subtle horizon motif and the place name, so a missing photo still reads as
 * intentional design rather than a broken image.
 *
 * Run once to (re)generate assets; sharp is a dev-only, --no-save tool and is
 * intentionally NOT a project dependency. The committed .webp outputs are what
 * ships. Usage:  node scripts/gen-destination-assets.mjs
 */
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '..', 'src', 'assets', 'destinations')

const W = 1200
const H = 800

// Curated muted blue-green-leaning duotone pairs (top → bottom), each evoking
// the destination's mood while staying within the single-accent discipline.
const DESTINATIONS = [
  { slug: 'kyoto', label: 'Kyoto', from: '#3f7a72', to: '#223f3b' },
  { slug: 'lisbon', label: 'Lisbon', from: '#5a938b', to: '#2a504b' },
  { slug: 'reykjavik', label: 'Reykjavik', from: '#82b0a9', to: '#33645d' },
  { slug: 'queenstown', label: 'Queenstown', from: '#3f7a72', to: '#1b322f' },
  { slug: 'santorini', label: 'Santorini', from: '#aecdc8', to: '#3f7a72' },
  { slug: 'banff', label: 'Banff', from: '#5a938b', to: '#223f3b' },
  { slug: 'marrakech', label: 'Marrakech', from: '#5a938b', to: '#2a504b' },
  { slug: 'tokyo', label: 'Tokyo', from: '#33645d', to: '#1b322f' },
  { slug: 'barcelona', label: 'Barcelona', from: '#5a938b', to: '#2a504b' },
  { slug: 'cape-town', label: 'Cape Town', from: '#3f7a72', to: '#223f3b' },
  { slug: 'patagonia', label: 'Patagonia', from: '#82b0a9', to: '#2a504b' },
  { slug: 'bali', label: 'Bali', from: '#5a938b', to: '#1b322f' },
  { slug: 'rome', label: 'Rome', from: '#5a938b', to: '#33645d' },
  { slug: 'oaxaca', label: 'Oaxaca', from: '#3f7a72', to: '#2a504b' },
  { slug: 'hanoi', label: 'Hanoi', from: '#5a938b', to: '#223f3b' },
  { slug: 'edinburgh', label: 'Edinburgh', from: '#3f7a72', to: '#1b322f' },
  { slug: 'kerala', label: 'Kerala', from: '#82b0a9', to: '#33645d' },
  { slug: 'porto', label: 'Porto', from: '#5a938b', to: '#2a504b' },
  { slug: 'dubrovnik', label: 'Dubrovnik', from: '#aecdc8', to: '#3f7a72' },
  { slug: 'kruger', label: 'Kruger', from: '#5a938b', to: '#223f3b' },
  // Generic fallback for any unmatched query.
  { slug: 'generic', label: '', from: '#5a938b', to: '#2a504b' },
]

function svg({ label, from, to }) {
  // Layered horizon: gradient sky, two soft mountain ridges, a faint sun disc,
  // and (optionally) the place name in a refined serif-less treatment.
  const title = label
    ? `<text x="60" y="${H - 70}" font-family="Inter, system-ui, sans-serif"
         font-size="64" font-weight="600" letter-spacing="-1.5"
         fill="#faf8f4" fill-opacity="0.96">${label}</text>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${from}"/>
        <stop offset="100%" stop-color="${to}"/>
      </linearGradient>
      <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#faf8f4" stop-opacity="0.10"/>
        <stop offset="100%" stop-color="#faf8f4" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#sky)"/>
    <circle cx="${W - 240}" cy="220" r="120" fill="#faf8f4" fill-opacity="0.10"/>
    <path d="M0 ${H * 0.62} Q ${W * 0.25} ${H * 0.5} ${W * 0.5} ${H * 0.6}
             T ${W} ${H * 0.58} V ${H} H 0 Z" fill="#000000" fill-opacity="0.10"/>
    <path d="M0 ${H * 0.74} Q ${W * 0.3} ${H * 0.64} ${W * 0.6} ${H * 0.74}
             T ${W} ${H * 0.72} V ${H} H 0 Z" fill="#000000" fill-opacity="0.16"/>
    <rect width="${W}" height="${H}" fill="url(#haze)"/>
    ${title}
  </svg>`
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  for (const d of DESTINATIONS) {
    const buf = Buffer.from(svg(d))
    const out = join(OUT_DIR, `${d.slug}.webp`)
    await sharp(buf).webp({ quality: 82 }).toFile(out)
    console.log('wrote', out)
  }
  console.log(`\nDone: ${DESTINATIONS.length} assets in ${OUT_DIR}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
