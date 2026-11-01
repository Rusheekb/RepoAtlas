import { fetchRepoMeta, fetchTree, getRateLimitInfo, mapRepoMeta, onRateLimitChange, resetRateLimitInfo, resolveCommit } from './api'
import { GitHubError, formatResetTime } from './errors'
import { headersOf, jsonResponse, textResponse } from './fakeGitHub'

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>

function stubFetch(handler: Handler) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init))
  vi.stubGlobal('fetch', fn)
  return fn
}

async function caught(p: Promise<unknown>): Promise<GitHubError> {
  try {
    await p
  } catch (err) {
    if (err instanceof GitHubError) return err
    throw err
  }
  throw new Error('expected a GitHubError')
}

const SHA = '0123456789abcdef0123456789abcdef01234567'

afterEach(() => {
  vi.unstubAllGlobals()
  resetRateLimitInfo()
})

describe('fetchRepoMeta', () => {
  const repoJson = {
    name: 'React',
    full_name: 'Facebook/React',
    owner: { login: 'Facebook', avatar_url: 'https://avatars.githubusercontent.com/u/69631' },
    description: 'The library for web and native user interfaces.',
    homepage: 'https://react.dev',
    html_url: 'https://github.com/facebook/react',
    stargazers_count: 230000,
    forks_count: 47000,
    open_issues_count: 900,
    default_branch: 'main',
    topics: ['javascript', 'ui', 42],
    license: { spdx_id: 'MIT', name: 'MIT License' },
    language: 'JavaScript',
    created_at: '2013-05-24T16:15:54Z',
    pushed_at: '2024-05-01T00:00:00Z',
    size: 350000,
    private: false,
    fork: false,
    archived: false,
  }

  it('calls the repos endpoint with GitHub headers and maps the JSON', async () => {
    const fetchMock = stubFetch(() => jsonResponse(repoJson))
    const meta = await fetchRepoMeta('facebook', 'react')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.github.com/repos/facebook/react')
    const headers = headersOf(init)
    expect(headers.accept).toBe('application/vnd.github+json')
    expect(headers['x-github-api-version']).toBe('2022-11-28')
    expect(headers.authorization).toBeUndefined()
    expect(meta).toEqual({
      owner: 'Facebook',
      repo: 'React',
      fullName: 'Facebook/React',
      description: 'The library for web and native user interfaces.',
      homepage: 'https://react.dev',
      htmlUrl: 'https://github.com/facebook/react',
      ownerAvatarUrl: 'https://avatars.githubusercontent.com/u/69631',
      stars: 230000,
      forks: 47000,
      openIssues: 900,
      defaultBranch: 'main',
      topics: ['javascript', 'ui'],
      license: 'MIT',
      primaryLanguage: 'JavaScript',
      createdAt: '2013-05-24T16:15:54Z',
      pushedAt: '2024-05-01T00:00:00Z',
      sizeKb: 350000,
      isPrivate: false,
      isFork: false,
      archived: false,
    })
  })

  it('sends the token as a Bearer header', async () => {
    const fetchMock = stubFetch(() => jsonResponse(repoJson))
    await fetchRepoMeta('facebook', 'react', { token: ' ghp_secret ' })
    expect(headersOf(fetchMock.mock.calls[0][1]).authorization).toBe('Bearer ghp_secret')
  })

  it('uses the license name when there is no SPDX id, and handles missing fields', () => {
    expect(mapRepoMeta({ ...repoJson, license: { spdx_id: 'NOASSERTION', name: 'Other' } }, 'a', 'b').license).toBe('Other')
    const sparse = mapRepoMeta({ name: 'b' }, 'a', 'b')
    expect(sparse).toMatchObject({ owner: 'a', repo: 'b', fullName: 'a/b', license: null, description: null, homepage: null, stars: 0, topics: [] })
    expect(sparse.defaultBranch).toBe('main')
    expect(mapRepoMeta({ ...repoJson, private: true }, 'a', 'b').isPrivate).toBe(true)
  })

  it('encodes owner and repo', async () => {
    const fetchMock = stubFetch(() => jsonResponse(repoJson))
    await fetchRepoMeta('a b', 'c#d')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.github.com/repos/a%20b/c%23d')
  })

  it('rejects an unexpected response shape', async () => {
    stubFetch(() => jsonResponse(['not', 'a', 'repo']))
    expect((await caught(fetchRepoMeta('a', 'b'))).kind).toBe('unknown')
  })
})

describe('resolveCommit', () => {
  it('asks for the plain SHA media type and returns it', async () => {
    const fetchMock = stubFetch(() => textResponse(`${SHA}\n`))
    expect(await resolveCommit('o', 'r', 'main')).toBe(SHA)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.github.com/repos/o/r/commits/main')
    expect(headersOf(init).accept).toBe('application/vnd.github.sha')
  })

  it('keeps slashes in branch names but encodes other characters', async () => {
    const fetchMock = stubFetch(() => textResponse(SHA))
    await resolveCommit('o', 'r', 'feature/new login#2')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.github.com/repos/o/r/commits/feature/new%20login%232')
  })

  it('falls back to the JSON .sha field', async () => {
    stubFetch(() => jsonResponse({ sha: SHA.toUpperCase(), commit: {} }))
    expect(await resolveCommit('o', 'r', 'v1.0')).toBe(SHA)
  })

  it('explains an unknown branch in plain words', async () => {
    stubFetch(() => jsonResponse({ message: 'No commit found for SHA: nope' }, { status: 422 }))
    const err = await caught(resolveCommit('o', 'r', 'nope'))
    expect(err.kind).toBe('not-found')
    expect(err.message).toContain('“nope”')
    expect(err.detail).toContain('422')
  })

  it('maps 409 (empty repository) to "empty"', async () => {
    stubFetch(() => jsonResponse({ message: 'Git Repository is empty.' }, { status: 409 }))
    const err = await caught(resolveCommit('o', 'r', 'main'))
    expect(err.kind).toBe('empty')
    expect(err.message).toBe("This repository is empty — there's no code to explore yet.")
  })

  it('rejects garbage bodies', async () => {
    stubFetch(() => textResponse('<html>hello</html>'))
    expect((await caught(resolveCommit('o', 'r', 'main'))).kind).toBe('unknown')
  })
})

describe('fetchTree', () => {
  it('keeps regular files only', async () => {
    const fetchMock = stubFetch(() =>
      jsonResponse({
        sha: SHA,
        truncated: true,
        tree: [
          { path: 'src', mode: '040000', type: 'tree', sha: 't1' },
          { path: 'src/index.ts', mode: '100644', type: 'blob', sha: 'b1', size: 120 },
          { path: 'bin/run', mode: '100755', type: 'blob', sha: 'b2', size: 40 },
          { path: 'link', mode: '120000', type: 'blob', sha: 'b3', size: 8 },
          { path: 'vendor/lib', mode: '160000', type: 'commit', sha: 'c1' },
          { path: 'empty.txt', mode: '100644', type: 'blob', sha: 'b4' },
          'garbage',
        ],
      }),
    )
    const { tree, truncated } = await fetchTree('o', 'r', SHA)
    expect(fetchMock.mock.calls[0][0]).toBe(`https://api.github.com/repos/o/r/git/trees/${SHA}?recursive=1`)
    expect(truncated).toBe(true)
    expect(tree).toEqual([
      { path: 'src/index.ts', size: 120, sha: 'b1' },
      { path: 'bin/run', size: 40, sha: 'b2' },
      { path: 'empty.txt', size: 0, sha: 'b4' },
    ])
  })
})

describe('error mapping', () => {
  it('404 → not-found with a friendly message and technical detail', async () => {
    stubFetch(() => jsonResponse({ message: 'Not Found' }, { status: 404 }))
    const err = await caught(fetchRepoMeta('nobody', 'nothing'))
    expect(err).toBeInstanceOf(GitHubError)
    expect(err.kind).toBe('not-found')
    expect(err.message).toBe(
      "We couldn't find that repository. Double-check the name — and if it's private, add a GitHub token in Settings.",
    )
    expect(err.status).toBe(404)
    expect(err.detail).toContain('404')
    expect(err.detail).toContain('Not Found')
  })

  it('403 that is not about rate limits → not-found', async () => {
    stubFetch(() =>
      jsonResponse({ message: 'Resource protected by organization SAML enforcement.' }, { status: 403, headers: { 'x-ratelimit-remaining': '4999' } }),
    )
    expect((await caught(fetchRepoMeta('o', 'r'))).kind).toBe('not-found')
  })

  it('403 with no requests remaining → rate-limited with the reset time', async () => {
    const reset = Math.floor(new Date('2030-01-01T15:45:00Z').getTime() / 1000)
    stubFetch(() =>
      jsonResponse(
        { message: 'API rate limit exceeded for 1.2.3.4.' },
        { status: 403, headers: { 'x-ratelimit-limit': '60', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) } },
      ),
    )
    const err = await caught(fetchRepoMeta('o', 'r'))
    expect(err.kind).toBe('rate-limited')
    expect(err.resetAt).toBe(reset * 1000)
    expect(err.message).toContain('60 requests an hour')
    expect(err.message).toContain(formatResetTime(reset * 1000))
    expect(formatResetTime(reset * 1000)).toMatch(/\d{1,2}:\d{2}/)
    expect(err.message).toContain('token in Settings')
    expect(getRateLimitInfo()).toEqual({ limit: 60, remaining: 0, resetAt: reset * 1000 })
  })

  it('429 secondary rate limit uses Retry-After for the reset time', async () => {
    const now = Date.now()
    stubFetch(() =>
      jsonResponse({ message: 'You have exceeded a secondary rate limit.' }, { status: 429, headers: { 'retry-after': '120' } }),
    )
    const err = await caught(fetchRepoMeta('o', 'r'))
    expect(err.kind).toBe('rate-limited')
    expect(err.resetAt).toBeGreaterThanOrEqual(now + 119_000)
    expect(err.resetAt).toBeLessThanOrEqual(Date.now() + 121_000)
  })

  it('403 secondary rate-limit message without headers → rate-limited', async () => {
    stubFetch(() => jsonResponse({ message: 'You have exceeded a secondary rate limit. Please wait.' }, { status: 403 }))
    const err = await caught(fetchRepoMeta('o', 'r'))
    expect(err.kind).toBe('rate-limited')
    expect(err.resetAt).toBeGreaterThan(Date.now())
  })

  it('tailors the rate-limit message when a token is in use', async () => {
    stubFetch(() =>
      jsonResponse({ message: 'API rate limit exceeded' }, { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1900000000' } }),
    )
    const err = await caught(fetchRepoMeta('o', 'r', { token: 'ghp_x' }))
    expect(err.kind).toBe('rate-limited')
    expect(err.message).toContain('your token')
    expect(err.message).not.toContain('60 requests')
  })

  it('401 → unauthorized', async () => {
    stubFetch(() => jsonResponse({ message: 'Bad credentials' }, { status: 401 }))
    const err = await caught(fetchRepoMeta('o', 'r', { token: 'bad' }))
    expect(err.kind).toBe('unauthorized')
    expect(err.message).toMatch(/^Your GitHub token was rejected/)
  })

  it('a fetch TypeError → network', async () => {
    stubFetch(() => {
      throw new TypeError('Failed to fetch')
    })
    const err = await caught(fetchRepoMeta('o', 'r'))
    expect(err.kind).toBe('network')
    expect(err.detail).toContain('Failed to fetch')
  })

  it('409 on the tree → empty', async () => {
    stubFetch(() => jsonResponse({ message: 'Git Repository is empty.' }, { status: 409 }))
    expect((await caught(fetchTree('o', 'r', SHA))).kind).toBe('empty')
  })

  it('5xx and other statuses → unknown', async () => {
    stubFetch(() => textResponse('oops', { status: 502 }))
    const err = await caught(fetchRepoMeta('o', 'r'))
    expect(err.kind).toBe('unknown')
    expect(err.status).toBe(502)
    stubFetch(() => textResponse('teapot', { status: 418 }))
    expect((await caught(fetchRepoMeta('o', 'r'))).kind).toBe('unknown')
  })

  it('passes abort errors through untouched', async () => {
    stubFetch(() => {
      throw new DOMException('The operation was aborted.', 'AbortError')
    })
    await expect(fetchRepoMeta('o', 'r')).rejects.toMatchObject({ name: 'AbortError' })
    const ctrl = new AbortController()
    ctrl.abort()
    const fetchMock = stubFetch(() => jsonResponse({}))
    await expect(fetchRepoMeta('o', 'r', { signal: ctrl.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('rate-limit tracking', () => {
  it('records the latest headers from every response and notifies listeners', async () => {
    const seen: number[] = []
    const off = onRateLimitChange((info) => seen.push(info.remaining))
    let remaining = 10
    stubFetch(() =>
      textResponse(SHA, {
        headers: { 'x-ratelimit-limit': '60', 'x-ratelimit-remaining': String(remaining--), 'x-ratelimit-reset': '1900000000' },
      }),
    )
    expect(getRateLimitInfo()).toBeNull()
    await resolveCommit('o', 'r', 'main')
    await resolveCommit('o', 'r', 'main')
    expect(getRateLimitInfo()).toEqual({ limit: 60, remaining: 9, resetAt: 1_900_000_000_000 })
    expect(seen).toEqual([10, 9])
    off()
    await resolveCommit('o', 'r', 'main')
    expect(seen).toEqual([10, 9])
  })

  it('ignores responses without rate-limit headers', async () => {
    stubFetch(() => textResponse(SHA))
    await resolveCommit('o', 'r', 'main')
    expect(getRateLimitInfo()).toBeNull()
  })
})
