import { create } from 'zustand'
import type { ExplainTarget } from '@/core/types'

/** The global "Explain" side panel. Any view can open it for a module, file, concept, technology or term. */
export interface ExplainState {
  target: ExplainTarget | null
  /** Previous targets, so the panel can offer "Back". */
  history: ExplainTarget[]
  open: (target: ExplainTarget) => void
  back: () => void
  close: () => void
}

export const useExplain = create<ExplainState>()((set, get) => ({
  target: null,
  history: [],
  open: (target) => {
    const cur = get().target
    set({ target, history: cur ? [...get().history, cur].slice(-20) : [] })
  },
  back: () => {
    const h = get().history
    if (!h.length) return set({ target: null })
    set({ target: h[h.length - 1], history: h.slice(0, -1) })
  },
  close: () => set({ target: null, history: [] }),
}))
