/** Pure helpers for the "Guided Tours" view: progress keys, step parsing, resuming and picking the next tour. */
import type { AnalyzedFile, Tour, TourStep } from '@/core/types'

/** Progress key for a whole tour (marked when the reader finishes it). */
export function tourKey(tourId: string): string {
  return `tour:${tourId}`
}

/** Progress key for one step. `n` is 1-based, matching the ?step= in the address. */
export function tourStepKey(tourId: string, n: number): string {
  return `tour:${tourId}:step:${n}`
}

/**
 * Parse the 1-based ?step= value into a 0-based index between 0 and `count` (inclusive).
 * `count` means "past the last step" — the "Tour complete" card. Missing or invalid values start at the beginning.
 */
export function stepIndexFromParam(param: string | null, count: number): number {
  if (param == null || !/^\d+$/.test(param.trim())) return 0
  const n = Number(param.trim())
  if (n < 1) return 0
  return Math.min(n - 1, count)
}

/** The module a step points at: its own moduleId, else the module of its file. */
export function stepModuleId(step: TourStep, files: Record<string, AnalyzedFile>): string | null {
  if (step.moduleId) return step.moduleId
  if (step.file) return files[step.file]?.moduleId ?? null
  return null
}

/** How many of a tour's steps the reader has seen. */
export function seenStepCount(tour: Tour, seen: Record<string, number> | undefined): number {
  if (!seen) return 0
  let n = 0
  for (let i = 0; i < tour.steps.length; i++) if (seen[tourStepKey(tour.id, i + 1)]) n++
  return n
}

export type TourStatus = 'new' | 'started' | 'done'

/** Whether the reader hasn't started a tour, is part-way through, or finished it. */
export function tourStatus(tour: Tour, seen: Record<string, number> | undefined): TourStatus {
  if (seen?.[tourKey(tour.id)]) return 'done'
  const n = seenStepCount(tour, seen)
  if (tour.steps.length > 0 && n >= tour.steps.length) return 'done'
  return n > 0 ? 'started' : 'new'
}

/** 0-based index of the step to resume at: the first unseen step (or the start when all were seen). */
export function resumeStepIndex(tour: Tour, seen: Record<string, number> | undefined): number {
  for (let i = 0; i < tour.steps.length; i++) if (!seen?.[tourStepKey(tour.id, i + 1)]) return i
  return 0
}

/**
 * The tour to suggest after finishing `currentId`: the next unfinished tour after it in the list (wrapping around),
 * or null when every other tour is finished too.
 */
export function pickNextTour(tours: readonly Tour[], currentId: string, seen: Record<string, number> | undefined): Tour | null {
  const i = tours.findIndex((t) => t.id === currentId)
  for (let k = 1; k <= tours.length; k++) {
    const t = tours[(Math.max(0, i) + k) % tours.length]
    if (!t || t.id === currentId) continue
    if (tourStatus(t, seen) !== 'done') return t
  }
  return null
}

/**
 * Claude's tours first, then the starter tours. Any Claude tour whose id collides with a starter tour (or another
 * tour) gets a unique "ai-" id so addresses and progress never mix the two up. Tours without steps are dropped.
 */
export function mergeTours(starter: readonly Tour[], ai: readonly Tour[] | null | undefined): Tour[] {
  const taken = new Set(starter.map((t) => t.id))
  const claimId = (id: string): string => {
    if (id && !taken.has(id)) {
      taken.add(id)
      return id
    }
    const base = id ? `ai-${id}` : 'ai-tour'
    let candidate = base
    for (let n = 2; taken.has(candidate); n++) candidate = `${base}-${n}`
    taken.add(candidate)
    return candidate
  }
  const out: Tour[] = []
  for (const t of ai ?? []) {
    if (!t.steps?.length) continue
    const id = claimId(t.id)
    out.push(id === t.id ? t : { ...t, id })
  }
  for (const t of starter) if (t.steps.length) out.push(t)
  return out
}
