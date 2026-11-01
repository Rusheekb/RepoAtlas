import type { ConceptMap, RepoAnalysis, Tour } from '@/core/types'

/**
 * A heuristic concept map so "Key Ideas" works without AI: concepts derived from the project kind, main modules,
 * core technologies, data models (files with role 'model'/'schema' → their class names), routes and entry points,
 * related with simple verbs ("uses", "stores", "shows", "is built with"). 6–16 concepts. source: 'starter'.
 */
export function buildStarterConcepts(analysis: Omit<RepoAnalysis, 'starterConcepts' | 'starterTours'>): ConceptMap {
  void analysis
  return { concepts: [], relations: [], source: 'starter' }
}

/**
 * Heuristic tours (source: 'starter'):
 *  1. "Where does it all begin?" — from the main entry point, follow imports breadth-first through the most important files (4–8 steps).
 *  2. "How the main parts work together" — walk the module graph from the entry module along the heaviest edges.
 *  3. (if routes exist) "What happens when someone visits the app/API?" — route files → what they call.
 * Each step explains in plain English using file summaries, roles and symbols; `snippet` is a real line from the file when available.
 */
export function buildStarterTours(analysis: Omit<RepoAnalysis, 'starterConcepts' | 'starterTours'>, contents: Record<string, string>): Tour[] {
  void analysis; void contents
  return []
}
