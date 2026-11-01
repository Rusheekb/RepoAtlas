/** Small fixtures for the visualization tests. */
import { basename, dirname, extname } from '@/core/paths'
import type { AnalyzedFile, ConceptMap, FileRole, Layer, ModuleEdge, ModuleInfo, TechItem, Tour } from '@/core/types'

export function makeFile(path: string, over: Partial<AnalyzedFile> = {}): AnalyzedFile {
  return {
    path,
    name: basename(path),
    dir: dirname(path),
    ext: extname(path),
    language: 'TypeScript',
    size: 1200,
    lines: 40,
    fetched: true,
    kind: 'source',
    role: 'util' as FileRole,
    layer: 'logic' as Layer,
    isEntry: false,
    moduleId: dirname(path) || '(root)',
    imports: [],
    externalImports: [],
    unresolvedImports: [],
    importedBy: [],
    symbols: [],
    routes: [],
    summary: `Helper code in ${basename(path)}.`,
    ...over,
  }
}

/** Wire imports / importedBy for a list of [from, to] pairs. */
export function linkFiles(files: AnalyzedFile[], pairs: [string, string][]): Record<string, AnalyzedFile> {
  const map: Record<string, AnalyzedFile> = {}
  for (const f of files) map[f.path] = { ...f, imports: [...f.imports], importedBy: [...f.importedBy] }
  for (const [a, b] of pairs) {
    map[a].imports.push(b)
    map[b].importedBy.push(a)
  }
  return map
}

export function makeModule(id: string, over: Partial<ModuleInfo> = {}): ModuleInfo {
  return {
    id,
    name: id.split('/').pop() || 'Project setup files',
    path: id === '(root)' ? '' : id,
    layer: 'logic',
    role: 'Core rules',
    description: `The ${id} part of the project.`,
    emoji: '⚙️',
    files: [],
    fileCount: 3,
    lines: 1200,
    bytes: 40_000,
    languages: ['TypeScript'],
    keyFiles: [],
    layerBreakdown: { logic: 800, ui: 400 },
    ...over,
  }
}

export const MODULES: ModuleInfo[] = [
  makeModule('src/pages', { layer: 'ui', role: 'Whole screens', emoji: '📄', layerBreakdown: { ui: 900 } }),
  makeModule('src/components', { layer: 'ui', role: 'Reusable screen pieces', emoji: '🧩' }),
  makeModule('src/state', { layer: 'data', role: 'App memory', emoji: '🧠' }),
  makeModule('src/utils', { role: 'Helpers', emoji: '🧰' }),
  makeModule('docs', { layer: 'docs', role: 'Guides', emoji: '📖', lines: 0, bytes: 2048 }),
]

export const MODULE_EDGES: ModuleEdge[] = [
  { source: 'src/pages', target: 'src/components', weight: 12, examples: [] },
  { source: 'src/pages', target: 'src/state', weight: 4, examples: [] },
  { source: 'src/components', target: 'src/utils', weight: 6, examples: [] },
  { source: 'src/state', target: 'src/utils', weight: 1, examples: [] },
  { source: 'src/utils', target: 'src/state', weight: 1, examples: [] },
]

export const CONCEPTS: ConceptMap = {
  source: 'starter',
  concepts: [
    { id: 'repo', name: 'Repository', emoji: '📦', category: 'data', summary: 'A project on GitHub.', explanation: '', analogy: 'Like a folder of documents', files: ['a.ts'], importance: 5 },
    { id: 'analysis', name: 'Analysis', emoji: '🔍', category: 'process', summary: 'Reading the code.', explanation: '', analogy: '', files: [], importance: 4 },
    { id: 'reader', name: 'Reader', emoji: '🧑', category: 'actor', summary: 'You!', explanation: '', analogy: '', files: [], importance: 3 },
    { id: 'map', name: 'Map view', emoji: '🗺️', category: 'feature', summary: 'A picture of the parts.', explanation: '', analogy: '', files: [], importance: 2 },
    { id: 'lonely', name: 'Standalone idea', emoji: '💡', category: 'idea', summary: 'Not linked.', explanation: '', analogy: '', files: [], importance: 1 },
  ],
  relations: [
    { from: 'analysis', to: 'repo', label: 'reads' },
    { from: 'reader', to: 'map', label: 'looks at' },
    { from: 'map', to: 'analysis', label: 'is drawn from' },
    { from: 'repo', to: 'analysis', label: 'feeds' },
    { from: 'ghost', to: 'repo', label: 'ignored' },
  ],
}

export const TECH: TechItem[] = [
  { id: 'react', name: 'React', category: 'frontend', description: 'A toolkit for building web pages. It is popular.', analogy: 'Like LEGO bricks for web pages', evidence: [], importance: 'core' },
  { id: 'tailwind', name: 'Tailwind CSS', category: 'styling', description: 'Styling helpers.', evidence: [], importance: 'supporting' },
  { id: 'typescript', name: 'TypeScript', category: 'language', description: 'JavaScript with labels on data.', evidence: [], importance: 'core' },
  { id: 'vitest', name: 'Vitest', category: 'testing', description: 'Runs automatic checks.', evidence: [], importance: 'tooling' },
  { id: 'vite', name: 'Vite', category: 'build', description: 'Bundles the app.', evidence: [], importance: 'tooling' },
]

export const TOUR: Tour = {
  id: 'startup',
  title: 'What happens when the app starts?',
  question: 'What happens when the app starts?',
  emoji: '🚀',
  summary: 'From the first file to the first screen.',
  source: 'starter',
  steps: [
    { title: 'The front door', explanation: '', file: 'src/main.tsx', snippet: null, moduleId: '(root)' },
    { title: 'The page frame', explanation: '', file: 'src/pages/Home.tsx', snippet: null, moduleId: 'src/pages' },
    { title: 'The big idea', explanation: '', file: null, snippet: null, moduleId: null },
  ],
}

/** jsdom lacks layout + ResizeObserver; give elements a size so charts render. */
export function stubLayout(width = 900, height = 600): () => void {
  const originalRect = HTMLElement.prototype.getBoundingClientRect
  const originalRO = globalThis.ResizeObserver
  const originalMatrix = (globalThis as { DOMMatrixReadOnly?: unknown }).DOMMatrixReadOnly
  HTMLElement.prototype.getBoundingClientRect = function () {
    return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON: () => ({}) } as DOMRect
  }
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  ;(globalThis as { DOMMatrixReadOnly?: unknown }).DOMMatrixReadOnly = class {
    m22 = 1
    constructor(_transform?: string) {
      void _transform
    }
  }
  return () => {
    HTMLElement.prototype.getBoundingClientRect = originalRect
    globalThis.ResizeObserver = originalRO
    ;(globalThis as { DOMMatrixReadOnly?: unknown }).DOMMatrixReadOnly = originalMatrix
  }
}
