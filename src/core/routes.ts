import type { RepoRef, ViewId } from './types'

/**
 * Hash routes (GitHub Pages friendly):
 *   #/                                   home
 *   #/gh/:owner/:repo                    overview
 *   #/gh/:owner/:repo/:view              a view
 *   #/gh/:owner/:repo/explore?file=path  explorer focused on a file
 *   any repo route may carry ?ref=branch
 */
export function repoPath(
  ref: Pick<RepoRef, 'owner' | 'repo'> & { ref?: string },
  view: ViewId = 'overview',
  params: Record<string, string | undefined> = {},
): string {
  const base = `/gh/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`
  const path = view === 'overview' ? base : `${base}/${view}`
  const qs = new URLSearchParams()
  if (ref.ref) qs.set('ref', ref.ref)
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') qs.set(k, v)
  const q = qs.toString()
  return q ? `${path}?${q}` : path
}

export function repoKey(ref: RepoRef): string {
  return `${ref.owner}/${ref.repo}${ref.ref ? `@${ref.ref}` : ''}`.toLowerCase()
}
