import type { LoadProgress } from '@/core/types'
import { GitHubError } from './errors'
import { fakeGitHub, type FakeRepoOptions } from './fakeGitHub'
import {
  MAX_CACHED_SNAPSHOTS,
  REF_CACHE_TTL_MS,
  clearSnapshotCache,
  listCachedSnapshots,
  loadRepoSnapshot,
  removeCachedSnapshot,
  snapshotCacheKey,
} from './snapshot'

const repoFiles: FakeRepoOptions['files'] = {
  'README.md': '# Widgets\nMakes widgets.',
  'package.json': '{"name":"widgets","dependencies":{"react":"^19.0.0"}}',
  'src/index.ts': "import { App } from './App'\nApp()\n",
  'src/App.tsx': 'export function App() { return null }\n',
  'src/empty.ts': '',
  'src/data.bin.txt': 'oops\u0000binary',
  'src/missing.ts': 'never served',
  'assets/logo.png': { size: 2048 },
  'package-lock.json': { size: 90_000 },
  'node_modules/react/index.js': 'module.exports = {}',
}

function install(opts: FakeRepoOptions = {}) {
  const gh = fakeGitHub({ files: repoFiles, rawStatus: { 'src/missing.ts': 404 }, ...opts })
  const fetchMock = vi.fn(gh.fetchImpl)
  vi.stubGlobal('fetch', fetchMock)
  return { ...gh, fetchMock }
}

beforeEach(async () => {
  await clearSnapshotCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('loadRepoSnapshot', () => {
  it('builds a snapshot end-to-end with friendly progress', async () => {
    const { fetchMock, sha } = install()
    const progress: LoadProgress[] = []
    const snap = await loadRepoSnapshot({ owner: 'acme', repo: 'widgets' }, { depth: 'standard', onProgress: (p) => progress.push(p) })

    expect(snap.meta.fullName).toBe('acme/widgets')
    expect(snap.ref).toBe('main')
    expect(snap.commitSha).toBe(sha)
    expect(snap.treeTruncated).toBe(false)
    expect(snap.tree).toHaveLength(Object.keys(repoFiles!).length)
    expect(snap.files).toEqual({
      'README.md': '# Widgets\nMakes widgets.',
      'package.json': '{"name":"widgets","dependencies":{"react":"^19.0.0"}}',
      'src/index.ts': "import { App } from './App'\nApp()\n",
      'src/App.tsx': 'export function App() { return null }\n',
      'src/empty.ts': '',
    })
    expect(Object.keys(snap.files)[0]).toBe('README.md')
    expect(snap.skipped).toEqual(
      expect.arrayContaining([
        { path: 'assets/logo.png', reason: 'binary' },
        { path: 'package-lock.json', reason: 'lockfile' },
        { path: 'node_modules/react/index.js', reason: 'vendored' },
        { path: 'src/missing.ts', reason: 'fetch-failed' },
        { path: 'src/data.bin.txt', reason: 'binary' },
      ]),
    )
    expect(snap.skipped).toHaveLength(5)
    expect(snap.fetchedAt).toBeGreaterThan(0)

    const messages = progress.map((p) => p.message)
    expect(messages[0]).toBe('Finding acme/widgets on GitHub…')
    expect(messages).toContain('Listing every file in the project…')
    expect(messages).toContain('Found 10 files. Picking the most important ones to read…')
    expect(messages).toContain('Reading 0 of 6 files…')
    const last = progress.at(-1)!
    expect(last).toEqual({ stage: 'files', message: 'Reading 6 of 6 files…', done: 6, total: 6 })
    expect(progress.map((p) => p.stage)).toEqual(expect.arrayContaining(['meta', 'tree', 'files']))

    // The empty file needed no download; skipped files were never requested.
    const urls = fetchMock.mock.calls.map(([u]) => String(u))
    expect(urls.some((u) => u.endsWith('/src/empty.ts'))).toBe(false)
    expect(urls.some((u) => u.includes('logo.png') || u.includes('node_modules') || u.includes('package-lock'))).toBe(false)
    expect(urls.filter((u) => u.startsWith('https://api.github.com'))).toHaveLength(3)
  })

  it('serves a repeat visit from cache with zero network requests', async () => {
    const { fetchMock } = install()
    const first = await loadRepoSnapshot({ owner: 'acme', repo: 'widgets' }, { depth: 'standard' })
    fetchMock.mockClear()

    const progress: string[] = []
    const again = await loadRepoSnapshot({ owner: 'ACME', repo: 'Widgets' }, { depth: 'standard', onProgress: (p) => progress.push(p.message) })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(again).toEqual(first)
    expect(progress.at(-1)).toMatch(/saved from your last visit/)
  })

  it('after 10 minutes re-checks the commit but still reuses the cached files', async () => {
    const { fetchMock } = install()
    const t0 = Date.now()
    await loadRepoSnapshot({ owner: 'acme', repo: 'widgets' }, { depth: 'standard' })
    fetchMock.mockClear()

    vi.spyOn(Date, 'now').mockReturnValue(t0 + REF_CACHE_TTL_MS + 1000)
    await loadRepoSnapshot({ owner: 'acme', repo: 'widgets' }, { depth: 'standard' })
    const urls = fetchMock.mock.calls.map(([u]) => String(u))
    expect(urls).toEqual(['https://api.github.com/repos/acme/widgets', 'https://api.github.com/repos/acme/widgets/commits/main'])
  })

  it('force: true bypasses both caches', async () => {
    const { fetchMock } = install()
    await loadRepoSnapshot({ owner: 'acme', repo: 'widgets' }, { depth: 'standard' })
    fetchMock.mockClear()
    await loadRepoSnapshot({ owner: 'acme', repo: 'widgets' }, { depth: 'standard', force: true })
    const urls = fetchMock.mock.calls.map(([u]) => String(u))
    expect(urls.filter((u) => u.startsWith('https://api.github.com'))).toHaveLength(3)
    expect(urls.some((u) => u.startsWith('https://raw.githubusercontent.com'))).toBe(true)
  })

  it('caches each analysis depth separately', async () => {
    const { fetchMock } = install()
    await loadRepoSnapshot({ owner: 'acme', repo: 'widgets' }, { depth: 'standard' })
    fetchMock.mockClear()
    await loadRepoSnapshot({ owner: 'acme', repo: 'widgets' }, { depth: 'quick' })
    const urls = fetchMock.mock.calls.map(([u]) => String(u))
    // Meta + commit came from the 10-minute cache; the tree and files are new for this depth.
    expect(urls.filter((u) => u.startsWith('https://api.github.com'))).toEqual([
      expect.stringContaining('/git/trees/'),
    ])
  })

  it('opens a specific branch and skips resolving a full SHA', async () => {
    const sha = 'b'.repeat(40)
    const { fetchMock } = install({ sha })
    const snap = await loadRepoSnapshot({ owner: 'acme', repo: 'widgets', ref: sha }, { depth: 'quick' })
    expect(snap.ref).toBe(sha)
    expect(snap.commitSha).toBe(sha)
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/commits/'))).toBe(false)
  })

  it('explains an unknown branch', async () => {
    install()
    await expect(loadRepoSnapshot({ owner: 'acme', repo: 'widgets', ref: 'nope' }, { depth: 'quick' })).rejects.toMatchObject({
      kind: 'not-found',
      message: expect.stringContaining('“nope”'),
    })
  })

  it('throws "empty" for a repository with no files', async () => {
    install({ files: {} })
    const err = await loadRepoSnapshot({ owner: 'acme', repo: 'widgets' }, { depth: 'quick' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(GitHubError)
    expect((err as GitHubError).kind).toBe('empty')

    install({ files: {}, extraTree: [{ path: 'sub', type: 'commit', mode: '160000' }] })
    await expect(loadRepoSnapshot({ owner: 'acme', repo: 'widgets' }, { depth: 'quick', force: true })).rejects.toMatchObject({
      kind: 'empty',
      message: "This repository is empty — there's no code to explore yet.",
    })
  })

  it('reports a missing repository as not-found', async () => {
    install()
    await expect(loadRepoSnapshot({ owner: 'nobody', repo: 'nothing' }, { depth: 'quick' })).rejects.toMatchObject({ kind: 'not-found' })
  })

  it('rejects blank input', async () => {
    await expect(loadRepoSnapshot({ owner: ' ', repo: 'x' }, { depth: 'quick' })).rejects.toMatchObject({ kind: 'invalid-input' })
  })

  it('reads private repositories through the API with the token', async () => {
    const { fetchMock } = install({ isPrivate: true })
    const snap = await loadRepoSnapshot({ owner: 'acme', repo: 'widgets' }, { depth: 'standard', token: 'ghp_x' })
    expect(snap.meta.isPrivate).toBe(true)
    expect(snap.files['src/App.tsx']).toBe('export function App() { return null }\n')
    expect(fetchMock.mock.calls.some(([u]) => String(u).startsWith('https://raw.githubusercontent.com'))).toBe(false)
  })

  it('does not cache a snapshot when most downloads failed', async () => {
    const { fetchMock } = install({ rawStatus: { 'README.md': 500, 'package.json': 500, 'src/index.ts': 500, 'src/App.tsx': 500 } })
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 50 })
    try {
      const snap = await loadRepoSnapshot({ owner: 'acme', repo: 'widgets' }, { depth: 'standard' })
      expect(snap.skipped.filter((s) => s.reason === 'fetch-failed').length).toBeGreaterThanOrEqual(4)
    } finally {
      vi.useRealTimers()
    }
    fetchMock.mockClear()
    await loadRepoSnapshot({ owner: 'acme', repo: 'widgets' }, { depth: 'standard' })
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/git/trees/'))).toBe(true)
  })

  it('honors an aborted signal', async () => {
    const { fetchMock } = install()
    const ctrl = new AbortController()
    ctrl.abort()
    await expect(loadRepoSnapshot({ owner: 'acme', repo: 'widgets' }, { depth: 'quick', signal: ctrl.signal })).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stops when aborted midway', async () => {
    const ctrl = new AbortController()
    const { fetchMock } = install()
    const p = loadRepoSnapshot(
      { owner: 'acme', repo: 'widgets' },
      {
        depth: 'quick',
        signal: ctrl.signal,
        onProgress: (prog) => {
          if (prog.stage === 'tree') ctrl.abort()
        },
      },
    )
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock.mock.calls.some(([u]) => String(u).startsWith('https://raw.githubusercontent.com'))).toBe(false)
  })
})

describe('snapshot cache', () => {
  it('keeps only the most recent snapshots', async () => {
    for (let i = 0; i <= MAX_CACHED_SNAPSHOTS; i++) {
      install({ repo: `repo${i}` })
      await loadRepoSnapshot({ owner: 'acme', repo: `repo${i}` }, { depth: 'quick' })
    }
    const cached = await listCachedSnapshots()
    expect(cached).toHaveLength(MAX_CACHED_SNAPSHOTS)
    expect(cached.map((c) => c.fullName)).not.toContain('acme/repo0')
    expect(cached[0].fullName).toBe(`acme/repo${MAX_CACHED_SNAPSHOTS}`)
    expect(cached[0]).toMatchObject({ depth: 'quick', ref: 'main', fileCount: 10 })

    // repo0 was evicted: its commit is still remembered, but the files must be downloaded again.
    const { fetchMock } = install({ repo: 'repo0' })
    await loadRepoSnapshot({ owner: 'acme', repo: 'repo0' }, { depth: 'quick' })
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/git/trees/'))).toBe(true)

    // That pushed out repo1 (now the oldest); repo2 is still cached: loading it is free and makes it the most recent.
    expect((await listCachedSnapshots()).map((c) => c.fullName)).not.toContain('acme/repo1')
    const second = install({ repo: 'repo2' })
    await loadRepoSnapshot({ owner: 'acme', repo: 'repo2' }, { depth: 'quick' })
    expect(second.fetchMock).not.toHaveBeenCalled()
    expect((await listCachedSnapshots())[0].fullName).toBe('acme/repo2')
  })

  it('clearSnapshotCache empties everything', async () => {
    install()
    await loadRepoSnapshot({ owner: 'acme', repo: 'widgets' }, { depth: 'quick' })
    expect(await listCachedSnapshots()).toHaveLength(1)
    await clearSnapshotCache()
    expect(await listCachedSnapshots()).toEqual([])
    const { fetchMock } = install()
    await loadRepoSnapshot({ owner: 'acme', repo: 'widgets' }, { depth: 'quick' })
    expect(fetchMock.mock.calls.length).toBeGreaterThan(3)
  })

  it('removeCachedSnapshot removes one entry', async () => {
    const { sha } = install()
    await loadRepoSnapshot({ owner: 'acme', repo: 'widgets' }, { depth: 'quick' })
    const key = snapshotCacheKey('Acme', 'Widgets', sha, 'quick')
    expect(key).toBe(`acme/widgets@${sha}:quick`)
    await removeCachedSnapshot(key)
    expect(await listCachedSnapshots()).toEqual([])
  })

  it('does not hang when IndexedDB never answers', async () => {
    vi.resetModules()
    vi.stubGlobal('indexedDB', { open: () => ({}) })
    const fresh = await import('./snapshot')
    install()
    vi.useFakeTimers()
    try {
      const p = fresh.loadRepoSnapshot({ owner: 'acme', repo: 'widgets' }, { depth: 'quick' })
      await vi.advanceTimersByTimeAsync(3100)
      const snap = await p
      expect(snap.files['README.md']).toBe('# Widgets\nMakes widgets.')
    } finally {
      vi.useRealTimers()
    }
  })

  it('still loads when IndexedDB writes fail', async () => {
    const { fetchMock } = install()
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })
    const snap = await loadRepoSnapshot({ owner: 'acme', repo: 'widgets' }, { depth: 'quick' })
    expect(snap.files['README.md']).toBe('# Widgets\nMakes widgets.')
    spy.mockRestore()
    fetchMock.mockClear()
    await loadRepoSnapshot({ owner: 'acme', repo: 'widgets' }, { depth: 'quick' })
    expect(fetchMock.mock.calls.length).toBeGreaterThan(0)
  })
})
