import { describe, expect, it } from 'vitest'
import type { AnalyzedFile, ModuleInfo, RepoAnalysis } from '@/core/types'
import { ROOT_MODULE_ID } from '@/core/types'
import { buildLearningPath, rankModules } from './learningPath'
import { makeFile, makeMeta } from './structure/testkit'

type Input = Parameters<typeof buildLearningPath>[0]

function mod(id: string, lines: number, layer: ModuleInfo['layer'] = 'logic', keyFiles: string[] = []): ModuleInfo {
  return {
    id,
    name: id === ROOT_MODULE_ID ? 'Project setup files' : id.split('/').pop() ?? id,
    path: id === ROOT_MODULE_ID ? '' : id,
    layer,
    role: id === ROOT_MODULE_ID ? 'Project setup files' : 'Core logic',
    description: `Holds the ${id} code. More here.`,
    emoji: '⚙️',
    files: keyFiles,
    fileCount: keyFiles.length,
    lines,
    bytes: lines * 40,
    languages: ['TypeScript'],
    keyFiles,
    layerBreakdown: { [layer]: lines },
  }
}

function input(overrides: Partial<RepoAnalysis> = {}): Input {
  const files: Record<string, AnalyzedFile> = {
    'src/main.ts': makeFile('src/main.ts', { isEntry: true, entryReason: 'The server starts here — it begins listening for web requests.', lines: 80, moduleId: 'src' }),
    'src/lib/db.ts': makeFile('src/lib/db.ts', { importedBy: ['a', 'b', 'c'], lines: 200, moduleId: 'src/lib' }),
  }
  return {
    meta: makeMeta(),
    ref: 'main',
    commitSha: 'x',
    files,
    fileEdges: [],
    modules: [mod('src/lib', 900, 'logic', ['src/lib/db.ts']), mod('src/routes', 600, 'api', ['src/routes/a.ts']), mod('src/ui', 300, 'ui'), mod('tests', 2000, 'test'), mod(ROOT_MODULE_ID, 50, 'config'), mod('src', 80)],
    moduleEdges: [{ source: 'src/routes', target: 'src/lib', weight: 5, examples: [] }],
    languages: [],
    techStack: [],
    projectKind: { id: 'api-server', label: 'Server / API', description: '', emoji: '🖥️', confidence: 0.8, reasons: [] },
    entryPoints: ['src/main.ts'],
    hubs: ['src/lib/db.ts'],
    externalPackages: [],
    readme: { path: 'README.md', content: 'word '.repeat(900) },
    stats: { totalFiles: 10, analyzedFiles: 10, totalBytes: 0, totalLines: 0, sourceFiles: 5, testFiles: 2, languageCount: 1, folderCount: 3, maxDepth: 2, internalEdges: 3, externalPackages: 0 },
    glossaryTermIds: [],
    overview: '',
    warnings: [],
    analyzedAt: 0,
    ...overrides,
  }
}

describe('buildLearningPath', () => {
  it('walks from the README to a quiz through the real starting point, parts and hub', () => {
    const steps = buildLearningPath(input())
    expect(steps.length).toBeGreaterThanOrEqual(6)
    expect(steps.length).toBeLessThanOrEqual(10)
    expect(steps[0]).toMatchObject({ id: 'readme', target: { type: 'readme' }, minutes: 5 })
    expect(steps[1].target).toEqual({ type: 'view', view: 'overview' })
    expect(steps.find((s) => s.target.type === 'view' && s.target.view === 'map')).toBeDefined()
    const entry = steps.find((s) => s.target.type === 'file' && s.target.path === 'src/main.ts')!
    expect(entry.title).toBe('Open the starting point: main.ts')
    expect(entry.description).toMatch(/server starts here/)
    const modules = steps.filter((s) => s.target.type === 'module')
    expect(modules.length).toBeGreaterThanOrEqual(2)
    expect(modules[0].target).toEqual({ type: 'module', id: 'src/lib' })
    expect(modules[0].description).toMatch(/biggest part of the main code/)
    expect(modules[0].description).toMatch(/A good file to start with is db\.ts\./)
    expect(modules.some((s) => s.target.type === 'module' && s.target.id === 'tests')).toBe(false)
    expect(steps.find((s) => s.title.startsWith('Meet the most relied-on file'))?.target).toEqual({ type: 'file', path: 'src/lib/db.ts' })
    expect(steps[steps.length - 1].target).toEqual({ type: 'view', view: 'quiz' })
    expect(new Set(steps.map((s) => s.id)).size).toBe(steps.length)
    for (const s of steps) {
      expect(s.minutes).toBeGreaterThan(0)
      expect(s.description.length).toBeGreaterThan(20)
    }
  })

  it('still offers a useful path for a tiny repo with no README or starting point', () => {
    const steps = buildLearningPath(input({ readme: null, entryPoints: [], hubs: [], modules: [mod(ROOT_MODULE_ID, 10, 'config')], moduleEdges: [] }))
    expect(steps.length).toBeGreaterThanOrEqual(6)
    expect(steps[0].target).toEqual({ type: 'view', view: 'overview' })
    expect(steps[steps.length - 1].target).toEqual({ type: 'view', view: 'quiz' })
  })

  it('never exceeds 10 steps and always ends with the quiz', () => {
    const many = Array.from({ length: 12 }, (_, i) => mod(`src/m${i}`, 1000 - i))
    const steps = buildLearningPath(input({ modules: many }))
    expect(steps.length).toBeLessThanOrEqual(10)
    expect(steps[steps.length - 1].id).toBe('quiz')
  })
})

describe('rankModules', () => {
  it('ranks the project’s own code by size and connections, leaving out tests and setup files', () => {
    const ranked = rankModules(input()).map((m) => m.id)
    expect(ranked[0]).toBe('src/lib')
    expect(ranked).not.toContain('tests')
    expect(ranked).not.toContain(ROOT_MODULE_ID)
  })

  it('says “the biggest part of the main code”, since tests and docs are left out of the ranking', () => {
    const steps = buildLearningPath(input())
    const text = steps.map((st) => st.description).join(' ')
    expect(text).not.toMatch(/biggest part of the project/)
    expect(text).toMatch(/biggest part of the main code/)
  })

  it('counts the hub’s users the same way as the overview, tests included', () => {
    const files: Record<string, AnalyzedFile> = {
      'src/main.ts': makeFile('src/main.ts', { isEntry: true, lines: 80, moduleId: 'src' }),
      'src/lib/db.ts': makeFile('src/lib/db.ts', { importedBy: ['src/a.ts', 'src/b.ts', 'tests/db.test.ts'], lines: 200, moduleId: 'src/lib' }),
      'src/a.ts': makeFile('src/a.ts'),
      'src/b.ts': makeFile('src/b.ts'),
      'tests/db.test.ts': makeFile('tests/db.test.ts', { kind: 'test', role: 'test', layer: 'test' }),
    }
    const hub = buildLearningPath(input({ files })).find((st) => st.id === 'file:src/lib/db.ts')
    expect(hub?.description).toMatch(/^3 other files \(1 of them is a test\) use it/)
  })

  it('calls the project by the same name as the overview', () => {
    const steps = buildLearningPath(input(), { name: 'httpie' })
    expect(steps.find((st) => st.id === 'big-picture')?.description).toContain('what httpie is')
  })
})
