import type { RepoRef } from '@/core/types'

/**
 * Parse what a user typed/pasted into a RepoRef. Must accept (case-insensitive host, trailing slashes, ".git", whitespace):
 *   "owner/repo"
 *   "github.com/owner/repo"
 *   "https://github.com/owner/repo"
 *   "https://github.com/owner/repo.git"
 *   "git@github.com:owner/repo.git"
 *   "https://github.com/owner/repo/tree/branch-name"            → ref "branch-name"
 *   "https://github.com/owner/repo/tree/feature/x/src/dir"       → ref "feature" (ambiguous: take first segment)
 *   "https://github.com/owner/repo/blob/main/src/index.ts"      → ref "main"
 *   "https://github.com/owner/repo/commit/<sha>"                → ref "<sha>"
 *   "https://github.com/owner/repo?tab=readme"                  → ignore query/hash
 * Returns null when the input is not a GitHub repository reference.
 * Owner: 1–39 chars [A-Za-z0-9-]; repo: [A-Za-z0-9._-]+ (not "." or "..").
 */
export function parseRepoInput(input: string): RepoRef | null {
  void input
  throw new Error('TODO: implement parseRepoInput')
}
