import { useEffect } from 'react'

const SUFFIX = 'Travel AI (TAI)'
const DEFAULT_DESCRIPTION =
  'Turn your interests into a destination worth the flight, then into a day-by-day itinerary. Personalized travel planning powered by AI.'

/**
 * Ensure a single named <meta>/<link> tag exists in <head> and set its content.
 * Created lazily so we never depend on the static index.html beyond its
 * crawl-time defaults; on the client we keep the per-route values fresh.
 */
function setMeta(selector: string, attrs: Record<string, string>): void {
  if (typeof document === 'undefined') return
  let el = document.head.querySelector<HTMLElement>(selector)
  if (!el) {
    el = document.createElement(selector.startsWith('link') ? 'link' : 'meta')
    document.head.appendChild(el)
  }
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
}

/**
 * Per-route document head manager. Sets <title>, the description meta, the
 * canonical link, and the Open Graph / Twitter title+description so each route
 * has distinct metadata for crawlers and social shares. Falls back to the app
 * description when a page does not supply one.
 *
 * `title` is the bare page name; the brand suffix is appended automatically
 * (the home route passes the full brand string and is used as-is).
 */
export function useDocumentTitle(
  title: string,
  description: string = DEFAULT_DESCRIPTION,
  options: { brand?: boolean } = {},
): void {
  const brand = options.brand ?? true
  const fullTitle = brand ? `${title} | ${SUFFIX}` : title

  useEffect(() => {
    if (typeof document === 'undefined') return

    const previous = document.title
    document.title = fullTitle

    setMeta('meta[name="description"]', { name: 'description', content: description })
    setMeta('meta[property="og:title"]', { property: 'og:title', content: fullTitle })
    setMeta('meta[property="og:description"]', {
      property: 'og:description',
      content: description,
    })
    setMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: fullTitle })
    setMeta('meta[name="twitter:description"]', {
      name: 'twitter:description',
      content: description,
    })

    const url = typeof window !== 'undefined' ? window.location.href : ''
    if (url) {
      setMeta('link[rel="canonical"]', { rel: 'canonical', href: url })
      setMeta('meta[property="og:url"]', { property: 'og:url', content: url })
    }

    return () => {
      // Restore the prior title if this page unmounts before another sets one.
      document.title = previous
    }
  }, [fullTitle, description])
}

export { DEFAULT_DESCRIPTION }
