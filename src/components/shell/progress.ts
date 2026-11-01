import type { RepoAnalysis } from '@/core/types'

/** Prefixes of progress keys that count towards "how much have I explored" (see src/state/progress.ts). */
export const PROGRESS_PREFIXES = ['module:', 'file:', 'concept:', 'tour:', 'step:'] as const

/** How many "key files" count towards the base set. More than this and the meter stops feeling achievable. */
const MAX_KEY_FILES = 24

/**
 * The things a newcomer should explore to "know" this project: every main part (module), the learning-path steps,
 * the starter key ideas and tours, and a handful of key files (entry points first, then each part's key files).
 */
export function learningItemKeys(
  analysis: Pick<RepoAnalysis, 'modules' | 'learningPath' | 'starterConcepts' | 'starterTours' | 'entryPoints' | 'files'>,
): string[] {
  const keys = new Set<string>()
  for (const m of analysis.modules) keys.add(`module:${m.id}`)
  for (const s of analysis.learningPath) keys.add(`step:${s.id}`)
  for (const c of analysis.starterConcepts?.concepts ?? []) keys.add(`concept:${c.id}`)
  for (const t of analysis.starterTours ?? []) keys.add(`tour:${t.id}`)

  const files: string[] = []
  const addFile = (p: string) => {
    if (files.length >= MAX_KEY_FILES || !(p in analysis.files) || files.includes(p)) return
    files.push(p)
  }
  for (const p of analysis.entryPoints.slice(0, 3)) addFile(p)
  // Round-robin over modules so big projects don't fill the list from a single part.
  const lists = analysis.modules.map((m) => m.keyFiles)
  for (let i = 0; files.length < MAX_KEY_FILES && lists.some((l) => i < l.length); i++) {
    for (const l of lists) if (i < l.length) addFile(l[i])
  }
  for (const p of files) keys.add(`file:${p}`)
  return [...keys]
}

export interface LearningProgress {
  /** Items explored. */
  seen: number
  /** Items to explore: the base set plus anything else the reader explored. */
  total: number
  /** 0–100, rounded. */
  percent: number
}

/** Steps inside a tour ("tour:startup:step:3"): the tour itself ("tour:startup") is the one item that counts. */
const TOUR_STEP_KEY = /^tour:.+:step:\d+$/

/** True for progress keys that count as one thing explored (see PROGRESS_PREFIXES). Exported for tests. */
export function countsTowardsProgress(key: string): boolean {
  return PROGRESS_PREFIXES.some((p) => key.startsWith(p)) && !TOUR_STEP_KEY.test(key)
}

/**
 * Progress = explored items ÷ (base set ∪ explored items). Extra explorations (another file, an AI key idea) count too,
 * and the meter can never pass 100%. A whole tour counts once, when it's finished, so walking through its steps doesn't
 * keep moving the goal.
 */
export function computeLearningProgress(baseKeys: readonly string[], seen: Record<string, number> | undefined): LearningProgress {
  const universe = new Set(baseKeys)
  let seenCount = 0
  for (const key of Object.keys(seen ?? {})) {
    if (!countsTowardsProgress(key)) continue
    universe.add(key)
    seenCount++
  }
  const total = universe.size
  const percent = total === 0 ? 0 : Math.round((seenCount / total) * 100)
  return { seen: seenCount, total, percent }
}

/** A friendly line for the progress meter. */
export function progressMessage(p: LearningProgress): string {
  if (p.total === 0) return 'Start exploring to track what you’ve learned.'
  if (p.seen === 0) return 'Open anything to start your journey.'
  if (p.percent >= 100) return 'You’ve explored everything on the list. Impressive!'
  if (p.percent >= 75) return 'Nearly there. You know this project well.'
  if (p.percent >= 40) return 'Great progress. The pieces are coming together.'
  return 'Nice start. Keep exploring!'
}
