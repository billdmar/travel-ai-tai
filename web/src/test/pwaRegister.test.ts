import { describe, expect, it } from 'vitest'
import { registerServiceWorker } from '../pwa/register'

// The real Workbox service worker is only emitted in PROD builds, and the
// `virtual:pwa-register` module the helper dynamically imports does not exist
// under vitest. The guard must therefore short-circuit before that import so the
// test suite never attempts (and fails) a real SW registration in jsdom.
describe('registerServiceWorker', () => {
  it('is a no-op under the test environment (import.meta.env.PROD is false)', () => {
    // PROD is false in vitest; the dynamic import is never reached, so this must
    // return synchronously without throwing or rejecting an unhandled promise.
    expect(import.meta.env.PROD).toBe(false)
    expect(() => registerServiceWorker()).not.toThrow()
  })
})
