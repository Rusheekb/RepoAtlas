import { GitHubError } from './errors'
import { headersOf, jsonResponse, textResponse } from './fakeGitHub'
import { checkTextContent, fetchFileText, fetchManyFiles, githubFileUrl, githubTreeUrl, rawFileUrl } from './files'

const SHA = 'f'.repeat(40)
const base = { owner: 'acme', repo: 'widgets', commitSha: SHA }

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

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('URL helpers', () => {
  it('builds raw URLs with every path segment encoded', () => {
    expect(rawFileUrl('acme', 'widgets', SHA, 'src/my file#1.ts')).toBe(
      `https://raw.githubusercontent.com/acme/widgets/${SHA}/src/my%20file%231.ts`,
    )
    expect(rawFileUrl('acme', 'widgets', 'feature/x', 'docs/é.md')).toBe(
      'https://raw.githubusercontent.com/acme/widgets/feature/x/docs/%C3%A9.md',
    )
  })

  it('builds "Open on GitHub" links', () => {
    expect(githubFileUrl('acme', 'widgets', 'main', 'src/app.ts')).toBe('https://github.com/acme/widgets/blob/main/src/app.ts')
    expect(githubFileUrl('acme', 'widgets', 'main', 'src/app.ts', 10)).toBe('https://github.com/acme/widgets/blob/main/src/app.ts#L10')
    expect(githubFileUrl('acme', 'widgets', 'main', 'a.ts', 0)).toBe('https://github.com/acme/widgets/blob/main/a.ts')
    expect(githubFileUrl('acme', 'widgets', 'dev/x', 'a b.ts', 3)).toBe('https://github.com/acme/widgets/blob/dev/x/a%20b.ts#L3')
    expect(githubTreeUrl('acme', 'widgets', 'main', 'src/lib')).toBe('https://github.com/acme/widgets/tree/main/src/lib')
    expect(githubTreeUrl('acme', 'widgets', 'main', '')).toBe('https://github.com/acme/widgets/tree/main')
    expect(githubTreeUrl('acme', 'widgets', 'main', '/src/')).toBe('https://github.com/acme/widgets/tree/main/src')
  })
})

describe('checkTextContent', () => {
  it('strips a UTF-8 BOM', () => {
    expect(checkTextContent('﻿hello', 'a.txt')).toBe('hello')
    expect(checkTextContent('hello', 'a.txt')).toBe('hello')
  })

  it('flags NUL bytes, mojibake and Git LFS pointers as binary', () => {
    for (const text of [
      'PNG\u0000\u0001\u0002',
      '�'.repeat(100),
      'version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 123\n',
    ]) {
      let err: unknown
      try {
        checkTextContent(text, 'x.bin')
      } catch (e) {
        err = e
      }
      expect(err).toBeInstanceOf(GitHubError)
      expect((err as GitHubError).skipReason).toBe('binary')
    }
  })

  it('accepts a few stray replacement characters', () => {
    const text = `${'a'.repeat(200)}�${'b'.repeat(200)}`
    expect(checkTextContent(text, 'a.txt')).toBe(text)
  })
})

describe('fetchFileText', () => {
  it('downloads public files from raw.githubusercontent.com with no custom headers', async () => {
    const fetchMock = stubFetch(() => textResponse('export const x = 1\n'))
    const text = await fetchFileText({ ...base, path: 'src/a b.ts' })
    expect(text).toBe('export const x = 1\n')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`https://raw.githubusercontent.com/acme/widgets/${SHA}/src/a%20b.ts`)
    expect(init?.headers).toBeUndefined()
  })

  it('does not attach the token to raw requests even when one is set', async () => {
    const fetchMock = stubFetch(() => textResponse('ok'))
    await fetchFileText({ ...base, path: 'a.ts', token: 'ghp_x' })
    expect(headersOf(fetchMock.mock.calls[0][1]).authorization).toBeUndefined()
  })

  it('uses the authenticated contents API for private repos', async () => {
    const fetchMock = stubFetch(() => textResponse('secret code'))
    const text = await fetchFileText({ ...base, path: 'src/dir/x.py', token: 'ghp_x', isPrivate: true })
    expect(text).toBe('secret code')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`https://api.github.com/repos/acme/widgets/contents/src/dir/x.py?ref=${SHA}`)
    const headers = headersOf(init)
    expect(headers.accept).toBe('application/vnd.github.raw+json')
    expect(headers.authorization).toBe('Bearer ghp_x')
    expect(headers['x-github-api-version']).toBe('2022-11-28')
  })

  it('falls back to the API when a raw download fails and a token is present', async () => {
    const fetchMock = stubFetch((url) =>
      url.startsWith('https://raw.githubusercontent.com') ? textResponse('404: Not Found', { status: 404 }) : textResponse('from api'),
    )
    expect(await fetchFileText({ ...base, path: 'a.ts', token: 'ghp_x' })).toBe('from api')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1][0])).toContain('api.github.com/repos/acme/widgets/contents/a.ts')
  })

  it('reports a missing public file without trying the API when there is no token', async () => {
    const fetchMock = stubFetch(() => textResponse('404: Not Found', { status: 404 }))
    const err = await caught(fetchFileText({ ...base, path: 'gone.ts' }))
    expect(err.kind).toBe('not-found')
    expect(err.message).toContain('gone.ts')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('private repo without a token asks for one', async () => {
    stubFetch(() => jsonResponse({ message: 'Not Found' }, { status: 404 }))
    const err = await caught(fetchFileText({ ...base, path: 'a.ts', isPrivate: true }))
    expect(err.kind).toBe('not-found')
    expect(err.message).toContain('token')
  })

  it('rejects binary content with skipReason "binary" and strips BOMs', async () => {
    stubFetch(() => textResponse('GIF89a\u0000\u0000'))
    const err = await caught(fetchFileText({ ...base, path: 'logo.dat' }))
    expect(err.skipReason).toBe('binary')

    stubFetch(() => textResponse('version https://git-lfs.github.com/spec/v1\noid sha256:123\nsize 99999\n'))
    expect((await caught(fetchFileText({ ...base, path: 'model.bin' }))).skipReason).toBe('binary')

    stubFetch(() => textResponse('﻿# Title'))
    expect(await fetchFileText({ ...base, path: 'README.md' })).toBe('# Title')
  })

  it('retries once after a server error', async () => {
    vi.useFakeTimers()
    let n = 0
    const fetchMock = stubFetch(() => (n++ === 0 ? textResponse('bad gateway', { status: 502 }) : textResponse('second time lucky')))
    const p = fetchFileText({ ...base, path: 'a.ts' })
    await vi.advanceTimersByTimeAsync(450)
    expect(await p).toBe('second time lucky')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries once after a network error, then gives up', async () => {
    vi.useFakeTimers()
    const fetchMock = stubFetch(() => {
      throw new TypeError('Failed to fetch')
    })
    const p = caught(fetchFileText({ ...base, path: 'a.ts' }))
    await vi.advanceTimersByTimeAsync(450)
    const err = await p
    expect(err.kind).toBe('network')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry a 404', async () => {
    const fetchMock = stubFetch(() => textResponse('nope', { status: 404 }))
    await caught(fetchFileText({ ...base, path: 'a.ts' }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('fetchManyFiles', () => {
  it('downloads with at most 8 at a time, keeps order and reports progress', async () => {
    let inFlight = 0
    let maxInFlight = 0
    stubFetch(async (url) => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 1 + (url.length % 5)))
      inFlight--
      return textResponse(`content of ${decodeURIComponent(url.split('/').pop() ?? '')}`)
    })
    const paths = Array.from({ length: 40 }, (_, i) => `src/file${i}.ts`)
    const progress: [number, number][] = []
    const result = await fetchManyFiles(base, paths, (done, total) => progress.push([done, total]))
    expect(maxInFlight).toBeLessThanOrEqual(8)
    expect(maxInFlight).toBeGreaterThan(1)
    expect(Object.keys(result.files)).toEqual(paths)
    expect(result.files['src/file7.ts']).toBe('content of file7.ts')
    expect(result.failed).toEqual([])
    expect(progress[0]).toEqual([0, 40])
    expect(progress.at(-1)).toEqual([40, 40])
    expect(progress).toHaveLength(41)
  })

  it('never throws for individual files and records why each failed', async () => {
    stubFetch((url) => {
      if (url.endsWith('missing.ts')) return textResponse('404', { status: 404 })
      if (url.endsWith('image.dat')) return textResponse('\u0000\u0001binary')
      return textResponse('ok')
    })
    const result = await fetchManyFiles(base, ['a.ts', 'missing.ts', 'image.dat', 'b.ts', 'a.ts'])
    expect(Object.keys(result.files)).toEqual(['a.ts', 'b.ts'])
    expect(result.failed).toEqual(['missing.ts', 'image.dat'])
    expect(result.failedReasons).toEqual({ 'missing.ts': 'fetch-failed', 'image.dat': 'binary' })
  })

  it('handles an empty list', async () => {
    const fetchMock = stubFetch(() => textResponse('ok'))
    const progress: number[] = []
    expect(await fetchManyFiles(base, [], (d) => progress.push(d))).toEqual({ files: {}, failed: [], failedReasons: {} })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(progress).toEqual([0])
  })

  it('stops and rejects with an AbortError when the signal fires', async () => {
    const ctrl = new AbortController()
    let started = 0
    stubFetch(async (_url, init) => {
      started++
      if (started === 10) ctrl.abort()
      await new Promise((r) => setTimeout(r, 2))
      if (init?.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
      return textResponse('ok')
    })
    const paths = Array.from({ length: 100 }, (_, i) => `f${i}.ts`)
    await expect(fetchManyFiles({ ...base, signal: ctrl.signal }, paths)).rejects.toMatchObject({ name: 'AbortError' })
    expect(started).toBeLessThan(20)
  })

  it('rejects immediately for an already-aborted signal', async () => {
    const fetchMock = stubFetch(() => textResponse('ok'))
    const ctrl = new AbortController()
    ctrl.abort()
    await expect(fetchManyFiles({ ...base, signal: ctrl.signal }, ['a.ts'])).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
