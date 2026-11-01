import type { AnalysisDepth, LoadProgress, RepoRef, RepoSnapshot } from '@/core/types'

export interface LoadSnapshotOptions {
  token?: string
  depth: AnalysisDepth
  onProgress?: (p: LoadProgress) => void
  signal?: AbortSignal
  /** Ignore the IndexedDB cache. */
  force?: boolean
}

/**
 * Full ingestion: meta → resolve commit → tree → select → download files → RepoSnapshot.
 * Caches snapshots in IndexedDB (idb-keyval) keyed by `${owner}/${repo}@${commitSha}:${depth}` (lower-case owner/repo)
 * so revisiting is instant; keeps at most ~8 cached snapshots (evict oldest).
 * Reports friendly progress messages for each stage ("Finding the repository…", "Listing 1,204 files…",
 * "Reading 120 of 400 files…"). Throws GitHubError (kind 'empty' for repos with no files).
 */
export async function loadRepoSnapshot(ref: RepoRef, opts: LoadSnapshotOptions): Promise<RepoSnapshot> {
  void ref; void opts
  throw new Error('TODO: implement loadRepoSnapshot')
}

/** Remove all cached snapshots (Settings → "Clear cached data"). */
export async function clearSnapshotCache(): Promise<void> {
  throw new Error('TODO: implement clearSnapshotCache')
}
