import { parseRepoInput } from './parse'
import type { RepoRef } from '@/core/types'

const ok = (owner: string, repo: string, ref?: string): RepoRef => (ref ? { owner, repo, ref } : { owner, repo })

describe('parseRepoInput', () => {
  const valid: [string, RepoRef][] = [
    // Bare forms
    ['facebook/react', ok('facebook', 'react')],
    ['  facebook/react  ', ok('facebook', 'react')],
    ['facebook/react/', ok('facebook', 'react')],
    ['facebook/react.git', ok('facebook', 'react')],
    ['vercel/next.js', ok('vercel', 'next.js')],
    ['octo-org/my_repo-2', ok('octo-org', 'my_repo-2')],
    ['owner/repo@develop', ok('owner', 'repo', 'develop')],
    ['owner/repo@feature/login', ok('owner', 'repo', 'feature/login')],
    ['owner/repo/tree/main', ok('owner', 'repo', 'main')],
    ['a/b', ok('a', 'b')],
    ['user/user.github.io', ok('user', 'user.github.io')],

    // Host without scheme
    ['github.com/facebook/react', ok('facebook', 'react')],
    ['GitHub.com/facebook/react', ok('facebook', 'react')],
    ['www.github.com/facebook/react', ok('facebook', 'react')],

    // https / http
    ['https://github.com/facebook/react', ok('facebook', 'react')],
    ['http://github.com/facebook/react', ok('facebook', 'react')],
    ['HTTPS://GITHUB.COM/facebook/react', ok('facebook', 'react')],
    ['https://github.com/facebook/react/', ok('facebook', 'react')],
    ['https://github.com/facebook/react//', ok('facebook', 'react')],
    ['https://github.com/facebook/react.git', ok('facebook', 'react')],
    ['https://github.com/facebook/react.GIT', ok('facebook', 'react')],
    ['https://www.github.com/facebook/react', ok('facebook', 'react')],
    ['https://github.com:443/facebook/react', ok('facebook', 'react')],

    // Query and hash are ignored
    ['https://github.com/facebook/react?tab=readme-ov-file', ok('facebook', 'react')],
    ['https://github.com/facebook/react#readme', ok('facebook', 'react')],
    ['https://github.com/facebook/react/tree/main?tab=readme#install', ok('facebook', 'react', 'main')],

    // Refs from deep links
    ['https://github.com/owner/repo/tree/branch-name', ok('owner', 'repo', 'branch-name')],
    ['https://github.com/owner/repo/tree/feature/x/src/dir', ok('owner', 'repo', 'feature')],
    ['https://github.com/owner/repo/tree/feature%2Fx', ok('owner', 'repo', 'feature/x')],
    ['https://github.com/owner/repo/blob/main/src/index.ts', ok('owner', 'repo', 'main')],
    ['https://github.com/owner/repo/blob/v1.2.3/README.md#L10', ok('owner', 'repo', 'v1.2.3')],
    [
      'https://github.com/owner/repo/commit/3f786850e387550fdab836ed7e6dc881de23001b',
      ok('owner', 'repo', '3f786850e387550fdab836ed7e6dc881de23001b'),
    ],
    ['https://github.com/owner/repo/commits/develop', ok('owner', 'repo', 'develop')],
    ['https://github.com/owner/repo/releases/tag/v2.0.0', ok('owner', 'repo', 'v2.0.0')],
    ['https://github.com/owner/repo/blame/main/a.ts', ok('owner', 'repo', 'main')],
    ['https://github.com/owner/repo/tree/', ok('owner', 'repo')],

    // Other repo pages keep only the repo
    ['https://github.com/owner/repo/issues/42', ok('owner', 'repo')],
    ['https://github.com/owner/repo/pull/7/files', ok('owner', 'repo')],
    ['https://github.com/owner/repo/releases', ok('owner', 'repo')],
    ['https://github.com/owner/repo/wiki', ok('owner', 'repo')],

    // Git remotes
    ['git@github.com:facebook/react.git', ok('facebook', 'react')],
    ['git@github.com:facebook/react', ok('facebook', 'react')],
    ['git@GitHub.com:facebook/react.git', ok('facebook', 'react')],
    ['ssh://git@github.com/facebook/react.git', ok('facebook', 'react')],
    ['git://github.com/facebook/react.git', ok('facebook', 'react')],
    ['git+https://github.com/facebook/react.git', ok('facebook', 'react')],
    ['git+ssh://git@github.com/facebook/react.git', ok('facebook', 'react')],

    // Other GitHub hosts
    ['https://api.github.com/repos/facebook/react', ok('facebook', 'react')],
    ['https://raw.githubusercontent.com/facebook/react/main/README.md', ok('facebook', 'react', 'main')],
    ['https://raw.githubusercontent.com/facebook/react/refs/heads/dev/README.md', ok('facebook', 'react', 'dev')],

    // Wrapped in punctuation people paste
    ['<https://github.com/facebook/react>', ok('facebook', 'react')],
    ['"facebook/react"', ok('facebook', 'react')],
    ['`facebook/react`', ok('facebook', 'react')],
    ['(github.com/facebook/react)', ok('facebook', 'react')],

    // Case is preserved (GitHub is case-insensitive; the API returns canonical casing)
    ['https://github.com/Microsoft/TypeScript', ok('Microsoft', 'TypeScript')],
  ]

  it.each(valid)('parses %j', (input, expected) => {
    expect(parseRepoInput(input)).toEqual(expected)
  })

  const invalid: string[] = [
    '',
    '   ',
    'react',
    'facebook',
    'facebook/',
    '/react',
    'facebook / react',
    'face book/react',
    'https://github.com',
    'https://github.com/',
    'https://github.com/facebook',
    'https://gitlab.com/owner/repo',
    'https://example.com/owner/repo',
    'https://gist.github.com/owner/abc123',
    'ftp://github.com/owner/repo',
    'javascript:alert(1)',
    'https://github.com/settings/profile',
    'https://github.com/orgs/acme/repositories',
    'https://github.com/features/actions',
    'https://github.com/topics/react',
    'https://github.com/marketplace/actions/checkout',
    'owner/.',
    'owner/..',
    '-owner/repo',
    'owner!/repo',
    'owner/re$po',
    `${'a'.repeat(40)}/repo`,
    'https://api.github.com/users/octocat',
    'git@gitlab.com:owner/repo.git',
  ]

  it.each(invalid)('rejects %j', (input) => {
    expect(parseRepoInput(input)).toBeNull()
  })

  it('accepts a 39-character owner', () => {
    expect(parseRepoInput(`${'a'.repeat(39)}/repo`)).toEqual(ok('a'.repeat(39), 'repo'))
  })

  it('does not throw on malformed percent-encoding', () => {
    expect(parseRepoInput('https://github.com/owner/repo/tree/%E0%A4%A')).toEqual(ok('owner', 'repo', '%E0%A4%A'))
  })
})
