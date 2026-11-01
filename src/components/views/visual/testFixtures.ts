/** A small, hand-made analysis + snapshot for the visual views' tests. */
import { makeFile, makeModule } from '@/components/graphs/testFixtures'
import type { AnalyzedFile, ConceptMap, RepoAnalysis, RepoSnapshot, Tour } from '@/core/types'

export const MAIN_TS = [
  "import { createApp } from './app'",
  '',
  '// Start the shop.',
  'const app = createApp()',
  'app.listen(3000)',
  '',
].join('\n')

export const APP_TS = Array.from({ length: 30 }, (_, i) =>
  i === 19 ? 'export function createApp() {' : i === 20 ? '  return new Shop()' : `// line ${i + 1}`,
).join('\n')

function withLinks(files: AnalyzedFile[], pairs: [string, string][]): Record<string, AnalyzedFile> {
  const map: Record<string, AnalyzedFile> = {}
  for (const f of files) map[f.path] = { ...f, imports: [], importedBy: [] }
  for (const [a, b] of pairs) {
    map[a].imports.push(b)
    map[b].importedBy.push(a)
  }
  return map
}

export const FILES = withLinks(
  [
    makeFile('src/main.ts', { moduleId: 'src', role: 'entry', isEntry: true, lines: 6, layer: 'logic' }),
    makeFile('src/app.ts', { moduleId: 'src', role: 'service', lines: 30 }),
    makeFile('src/ui/Cart.tsx', { moduleId: 'src/ui', role: 'component', layer: 'ui', lines: 120, language: 'TypeScript' }),
    makeFile('src/ui/Button.tsx', { moduleId: 'src/ui', role: 'component', layer: 'ui', lines: 45 }),
    makeFile('src/db/orders.py', { moduleId: 'src/db', role: 'model', layer: 'data', lines: 80, language: 'Python' }),
    makeFile('docs/guide.md', { moduleId: 'docs', role: 'docs', layer: 'docs', lines: null, fetched: false, language: null, size: 4000 }),
  ],
  [
    ['src/main.ts', 'src/app.ts'],
    ['src/app.ts', 'src/ui/Cart.tsx'],
    ['src/ui/Cart.tsx', 'src/ui/Button.tsx'],
    ['src/app.ts', 'src/db/orders.py'],
  ],
)

export const MODULES = [
  makeModule('src', { name: 'src', role: 'Main code', emoji: '🏠', files: ['src/main.ts', 'src/app.ts'], fileCount: 2, lines: 36, layer: 'logic' }),
  makeModule('src/ui', { name: 'ui', role: 'Screens and buttons', emoji: '🧩', files: ['src/ui/Cart.tsx', 'src/ui/Button.tsx'], fileCount: 2, lines: 165, layer: 'ui' }),
  makeModule('src/db', { name: 'db', role: 'Stored orders', emoji: '🗄️', files: ['src/db/orders.py'], fileCount: 1, lines: 80, layer: 'data' }),
  makeModule('docs', { name: 'docs', role: 'Guides', emoji: '📖', files: ['docs/guide.md'], fileCount: 1, lines: 0, layer: 'docs' }),
]

export const STARTER_CONCEPTS: ConceptMap = {
  source: 'starter',
  concepts: [
    { id: 'orders', name: 'Orders', emoji: '🧾', category: 'data', summary: 'What people buy, kept in `src/db`.', explanation: 'Orders are saved.', analogy: 'Like receipts', files: ['src/db/orders.py'], importance: 5 },
    { id: 'cart', name: 'Shopping cart', emoji: '🛒', category: 'feature', summary: 'Holds items before checkout.', explanation: 'The cart.', analogy: 'Like a basket', files: ['src/ui/Cart.tsx'], importance: 3 },
  ],
  relations: [{ from: 'cart', to: 'orders', label: 'becomes' }],
}

export const STARTER_TOURS: Tour[] = [
  {
    id: 'startup',
    title: 'What happens when the shop opens?',
    question: 'How does the shop start?',
    emoji: '🚀',
    summary: 'From `src/main.ts` to the first screen.',
    source: 'starter',
    steps: [
      { title: 'The front door', explanation: 'Everything starts in `src/main.ts`.', file: 'src/main.ts', snippet: 'const app = createApp()', moduleId: 'src' },
      { title: 'Building the app', explanation: 'The app is put together here.', file: 'src/app.ts', snippet: 'export   function createApp() {', moduleId: null },
      { title: 'The big idea', explanation: 'That is the whole start-up.', file: null, snippet: null, moduleId: null },
    ],
  },
  {
    id: 'orders',
    title: 'Where do orders go?',
    question: 'Where do orders go?',
    emoji: '🧾',
    summary: 'Follow an order into storage.',
    source: 'starter',
    steps: [{ title: 'Saving', explanation: 'Orders are saved.', file: 'src/db/orders.py', snippet: null, moduleId: 'src/db' }],
  },
]

export function makeAnalysis(over: Partial<RepoAnalysis> = {}): RepoAnalysis {
  return {
    meta: {
      owner: 'acme',
      repo: 'shop',
      fullName: 'acme/shop',
      description: 'A tiny shop.',
      homepage: null,
      htmlUrl: 'https://github.com/acme/shop',
      ownerAvatarUrl: '',
      stars: 1,
      forks: 0,
      openIssues: 0,
      defaultBranch: 'main',
      topics: [],
      license: null,
      primaryLanguage: 'TypeScript',
      createdAt: '2024-01-01T00:00:00Z',
      pushedAt: '2024-01-01T00:00:00Z',
      sizeKb: 10,
      isPrivate: false,
      isFork: false,
      archived: false,
    },
    ref: 'main',
    commitSha: 'abc123',
    files: FILES,
    fileEdges: [
      { source: 'src/main.ts', target: 'src/app.ts' },
      { source: 'src/app.ts', target: 'src/ui/Cart.tsx' },
      { source: 'src/ui/Cart.tsx', target: 'src/ui/Button.tsx' },
      { source: 'src/app.ts', target: 'src/db/orders.py' },
    ],
    modules: MODULES,
    moduleEdges: [
      { source: 'src', target: 'src/ui', weight: 1, examples: [] },
      { source: 'src', target: 'src/db', weight: 2, examples: [] },
    ],
    languages: [
      { name: 'TypeScript', bytes: 5000, files: 4, percent: 80, color: '#3178c6' },
      { name: 'Python', bytes: 1200, files: 1, percent: 20, color: '#3572A5' },
    ],
    techStack: [],
    projectKind: { id: 'web-app', label: 'Web application', description: 'An app.', emoji: '🌐', confidence: 0.8, reasons: [] },
    entryPoints: ['src/main.ts'],
    hubs: ['src/app.ts'],
    externalPackages: [],
    readme: null,
    stats: {
      totalFiles: 6,
      analyzedFiles: 5,
      totalBytes: 10000,
      totalLines: 281,
      sourceFiles: 5,
      testFiles: 0,
      languageCount: 2,
      folderCount: 4,
      maxDepth: 2,
      internalEdges: 4,
      externalPackages: 0,
    },
    glossaryTermIds: [],
    learningPath: [],
    overview: 'A tiny shop.',
    starterConcepts: STARTER_CONCEPTS,
    starterTours: STARTER_TOURS,
    warnings: [],
    analyzedAt: 0,
    ...over,
  }
}

export function makeSnapshot(analysis: RepoAnalysis): RepoSnapshot {
  return {
    meta: analysis.meta,
    ref: analysis.ref,
    commitSha: analysis.commitSha,
    tree: Object.values(analysis.files).map((f) => ({ path: f.path, size: f.size, sha: f.path })),
    treeTruncated: false,
    files: { 'src/main.ts': MAIN_TS, 'src/app.ts': APP_TS },
    skipped: [],
    fetchedAt: 0,
  }
}
