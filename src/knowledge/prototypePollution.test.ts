/**
 * Regression: repository files are untrusted. Parsing them must never write to Object.prototype
 * (a `[__proto__]` section once let a crafted setup.cfg redirect Claude requests carrying the user's key).
 */
import { analyzeRepo } from '@/analysis'
import type { RepoSnapshot } from '@/core/types'
import { parseIni } from './parsers/python'
import { parseManifests } from './manifests'

const PAYLOADS: Record<string, string> = {
  'setup.cfg': '[metadata]\nname = innocent\n\n[__proto__]\nbaseURL = https://attacker.example\npolluted = yes\n\n[options]\n__proto__ = x\nconstructor = y\n',
  'tox.ini': '[__proto__]\npolluted = yes\n',
  'package.json': '{"name":"x","dependencies":{"__proto__":{"polluted":"yes"}},"scripts":{"__proto__":"polluted"},"__proto__":{"polluted":"yes"}}',
  'pyproject.toml': '[project]\nname = "x"\n[project.scripts]\n__proto__ = "a:b"\n["__proto__"]\npolluted = "yes"\n',
  'pubspec.yaml': 'name: x\ndependencies:\n  __proto__:\n    polluted: yes\n',
  'composer.json': '{"autoload":{"psr-4":{"__proto__":"src/"}}}',
  'Cargo.toml': '[package]\nname = "x"\n[dependencies]\n__proto__ = "1"\n',
  '__proto__': 'a file literally named __proto__',
  'src/__proto__/constructor.py': 'import os\n',
}

function snapshot(): RepoSnapshot {
  const paths = Object.keys(PAYLOADS)
  return {
    meta: {
      owner: 'evil', repo: 'innocent', fullName: 'evil/innocent', description: null, homepage: null, htmlUrl: '', ownerAvatarUrl: '',
      stars: 0, forks: 0, openIssues: 0, defaultBranch: 'main', topics: [], license: null, primaryLanguage: null,
      createdAt: '', pushedAt: '', sizeKb: 1, isPrivate: false, isFork: false, archived: false,
    },
    ref: 'main', commitSha: 'a'.repeat(40), tree: paths.map((path) => ({ path, size: PAYLOADS[path].length, sha: 'b' })),
    treeTruncated: false, files: Object.assign(Object.create(null), PAYLOADS), skipped: [], fetchedAt: 0,
  }
}

function assertClean() {
  const probe: Record<string, unknown> = {}
  expect(probe.polluted).toBeUndefined()
  expect(probe.baseURL).toBeUndefined()
  expect(Object.getPrototypeOf(probe)).toBe(Object.prototype)
  expect(Object.keys(Object.prototype)).toEqual([])
}

describe('prototype pollution', () => {
  afterEach(() => {
    delete (Object.prototype as Record<string, unknown>).polluted
    delete (Object.prototype as Record<string, unknown>).baseURL
  })

  it('parseIni ignores __proto__ / constructor sections and keys', () => {
    const ini = parseIni(PAYLOADS['setup.cfg'])
    assertClean()
    expect(ini.metadata.name).toBe('innocent')
  })

  it('parseManifests never pollutes Object.prototype', () => {
    parseManifests(PAYLOADS, Object.keys(PAYLOADS))
    assertClean()
  })

  it('a full analysis of a hostile repo never pollutes Object.prototype', async () => {
    await analyzeRepo(snapshot())
    assertClean()
  })
})
