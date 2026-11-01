export interface FetchFileParams {
  owner: string
  repo: string
  commitSha: string
  path: string
  token?: string
  /** Private repos must go through the authenticated API (raw.githubusercontent.com would 404). */
  isPrivate?: boolean
  signal?: AbortSignal
}

/**
 * Download one file as UTF-8 text.
 * Public repos: https://raw.githubusercontent.com/{owner}/{repo}/{sha}/{path} (CORS-enabled, not API rate-limited).
 * Private repos or raw failure with a token: GET /repos/{owner}/{repo}/contents/{path}?ref={sha}
 * with Accept: application/vnd.github.raw. Paths must be URL-encoded per segment.
 * Throws GitHubError on failure. Rejects content that looks binary (contains NUL bytes).
 */
export async function fetchFileText(params: FetchFileParams): Promise<string> {
  void params
  throw new Error('TODO: implement fetchFileText')
}

/**
 * Download many files with limited concurrency (≈8). Never throws for individual failures —
 * returns successes in `files` and failures in `failed`. Calls onProgress(done, total) as files complete.
 */
export async function fetchManyFiles(
  base: Omit<FetchFileParams, 'path'>,
  paths: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ files: Record<string, string>; failed: string[] }> {
  void base; void paths; void onProgress
  throw new Error('TODO: implement fetchManyFiles')
}
