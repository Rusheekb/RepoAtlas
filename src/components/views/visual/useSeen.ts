import { useCallback, useMemo } from 'react'
import { useProgress } from '@/state/progress'

/** The ids of everything the reader explored with a given progress prefix (e.g. "module:" → module ids). */
export function seenIdsFrom(seen: Record<string, number> | undefined, prefix: string): string[] {
  if (!seen) return []
  const out: string[] = []
  for (const key of Object.keys(seen)) if (key.startsWith(prefix)) out.push(key.slice(prefix.length))
  return out
}

/** All progress entries for a repository ("owner/repo", any casing). */
export function useRepoSeen(fullName: string): Record<string, number> | undefined {
  const key = fullName.toLowerCase()
  return useProgress((s) => s.seen[key])
}

/** Seen ids for a prefix, memoized so graphs don't re-render needlessly. */
export function useSeenIds(fullName: string, prefix: string): string[] {
  const seen = useRepoSeen(fullName)
  return useMemo(() => seenIdsFrom(seen, prefix), [seen, prefix])
}

/** A stable `markSeen(itemKey)` for the current repository. */
export function useMarkSeen(fullName: string): (itemKey: string) => void {
  const markSeen = useProgress((s) => s.markSeen)
  return useCallback((itemKey: string) => markSeen(fullName, itemKey), [markSeen, fullName])
}
