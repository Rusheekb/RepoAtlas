import type { LearningStep, RepoAnalysis } from '@/core/types'

/**
 * Recommended order to explore the repo (6–10 steps): read the README → see The Big Picture → look at the map →
 * open the main entry point → visit the 2–4 most important modules (by size/centrality) → a hub file → take a tour →
 * test yourself. Each step has a plain-English "why" and a rough reading time.
 */
export function buildLearningPath(analysis: Omit<RepoAnalysis, 'learningPath' | 'starterConcepts' | 'starterTours'>): LearningStep[] {
  void analysis
  return []
}
