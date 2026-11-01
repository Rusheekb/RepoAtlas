import { useCallback, useSyncExternalStore } from 'react'
import { useSettings } from '@/state/settings'

/*
 * Screen and theme hooks. Kept apart from ./hooks (which knows about the loaded repository) so the home page can use
 * them without downloading the analysis engine.
 */

function hasMatchMedia(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
}

/** Subscribe to a CSS media query. Falls back to `fallback` where matchMedia is unavailable (tests, old browsers). */
export function useMediaQuery(query: string, fallback = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!hasMatchMedia()) return () => {}
      const mq = window.matchMedia(query)
      mq.addEventListener?.('change', onChange)
      return () => mq.removeEventListener?.('change', onChange)
    },
    [query],
  )
  const get = useCallback(() => (hasMatchMedia() ? window.matchMedia(query).matches : fallback), [query, fallback])
  return useSyncExternalStore(subscribe, get, () => fallback)
}

/** True on screens wide enough for side-by-side panels (Tailwind `lg`, 1024px). */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)', true)
}

export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)', false)
}

/** The theme actually on screen ('system' resolved through the OS setting). */
export function useResolvedTheme(): 'light' | 'dark' {
  const pref = useSettings((s) => s.theme)
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)', false)
  if (pref === 'system') return systemDark ? 'dark' : 'light'
  return pref
}

/** True when a Claude API key is set (the same as useHasAiKey in '@/ai', without loading Claude's code). */
export function useHasClaudeKey(): boolean {
  return useSettings((s) => s.anthropicApiKey.trim().length > 0)
}
