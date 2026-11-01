import { describe, expect, it, vi } from 'vitest'

vi.mock('@/knowledge', () => ({
  describeFolder: (name: string) =>
    name === 'components'
      ? { role: 'Reusable screen pieces', description: 'The building blocks screens are assembled from.', emoji: '🧩', layer: 'ui' }
      : null,
}))

import { ROOT_MODULE_ID } from '@/core/types'
import { buildModuleEdges, buildModules, fileLines } from './modules'
import { makeFile } from './structure/testkit'

function paths(ms: { id: string }[]) {
  return ms.map((m) => m.id).sort()
}

describe('buildModules', () => {
  it('returns nothing for an empty repo', () => {
    expect(buildModules([])).toEqual({ modules: [], assignments: {} })
  })

  it('opens up a dominant src folder into its sub-folders and keeps root files together', () => {
    const files = [
      makeFile('package.json', { kind: 'config', role: 'config', layer: 'config', lines: 30 }),
      makeFile('README.md', { kind: 'docs', role: 'docs', layer: 'docs', lines: 40 }),
      makeFile('src/main.tsx', { role: 'entry', layer: 'ui', isEntry: true, lines: 12 }),
      ...['Button', 'Card', 'Modal'].map((n) => makeFile(`src/components/${n}.tsx`, { role: 'component', layer: 'ui', lines: 80 })),
      ...['Home', 'Settings'].map((n) => makeFile(`src/pages/${n}.tsx`, { role: 'page', layer: 'ui', lines: 120 })),
      makeFile('src/api/client.ts', { role: 'client', layer: 'api', lines: 90 }),
      makeFile('src/store/cart.ts', { role: 'state', layer: 'logic', lines: 70 }),
      makeFile('src/utils/format.ts', { role: 'util', layer: 'logic', lines: 40 }),
      makeFile('tests/app.test.ts', { kind: 'test', role: 'test', layer: 'test', lines: 50 }),
    ]
    const { modules, assignments } = buildModules(files)
    expect(paths(modules)).toEqual([ROOT_MODULE_ID, 'src', 'src/api', 'src/components', 'src/pages', 'src/store', 'src/utils', 'tests'].sort())
    for (const f of files) expect(assignments[f.path]).toBeDefined()
    expect(assignments['src/main.tsx']).toBe('src')
    expect(assignments['package.json']).toBe(ROOT_MODULE_ID)

    const root = modules.find((m) => m.id === ROOT_MODULE_ID)!
    expect(root.name).toBe('Project setup files')
    expect(root.path).toBe('')

    const comps = modules.find((m) => m.id === 'src/components')!
    expect(comps.name).toBe('components')
    expect(comps.layer).toBe('ui')
    expect(comps.role).toBe('Reusable screen pieces')
    expect(comps.emoji).toBe('🧩')
    expect(comps.description).toContain('The building blocks screens are assembled from.')
    expect(comps.description).toContain('Holds 3 UI building blocks')
    expect(comps.fileCount).toBe(3)
    expect(comps.lines).toBe(240)
    expect(comps.languages).toEqual(['TSX'])
    expect(comps.layerBreakdown).toEqual({ ui: 240 })

    const pages = modules.find((m) => m.id === 'src/pages')!
    expect(pages.role).toBe('Screens')
    expect(pages.description).toMatch(/^Holds 2 screens — the pages people can visit\./)
  })

  it('gives every file exactly one module', () => {
    const files = Array.from({ length: 300 }, (_, i) => makeFile(`src/area${i % 40}/sub${i % 3}/file${i}.ts`, { lines: (i % 17) * 10 + 1 }))
    const { modules, assignments } = buildModules(files)
    const seen = new Map<string, number>()
    for (const m of modules) for (const p of m.files) seen.set(p, (seen.get(p) ?? 0) + 1)
    for (const f of files) {
      expect(seen.get(f.path)).toBe(1)
      expect(modules.some((m) => m.id === assignments[f.path])).toBe(true)
    }
    expect(modules.length).toBeLessThanOrEqual(24)
    expect(modules.length).toBeGreaterThanOrEqual(6)
  })

  it('splits monorepo packages into separate modules', () => {
    const files = [
      makeFile('package.json', { kind: 'config', role: 'config', layer: 'config' }),
      makeFile('packages/core/src/index.ts', { lines: 400 }),
      makeFile('packages/core/package.json', { kind: 'config', role: 'config', layer: 'config' }),
      makeFile('packages/ui/src/Button.tsx', { role: 'component', layer: 'ui', lines: 100 }),
      makeFile('packages/cli/src/main.ts', { role: 'cli', layer: 'api', lines: 50 }),
      makeFile('apps/web/src/main.tsx', { role: 'entry', layer: 'ui', lines: 60 }),
      makeFile('apps/docs/index.md', { kind: 'docs', role: 'docs', layer: 'docs', lines: 60 }),
    ]
    const { modules } = buildModules(files)
    const ids = paths(modules)
    expect(ids).toEqual(expect.arrayContaining(['packages/core', 'packages/ui', 'packages/cli', 'apps/web', 'apps/docs']))
    const core = modules.find((m) => m.id === 'packages/core')!
    expect(core.name).toBe('core')
    expect(core.description).toMatch(/separate packages/)
  })

  it('expands workspace folders declared by manifests', () => {
    const files = [
      makeFile('modules/alpha/a.ts', { lines: 50 }),
      makeFile('modules/beta/b.ts', { lines: 50 }),
      makeFile('modules/gamma/c.ts', { lines: 50 }),
      makeFile('README.md', { kind: 'docs', role: 'docs', layer: 'docs' }),
    ]
    const { modules } = buildModules(files, { workspaces: ['modules/*'] })
    expect(paths(modules)).toEqual(expect.arrayContaining(['modules/alpha', 'modules/beta', 'modules/gamma']))
  })

  it('collapses single-folder chains like Java package paths', () => {
    const base = 'src/main/java/com/acme/shop'
    const files = [
      makeFile('pom.xml', { kind: 'config', role: 'config', layer: 'config' }),
      makeFile(`${base}/Application.java`, { role: 'entry', isEntry: true, lines: 20 }),
      makeFile(`${base}/controller/OrderController.java`, { role: 'controller', layer: 'api', lines: 200 }),
      makeFile(`${base}/service/OrderService.java`, { role: 'service', lines: 300 }),
      makeFile(`${base}/model/Order.java`, { role: 'model', layer: 'data', lines: 100 }),
      makeFile('src/test/java/com/acme/shop/OrderTest.java', { kind: 'test', role: 'test', layer: 'test', lines: 100 }),
    ]
    const { modules } = buildModules(files)
    const names = modules.map((m) => m.name)
    expect(names).toEqual(expect.arrayContaining(['controller', 'service', 'model', 'shop']))
    expect(modules.find((m) => m.name === 'controller')!.id).toBe(`${base}/controller`)
  })

  it('makes names unique by adding the parent folder', () => {
    const files = [
      makeFile('client/components/A.tsx', { role: 'component', layer: 'ui', lines: 100 }),
      makeFile('client/pages/P.tsx', { role: 'page', layer: 'ui', lines: 100 }),
      makeFile('server/components/B.ts', { lines: 100 }),
      makeFile('server/routes/r.ts', { role: 'route', layer: 'api', lines: 100 }),
    ]
    const { modules } = buildModules(files)
    const names = modules.map((m) => m.name)
    expect(names).toEqual(expect.arrayContaining(['client/components', 'server/components']))
    expect(new Set(names).size).toBe(names.length)
  })

  it('folds the smallest folders into their parent when there are too many', () => {
    const files = [
      ...Array.from({ length: 40 }, (_, i) => makeFile(`src/f${i}/x.ts`, { lines: i === 0 ? 5000 : 10 + i })),
      makeFile('src/index.ts', { role: 'entry', isEntry: true }),
    ]
    const { modules, assignments } = buildModules(files)
    expect(modules.length).toBeLessThanOrEqual(24)
    expect(assignments['src/f0/x.ts']).toBe('src/f0')
    expect(assignments['src/f1/x.ts']).toBe('src')
    const src = modules.find((m) => m.id === 'src')!
    expect(src.description).toMatch(/more small folders/)
  })

  it('names the root module after the project when the main code lives at the top level', () => {
    const files = [
      makeFile('gin.go', { language: 'Go', lines: 600 }),
      makeFile('context.go', { language: 'Go', lines: 900 }),
      makeFile('tree.go', { language: 'Go', lines: 700 }),
      makeFile('go.mod', { kind: 'config', role: 'config', layer: 'config', lines: 20 }),
      makeFile('render/json.go', { language: 'Go', lines: 100 }),
    ]
    const { modules } = buildModules(files, { projectName: 'gin' })
    const root = modules.find((m) => m.id === ROOT_MODULE_ID)!
    expect(root.name).toBe('gin')
    expect(root.role).toBe('Main code (top level)')
  })

  it('estimates lines for files that were not downloaded and ignores media', () => {
    expect(fileLines(makeFile('a.ts', { lines: null, size: 4000 }))).toBe(100)
    expect(fileLines(makeFile('a.png', { lines: null, size: 4000, kind: 'asset' }))).toBe(0)
    const { modules } = buildModules([makeFile('lib/a.ts', { lines: null, size: 4000 }), makeFile('lib/b.ts', { lines: 5 })])
    expect(modules[0].lines).toBe(105)
  })

  it('lists entry points first, then the most-used files, as key files', () => {
    const files = [
      makeFile('lib/a.ts', { importedBy: ['x', 'y', 'z'] }),
      makeFile('lib/b.ts', { importedBy: ['x'] }),
      makeFile('lib/main.ts', { isEntry: true }),
      makeFile('lib/c.test.ts', { kind: 'test', importedBy: ['q', 'r', 's', 't'] }),
    ]
    const { modules } = buildModules(files)
    expect(modules[0].keyFiles).toEqual(['lib/main.ts', 'lib/a.ts', 'lib/b.ts'])
  })
})

describe('buildModuleEdges', () => {
  it('aggregates file links into module links with examples, skipping self-loops and duplicates', () => {
    const assignments = { 'a/1.ts': 'a', 'a/2.ts': 'a', 'b/1.ts': 'b', 'b/2.ts': 'b', 'c/1.ts': 'c' }
    const edges = buildModuleEdges(
      [
        { source: 'a/1.ts', target: 'b/1.ts' },
        { source: 'a/1.ts', target: 'b/1.ts' },
        { source: 'a/2.ts', target: 'b/1.ts' },
        { source: 'a/2.ts', target: 'b/2.ts' },
        { source: 'a/1.ts', target: 'b/2.ts' },
        { source: 'a/1.ts', target: 'a/2.ts' },
        { source: 'b/1.ts', target: 'c/1.ts' },
        { source: 'zzz.ts', target: 'c/1.ts' },
      ],
      assignments,
    )
    expect(edges).toHaveLength(2)
    expect(edges[0]).toMatchObject({ source: 'a', target: 'b', weight: 4 })
    expect(edges[0].examples).toHaveLength(3)
    expect(edges[1]).toMatchObject({ source: 'b', target: 'c', weight: 1, examples: [{ from: 'b/1.ts', to: 'c/1.ts' }] })
  })
})
