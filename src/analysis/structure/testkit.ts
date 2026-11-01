/**
 * Test-only helpers for building analysis objects by hand. Not imported by production code.
 */
import type { AnalyzedFile, RepoMeta } from '@/core/types'
import { basename, dirname, extname } from '@/core/paths'

const LANG_BY_EXT: Record<string, string> = {
  ts: 'TypeScript',
  tsx: 'TSX',
  js: 'JavaScript',
  jsx: 'JavaScript',
  py: 'Python',
  go: 'Go',
  rs: 'Rust',
  java: 'Java',
  rb: 'Ruby',
  css: 'CSS',
  html: 'HTML',
  md: 'Markdown',
  json: 'JSON',
  yml: 'YAML',
  yaml: 'YAML',
  sql: 'SQL',
}

/** An AnalyzedFile with sensible defaults (fetched source code, 10 lines). */
export function makeFile(path: string, overrides: Partial<AnalyzedFile> = {}): AnalyzedFile {
  const ext = extname(path)
  const lines = overrides.lines === undefined ? 10 : overrides.lines
  return {
    path,
    name: basename(path),
    dir: dirname(path),
    ext,
    language: LANG_BY_EXT[ext] ?? null,
    size: (lines ?? 10) * 40,
    lines,
    fetched: lines !== null,
    kind: 'source',
    role: 'library',
    layer: 'logic',
    isEntry: false,
    moduleId: '',
    imports: [],
    externalImports: [],
    unresolvedImports: [],
    importedBy: [],
    symbols: [],
    routes: [],
    summary: '',
    ...overrides,
  }
}

export function makeMeta(overrides: Partial<RepoMeta> = {}): RepoMeta {
  return {
    owner: 'acme',
    repo: 'shop',
    fullName: 'acme/shop',
    description: null,
    homepage: null,
    htmlUrl: 'https://github.com/acme/shop',
    ownerAvatarUrl: '',
    stars: 42,
    forks: 3,
    openIssues: 1,
    defaultBranch: 'main',
    topics: [],
    license: 'MIT',
    primaryLanguage: 'TypeScript',
    createdAt: '2024-01-01T00:00:00Z',
    pushedAt: '2026-01-01T00:00:00Z',
    sizeKb: 100,
    isPrivate: false,
    isFork: false,
    archived: false,
    ...overrides,
  }
}
