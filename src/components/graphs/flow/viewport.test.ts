import {
  bestPadding,
  boundsOf,
  explainPanelInset,
  fitZoom,
  focusSequence,
  planView,
  READABLE_ZOOM,
  revealViewport,
  toScreen,
  uniformInsets,
  windowViewport,
  type CornerObstacle,
  type NodeBox,
} from './viewport'

const card = (id: string, x: number, y: number, width = 236, height = 104): NodeBox => ({ id, x, y, width, height })
const inside = (r: { x: number; y: number; width: number; height: number }, box: { width: number; height: number }, pad = uniformInsets(0)) =>
  r.x >= pad.left - 0.5 && r.y >= pad.top - 0.5 && r.x + r.width <= box.width - pad.right + 0.5 && r.y + r.height <= box.height - pad.bottom + 0.5

describe('fitting', () => {
  it('fits bounds into the padded box', () => {
    const b = { x: 0, y: 0, width: 1000, height: 200 }
    expect(fitZoom(b, { width: 556, height: 600 }, uniformInsets(28))).toBeCloseTo(0.5)
    expect(fitZoom(b, { width: 40, height: 40 }, uniformInsets(28))).toBe(0)
  })

  it('keeps cards out of a corner overlay along whichever side costs less room', () => {
    const controls: CornerObstacle = { corner: 'bottom-left', width: 60, height: 120 }
    // A wide, flat picture is limited by width: give up room at the bottom instead.
    const wide = bestPadding({ x: 0, y: 0, width: 2000, height: 100 }, { width: 1000, height: 600 }, uniformInsets(20), [controls])
    expect(wide.pad.bottom).toBe(120)
    expect(wide.pad.left).toBe(20)
    expect(wide.zoom).toBeCloseTo(960 / 2000)
    // A tall, narrow picture is limited by height: give up a strip on the left.
    const tall = bestPadding({ x: 0, y: 0, width: 100, height: 2000 }, { width: 1000, height: 600 }, uniformInsets(20), [controls])
    expect(tall.pad.left).toBe(60)
    expect(tall.pad.bottom).toBe(20)
    expect(tall.zoom).toBeCloseTo(560 / 2000)
  })
})

describe('focusSequence', () => {
  const neighbors = new Map<string, Set<string>>([
    ['hub', new Set(['a', 'b'])],
    ['a', new Set(['hub', 'c'])],
    ['b', new Set(['hub'])],
    ['c', new Set(['a'])],
  ])
  it('walks outwards from the start, most important first within each ring, then the rest', () => {
    expect(focusSequence(['a', 'b', 'c', 'hub', 'solo'], neighbors, ['hub', 'b', 'a'], null)).toEqual(['hub', 'b', 'a', 'c', 'solo'])
    expect(focusSequence(['a', 'b', 'c', 'hub', 'solo'], neighbors, ['hub', 'b', 'a'], 'c')).toEqual(['c', 'a', 'hub', 'b', 'solo'])
  })
  it('falls back to the best-connected node when nothing is ranked', () => {
    expect(focusSequence(['c', 'hub', 'a', 'b'], neighbors, undefined, null)[0]).toBe('a')
  })
})

describe('planView', () => {
  const box = { width: 1100, height: 600 }
  const base = uniformInsets(28)

  it('shows the whole picture when it is readable', () => {
    const nodes = [card('a', 0, 0), card('b', 400, 0), card('c', 800, 200)]
    const plan = planView({ nodes, box, base, corners: [], sequence: ['a', 'b', 'c'], mode: 'auto' })
    expect(plan?.focused).toBe(false)
    expect(plan?.crowded).toBe(false)
    for (const n of nodes) expect(inside(toScreen(n, plan!.viewport), box, base)).toBe(true)
  })

  it('starts with a readable close-up when the whole picture would be tiny', () => {
    // 12 cards in a row: about 4,000px wide.
    const nodes = Array.from({ length: 12 }, (_, i) => card(`n${i}`, i * 340, 0))
    const neighbors = new Map<string, Set<string>>()
    for (let i = 0; i < 11; i++) {
      neighbors.set(`n${i}`, new Set([...(neighbors.get(`n${i}`) ?? []), `n${i + 1}`]))
      neighbors.set(`n${i + 1}`, new Set([`n${i}`]))
    }
    const sequence = focusSequence(nodes.map((n) => n.id), neighbors, ['n6'], null)
    const plan = planView({ nodes, box, base, corners: [], sequence, mode: 'auto', toggleReserve: 52 })!
    expect(plan.crowded).toBe(true)
    expect(plan.focused).toBe(true)
    expect(plan.viewport.zoom).toBeGreaterThanOrEqual(READABLE_ZOOM)
    expect(inside(toScreen(nodes[6], plan.viewport), box, plan.pad)).toBe(true)
    // The "Show all" button's room is kept free at the bottom.
    expect(plan.pad.bottom).toBe(28 + 52)

    const all = planView({ nodes, box, base, corners: [], sequence, mode: 'all', toggleReserve: 52 })!
    expect(all.focused).toBe(false)
    expect(all.viewport.zoom).toBeLessThan(0.3)
    for (const n of nodes) expect(inside(toScreen(n, all.viewport), box, all.pad)).toBe(true)
  })

  it('keeps the selected card and all its direct neighbors in a close-up when they fit legibly', () => {
    const nodes = [card('sel', 1500, 300), card('n1', 1100, 0), card('n2', 1100, 600), card('n3', 1900, 300), card('far1', 0, 0), card('far2', 3000, 900)]
    const neighbors = new Map<string, Set<string>>([
      ['sel', new Set(['n1', 'n2', 'n3'])],
      ['n1', new Set(['sel', 'far1'])],
      ['n2', new Set(['sel'])],
      ['n3', new Set(['sel', 'far2'])],
      ['far1', new Set(['n1'])],
      ['far2', new Set(['n3'])],
    ])
    const sequence = focusSequence(nodes.map((n) => n.id), neighbors, undefined, 'sel')
    const plan = planView({ nodes, box, base, corners: [], sequence, ringSize: 4, mode: 'auto' })!
    expect(plan.focused).toBe(true)
    for (const id of ['sel', 'n1', 'n2', 'n3']) {
      expect(inside(toScreen(nodes.find((n) => n.id === id)!, plan.viewport), box, plan.pad)).toBe(true)
    }
  })

  it('always keeps the starting card in view, even when its neighbors are far apart', () => {
    const nodes = [card('sel', 2000, 0), card('w', 0, 0), card('e', 4000, 0)]
    const neighbors = new Map<string, Set<string>>([
      ['sel', new Set(['w', 'e'])],
      ['w', new Set(['sel'])],
      ['e', new Set(['sel'])],
    ])
    const sequence = focusSequence(['sel', 'w', 'e'], neighbors, undefined, 'sel')
    const plan = planView({ nodes, box: { width: 500, height: 400 }, base, corners: [], sequence, ringSize: 3, mode: 'auto' })!
    expect(plan.viewport.zoom).toBeCloseTo(READABLE_ZOOM)
    expect(inside(toScreen(nodes[0], plan.viewport), { width: 500, height: 400 }, plan.pad)).toBe(true)
  })

  it('shows a handful of cards whole rather than cropping them', () => {
    // Four cards stacked: fit zoom about 0.55, below "readable" but fine for so few cards.
    const nodes = [0, 1, 2, 3].map((i) => card(`c${i}`, 0, i * 180))
    const plan = planView({ nodes, box: { width: 400, height: 460 }, base: uniformInsets(16), corners: [], sequence: ['c0'], mode: 'auto' })!
    expect(plan.focused).toBe(false)
    for (const n of nodes) expect(inside(toScreen(n, plan.viewport), { width: 400, height: 460 }, plan.pad)).toBe(true)
  })

  it('keeps fitted cards clear of the explain panel and of a button row along the top', () => {
    const nodes = [card('a', 0, 0), card('b', 300, 150)]
    const pad = { top: 28 + 26, right: 28 + 440, bottom: 28, left: 28 }
    const plan = planView({ nodes, box: { width: 1134, height: 600 }, base: pad, corners: [], sequence: ['a'], mode: 'auto' })!
    for (const n of nodes) expect(inside(toScreen(n, plan.viewport), { width: 1134, height: 600 }, pad)).toBe(true)
  })

  it('returns null before the canvas has a size', () => {
    expect(planView({ nodes: [card('a', 0, 0)], box: { width: 0, height: 0 }, base, corners: [], sequence: [], mode: 'auto' })).toBeNull()
  })
})

describe('revealViewport', () => {
  const box = { width: 1000, height: 600 }
  it('pans just enough to bring a hidden card out from under the panel', () => {
    const vp = { x: 0, y: 0, zoom: 1 }
    const target = { x: 800, y: 100, width: 200, height: 100 }
    const pad = { top: 20, right: 450, bottom: 20, left: 20 }
    const next = revealViewport(vp, target, box, pad)!
    expect(next.zoom).toBe(1)
    const s = toScreen(target, next)
    expect(s.x + s.width).toBeCloseTo(box.width - pad.right)
    expect(s.y).toBe(100)
  })
  it('leaves a visible card alone', () => {
    expect(revealViewport({ x: 0, y: 0, zoom: 1 }, { x: 100, y: 100, width: 100, height: 50 }, box, uniformInsets(20))).toBeNull()
  })
})

describe('windowViewport', () => {
  it('fits as many neighbors as it can while keeping the must-see card fully visible', () => {
    const items = [card('must', 500, 0, 100, 50), card('l', 0, 0, 100, 50), card('r', 900, 0, 100, 50), card('r2', 1100, 0, 100, 50)]
    const vp = windowViewport(items, items[0], { width: 700, height: 200 }, uniformInsets(0), 1)
    const visible = items.filter((r) => inside(toScreen(r, vp), { width: 700, height: 200 }))
    expect(visible.map((r) => r.id)).toContain('must')
    expect(visible.length).toBe(3)
  })
})

describe('explainPanelInset', () => {
  it('measures how much of the canvas the wide-screen drawer covers', () => {
    const canvas = { left: 282, right: 1416, bottom: 860, width: 1134 }
    expect(explainPanelInset(canvas, 1440, true)).toBe(1416 - 1000 + 12)
    expect(explainPanelInset(canvas, 1440, false)).toBe(0)
  })
  it('ignores phones (bottom sheet), canvases the drawer does not reach, and canvases it covers almost completely', () => {
    expect(explainPanelInset({ left: 16, right: 374, bottom: 700, width: 358 }, 390, true)).toBe(0)
    expect(explainPanelInset({ left: 0, right: 900, bottom: 700, width: 900 }, 1440, true)).toBe(0)
    expect(explainPanelInset({ left: 1021, right: 1399, bottom: 800, width: 378 }, 1440, true)).toBe(0)
  })
})

describe('boundsOf', () => {
  it('bounds all nodes or a subset', () => {
    const nodes = [card('a', 0, 0, 10, 10), card('b', 100, 50, 10, 10)]
    expect(boundsOf(nodes)).toEqual({ x: 0, y: 0, width: 110, height: 60 })
    expect(boundsOf(nodes, ['b'])).toEqual({ x: 100, y: 50, width: 10, height: 10 })
    expect(boundsOf(nodes, ['zzz'])).toBeNull()
  })
})
