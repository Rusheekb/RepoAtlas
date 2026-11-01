import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
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
      storage: createJSONStorage(() => localStorage),
      // Private projects stay in this tab's memory only, unless the reader asked RepoAtlas to remember their keys.
      partialize: (s) => {
        if (useSettings.getState().rememberKeys) return s
        const hidden = new Set(s.recent.filter((r) => r.isPrivate).map((r) => r.fullName.toLowerCase()))
        if (!hidden.size) return s
        const seen = { ...s.seen }
        for (const n of hidden) delete seen[n]
        return { ...s, recent: s.recent.filter((r) => !r.isPrivate), seen }
      },
    },
  ),
)
