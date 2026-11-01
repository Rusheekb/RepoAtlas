/**
 * Test helper (imported only by *.test.ts files in src/github): a tiny in-memory GitHub that answers
 * the same URLs the ingestion code calls, so tests can run end-to-end against a stubbed `fetch`.
 */

export interface FakeRepoOptions {
  owner?: string
  repo?: string
  defaultBranch?: string
  sha?: string
  isPrivate?: boolean
  /** path → content (string) or size-only placeholder ({ size }) for files that must never be downloaded. */
  files?: Record<string, string | { size: number }>
  /** Extra raw tree entries (symlinks, submodules …). */
  extraTree?: { path: string; type: string; mode: string; size?: number; sha?: string }[]
  /** Paths whose raw download fails with this status. */
  rawStatus?: Record<string, number>
  rateLimit?: { limit: number; remaining: number; reset: number }
  /** Extra branch or tag names (they may contain slashes) that resolve to the same commit. */
  branches?: string[]
}

export interface FetchCall {
  url: string
  headers: Record<string, string>
}

export function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json; charset=utf-8', ...init.headers },
  })
}

export function textResponse(text: string, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(text, { status: init.status ?? 200, headers: { 'content-type': 'text/plain; charset=utf-8', ...init.headers } })
}

export function headersOf(init: RequestInit | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  const h = init?.headers
  if (!h) return out
  new Headers(h).forEach((value, key) => {
    out[key.toLowerCase()] = value
  })
  return out
}

/** Build a fetch implementation that serves one fake repository. */
export function fakeGitHub(opts: FakeRepoOptions = {}) {
  const owner = opts.owner ?? 'acme'
  const repo = opts.repo ?? 'widgets'
  const defaultBranch = opts.defaultBranch ?? 'main'
  const sha = opts.sha ?? 'a'.repeat(40)
  const files = opts.files ?? {}
  const calls: FetchCall[] = []
  const rl = opts.rateLimit ?? { limit: 60, remaining: 59, reset: 1_900_000_000 }
  const rlHeaders = {
    'x-ratelimit-limit': String(rl.limit),
    'x-ratelimit-remaining': String(rl.remaining),
    'x-ratelimit-reset': String(rl.reset),
  }
  const base = `/repos/${owner}/${repo}`.toLowerCase()

  const contentOf = (path: string): string | null => {
    const v = files[path]
    if (v == null) return null
    return typeof v === 'string' ? v : 'x'.repeat(Math.min(v.size, 10))
  }

  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    calls.push({ url: url.href, headers: headersOf(init) })
    if (init?.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')

    if (url.host === 'raw.githubusercontent.com') {
      const parts = url.pathname.split('/').slice(1).map(decodeURIComponent)
      const [o, r, ref, ...rest] = parts
      const path = rest.join('/')
      if (o.toLowerCase() !== owner.toLowerCase() || r.toLowerCase() !== repo.toLowerCase() || ref !== sha || opts.isPrivate) {
        return textResponse('404: Not Found', { status: 404 })
      }
      const forced = opts.rawStatus?.[path]
      if (forced) return textResponse('error', { status: forced })
      const text = contentOf(path)
      return text == null ? textResponse('404: Not Found', { status: 404 }) : textResponse(text)
    }

    if (url.host !== 'api.github.com') return textResponse('unexpected host', { status: 599 })
    const p = url.pathname.toLowerCase()
    if (!p.startsWith(base)) return jsonResponse({ message: 'Not Found' }, { status: 404, headers: rlHeaders })
    // Like GitHub: a private repository does not exist for anyone without a token.
    if (opts.isPrivate && !headersOf(init).authorization) return jsonResponse({ message: 'Not Found' }, { status: 404, headers: rlHeaders })
    const rest = url.pathname.slice(base.length)

    if (rest === '' || rest === '/') {
      return jsonResponse(
        {
          name: repo,
          full_name: `${owner}/${repo}`,
          owner: { login: owner, avatar_url: `https://avatars.example/${owner}` },
          description: 'Widgets for everyone',
          homepage: '',
          html_url: `https://github.com/${owner}/${repo}`,
          stargazers_count: 10,
          forks_count: 2,
          open_issues_count: 1,
          default_branch: defaultBranch,
          topics: ['widgets'],
          license: { spdx_id: 'MIT', name: 'MIT License' },
          language: 'TypeScript',
          created_at: '2020-01-01T00:00:00Z',
          pushed_at: '2024-01-01T00:00:00Z',
          size: 123,
          private: Boolean(opts.isPrivate),
          fork: false,
          archived: false,
        },
        { headers: rlHeaders },
      )
    }
    if (rest.startsWith('/commits/')) {
      const ref = decodeURIComponent(rest.slice('/commits/'.length))
      if (ref !== defaultBranch && ref !== sha && !opts.branches?.includes(ref)) {
        return jsonResponse({ message: `No commit found for SHA: ${ref}` }, { status: 422, headers: rlHeaders })
      }
      return textResponse(sha, { headers: rlHeaders })
    }
    if (rest.startsWith('/git/trees/')) {
      const allPaths = Object.keys(files)
      if (allPaths.length === 0 && !opts.extraTree?.length) {
        return jsonResponse({ message: 'Git Repository is empty.' }, { status: 409, headers: rlHeaders })
      }
      const tree = [
        ...allPaths.map((path) => {
          const v = files[path]
          return { path, mode: '100644', type: 'blob', sha: `blob-${path}`, size: typeof v === 'string' ? new TextEncoder().encode(v).length : v.size }
        }),
        ...(opts.extraTree ?? []),
      ]
      return jsonResponse({ sha, tree, truncated: false }, { headers: rlHeaders })
    }
    if (rest.startsWith('/contents/')) {
      const path = rest.slice('/contents/'.length).split('/').map(decodeURIComponent).join('/')
      const text = contentOf(path)
      return text == null
        ? jsonResponse({ message: 'Not Found' }, { status: 404, headers: rlHeaders })
        : textResponse(text, { headers: rlHeaders })
    }
    return jsonResponse({ message: 'Not Found' }, { status: 404, headers: rlHeaders })
  }

  return { fetchImpl, calls, owner, repo, sha, defaultBranch }
}
