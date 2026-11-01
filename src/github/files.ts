import type { SkipReason } from '@/core/types'
import { apiFetch, encodePath, repoApiPath } from './api'
import { GitHubError, MESSAGES, describeError, isAbortError, rateLimitMessage, sleep, throwIfAborted } from './errors'

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

export const RAW_HOST = 'https://raw.githubusercontent.com'
/** How many files download at the same time. */
export const FILE_CONCURRENCY = 8
/** Pause before the single retry after a network error or GitHub server error. */
export const RETRY_DELAY_MS = 400

const LFS_POINTER_PREFIX = 'version https://git-lfs.github.com/spec/v1'
const BINARY_SNIFF_CHARS = 8000

// ─── URL helpers ──────────────────────────────────────────────────────────────

/** Direct download URL for a file at a commit (also used to resolve images in READMEs). */
export function rawFileUrl(owner: string, repo: string, sha: string, path: string): string {
  return `${RAW_HOST}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodePath(sha)}/${encodePath(path)}`
}

/** "Open on GitHub" link for a file, optionally jumping to a line: https://github.com/o/r/blob/ref/path#L10 */
export function githubFileUrl(owner: string, repo: string, ref: string, path: string, line?: number): string {
  const base = `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/blob/${encodePath(ref)}/${encodePath(path)}`
  return line != null && Number.isInteger(line) && line > 0 ? `${base}#L${line}` : base
}

/** "Open on GitHub" link for a folder ('' = the repository root at that ref). */
export function githubTreeUrl(owner: string, repo: string, ref: string, path: string): string {
  const base = `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tree/${encodePath(ref)}`
  const clean = path.replace(/^\/+|\/+$/g, '')
  return clean ? `${base}/${encodePath(clean)}` : base
}

// ─── Content checks ───────────────────────────────────────────────────────────

/**
 * Validate downloaded text: refuse binary content and Git LFS placeholders (as GitHubError with
 * skipReason 'binary') and strip a UTF-8 byte-order mark. Exported for tests.
 */
export function checkTextContent(text: string, path: string): string {
  const head = text.slice(0, BINARY_SNIFF_CHARS)
  if (head.includes('\u0000')) {
    throw new GitHubError('unknown', `“${path}” isn't a text file (it looks like an image or compiled program), so there's nothing to read.`, {
      detail: 'NUL byte found in content',
      skipReason: 'binary',
    })
  }
  // Text decoding of non-UTF-8 binary data produces lots of U+FFFD replacement characters.
  if (head.length >= 64) {
    let bad = 0
    for (let i = 0; i < head.length; i++) if (head.charCodeAt(i) === 0xfffd) bad++
    if (bad / head.length > 0.1) {
      throw new GitHubError('unknown', `“${path}” isn't a text file, so there's nothing to read.`, {
        detail: `${bad} undecodable characters in the first ${head.length}`,
        skipReason: 'binary',
      })
    }
  }
  if (text.startsWith(LFS_POINTER_PREFIX)) {
    throw new GitHubError(
      'unknown',
      `“${path}” is kept in Git LFS — a separate storage area for big files — so the repository only holds a placeholder for it.`,
      { detail: 'Git LFS pointer file', skipReason: 'binary' },
    )
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

// ─── Download paths ───────────────────────────────────────────────────────────

/** Read a response body, turning a dropped connection into a (retryable) network GitHubError. */
async function readText(res: Response, what: string, signal?: AbortSignal): Promise<string> {
  try {
    return await res.text()
  } catch (err) {
    if (isAbortError(err) || signal?.aborted) {
      throwIfAborted(signal)
      throw err
    }
    throw new GitHubError('network', MESSAGES.network, { detail: `${describeError(err)} (reading ${what})` })
  }
}

function isRetryable(err: unknown): boolean {
  return err instanceof GitHubError && (err.kind === 'network' || (err.status != null && err.status >= 500))
}

/** Run `fn`, retrying once after ~400ms on a network error or 5xx. */
async function withRetry<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (!isRetryable(err)) throw err
    await sleep(RETRY_DELAY_MS, signal)
    return fn()
  }
}

/** Public file via raw.githubusercontent.com: a plain GET with no custom headers, so no CORS preflight. */
async function fetchRaw(p: FetchFileParams): Promise<string> {
  throwIfAborted(p.signal)
  const url = rawFileUrl(p.owner, p.repo, p.commitSha, p.path)
  let res: Response
  try {
    res = await fetch(url, { signal: p.signal })
  } catch (err) {
    if (isAbortError(err) || p.signal?.aborted) {
      throwIfAborted(p.signal)
      throw err
    }
    throw new GitHubError('network', MESSAGES.network, { detail: `${describeError(err)} (GET ${url})` })
  }
  if (!res.ok) {
    const detail = `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''} for ${url}`
    if (res.status === 404) {
      throw new GitHubError('not-found', `We couldn't download “${p.path}” — GitHub says it isn't there at this version of the project.`, {
        detail,
        status: 404,
      })
    }
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after'))
      const resetAt = Date.now() + (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 60_000)
      throw new GitHubError('rate-limited', rateLimitMessage(resetAt, Boolean(p.token?.trim())), { detail, resetAt, status: 429 })
    }
    throw new GitHubError('unknown', res.status >= 500 ? MESSAGES.serverError : MESSAGES.unknown, { detail, status: res.status })
  }
  return readText(res, url, p.signal)
}

/** Any file via the authenticated contents API (works for private repos). */
async function fetchViaApi(p: FetchFileParams): Promise<string> {
  const apiPath = `${repoApiPath(p.owner, p.repo)}/contents/${encodePath(p.path)}?ref=${encodeURIComponent(p.commitSha)}`
  const res = await apiFetch(apiPath, {
    token: p.token,
    signal: p.signal,
    accept: 'application/vnd.github.raw+json',
    notFoundMessage: p.token?.trim()
      ? `We couldn't download “${p.path}”. GitHub says it isn't there, or your token can't read it.`
      : `We couldn't download “${p.path}”. If this repository is private, add a GitHub token in Settings.`,
  })
  return readText(res, apiPath, p.signal)
}

/**
 * Download one file as UTF-8 text.
 * Public repos: https://raw.githubusercontent.com/{owner}/{repo}/{sha}/{path} (CORS-enabled, not API rate-limited).
 * Private repos or raw failure with a token: GET /repos/{owner}/{repo}/contents/{path}?ref={sha}
 * with Accept: application/vnd.github.raw. Paths must be URL-encoded per segment.
 * Throws GitHubError on failure. Rejects content that looks binary (contains NUL bytes).
 *
 * Binary content and Git LFS placeholders throw a GitHubError whose `skipReason` is 'binary'.
 * A leading UTF-8 byte-order mark is removed. Network errors and 5xx responses are retried once.
 */
export async function fetchFileText(params: FetchFileParams): Promise<string> {
  const hasToken = Boolean(params.token?.trim())
  let text: string
  if (params.isPrivate && hasToken) {
    text = await withRetry(() => fetchViaApi(params), params.signal)
  } else if (params.isPrivate) {
    // Without a token there is no way to read a private file; the API gives the clearest error.
    text = await fetchViaApi(params)
  } else {
    try {
      text = await withRetry(() => fetchRaw(params), params.signal)
    } catch (err) {
      if (!hasToken || isAbortError(err) || params.signal?.aborted) throw err
      text = await withRetry(() => fetchViaApi(params), params.signal)
    }
  }
  return checkTextContent(text, params.path)
}

export interface FetchManyResult {
  /** path → text for every successful download, in the order `paths` was given. */
  files: Record<string, string>
  /** Every path that could not be used (including binary ones), in the order given. */
  failed: string[]
  /** Why each failed path failed: 'binary' (not text / Git LFS) or 'fetch-failed'. */
  failedReasons: Record<string, SkipReason>
}

/**
 * Download many files with limited concurrency (≈8). Never throws for individual failures —
 * returns successes in `files` and failures in `failed`. Calls onProgress(done, total) as files complete.
 *
 * Rejects with an AbortError (and stops starting new downloads) if `base.signal` fires.
 */
export async function fetchManyFiles(
  base: Omit<FetchFileParams, 'path'>,
  paths: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<FetchManyResult> {
  const unique = [...new Set(paths)]
  const total = unique.length
  const ok = new Map<string, string>()
  const reasons = new Map<string, SkipReason>()
  const signal = base.signal
  let next = 0
  let done = 0

  throwIfAborted(signal)
  const report = () => {
    if (!onProgress) return
    try {
      onProgress(done, total)
    } catch {
      /* progress callbacks must not break downloads */
    }
  }
  report()

  const worker = async () => {
    while (next < unique.length) {
      throwIfAborted(signal)
      const path = unique[next++]
      try {
        ok.set(path, await fetchFileText({ ...base, path }))
      } catch (err) {
        if (isAbortError(err) || signal?.aborted) {
          throwIfAborted(signal)
          throw err
        }
        reasons.set(path, err instanceof GitHubError && err.skipReason ? err.skipReason : 'fetch-failed')
      }
      done++
      report()
    }
  }

  const workers = Array.from({ length: Math.min(FILE_CONCURRENCY, total) }, () => worker())
  const results = await Promise.allSettled(workers)
  throwIfAborted(signal)
  const crashed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (crashed) throw crashed.reason

  const files: Record<string, string> = {}
  const failed: string[] = []
  const failedReasons: Record<string, SkipReason> = {}
  for (const path of unique) {
    const text = ok.get(path)
    if (text != null) files[path] = text
    else {
      failed.push(path)
      failedReasons[path] = reasons.get(path) ?? 'fetch-failed'
    }
  }
  return { files, failed, failedReasons }
}
