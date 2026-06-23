import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'

// FOUNDATION smoke test: proves the vitest + jsdom harness runs in CI before
// the test teams add real component/page coverage. Replace/extend freely.
describe('api client', () => {
  it('ApiError carries status and body', () => {
    const err = new ApiError(503, { error: 'unavailable' }, 30)
    expect(err.status).toBe(503)
    expect(err.retryAfterSeconds).toBe(30)
    expect(err.name).toBe('ApiError')
  })
})
