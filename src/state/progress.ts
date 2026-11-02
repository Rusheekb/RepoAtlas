import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { safeLocalStorage } from './safeStorage'
import { useSettings } from './settings'

export interface RecentRepo {
  fullName: string
  description: string | null
  openedAt: number
  /** A private repository (opened with a GitHub token). Only saved on this device while "Remember my keys" is on. */
  isPrivate?: boolean
}

/**
 * Learning progress per repository ("owner/repo" lower-case): which modules, files, concepts,
 * tours and learning-path steps the reader has explored. Persisted in localStorage.
 */
export interface ProgressState {
  seen: Record<string, Record<string, number>>
  /** Recently opened repositories, newest first. */
  recent: RecentRepo[]
  markSeen: (repo: string, itemKey: string) => void
  isSeen: (repo: string, itemKey: string) => boolean
  countSeen: (repo: string, prefix?: string) => number
  clearRepo: (repo: string) => void
  addRecent: (fullName: string, description: string | null, isPrivate?: boolean) => void
  removeRecent: (fullName: string) => void
  /**
   * Forget every private repository: its Recent entry and its progress (which names its files).
   * `alsoNames` adds repositories known to be private from elsewhere (e.g. the download cache), for entries saved
   * before the private flag existed.
   */
  forgetPrivateRepos: (alsoNames?: readonly string[]) => void
}

/** How much progress is kept on this device (it lives in the browser's small localStorage). */
const MAX_REPOS = 20
const MAX_ITEMS_PER_REPO = 3000

/** Keep the most recently explored repositories (and their newest items) so saved progress stays small. */
export function trimSeen(seen: ProgressState['seen'], maxRepos = MAX_REPOS, maxItems = MAX_ITEMS_PER_REPO): ProgressState['seen'] {
  const latest = (items: Record<string, number>) => Object.values(items).reduce((m, t) => (t > m ? t : m), 0)
  const repos = Object.entries(seen).sort((a, b) => latest(b[1]) - latest(a[1])).slice(0, maxRepos)
  const out: ProgressState['seen'] = {}
  for (const [repo, items] of repos) {
    const entries = Object.entries(items)
    out[repo] = entries.length <= maxItems ? items : Object.fromEntries(entries.sort((a, b) => b[1] - a[1]).slice(0, maxItems))
  }
  return out
}

/** Last resort when the browser says storage is full: keep the Recent list and progress for the 3 newest projects. */
function shrinkSaved(value: string): string | null {
  const parsed = JSON.parse(value) as { state?: Partial<ProgressState>; version?: number }
  if (!parsed.state) return null
  return JSON.stringify({ ...parsed, state: { ...parsed.state, seen: trimSeen(parsed.state.seen ?? {}, 3, 500) } })
}

/** Item keys look like "module:src/components", "file:src/a.ts", "concept:checkout", "tour:startup", "step:readme". */
export const useProgress = create<ProgressState>()(
  persist(
    (set, get) => ({
      seen: {},
      recent: [],
      markSeen: (repo, itemKey) => {
        const r = repo.toLowerCase()
        if (get().seen[r]?.[itemKey]) return
        set((s) => ({ seen: { ...s.seen, [r]: { ...(s.seen[r] ?? {}), [itemKey]: Date.now() } } }))
      },
      isSeen: (repo, itemKey) => Boolean(get().seen[repo.toLowerCase()]?.[itemKey]),
      countSeen: (repo, prefix) => {
        const items = get().seen[repo.toLowerCase()] ?? {}
        return Object.keys(items).filter((k) => !prefix || k.startsWith(prefix)).length
      },
      clearRepo: (repo) =>
        set((s) => {
          const next = { ...s.seen }
          delete next[repo.toLowerCase()]
          return { seen: next }
        }),
      addRecent: (fullName, description, isPrivate = false) =>
        set((s) => ({
          recent: [
            { fullName, description, openedAt: Date.now(), ...(isPrivate ? { isPrivate: true } : {}) },
            ...s.recent.filter((r) => r.fullName.toLowerCase() !== fullName.toLowerCase()),
          ].slice(0, 8),
        })),
      removeRecent: (fullName) => set((s) => ({ recent: s.recent.filter((r) => r.fullName !== fullName) })),
      forgetPrivateRepos: (alsoNames = []) =>
        set((s) => {
          const names = new Set(alsoNames.map((n) => n.toLowerCase()))
          for (const r of s.recent) if (r.isPrivate) names.add(r.fullName.toLowerCase())
          if (!names.size) return {}
          const seen = { ...s.seen }
          for (const n of names) delete seen[n]
          return { recent: s.recent.filter((r) => !names.has(r.fullName.toLowerCase())), seen }
        }),
    }),
    {
      name: 'repoatlas:progress',
      version: 1,
      // Never throws: a full or blocked browser storage just means progress lasts for this visit only.
      storage: createJSONStorage(() => safeLocalStorage(shrinkSaved)),
      // Private projects stay in this tab's memory only, unless the reader asked RepoAtlas to remember their keys.
      partialize: (s) => {
        const saved = { ...s, seen: trimSeen(s.seen) }
        if (useSettings.getState().rememberKeys) return saved
        const hidden = new Set(s.recent.filter((r) => r.isPrivate).map((r) => r.fullName.toLowerCase()))
        if (!hidden.size) return saved
        const seen = { ...saved.seen }
        for (const n of hidden) delete seen[n]
        return { ...saved, recent: s.recent.filter((r) => !r.isPrivate), seen }
      },
    },
  ),
)
