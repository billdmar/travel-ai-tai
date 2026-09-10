import '@testing-library/jest-dom'

// Node 22+ ships a built-in Web Storage implementation, and in a vitest jsdom
// environment `globalThis` *is* `window` — so Node's `localStorage` /
// `sessionStorage` occupy both names and shadow jsdom's outright. Node's
// `localStorage` is inert without a valid `--localstorage-file` (its methods are
// simply absent, so `localStorage.clear()` throws `TypeError: ... is not a
// function`); its `sessionStorage` does work, which is the more insidious case —
// those specs pass while exercising Node's store rather than the browser's.
//
// The app reads both as bare globals (`useTheme`, `SavedItinerariesPage`,
// `useInstallPrompt`, `ResultsPage`), so leaving this alone makes the suite's
// result a function of the Node version: green on the Node 20 CI pin, 21
// failures on a developer's Node 22+.
//
// jsdom's own `Storage` is not constructible (`Illegal constructor`), so we
// install a spec-shaped in-memory store — the same thing jsdom's is underneath.
// Guarded on the ambient object actually being unusable, so on a Node without
// built-in Web Storage jsdom's real Storage is left exactly as it was.
// See src/test/storageEnv.test.ts for the regression guard.
function createStorage(): Storage {
  const entries = new Map<string, string>()
  return {
    get length() {
      return entries.size
    },
    key: (index: number) => [...entries.keys()][index] ?? null,
    getItem: (key: string) => entries.get(String(key)) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(String(key), String(value))
    },
    removeItem: (key: string) => {
      entries.delete(String(key))
    },
    clear: () => {
      entries.clear()
    },
  }
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  const ambient = globalThis[name] as Storage | undefined
  const usable = ['getItem', 'setItem', 'removeItem', 'clear', 'key'].every(
    (method) => typeof ambient?.[method as keyof Storage] === 'function',
  )
  if (!usable) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value: createStorage(),
    })
  }
}

// jsdom lacks a few browser globals that our motion/preference primitives use.
// Provide inert polyfills so components that mount framer-motion viewport
// triggers (via Reveal) and read prefers-reduced-motion render without throwing
// under the test environment.

if (typeof globalThis.IntersectionObserver === 'undefined') {
  class MockIntersectionObserver {
    readonly root: Element | Document | null = null
    readonly rootMargin: string = ''
    readonly thresholds: ReadonlyArray<number> = []
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return []
    }
  }
  globalThis.IntersectionObserver =
    MockIntersectionObserver as unknown as typeof IntersectionObserver
}

if (typeof window !== 'undefined' && typeof window.matchMedia === 'undefined') {
  window.matchMedia = ((query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia
}
