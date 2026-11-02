import { LAYER_INFO } from '@/core/labels'
import type { LanguageStat, TechCategory } from '@/core/types'
import { foldLanguages, layerSegments, OTHER_KEY, safeColor } from './bars'
import {
  CONCEPT_CATEGORIES,
  CONCEPT_CATEGORY_INFO,
  conceptCategoryInfo,
  groupTechByRow,
  TECH_CATEGORY_ROW,
  TECH_ROWS,
  techHint,
  techRowOf,
} from './categories'
import { selectFileGraph } from './fileGraphData'
import { computeHighlight, edgeLabelVisible, edgeState, nodeVisual } from './flow/highlight'
import { TECH, makeFile } from './testFixtures'

const lang = (name: string, bytes: number, color = '#3178c6'): LanguageStat => ({ name, bytes, files: 1, percent: 0, color })

describe('safeColor', () => {
  it('allows hex and our CSS variables only', () => {
    expect(safeColor('#abc')).toBe('#abc')
    expect(safeColor('#A1B2C3')).toBe('#A1B2C3')
    expect(safeColor('var(--layer-ui)')).toBe('var(--layer-ui)')
    expect(safeColor('red; background: url(x)')).toBe('var(--layer-other)')
    expect(safeColor('url(javascript:alert(1))', '#000')).toBe('#000')
    expect(safeColor(null)).toBe('var(--layer-other)')
  })
})

describe('foldLanguages', () => {
  it('keeps the top languages and folds the rest into Other', () => {
    const langs = [lang('A', 50), lang('B', 20), lang('C', 10), lang('D', 8), lang('E', 6), lang('F', 3), lang('G', 2), lang('H', 1)]
    const segs = foldLanguages(langs, 6)
    expect(segs.map((s) => s.label)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'Other'])
    const other = segs[segs.length - 1]
    expect(other.key).toBe(OTHER_KEY)
    expect(other.value).toBe(3)
    expect(other.description).toBe('G, H')
    expect(segs.reduce((s, x) => s + x.percent, 0)).toBeCloseTo(100)
  })

  it('shows a single leftover language by name instead of "Other"', () => {
    const segs = foldLanguages([lang('A', 5), lang('B', 4), lang('C', 1)], 2)
    expect(segs.map((s) => s.label)).toEqual(['A', 'B', 'C'])
  })

  it('sorts by size, sanitizes colors and handles empty input', () => {
    const segs = foldLanguages([lang('Small', 1, 'not-a-color'), lang('Big', 99)])
    expect(segs[0].label).toBe('Big')
    expect(segs[1].color).toBe('var(--layer-other)')
    expect(foldLanguages([])).toEqual([])
    expect(foldLanguages([lang('Zero', 0)])).toEqual([])
  })

  it('falls back to percentages when sizes are missing', () => {
    const segs = foldLanguages([
      { name: 'A', bytes: 0, files: 1, percent: 75, color: '#111' },
      { name: 'B', bytes: 0, files: 1, percent: 25, color: '#222' },
    ])
    expect(segs.map((s) => Math.round(s.percent))).toEqual([75, 25])
  })
})

describe('layerSegments', () => {
  it('follows the fixed layer order, not size', () => {
    const segs = layerSegments({ other: 100, ui: 1, logic: 50 })
    expect(segs.map((s) => s.key)).toEqual(['layer:ui', 'layer:logic', 'layer:other'])
    expect(segs[0].color).toBe(LAYER_INFO.ui.color)
    expect(segs[0].label).toBe(LAYER_INFO.ui.label)
    expect(layerSegments({})).toEqual([])
  })
})

describe('concept categories', () => {
  it('map to the fixed palette slots', () => {
    expect(CONCEPT_CATEGORIES).toEqual(['feature', 'actor', 'process', 'data', 'idea', 'technology'])
    expect(CONCEPT_CATEGORY_INFO.feature.color).toBe('var(--layer-ui)')
    expect(CONCEPT_CATEGORY_INFO.actor.color).toBe('var(--layer-api)')
    expect(CONCEPT_CATEGORY_INFO.process.color).toBe('var(--layer-logic)')
    expect(CONCEPT_CATEGORY_INFO.data.color).toBe('var(--layer-data)')
    expect(CONCEPT_CATEGORY_INFO.idea.color).toBe('var(--layer-test)')
    expect(CONCEPT_CATEGORY_INFO.technology.color).toBe('var(--layer-docs)')
    expect(conceptCategoryInfo('nonsense').color).toBe('var(--layer-other)')
  })
})

describe('tech stack rows', () => {
  it('maps every tech category to a row', () => {
    const all: TechCategory[] = [
      'language', 'frontend', 'backend', 'mobile', 'desktop', 'database', 'data-science', 'ai', 'styling', 'state', 'testing',
      'build', 'quality', 'infra', 'ci', 'docs', 'api', 'auth', 'payments', 'cloud', 'cli', 'game', 'utility', 'package-manager',
    ]
    const rowIds = new Set(TECH_ROWS.map((r) => r.id))
    for (const c of all) expect(rowIds.has(TECH_CATEGORY_ROW[c])).toBe(true)
    expect(Object.keys(TECH_CATEGORY_ROW)).toHaveLength(all.length)
    expect(techRowOf('frontend')).toBe('surface')
    expect(techRowOf('database')).toBe('data')
    expect(techRowOf('ci')).toBe('tools')
    expect(techRowOf('backend')).toBe('engine')
    expect(techRowOf('???')).toBe('engine')
  })

  it('groups top to bottom, drops empty rows and puts core tech first', () => {
    const groups = groupTechByRow([...TECH, TECH[0]])
    expect(groups.map((g) => g.row.label)).toEqual(['What you see', 'The engine', 'Tools behind the scenes'])
    expect(groups[0].items.map((i) => i.id)).toEqual(['react', 'tailwind'])
    expect(groups[2].items.map((i) => i.id)).toEqual(['vite', 'vitest'])
  })

  it('writes short hints', () => {
    expect(techHint(TECH[0])).toBe('Like LEGO bricks for web pages')
    expect(techHint({ description: 'Runs checks. Then more.' })).toBe('Runs checks')
    const long = techHint({ description: 'word '.repeat(40) }, 30)
    expect(long.length).toBeLessThanOrEqual(30)
    expect(long.endsWith('…')).toBe(true)
  })
})

describe('selectFileGraph', () => {
  const files = ['a', 'b', 'c', 'd'].map((n) => makeFile(`m/${n}.ts`))
  const outside = makeFile('other/x.ts')
  const edges = [
    { source: 'm/a.ts', target: 'm/b.ts' },
    { source: 'm/a.ts', target: 'm/c.ts' },
    { source: 'm/b.ts', target: 'm/c.ts' },
    { source: 'm/a.ts', target: 'other/x.ts' },
    { source: 'm/a.ts', target: 'm/b.ts' },
    { source: 'other/x.ts', target: 'other/y.ts' },
  ]

  it('keeps the most connected files under the cap', () => {
    const sel = selectFileGraph(files, edges, { cap: 2 })
    expect(sel.main).toEqual(['m/a.ts', 'm/b.ts'])
    expect(sel.hiddenMain).toBe(2)
    expect(sel.edges).toEqual([{ source: 'm/a.ts', target: 'm/b.ts' }])
  })

  it('adds outside neighbors only when asked, and only edges touching main files', () => {
    const without = selectFileGraph(files, edges)
    expect(without.neighbors).toEqual([])
    const withN = selectFileGraph(files, edges, { showNeighbors: true, allFiles: { [outside.path]: outside } })
    expect(withN.neighbors).toEqual(['other/x.ts'])
    expect(withN.edges).toContainEqual({ source: 'm/a.ts', target: 'other/x.ts' })
    expect(withN.edges.some((e) => e.target === 'other/y.ts')).toBe(false)
    expect(withN.edges).toHaveLength(4)
  })

  it('leaves out neighbors when there is no room', () => {
    const sel = selectFileGraph(files, edges, { cap: 4, showNeighbors: true })
    expect(sel.neighbors).toEqual([])
    expect(sel.hiddenNeighbors).toBe(1)
  })
})

describe('flow highlight', () => {
  const neighbors = new Map([
    ['a', new Set(['b'])],
    ['b', new Set(['a', 'c'])],
    ['c', new Set(['b'])],
  ])
  const nodeIds = new Set(['a', 'b', 'c', 'd'])
  const base = { hoverId: null, focusId: null, selectedId: null, neighbors, nodeIds, hoverEdgeId: null, markers: { normal: 'n', active: 'a' } }

  it('emphasizes nothing by default', () => {
    const h = computeHighlight(base)
    expect(nodeVisual(h, 'a').dimmed).toBe(false)
    expect(edgeState(h, 'e', 'a', 'b')).toBe('normal')
  })

  it('hover emphasizes the neighborhood and its edges', () => {
    const h = computeHighlight({ ...base, hoverId: 'a' })
    expect(nodeVisual(h, 'b').dimmed).toBe(false)
    expect(nodeVisual(h, 'c').dimmed).toBe(true)
    expect(edgeState(h, 'ab', 'a', 'b')).toBe('active')
    expect(edgeState(h, 'bc', 'b', 'c')).toBe('dim')
  })

  it('external highlight wins over selection, hover wins over both', () => {
    const h = computeHighlight({ ...base, selectedId: 'c', highlightIds: ['a', 'b', 'gone'] })
    expect(h.focus).toBeNull()
    expect(nodeVisual(h, 'c').dimmed).toBe(true)
    expect(nodeVisual(h, 'c').selected).toBe(true)
    expect(edgeState(h, 'ab', 'a', 'b')).toBe('active')
    const hovered = computeHighlight({ ...base, selectedId: 'c', highlightIds: ['a'], hoverId: 'c' })
    expect(hovered.focus).toBe('c')
  })

  it('shows edge labels per mode', () => {
    const always = computeHighlight({ ...base, edgeLabels: 'always' })
    expect(edgeLabelVisible(always, 'x', 'normal')).toBe(true)
    expect(edgeLabelVisible(always, 'x', 'dim')).toBe(false)
    const hover = computeHighlight({ ...base, hoverEdgeId: 'x' })
    expect(edgeLabelVisible(hover, 'x', edgeState(hover, 'x', 'a', 'b'))).toBe(true)
    expect(edgeLabelVisible(hover, 'y', 'normal')).toBe(false)
    const focus = computeHighlight({ ...base, edgeLabels: 'focus', selectedId: 'a' })
    expect(edgeLabelVisible(focus, 'ab', edgeState(focus, 'ab', 'a', 'b'))).toBe(true)
    expect(edgeLabelVisible(focus, 'bc', edgeState(focus, 'bc', 'b', 'c'))).toBe(false)
  })

  it('marks seen nodes', () => {
    const h = computeHighlight({ ...base, seenIds: ['d'] })
    expect(nodeVisual(h, 'd').seen).toBe(true)
  })
})
