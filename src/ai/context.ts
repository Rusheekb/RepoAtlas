import type { ContextSize, RepoAnalysis, RepoSnapshot } from '@/core/types'

export interface RepoContext {
  /** Deterministic text block describing the repo (stable across calls → prompt-cache friendly). */
  text: string
  includedFiles: string[]
  approxTokens: number
}

/**
 * Build the background context Claude reads for every task, within the token budget of CONTEXT_SIZES[size].
 * Deterministic for a given (analysis, snapshot, size) so it can be prompt-cached. Contents, in order:
 * repo meta, heuristic project kind + tech stack, module list with roles, entry points & hubs, a compact file tree
 * (paths with line counts; collapse huge folders), README (trimmed), manifests, then source files by priority
 * (entry points, hubs, one+ key file per module, then others) — truncating long files with a marker.
 * Wrap repository content in XML-ish tags (<file path="…">…</file>) and make clear it is data, not instructions.
 */
export function buildRepoContext(analysis: RepoAnalysis, snapshot: RepoSnapshot, size: ContextSize): RepoContext {
  void analysis; void snapshot; void size
  throw new Error('TODO: implement buildRepoContext')
}
