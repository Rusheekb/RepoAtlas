import type { RepoMeta, TreeEntry } from '@/core/types'
import { GitHubError, MESSAGES, describeError, isAbortError, rateLimitMessage, throwIfAborted } from './errors'

export const GITHUB_API = 'https://api.github.com'
export const API_VERSION = '2022-11-28'

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

// ─── Rate-limit tracking ──────────────────────────────────────────────────────

let lastRateLimit: RateLimitInfo | null = null
const rateLimitListeners = new Set<(info: RateLimitInfo) => void>()

function recordRateLimit(headers: Headers): void {
  const limit = Number(headers.get('x-ratelimit-limit'))
  const remainingRaw = headers.get('x-ratelimit-remaining')
  const reset = Number(headers.get('x-ratelimit-reset'))
  if (remainingRaw == null || !Number.isFinite(limit) || !Number.isFinite(reset) || limit <= 0) return
  const remaining = Number(remainingRaw)
  if (!Number.isFinite(remaining)) return
  lastRateLimit = { limit, remaining, resetAt: reset * 1000 }
  for (const listener of rateLimitListeners) {
    try {
      listener(lastRateLimit)
    } catch {
      /* a listener's bug must never break a download */
    }
  }
}

export function getRateLimitInfo(): RateLimitInfo | null {
  return lastRateLimit
}

/** Get notified whenever new rate-limit headers arrive. Returns an unsubscribe function. */
export function onRateLimitChange(listener: (info: RateLimitInfo) => void): () => void {
  rateLimitListeners.add(listener)
  return () => {
    rateLimitListeners.delete(listener)
  }
}

/** Forget the recorded rate limit (used by tests). */
export function resetRateLimitInfo(): void {
  lastRateLimit = null
}

// ─── Request helper ───────────────────────────────────────────────────────────

/** Encode each segment of a slash-separated path (file paths, branch names with slashes). */
export function encodePath(path: string): string {
  return path
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/')
}

export function repoApiPath(owner: string, repo: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
}

export interface ApiFetchOptions extends GitHubRequestOptions {
  /** Accept header (default application/vnd.github+json). */
  accept?: string
  /** Friendlier message for a 404 / non-rate-limit 403 in this context. */
  notFoundMessage?: string
  /** Friendlier message for a 422 in this context (otherwise 'unknown'). */
  unprocessableMessage?: string
}

export function buildHeaders(token: string | undefined, accept = 'application/vnd.github+json'): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: accept,
    'X-GitHub-Api-Version': API_VERSION,
  }
  const t = token?.trim()
  if (t) headers.Authorization = `Bearer ${t}`
  return headers
}

async function readBodyMessage(res: Response): Promise<string> {
  let text = ''
  try {
    text = await res.text()
  } catch {
    return ''
  }
  try {
    const json: unknown = JSON.parse(text)
    if (json && typeof json === 'object' && 'message' in json && typeof (json as { message: unknown }).message === 'string') {
      return (json as { message: string }).message
    }
  } catch {
    /* not JSON */
  }
  return text.slice(0, 300)
}

/** Turn a failed api.github.com response into a friendly GitHubError. */
export async function errorFromResponse(
  res: Response,
  ctx: { hasToken: boolean; notFoundMessage?: string; unprocessableMessage?: string; what?: string },
): Promise<GitHubError> {
  const status = res.status
  const bodyMessage = await readBodyMessage(res)
  const detail = `HTTP ${status}${res.statusText ? ` ${res.statusText}` : ''}${ctx.what ? ` for ${ctx.what}` : ''}${
    bodyMessage ? ` — ${bodyMessage}` : ''
  }`

  if (status === 403 || status === 429) {
    const remaining = res.headers.get('x-ratelimit-remaining')
    const retryAfter = Number(res.headers.get('retry-after'))
    const isRateLimit =
      status === 429 || remaining === '0' || /rate limit/i.test(bodyMessage) || (Number.isFinite(retryAfter) && retryAfter > 0)
    if (isRateLimit) {
      const reset = Number(res.headers.get('x-ratelimit-reset'))
      let resetAt: number
      if (remaining === '0' && Number.isFinite(reset) && reset > 0) resetAt = reset * 1000
      else if (Number.isFinite(retryAfter) && retryAfter > 0) resetAt = Date.now() + retryAfter * 1000
      else if (Number.isFinite(reset) && reset > 0) resetAt = reset * 1000
      else resetAt = Date.now() + 60_000
      return new GitHubError('rate-limited', rateLimitMessage(resetAt, ctx.hasToken), { detail, resetAt, status })
    }
    return new GitHubError('not-found', ctx.notFoundMessage ?? MESSAGES.notFound, { detail, status })
  }
  if (status === 404) return new GitHubError('not-found', ctx.notFoundMessage ?? MESSAGES.notFound, { detail, status })
  if (status === 401) return new GitHubError('unauthorized', MESSAGES.unauthorized, { detail, status })
  if (status === 409) return new GitHubError('empty', MESSAGES.empty, { detail, status })
  if (status === 422 && ctx.unprocessableMessage) {
    return new GitHubError('not-found', ctx.unprocessableMessage, { detail, status })
  }
  if (status === 451) return new GitHubError('unknown', MESSAGES.unavailable, { detail, status })
  if (status >= 500) return new GitHubError('unknown', MESSAGES.serverError, { detail, status })
  return new GitHubError('unknown', MESSAGES.unknown, { detail, status })
}

/**
 * GET an api.github.com path (starting with "/"). Records rate-limit headers from every response and
 * throws a friendly GitHubError for anything that isn't 2xx. Abort errors are re-thrown unchanged.
 */
export async function apiFetch(path: string, opts: ApiFetchOptions = {}): Promise<Response> {
  throwIfAborted(opts.signal)
  let res: Response
  try {
    res = await fetch(`${GITHUB_API}${path}`, {
      method: 'GET',
      headers: buildHeaders(opts.token, opts.accept),
      signal: opts.signal,
    })
  } catch (err) {
    if (isAbortError(err) || opts.signal?.aborted) {
      throwIfAborted(opts.signal)
      throw err
    }
    throw new GitHubError('network', MESSAGES.network, { detail: `${describeError(err)} (GET ${path})` })
  }
  recordRateLimit(res.headers)
  if (!res.ok) {
    throw await errorFromResponse(res, {
      hasToken: Boolean(opts.token?.trim()),
      notFoundMessage: opts.notFoundMessage,
      unprocessableMessage: opts.unprocessableMessage,
      what: `GET ${path}`,
    })
  }
  return res
}

async function readJson(res: Response, what: string): Promise<unknown> {
  try {
    return await res.json()
  } catch (err) {
    if (isAbortError(err)) throw err
    throw new GitHubError('unknown', MESSAGES.badResponse, { detail: `${what}: ${describeError(err)}`, status: res.status })
  }
}

// ─── Small JSON readers (GitHub JSON is untrusted input) ──────────────────────

type Json = Record<string, unknown>

function isObj(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}
function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}
function bool(v: unknown): boolean {
  return v === true
}

/** Map GET /repos/{owner}/{repo} JSON to RepoMeta. Exported for tests. */
export function mapRepoMeta(json: unknown, fallbackOwner: string, fallbackRepo: string): RepoMeta {
  const j = isObj(json) ? json : {}
  const owner = isObj(j.owner) ? j.owner : {}
  const license = isObj(j.license) ? j.license : null
  const ownerLogin = str(owner.login, fallbackOwner)
  const name = str(j.name, fallbackRepo)
  const spdx = license ? strOrNull(license.spdx_id) : null
  const licenseName = license ? strOrNull(license.name) : null
  return {
    owner: ownerLogin,
    repo: name,
    fullName: str(j.full_name, `${ownerLogin}/${name}`),
    description: strOrNull(j.description),
    homepage: strOrNull(j.homepage),
    htmlUrl: str(j.html_url, `https://github.com/${ownerLogin}/${name}`),
    ownerAvatarUrl: str(owner.avatar_url),
    stars: num(j.stargazers_count),
    forks: num(j.forks_count),
    openIssues: num(j.open_issues_count),
    defaultBranch: str(j.default_branch, 'main') || 'main',
    topics: Array.isArray(j.topics) ? j.topics.filter((t): t is string => typeof t === 'string') : [],
    license: spdx && spdx !== 'NOASSERTION' ? spdx : licenseName,
    primaryLanguage: strOrNull(j.language),
    createdAt: str(j.created_at),
    pushedAt: str(j.pushed_at),
    sizeKb: num(j.size),
    isPrivate: bool(j.private) || j.visibility === 'private' || j.visibility === 'internal',
    isFork: bool(j.fork),
    archived: bool(j.archived),
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** GET /repos/{owner}/{repo} → RepoMeta. Throws GitHubError with friendly messages (not-found, rate-limited …). */
export async function fetchRepoMeta(owner: string, repo: string, opts?: GitHubRequestOptions): Promise<RepoMeta> {
  const path = repoApiPath(owner, repo)
  const res = await apiFetch(path, { ...opts })
  const json = await readJson(res, `GET ${path}`)
  if (!isObj(json) || typeof json.name !== 'string') {
    throw new GitHubError('unknown', MESSAGES.badResponse, { detail: `GET ${path}: unexpected response shape` })
  }
  return mapRepoMeta(json, owner, repo)
}

const SHA_RE = /^[0-9a-f]{40}([0-9a-f]{24})?$/i

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
  const cleanRef = ref.trim()
  if (!cleanRef) {
    throw new GitHubError('invalid-input', 'Please tell us which branch, tag or commit to open.', {
      detail: 'resolveCommit called with an empty ref',
    })
  }
  const path = `${repoApiPath(owner, repo)}/commits/${encodePath(cleanRef)}`
  const refMessage = `We couldn't find a branch, tag or commit called “${cleanRef}” in ${owner}/${repo}. Check the spelling, or open the project without choosing a branch.`
  const res = await apiFetch(path, {
    ...opts,
    accept: 'application/vnd.github.sha',
    notFoundMessage: refMessage,
    unprocessableMessage: refMessage,
  })
  let text = ''
  try {
    text = (await res.text()).trim()
  } catch (err) {
    if (isAbortError(err)) throw err
    throw new GitHubError('unknown', MESSAGES.badResponse, { detail: `GET ${path}: ${describeError(err)}` })
  }
  if (SHA_RE.test(text)) return text.toLowerCase()
  // Some proxies / older servers ignore the sha media type and send the JSON commit instead.
  try {
    const json: unknown = JSON.parse(text)
    if (isObj(json) && typeof json.sha === 'string' && SHA_RE.test(json.sha)) return json.sha.toLowerCase()
  } catch {
    /* fall through */
  }
  throw new GitHubError('unknown', MESSAGES.badResponse, { detail: `GET ${path}: expected a commit SHA, got ${JSON.stringify(text.slice(0, 80))}` })
}

/** GET /repos/{owner}/{repo}/git/trees/{sha}?recursive=1 → blobs only. */
export async function fetchTree(
  owner: string,
  repo: string,
  commitSha: string,
  opts?: GitHubRequestOptions,
): Promise<{ tree: TreeEntry[]; truncated: boolean }> {
  const path = `${repoApiPath(owner, repo)}/git/trees/${encodeURIComponent(commitSha)}?recursive=1`
  const res = await apiFetch(path, { ...opts })
  const json = await readJson(res, `GET ${path}`)
  if (!isObj(json) || !Array.isArray(json.tree)) {
    throw new GitHubError('unknown', MESSAGES.badResponse, { detail: `GET ${path}: unexpected response shape` })
  }
  const tree: TreeEntry[] = []
  for (const item of json.tree) {
    if (!isObj(item)) continue
    // Keep regular files only: skip folders ('tree'), submodules ('commit') and symlinks (mode 120000).
    if (item.type !== 'blob' || item.mode === '120000') continue
    const p = str(item.path)
    if (!p) continue
    tree.push({ path: p.replace(/^\/+/, ''), size: num(item.size), sha: str(item.sha) })
  }
  return { tree, truncated: json.truncated === true }
}
