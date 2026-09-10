import { describe, it, expect, beforeEach } from 'vitest'

// Guards the Web Storage shim in ./setup.ts.
//
// Node 22+ ships its own `globalThis.localStorage` / `sessionStorage`, and in a
// vitest jsdom environment `globalThis` *is* `window` — so Node's versions land
// on both names and there is no unshadowed jsdom Storage left to fall back to.
// Node's `localStorage` is inert unless the process was started with a valid
// `--localstorage-file`: every method is missing, so `localStorage.clear()` dies
// with `TypeError: localStorage.clear is not a function`. Its `sessionStorage`
// is a working in-memory store, which is worse in a quieter way — those tests
// pass while silently exercising Node's store instead of the browser's.
//
// The app reads these as bare globals (`useTheme`, `SavedItinerariesPage`,
// `useInstallPrompt`, `ResultsPage`), so without the shim the suite's result
// depends on the Node version running it: green on the Node 20 CI pin, 21
// failures on a developer's Node 22+. These assertions fail without it.
describe.each(['localStorage', 'sessionStorage'] as const)('%s test environment', (name) => {
  beforeEach(() => {
    globalThis[name].clear()
  })

  it('exposes the full Storage API', () => {
    const storage = globalThis[name]
    for (const method of ['getItem', 'setItem', 'removeItem', 'clear', 'key']) {
      expect(typeof storage[method as keyof Storage]).toBe('function')
    }
    expect(typeof storage.length).toBe('number')
  })

  it('round-trips a value and reports a miss as null', () => {
    const storage = globalThis[name]
    expect(storage.getItem('tai.probe')).toBeNull()
    storage.setItem('tai.probe', 'value')
    expect(storage.getItem('tai.probe')).toBe('value')
    storage.removeItem('tai.probe')
    expect(storage.getItem('tai.probe')).toBeNull()
  })

  it('coerces keys and values to strings, as the Storage spec requires', () => {
    const storage = globalThis[name]
    storage.setItem('tai.n', 1 as unknown as string)
    expect(storage.getItem('tai.n')).toBe('1')
  })

  it('tracks length and enumerates keys, and clear() empties the store', () => {
    const storage = globalThis[name]
    storage.setItem('tai.a', '1')
    storage.setItem('tai.b', '2')
    expect(storage.length).toBe(2)
    expect([storage.key(0), storage.key(1)].sort()).toEqual(['tai.a', 'tai.b'])
    expect(storage.key(9)).toBeNull()
    storage.clear()
    expect(storage.length).toBe(0)
    expect(storage.getItem('tai.a')).toBeNull()
  })
})
