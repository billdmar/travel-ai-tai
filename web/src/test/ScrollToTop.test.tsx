import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import ScrollToTop from '../components/ScrollToTop'

function NavigateTo({ path }: { path: string }) {
  const navigate = useNavigate()
  useEffect(() => {
    navigate(path)
  }, [navigate, path])
  return null
}

describe('ScrollToTop', () => {
  beforeEach(() => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    // Ensure a main-content element exists in the document for focus tests
    const main = document.createElement('main')
    main.id = 'main-content'
    main.tabIndex = -1
    document.body.appendChild(main)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    const main = document.getElementById('main-content')
    if (main) main.remove()
  })

  it('calls window.scrollTo(0, 0) on initial render', () => {
    render(
      <MemoryRouter initialEntries={['/about']}>
        <ScrollToTop />
      </MemoryRouter>,
    )
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0)
  })

  it('calls window.scrollTo(0, 0) when location changes', () => {
    render(
      <MemoryRouter initialEntries={['/about']}>
        <ScrollToTop />
        <NavigateTo path="/discover" />
      </MemoryRouter>,
    )
    // scrollTo is called once on initial render (/about) and once on navigate (/discover)
    expect(window.scrollTo).toHaveBeenCalledTimes(2)
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0)
  })

  it('moves focus to #main-content on route change', () => {
    render(
      <MemoryRouter initialEntries={['/about']}>
        <ScrollToTop />
      </MemoryRouter>,
    )
    const main = document.getElementById('main-content')
    expect(document.activeElement).toBe(main)
  })
})
