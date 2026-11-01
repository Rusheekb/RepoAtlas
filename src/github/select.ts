import type { AnalysisDepth, SkipReason, TreeEntry } from '@/core/types'

/**
 * Decide which files' contents to download, most valuable first, within the depth's limits
 * (ANALYSIS_DEPTHS in src/core/labels.ts: maxFiles / maxTotalBytes).
 *
 * Priority: README(s) → package manifests & key config (package.json, pyproject.toml, go.mod, Cargo.toml, tsconfig.json,
 * Dockerfile, docker-compose, CI workflows …) → likely entry points (main/index/app/server/cli at shallow depth) →
 * source code (shallower first, spread across folders so every area is represented) → tests/docs.
 *
 * Never download: binaries/media (by extension), files > 512 KB, lockfiles, vendored/generated folders
 * (node_modules, vendor, dist, build, .next, target, __pycache__, coverage, *.min.js, *.map, generated protobufs …).
 * Those go to `skipped` with a reason. Files beyond the limit get reason 'limit'.
 */
export function selectFilesToFetch(
  tree: TreeEntry[],
  depth: AnalysisDepth,
): { fetch: string[]; skipped: { path: string; reason: SkipReason }[] } {
  void tree; void depth
  throw new Error('TODO: implement selectFilesToFetch')
}
