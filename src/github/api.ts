import type { RepoMeta, TreeEntry } from '@/core/types'

export interface GitHubRequestOptions {
  /** Personal access token (optional; raises rate limit from 60/hr to 5,000/hr and enables private repos). */
  token?: string
  signal?: AbortSignal
}

/** Latest rate-limit headers seen from api.github.com (for UI display). */
export interface RateLimitInfo {
  limit: number
  remaining: number
  /** ms since epoch */
  resetAt: number
}

/** GET /repos/{owner}/{repo} → RepoMeta. Throws GitHubError with friendly messages (not-found, rate-limited …). */
export async function fetchRepoMeta(owner: string, repo: string, opts?: GitHubRequestOptions): Promise<RepoMeta> {
  void owner; void repo; void opts
  throw new Error('TODO: implement fetchRepoMeta')
}

/**
 * Resolve a branch / tag / sha (or the default branch when `ref` is undefined) to a commit SHA.
 * Uses GET /repos/{owner}/{repo}/commits/{ref} (Accept: application/vnd.github.sha) or equivalent.
 */
export async function resolveCommit(
  owner: string,
  repo: string,
  ref: string,
  opts?: GitHubRequestOptions,
): Promise<string> {
  void owner; void repo; void ref; void opts
  throw new Error('TODO: implement resolveCommit')
}

/** GET /repos/{owner}/{repo}/git/trees/{sha}?recursive=1 → blobs only. */
export async function fetchTree(
  owner: string,
  repo: string,
  commitSha: string,
  opts?: GitHubRequestOptions,
): Promise<{ tree: TreeEntry[]; truncated: boolean }> {
  void owner; void repo; void commitSha; void opts
  throw new Error('TODO: implement fetchTree')
}

export function getRateLimitInfo(): RateLimitInfo | null {
  return null
}
