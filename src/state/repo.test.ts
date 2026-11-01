import type { RepoRef, RepoSnapshot } from '@/core/types'
import type { FetchFileParams, LoadSnapshotOptions } from '@/github'

const pendingMain: ((text: string) => void)[] = []

vi.mock('@/github', async (orig) => {
  const real = await orig<typeof import('@/github')>()
  return {
    ...real,
    loadRepoSnapshot: vi.fn(
      async (ref: RepoRef, _opts: LoadSnapshotOptions): Promise<RepoSnapshot> => ({
        meta: {
          owner: ref.owner,
          repo: ref.repo,
          fullName: `${ref.owner}/${ref.repo}`,
          description: null,
          homepage: null,
          htmlUrl: `https://github.com/${ref.owner}/${ref.repo}`,
          ownerAvatarUrl: '',
          stars: 0,
          forks: 0,
          openIssues: 0,
          defaultBranch: 'main',
          topics: [],
          license: null,
          primaryLanguage: null,
          createdAt: '2020-01-01T00:00:00Z',
          pushedAt: '2020-01-01T00:00:00Z',
          sizeKb: 1,
          isPrivate: false,
          isFork: false,
          archived: false,
        },
        ref: ref.ref ?? 'main',
        commitSha: ref.ref === 'dev' ? 'b'.repeat(40) : 'a'.repeat(40),
        tree: [
          { path: 'README.md', size: 5, sha: 'x' },
          { path: 'docs/big.md', size: 999_999, sha: 'y' },
        ],
        treeTruncated: false,
        files: { 'README.md': 'hello' },
        skipped: [{ path: 'docs/big.md', reason: 'limit' }],
        fetchedAt: 0,
      }),
    ),
    fetchFileText: vi.fn((p: FetchFileParams) => {
      // Downloads on the main branch are slow (they finish when the test says so); dev answers at once.
      if (p.commitSha.startsWith('a')) return new Promise<string>((resolve) => pendingMain.push(resolve))
      return Promise.resolve('CONTENT FROM dev BRANCH')
    }),
  }
})
vi.mock('@/analysis', () => ({ analyzeRepo: vi.fn(async (s: RepoSnapshot) => ({ meta: s.meta })) }))

const github = await import('@/github')
const { useRepoStore } = await import('./repo')
const { useSettings } = await import('./settings')

beforeEach(() => {
  pendingMain.length = 0
  useRepoStore.getState().reset()
  vi.mocked(github.fetchFileText).mockClear()
  vi.mocked(github.loadRepoSnapshot).mockClear()
})

describe('repo store', () => {
  it('never shows a late download from the previous branch in the next one', async () => {
    await useRepoStore.getState().load({ owner: 'o', repo: 'r' })
    expect(useRepoStore.getState().status).toBe('ready')
    const late = useRepoStore.getState().getFileContent('docs/big.md') // slow download on main …
    await useRepoStore.getState().load({ owner: 'o', repo: 'r', ref: 'dev' }) // … the user switches branch
    expect(useRepoStore.getState().snapshot?.commitSha).toBe('b'.repeat(40))

    // The switch aborted the old download's request.
    const firstCall = vi.mocked(github.fetchFileText).mock.calls[0][0]
    expect(firstCall.signal?.aborted).toBe(true)

    pendingMain.forEach((resolve) => resolve('CONTENT FROM main BRANCH')) // it finishes late anyway
    await expect(late).resolves.toBe('CONTENT FROM main BRANCH')
    await expect(useRepoStore.getState().getFileContent('docs/big.md')).resolves.toBe('CONTENT FROM dev BRANCH')
  })

  it('remembers on-demand downloads for the snapshot they belong to', async () => {
    await useRepoStore.getState().load({ owner: 'o', repo: 'r', ref: 'dev' })
    await useRepoStore.getState().getFileContent('docs/big.md')
    await useRepoStore.getState().getFileContent('docs/big.md')
    expect(github.fetchFileText).toHaveBeenCalledTimes(1)
    // Files already in the snapshot are never downloaded, and object built-ins are not mistaken for files.
    await expect(useRepoStore.getState().getFileContent('README.md')).resolves.toBe('hello')
    await useRepoStore.getState().getFileContent('constructor')
    expect(github.fetchFileText).toHaveBeenCalledTimes(2)
  })

  it('only lets private code be kept on disk when the user chose to remember their keys', async () => {
    useSettings.getState().set({ rememberKeys: false })
    await useRepoStore.getState().load({ owner: 'o', repo: 'r' })
    expect(vi.mocked(github.loadRepoSnapshot).mock.calls[0][1].persistPrivate).toBe(false)

    useSettings.getState().set({ rememberKeys: true })
    await useRepoStore.getState().load({ owner: 'o', repo: 'other' })
    expect(vi.mocked(github.loadRepoSnapshot).mock.calls[1][1].persistPrivate).toBe(true)
    useSettings.getState().set({ rememberKeys: false })
  })
})
