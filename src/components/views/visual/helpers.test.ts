import { buildArchitectureLayout } from '@/components/graphs'
import { makeFile, makeModule } from '@/components/graphs/testFixtures'
import type { ModuleEdge, Tour } from '@/core/types'
import {
  bestFitDirection,
  defaultSortDirection,
  moduleFiles,
  moduleNeighborhood,
  moduleRows,
  nameList,
  outsideNeighborCount,
  presentLayers,
  sortModuleRows,
} from './architecture'
import { makeCodeRefResolver } from './codeRefs'
import { biggestFiles, cleanFolder, filesUnder, folderExists, folderStats } from './codemap'
import { FILES, MODULES, STARTER_TOURS, makeAnalysis } from './testFixtures'
import {
  mergeTours,
  pickNextTour,
  resumeStepIndex,
  seenStepCount,
  stepIndexFromParam,
  stepModuleId,
  tourKey,
  tourStatus,
  tourStepKey,
} from './tours'
import { seenIdsFrom } from './useSeen'

const EDGES: ModuleEdge[] = [
  { source: 'src', target: 'src/ui', weight: 3, examples: [] },
  { source: 'src', target: 'src/db', weight: 1, examples: [] },
  { source: 'src/ui', target: 'src/db', weight: 2, examples: [] },
  { source: 'src', target: 'src', weight: 9, examples: [] },
  { source: 'src', target: 'ghost', weight: 9, examples: [] },
]

describe('architecture helpers', () => {
  it('builds rows with distinct, named "uses" and "used by" lists', () => {
    const rows = moduleRows(MODULES, EDGES)
    const src = rows.find((r) => r.module.id === 'src')
    const db = rows.find((r) => r.module.id === 'src/db')
    expect(src?.uses.map((m) => m.name)).toEqual(['db', 'ui'])
    expect(src?.usedBy).toEqual([])
    expect(db?.usedBy.map((m) => m.name)).toEqual(['src', 'ui'])
    expect(rows).toHaveLength(MODULES.length)
  })

  it('sorts by any column with stable name tie-breaks', () => {
    const rows = moduleRows(MODULES, EDGES)
    expect(sortModuleRows(rows, 'lines', 'desc').map((r) => r.module.id)).toEqual(['src/ui', 'src/db', 'src', 'docs'])
    expect(sortModuleRows(rows, 'name', 'asc').map((r) => r.module.name)).toEqual(['db', 'docs', 'src', 'ui'])
    expect(sortModuleRows(rows, 'usedBy', 'desc')[0].module.id).toBe('src/db')
    expect(sortModuleRows(rows, 'files', 'asc').map((r) => r.module.fileCount)).toEqual([1, 1, 2, 2])
    expect(defaultSortDirection('name')).toBe('asc')
    expect(defaultSortDirection('lines')).toBe('desc')
  })

  it('lists a module’s files and the layers present', () => {
    expect(moduleFiles(MODULES[1], FILES).map((f) => f.path)).toEqual(['src/ui/Cart.tsx', 'src/ui/Button.tsx'])
    expect(moduleFiles(makeModule('x', { files: ['nope.ts'] }), FILES)).toEqual([])
    expect(presentLayers(MODULES)).toEqual(['ui', 'logic', 'data', 'docs'])
  })

  it('writes short name lists', () => {
    expect(nameList([])).toBe('')
    expect(nameList(['a'])).toBe('a')
    expect(nameList(['a', 'b', 'c'])).toBe('a, b and c')
    expect(nameList(['a', 'b', 'c', 'd', 'e'], 2)).toBe('a, b and 3 more')
  })

  it('takes a module’s strongest neighbors for a small map', () => {
    const near = moduleNeighborhood('src/db', MODULES, EDGES, 1)
    expect(near.modules.map((m) => m.id)).toEqual(['src/ui', 'src/db'])
    expect(near.edges).toEqual([EDGES[2]])
    expect(moduleNeighborhood('nope', MODULES, EDGES).modules).toEqual([])
    expect(moduleNeighborhood('docs', MODULES, EDGES).modules.map((m) => m.id)).toEqual(['docs'])
  })

  it('counts the outside files connected to a set of files', () => {
    expect(outsideNeighborCount(moduleFiles(MODULES[1], FILES), FILES)).toBe(1)
    expect(outsideNeighborCount(moduleFiles(MODULES[0], FILES), FILES)).toBe(2)
    expect(outsideNeighborCount(moduleFiles(MODULES[3], FILES), FILES)).toBe(0)
  })

  it('picks the arrow direction that fills a box best', () => {
    const chain = [makeModule('a'), makeModule('b'), makeModule('c')]
    const edges: ModuleEdge[] = [
      { source: 'a', target: 'b', weight: 1, examples: [] },
      { source: 'b', target: 'c', weight: 1, examples: [] },
    ]
    expect(bestFitDirection(chain, edges, { width: 300, height: 600 }, buildArchitectureLayout)).toBe('TB')
    expect(bestFitDirection(chain, edges, { width: 1400, height: 200 }, buildArchitectureLayout)).toBe('LR')
    expect(bestFitDirection([makeModule('solo')], [], { width: 1400, height: 200 }, buildArchitectureLayout)).toBe('TB')
  })
})

describe('code map helpers', () => {
  const files = Object.values(FILES)

  it('normalizes folders and finds the files inside', () => {
    expect(cleanFolder('/src/ui/')).toBe('src/ui')
    expect(cleanFolder(null)).toBe('')
    expect(filesUnder(files, 'src/ui').map((f) => f.name)).toEqual(['Cart.tsx', 'Button.tsx'])
    expect(filesUnder(files, '')).toHaveLength(files.length)
    expect(filesUnder(files, 'sr')).toEqual([])
    expect(folderExists(files, 'src/db')).toBe(true)
    expect(folderExists(files, 'src/d')).toBe(false)
    expect(folderExists(files, '')).toBe(true)
  })

  it('ranks the biggest files by lines, skipping unread ones', () => {
    expect(biggestFiles(files, 3).map((f) => f.path)).toEqual(['src/ui/Cart.tsx', 'src/db/orders.py', 'src/ui/Button.tsx'])
    expect(biggestFiles(files).some((f) => f.lines == null)).toBe(false)
  })

  it('falls back to size when nothing was read', () => {
    const unread = [makeFile('a.bin', { lines: null, size: 10 }), makeFile('b.bin', { lines: null, size: 99 })]
    expect(biggestFiles(unread).map((f) => f.path)).toEqual(['b.bin', 'a.bin'])
  })

  it('totals a folder', () => {
    const all = folderStats(files, '')
    expect(all).toMatchObject({ files: 6, lines: 281, readFiles: 5, folders: 4 })
    expect(all.languages.map((l) => l.name)).toEqual(['TypeScript', 'Python'])
    expect(all.layerBreakdown.docs).toBe(100)
    const ui = folderStats(files, 'src/ui')
    expect(ui).toMatchObject({ files: 2, lines: 165, folders: 0 })
    expect(Object.keys(ui.layerBreakdown)).toEqual(['ui'])
  })
})

describe('tour helpers', () => {
  const tour = STARTER_TOURS[0]

  it('parses the 1-based ?step=', () => {
    expect(stepIndexFromParam(null, 3)).toBe(0)
    expect(stepIndexFromParam('1', 3)).toBe(0)
    expect(stepIndexFromParam('3', 3)).toBe(2)
    expect(stepIndexFromParam('4', 3)).toBe(3)
    expect(stepIndexFromParam('99', 3)).toBe(3)
    expect(stepIndexFromParam('0', 3)).toBe(0)
    expect(stepIndexFromParam('-2', 3)).toBe(0)
    expect(stepIndexFromParam('two', 3)).toBe(0)
  })

  it('builds progress keys and tracks status', () => {
    expect(tourKey('startup')).toBe('tour:startup')
    expect(tourStepKey('startup', 2)).toBe('tour:startup:step:2')
    expect(tourStatus(tour, undefined)).toBe('new')
    const some = { [tourStepKey('startup', 1)]: 1 }
    expect(seenStepCount(tour, some)).toBe(1)
    expect(tourStatus(tour, some)).toBe('started')
    expect(resumeStepIndex(tour, some)).toBe(1)
    const all = { ...some, [tourStepKey('startup', 2)]: 1, [tourStepKey('startup', 3)]: 1 }
    expect(tourStatus(tour, all)).toBe('done')
    expect(resumeStepIndex(tour, all)).toBe(0)
    expect(tourStatus(tour, { [tourKey('startup')]: 1 })).toBe('done')
  })

  it('finds the module of a step', () => {
    const files = makeAnalysis().files
    expect(stepModuleId(tour.steps[0], files)).toBe('src')
    expect(stepModuleId(tour.steps[1], files)).toBe('src')
    expect(stepModuleId(tour.steps[2], files)).toBeNull()
  })

  it('suggests the next unfinished tour, wrapping around', () => {
    const tours = STARTER_TOURS
    expect(pickNextTour(tours, 'startup', undefined)?.id).toBe('orders')
    expect(pickNextTour(tours, 'orders', undefined)?.id).toBe('startup')
    expect(pickNextTour(tours, 'startup', { [tourKey('orders')]: 1 })).toBeNull()
  })

  it('merges Claude’s tours first and keeps every id unique', () => {
    const ai: Tour[] = [
      { ...STARTER_TOURS[0], source: 'ai', title: 'Claude’s start-up' },
      { ...STARTER_TOURS[1], id: 'fresh', source: 'ai' },
      { ...STARTER_TOURS[1], id: 'fresh', source: 'ai', title: 'Twin' },
      { ...STARTER_TOURS[1], id: 'empty', steps: [], source: 'ai' },
    ]
    const merged = mergeTours(STARTER_TOURS, ai)
    expect(merged.map((t) => t.id)).toEqual(['ai-startup', 'fresh', 'ai-fresh', 'startup', 'orders'])
    expect(merged[0].title).toBe('Claude’s start-up')
    expect(merged[3]).toBe(STARTER_TOURS[0])
    expect(mergeTours(STARTER_TOURS, null)).toEqual(STARTER_TOURS)
  })
})

describe('seenIdsFrom', () => {
  it('strips the prefix', () => {
    expect(seenIdsFrom({ 'module:a': 1, 'file:x': 1, 'module:b/c': 2 }, 'module:')).toEqual(['a', 'b/c'])
    expect(seenIdsFrom(undefined, 'module:')).toEqual([])
  })
})

describe('makeCodeRefResolver', () => {
  const resolve = makeCodeRefResolver(['src/flask/app.py', 'src/flask/sansio/app.py', 'src/flask/ctx.py', 'README.md', 'docs/a b.md'])

  it('accepts exact paths, with or without ./ and line references', () => {
    expect(resolve('src/flask/ctx.py')).toBe('src/flask/ctx.py')
    expect(resolve('./src/flask/ctx.py:12')).toBe('src/flask/ctx.py')
    expect(resolve('README.md')).toBe('README.md')
  })

  it('resolves a unique bare file name, or the one next to the step’s file', () => {
    expect(resolve('ctx.py')).toBe('src/flask/ctx.py')
    expect(resolve('app.py')).toBeNull()
    expect(resolve('app.py', 'src/flask/sansio')).toBe('src/flask/sansio/app.py')
  })

  it('resolves a unique partial path', () => {
    expect(resolve('flask/ctx.py')).toBe('src/flask/ctx.py')
    expect(resolve('sansio/app.py')).toBe('src/flask/sansio/app.py')
  })

  it('ignores code that is not a file', () => {
    expect(resolve('Flask(__name__)')).toBeNull()
    expect(resolve('GET /')).toBeNull()
    expect(resolve('')).toBeNull()
  })
})
