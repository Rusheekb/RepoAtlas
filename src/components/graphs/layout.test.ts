import {
  buildNeighbors,
  clipToRect,
  edgeCrossings,
  edgeKey,
  edgeStrokeWidth,
  gridColumnsFor,
  gridLayout,
  layoutForce,
  layoutLayered,
  mergeLinks,
  nearestInDirection,
  polylineMidpoint,
  placeEdgeLabelSpots,
  rectEdgeGeometry,
  resolveOverlaps,
  routeAround,
  routedEdgeGeometry,
  smoothPath,
  trimEnd,
  type Point,
  type Rect,
  type SizedNode,
} from './layout'

const W = 200
const H = 80
const nodes = (ids: string[]): SizedNode[] => ids.map((id) => ({ id, width: W, height: H }))

function overlaps(a: Rect, b: Rect, pad = 0): boolean {
  return a.x < b.x + b.width + pad && b.x < a.x + a.width + pad && a.y < b.y + b.height + pad && b.y < a.y + a.height + pad
}

function rectsOf(result: { positions: Map<string, Point> }, sized: SizedNode[]): Rect[] {
  return sized.map((n) => ({ ...(result.positions.get(n.id) as Point), width: n.width, height: n.height }))
}

describe('mergeLinks', () => {
  it('sums duplicate weights and drops self links and unknown nodes', () => {
    const merged = mergeLinks(
      [
        { source: 'a', target: 'b', weight: 2 },
        { source: 'a', target: 'b', weight: 3 },
        { source: 'a', target: 'a' },
        { source: 'a', target: 'zzz' },
        { source: 'b', target: 'a' },
      ],
      new Set(['a', 'b']),
    )
    expect(merged).toEqual([
      { source: 'a', target: 'b', weight: 5 },
      { source: 'b', target: 'a', weight: 1 },
    ])
  })
})

describe('buildNeighbors', () => {
  it('is undirected', () => {
    const n = buildNeighbors([
      { source: 'a', target: 'b' },
      { source: 'c', target: 'a' },
    ])
    expect([...(n.get('a') ?? [])].sort()).toEqual(['b', 'c'])
    expect([...(n.get('b') ?? [])]).toEqual(['a'])
  })
})

describe('edgeStrokeWidth', () => {
  it('scales from 1.5 to 4px', () => {
    expect(edgeStrokeWidth(1, 1)).toBe(1.5)
    expect(edgeStrokeWidth(1, 50)).toBe(1.5)
    expect(edgeStrokeWidth(50, 50)).toBe(4)
    const mid = edgeStrokeWidth(10, 50)
    expect(mid).toBeGreaterThan(1.5)
    expect(mid).toBeLessThan(4)
    expect(edgeStrokeWidth(500, 50)).toBe(4)
  })
})

describe('layoutLayered', () => {
  it('places linked nodes left-to-right in dependency order without overlaps', () => {
    const sized = nodes(['a', 'b', 'c'])
    const res = layoutLayered(sized, [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
    ])
    const a = res.positions.get('a') as Point
    const b = res.positions.get('b') as Point
    const c = res.positions.get('c') as Point
    expect(a.x).toBeLessThan(b.x)
    expect(b.x).toBeLessThan(c.x)
    expect(Math.min(a.x, a.y)).toBeGreaterThanOrEqual(0)
    expect(res.edgePoints.get(edgeKey('a', 'b'))?.length).toBeGreaterThanOrEqual(2)
    expect(res.width).toBeGreaterThanOrEqual(c.x + W - 1)
  })

  it('stacks top-to-bottom for TB', () => {
    const res = layoutLayered(nodes(['a', 'b']), [{ source: 'a', target: 'b' }], { direction: 'TB' })
    expect((res.positions.get('a') as Point).y).toBeLessThan((res.positions.get('b') as Point).y)
  })

  it('handles cycles', () => {
    const sized = nodes(['a', 'b', 'c'])
    const res = layoutLayered(sized, [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
      { source: 'c', target: 'a' },
    ])
    expect(res.positions.size).toBe(3)
    expect(res.edgePoints.size).toBe(3)
    const rects = rectsOf(res, sized)
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i], rects[j])).toBe(false)
  })

  it('puts nodes without links in a tidy grid below the main picture', () => {
    const sized = nodes(['a', 'b', 'x', 'y', 'z'])
    const res = layoutLayered(sized, [{ source: 'a', target: 'b' }])
    const mainBottom = Math.max((res.positions.get('a') as Point).y, (res.positions.get('b') as Point).y) + H
    const ys = ['x', 'y', 'z'].map((id) => (res.positions.get(id) as Point).y)
    for (const y of ys) expect(y).toBeGreaterThan(mainBottom)
    const rects = rectsOf(res, sized)
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i], rects[j])).toBe(false)
    expect(res.height).toBeGreaterThanOrEqual(Math.max(...ys) + H - 1)
  })

  it('lays out a picture with no links at all as a grid', () => {
    const sized = nodes(['a', 'b', 'c', 'd', 'e', 'f'])
    const res = layoutLayered(sized, [])
    expect(res.positions.size).toBe(6)
    expect(res.edgePoints.size).toBe(0)
    const rects = rectsOf(res, sized)
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i], rects[j])).toBe(false)
  })

  it('returns an empty layout for no nodes', () => {
    expect(layoutLayered([], []).positions.size).toBe(0)
  })
})

describe('gridLayout', () => {
  it('wraps into the requested number of columns', () => {
    const g = gridLayout(nodes(['a', 'b', 'c', 'd', 'e']), 2, 10)
    expect(g.positions.get('c')).toEqual({ x: 0, y: H + 10 })
    expect(g.width).toBe(2 * W + 10)
    expect(g.height).toBe(3 * H + 20)
  })
})

describe('layoutForce', () => {
  const sized: SizedNode[] = [
    { id: 'a', width: 212, height: 74 },
    { id: 'b', width: 190, height: 66 },
    { id: 'c', width: 172, height: 58 },
    { id: 'd', width: 158, height: 54 },
    { id: 'e', width: 148, height: 50 },
    { id: 'lonely', width: 148, height: 50 },
  ]
  const links = [
    { source: 'a', target: 'b' },
    { source: 'a', target: 'c' },
    { source: 'b', target: 'd' },
    { source: 'c', target: 'e' },
    { source: 'e', target: 'a' },
    { source: 'a', target: 'missing' },
  ]

  it('settles without overlapping cards and is deterministic', () => {
    const r1 = layoutForce(sized, links)
    const r2 = layoutForce(sized, links)
    expect([...r1.positions.entries()]).toEqual([...r2.positions.entries()])
    const rects = rectsOf(r1, sized)
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i], rects[j])).toBe(false)
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(-0.001)
      expect(r.y).toBeGreaterThanOrEqual(-0.001)
    }
    expect(r1.edgePoints.size).toBe(5)
  })

  it('keeps the picture compact (linked ideas near each other, no runaway nodes)', () => {
    const r = layoutForce(sized, links)
    expect(r.width).toBeLessThan(1600)
    expect(r.height).toBeLessThan(1600)
  })

  it('handles a single node', () => {
    const r = layoutForce([{ id: 'solo', width: 100, height: 40 }], [])
    expect(r.positions.get('solo')).toEqual({ x: 0, y: 0 })
    expect(r.width).toBe(100)
  })
})

describe('resolveOverlaps', () => {
  it('separates stacked rectangles', () => {
    const rects: Rect[] = [
      { x: 0, y: 0, width: 100, height: 40 },
      { x: 10, y: 5, width: 100, height: 40 },
      { x: 0, y: 0, width: 100, height: 40 },
    ]
    resolveOverlaps(rects, 8)
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i], rects[j])).toBe(false)
  })
})

describe('geometry', () => {
  const box: Rect = { x: 0, y: 0, width: 100, height: 50 }

  it('clips a ray to the rectangle border (plus gap)', () => {
    expect(clipToRect(box, { x: 500, y: 25 }, 0)).toEqual({ x: 100, y: 25 })
    expect(clipToRect(box, { x: 50, y: -300 }, 0)).toEqual({ x: 50, y: 0 })
    const p = clipToRect(box, { x: 50, y: 400 }, 3)
    expect(p.y).toBeCloseTo(53)
  })

  it('trims the end of a path for an arrowhead', () => {
    const out = trimEnd(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      5,
    )
    expect(out[1]).toEqual({ x: 95, y: 0 })
  })

  it('builds smooth paths', () => {
    expect(smoothPath([])).toBe('')
    expect(
      smoothPath([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ]),
    ).toBe('M0,0 L10,0')
    const d = smoothPath([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 0 },
    ])
    expect(d.startsWith('M0,0 Q10,10 15,5')).toBe(true)
    expect(d.endsWith('L20,0')).toBe(true)
  })

  it('finds the midpoint along a polyline', () => {
    expect(
      polylineMidpoint([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ]),
    ).toEqual({ x: 10, y: 0 })
  })

  it('routes edges with a label anchor', () => {
    const geo = routedEdgeGeometry([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ])
    expect(geo.path).toBe('M0,0 L95,0')
    expect(geo.labelX).toBe(50)
  })

  it('draws straight and curved edges between rectangles', () => {
    const a: Rect = { x: 0, y: 0, width: 100, height: 40 }
    const b: Rect = { x: 300, y: 0, width: 100, height: 40 }
    const straight = rectEdgeGeometry(a, b)
    expect(straight.path).toMatch(/^M103,20 L29[0-9.]*,20$/)
    const curved = rectEdgeGeometry(a, b, 30)
    expect(curved.path).toContain('Q')
    expect(curved.labelY).not.toBeCloseTo(20)
  })
})

describe('nearestInDirection', () => {
  const centers = new Map<string, Point>([
    ['mid', { x: 0, y: 0 }],
    ['right', { x: 100, y: 10 }],
    ['farRight', { x: 300, y: 0 }],
    ['down', { x: 0, y: 120 }],
    ['upLeft', { x: -50, y: -200 }],
  ])
  it('picks the closest node in the arrow direction', () => {
    expect(nearestInDirection('mid', centers, 'right')).toBe('right')
    expect(nearestInDirection('mid', centers, 'down')).toBe('down')
    expect(nearestInDirection('mid', centers, 'up')).toBe('upLeft')
    expect(nearestInDirection('mid', centers, 'left')).toBe('upLeft')
    expect(nearestInDirection('farRight', centers, 'right')).toBeNull()
    expect(nearestInDirection('nope', centers, 'right')).toBeNull()
  })
})

describe('unlinked files fill the canvas shape (regression: tall 3-column strips)', () => {
  it('picks grid columns for the target shape, never narrower than the linked picture', () => {
    // 102 test files that use nothing else, on a 2:1 canvas: a wide grid, not 3 columns × 34 rows.
    const cols = gridColumnsFor(102, 212, 56, 16, 2)
    expect(cols).toBeGreaterThanOrEqual(7)
    const rows = Math.ceil(102 / cols)
    const aspect = (cols * 228) / (rows * 72)
    expect(aspect).toBeGreaterThan(1.4)
    expect(aspect).toBeLessThan(3)
    expect(gridColumnsFor(4, 212, 56, 16, 2, 2000)).toBe(4)
    expect(gridColumnsFor(30, 212, 56, 16, 0.8)).toBeLessThan(gridColumnsFor(30, 212, 56, 16, 2))
  })

  it('lays out a mostly-unlinked folder roughly in the canvas shape', () => {
    const files: SizedNode[] = Array.from({ length: 60 }, (_, i) => ({ id: `t${i}`, width: 212, height: 56 }))
    const res = layoutLayered(files, [{ source: 't0', target: 't1' }], { direction: 'LR', gridGap: 16, targetAspect: 2 })
    expect(res.width / res.height).toBeGreaterThan(1.2)
    const rects = rectsOf(res, files)
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i], rects[j])).toBe(false)
  })
})

describe('concept map layout (regression: cramped cards, arrows under cards, labels on names)', () => {
  const sized: SizedNode[] = [
    { id: 'hub', width: 212, height: 74 },
    ...Array.from({ length: 9 }, (_, i) => ({ id: `n${i}`, width: 158, height: 54 })),
  ]
  const links = [
    ...Array.from({ length: 9 }, (_, i) => ({ source: 'hub', target: `n${i}` })),
    { source: 'n0', target: 'n5' },
    { source: 'n2', target: 'n7' },
  ]

  it('keeps room for a relation label between every pair of cards and spreads out sideways', () => {
    const res = layoutForce(sized, links)
    const rects = rectsOf(res, sized)
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i], rects[j], 33)).toBe(false)
    expect(res.width).toBeGreaterThan(res.height)
  })

  it('bows an arrow around a card that sits in its way', () => {
    const a = { x: 0, y: 0, width: 100, height: 40 }
    const b = { x: 600, y: 0, width: 100, height: 40 }
    const blocker = { x: 300, y: -5, width: 100, height: 50 }
    expect(edgeCrossings(rectEdgeGeometry(a, b), [blocker])).toHaveLength(1)
    const routed = routeAround(a, b, [blocker])
    expect(routed.control).toBeDefined()
    expect(edgeCrossings(routed, [blocker])).toHaveLength(0)
    // Nothing in the way: a straight line.
    expect(routeAround(a, b, []).control).toBeUndefined()
  })

  it('moves a label beside its edge when the spots on it are taken, and flags labels with no free spot', () => {
    const geo = rectEdgeGeometry({ x: 0, y: 0, width: 100, height: 40 }, { x: 400, y: 0, width: 100, height: 40 })
    // A card sits right on the middle of the edge.
    const blocker = { x: 150, y: 5, width: 200, height: 30 }
    const [spot] = placeEdgeLabelSpots([{ geo, width: 60, height: 20 }], [blocker])
    expect(spot.clear).toBe(true)
    expect(overlaps({ x: spot.x - 30, y: spot.y - 10, width: 60, height: 20 }, blocker)).toBe(false)
    // Everything around the edge is covered: the label is flagged rather than silently drawn on a card.
    const wall = { x: -100, y: -200, width: 800, height: 440 }
    expect(placeEdgeLabelSpots([{ geo, width: 60, height: 20 }], [wall])[0].clear).toBe(false)
  })
})
