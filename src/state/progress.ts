import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

/**
 * Learning progress per repository ("owner/repo" lower-case): which modules, files, concepts,
 * tours and learning-path steps the reader has explored. Persisted in localStorage.
 */
export interface ProgressState {
  seen: Record<string, Record<string, number>>
  /** Recently opened repositories, newest first. */
  recent: { fullName: string; description: string | null; openedAt: number }[]
  markSeen: (repo: string, itemKey: string) => void
  isSeen: (repo: string, itemKey: string) => boolean
  countSeen: (repo: string, prefix?: string) => number
  clearRepo: (repo: string) => void
  addRecent: (fullName: string, description: string | null) => void
  removeRecent: (fullName: string) => void
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
      addRecent: (fullName, description) =>
        set((s) => ({
          recent: [{ fullName, description, openedAt: Date.now() }, ...s.recent.filter((r) => r.fullName.toLowerCase() !== fullName.toLowerCase())].slice(0, 8),
        })),
      removeRecent: (fullName) => set((s) => ({ recent: s.recent.filter((r) => r.fullName !== fullName) })),
    }),
    { name: 'repoatlas:progress', version: 1, storage: createJSONStorage(() => localStorage) },
  ),
)
