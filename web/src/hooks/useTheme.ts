import { useCallback, useEffect, useSyncExternalStore } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'
export type EffectiveTheme = 'light' | 'dark'

const STORAGE_KEY = 'tai.theme'

// Module-level state so all hook instances share the same value.
let preference: ThemePreference = readStoredPreference()

function readStoredPreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {
    // localStorage unavailable (SSR, private browsing edge-cases).
  }
  return 'system'
}

function getSystemTheme(): EffectiveTheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function computeEffective(pref: ThemePreference): EffectiveTheme {
  return pref === 'system' ? getSystemTheme() : pref
}

function applyToDOM(effective: EffectiveTheme) {
  const root = document.documentElement
  if (effective === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

// --- External store machinery for useSyncExternalStore ---
type Listener = () => void
const listeners = new Set<Listener>()

function subscribe(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function emitChange() {
  for (const l of listeners) l()
}

function getSnapshot(): ThemePreference {
  return preference
}

// Apply on module load so there's no flash of wrong theme.
applyToDOM(computeEffective(preference))

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => 'system' as ThemePreference)
  const effectiveTheme = computeEffective(theme)

  // Keep DOM in sync whenever preference or system theme changes.
  useEffect(() => {
    applyToDOM(effectiveTheme)
  }, [effectiveTheme])

  // Listen for OS-level theme changes when in 'system' mode.
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      applyToDOM(computeEffective('system'))
      emitChange()
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  const setTheme = useCallback((next: ThemePreference) => {
    preference = next
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Silently ignore storage write failures.
    }
    applyToDOM(computeEffective(next))
    emitChange()
  }, [])

  return { theme, effectiveTheme, setTheme } as const
}
