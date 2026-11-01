import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { useNavigate, useParams } from 'react-router'
import { repoPath } from '@/core/routes'
import type { ViewId } from '@/core/types'
import { useRepoStore } from '@/state/repo'
import { useSettings } from '@/state/settings'

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

/**
 * Links and navigation inside the current repository, keeping any ?ref= the reader asked for.
 * Prefers GitHub's canonical owner/repo casing once the repo has loaded.
 */
export function useRepoNav(): {
  href: (view?: ViewId, params?: Record<string, string | undefined>) => string
  go: (view?: ViewId, params?: Record<string, string | undefined>) => void
} {
  const navigate = useNavigate()
  const params = useParams()
  const meta = useRepoStore((s) => s.analysis?.meta)
  const requestedRef = useRepoStore((s) => s.ref?.ref)
  const owner = meta?.owner ?? params.owner ?? ''
  const repo = meta?.repo ?? params.repo ?? ''
  const href = useCallback(
    (view: ViewId = 'overview', p: Record<string, string | undefined> = {}) => repoPath({ owner, repo, ref: requestedRef }, view, p),
    [owner, repo, requestedRef],
  )
  const go = useCallback((view?: ViewId, p?: Record<string, string | undefined>) => navigate(href(view, p)), [navigate, href])
  return useMemo(() => ({ href, go }), [href, go])
}
