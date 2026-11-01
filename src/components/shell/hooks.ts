import { useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router'
import { repoPath } from '@/core/routes'
import type { ViewId } from '@/core/types'
import { useRepoStore } from '@/state/repo'

// Screen and theme hooks live in ./media (no repository code), and are re-exported here for existing callers.
export { useIsDesktop, useMediaQuery, usePrefersReducedMotion, useResolvedTheme } from './media'

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
