import type { AnalyzedFile, RepoAnalysis } from '@/core/types'

/**
 * One plain-English sentence describing a file from its role, symbols, routes and connections, e.g.
 * "A UI building block called `LoginForm`. 4 other files use it." or
 * "Answers web requests to /api/users (GET, POST)." Avoid jargon; never more than ~30 words.
 */
export function summarizeFile(file: AnalyzedFile): string {
  return `${file.name}`
}

/**
 * Heuristic plain-English overview of the whole project in Markdown (no AI). Sections:
 * "## What is this?", "## What it's built with", "## How it's organized", "## Where it starts", "## Good to know".
 * Uses projectKind, techStack (with descriptions), modules (top ~6 with roles), entry points, stats, README first paragraph.
 * Friendly, concrete, 200–400 words.
 */
export function writeOverview(analysis: Omit<RepoAnalysis, 'overview' | 'learningPath' | 'starterConcepts' | 'starterTours'>): string {
  void analysis
  return ''
}
