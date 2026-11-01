/**
 * Pure layout helpers shared by the node graphs (no React, no DOM).
 *
 * - layoutLayered: dagre "layered" layout for dependency maps (handles cycles and disconnected parts;
 *   nodes with no links at all are placed in a tidy grid under the main picture).
 * - layoutForce:   d3-force layout settled synchronously up front, for concept maps.
 * - Geometry helpers that turn routed points into SVG paths with room for an arrowhead.
 */
import dagre from '@dagrejs/dagre'
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'

export interface Point {
  x: number
  y: number
}

/** A rectangle by its top-left corner. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface SizedNode {
  id: string
  width: number
  height: number
}

export interface LinkInput {
  source: string
  target: string
  weight?: number
}

export interface LayoutResult {
  /** Top-left corner of every node. */
  positions: Map<string, Point>
  /** Routed polyline for every laid-out link, keyed by edgeKey(source, target). Starts and ends on node borders. */
  edgePoints: Map<string, Point[]>
  width: number
  height: number
}

export type Direction = 'LR' | 'TB'

/** Stable key for a directed link. */
export function edgeKey(source: string, target: string): string {
  return `${source}\u0000${target}`
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/** Collapse duplicate links (summing weights), dropping self-links and links to unknown nodes. */
export function mergeLinks(links: readonly LinkInput[], known: ReadonlySet<string>): { source: string; target: string; weight: number }[] {
  const merged = new Map<string, { source: string; target: string; weight: number }>()
  for (const l of links) {
    if (l.source === l.target || !known.has(l.source) || !known.has(l.target)) continue
    const k = edgeKey(l.source, l.target)
    const w = Number.isFinite(l.weight) && (l.weight ?? 0) > 0 ? (l.weight as number) : 1
    const prev = merged.get(k)
    if (prev) prev.weight += w
    else merged.set(k, { source: l.source, target: l.target, weight: w })
  }
  return [...merged.values()]
}

/** Undirected neighbor lookup. */
export function buildNeighbors(links: readonly { source: string; target: string }[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  const add = (a: string, b: string) => {
    let s = out.get(a)
    if (!s) out.set(a, (s = new Set()))
    s.add(b)
  }
  for (const l of links) {
    if (l.source === l.target) continue
    add(l.source, l.target)
    add(l.target, l.source)
  }
  return out
}

/** Edge stroke width (1.5–4px) on a square-root scale of the link weight. */
export function edgeStrokeWidth(weight: number, maxWeight: number): number {
  if (!(maxWeight > 1) || !(weight > 1)) return 1.5
  const t = Math.sqrt((Math.min(weight, maxWeight) - 1) / (maxWeight - 1))
  return Math.round((1.5 + 2.5 * t) * 100) / 100
}

/** Grid placement for nodes that have no links. Returns positions relative to (0,0) plus the grid size. */
export function gridLayout(
  nodes: readonly SizedNode[],
  columns: number,
  gap: number,
): { positions: Map<string, Point>; width: number; height: number } {
  const positions = new Map<string, Point>()
  if (!nodes.length) return { positions, width: 0, height: 0 }
  const cellW = Math.max(...nodes.map((n) => n.width))
  const cellH = Math.max(...nodes.map((n) => n.height))
  const cols = clamp(Math.floor(columns), 1, nodes.length)
  const rows = Math.ceil(nodes.length / cols)
  nodes.forEach((n, i) => {
    const c = i % cols
    const r = Math.floor(i / cols)
    positions.set(n.id, {
      x: c * (cellW + gap) + (cellW - n.width) / 2,
      y: r * (cellH + gap) + (cellH - n.height) / 2,
    })
  })
  return { positions, width: cols * cellW + (cols - 1) * gap, height: rows * cellH + (rows - 1) * gap }
}

export interface LayeredOptions {
  direction?: Direction
  nodesep?: number
  ranksep?: number
  /** Gap between cells of the grid used for unlinked nodes. */
  gridGap?: number
}

/**
 * Layered (dagre) layout. Linked nodes are laid out by dagre; nodes without any link are put in a grid
 * row below the main picture (or form the whole picture if nothing is linked). Coordinates start at (0,0).
 */
export function layoutLayered(nodes: readonly SizedNode[], links: readonly LinkInput[], opts: LayeredOptions = {}): LayoutResult {
  const direction = opts.direction ?? 'LR'
  const nodesep = opts.nodesep ?? (direction === 'LR' ? 28 : 40)
  const ranksep = opts.ranksep ?? (direction === 'LR' ? 96 : 72)
  const gap = opts.gridGap ?? 24

  const known = new Set(nodes.map((n) => n.id))
  const merged = mergeLinks(links, known)
  const linked = new Set<string>()
  for (const l of merged) {
    linked.add(l.source)
    linked.add(l.target)
  }

  const positions = new Map<string, Point>()
  const edgePoints = new Map<string, Point[]>()
  let mainW = 0
  let mainH = 0

  if (linked.size) {
    const g = new dagre.graphlib.Graph()
    g.setGraph({ rankdir: direction, nodesep, ranksep, edgesep: 14, marginx: 0, marginy: 0 })
    g.setDefaultEdgeLabel(() => ({}))
    for (const n of nodes) if (linked.has(n.id)) g.setNode(n.id, { width: n.width, height: n.height })
    for (const l of merged) {
      g.setEdge(l.source, l.target, { weight: 1 + Math.round(Math.log2(l.weight)), minlen: 1 })
    }
    dagre.layout(g)

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const id of g.nodes()) {
      const d = g.node(id) as { x: number; y: number; width: number; height: number }
      minX = Math.min(minX, d.x - d.width / 2)
      minY = Math.min(minY, d.y - d.height / 2)
      maxX = Math.max(maxX, d.x + d.width / 2)
      maxY = Math.max(maxY, d.y + d.height / 2)
    }
    const rawEdges: [string, Point[]][] = []
    for (const e of g.edges()) {
      const d = g.edge(e) as { points?: Point[] } | undefined
      if (!d?.points?.length) continue
      for (const p of d.points) {
        minX = Math.min(minX, p.x)
        minY = Math.min(minY, p.y)
        maxX = Math.max(maxX, p.x)
        maxY = Math.max(maxY, p.y)
      }
      rawEdges.push([edgeKey(e.v, e.w), d.points])
    }
    for (const id of g.nodes()) {
      const d = g.node(id) as { x: number; y: number; width: number; height: number }
      positions.set(id, { x: d.x - d.width / 2 - minX, y: d.y - d.height / 2 - minY })
    }
    for (const [k, pts] of rawEdges) edgePoints.set(k, pts.map((p) => ({ x: p.x - minX, y: p.y - minY })))
    mainW = maxX - minX
    mainH = maxY - minY
  }

  const isolated = nodes.filter((n) => !linked.has(n.id))
  let width = mainW
  let height = mainH
  if (isolated.length) {
    const cellW = Math.max(...isolated.map((n) => n.width))
    const cellH = Math.max(...isolated.map((n) => n.height))
    const columns = linked.size
      ? clamp(Math.floor((mainW + gap) / (cellW + gap)), Math.min(3, isolated.length), isolated.length)
      : Math.max(1, Math.ceil(Math.sqrt((isolated.length * 1.6 * cellH) / cellW)))
    const grid = gridLayout(isolated, columns, gap)
    const startY = linked.size ? mainH + Math.max(48, ranksep * 0.75) : 0
    const startX = linked.size && grid.width < mainW ? (mainW - grid.width) / 2 : 0
    for (const [id, p] of grid.positions) positions.set(id, { x: p.x + startX, y: p.y + startY })
    width = Math.max(mainW, startX + grid.width)
    height = startY + grid.height
  }

  return { positions, edgePoints, width, height }
}

export interface ForceOptions {
  /** Preferred link length (px between centers). */
  linkDistance?: number
  ticks?: number
  /** Many-body strength (negative = repel). */
  charge?: number
  /** Minimum free space kept between node rectangles. */
  padding?: number
}

/**
 * Force-directed layout, run synchronously for a fixed number of ticks (deterministic: d3-force seeds its own
 * random source and nodes start on a phyllotaxis spiral). A final pass removes any leftover rectangle overlaps.
 * Coordinates start at (0,0).
 */
export function layoutForce(nodes: readonly SizedNode[], links: readonly LinkInput[], opts: ForceOptions = {}): LayoutResult {
  const linkDistance = opts.linkDistance ?? 160
  const ticks = opts.ticks ?? 300
  const padding = opts.padding ?? 18
  type SimNode = SimulationNodeDatum & { id: string; w: number; h: number; r: number }

  const simNodes: SimNode[] = nodes.map((n, i) => {
    const angle = i * 2.399963229728653 // golden angle
    const radius = 60 * Math.sqrt(i + 0.5)
    return {
      id: n.id,
      w: n.width,
      h: n.height,
      r: Math.max(n.width, n.height) / 2,
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle),
    }
  })
  const known = new Set(nodes.map((n) => n.id))
  const merged = mergeLinks(links, known)
  // forceLink resolves string ids to node objects in place.
  const simLinks: SimulationLinkDatum<SimNode>[] = merged.map((l) => ({ source: l.source, target: l.target }))

  if (simNodes.length > 1) {
    const sim = forceSimulation<SimNode>(simNodes)
      .force('charge', forceManyBody<SimNode>().strength(opts.charge ?? -520))
      .force(
        'link',
        forceLink<SimNode, SimulationLinkDatum<SimNode>>(simLinks)
          .id((d) => d.id)
          .distance((l) => {
            const s = l.source as SimNode
            const t = l.target as SimNode
            return linkDistance + (s.r + t.r) * 0.75
          })
          .strength(0.55),
      )
      .force(
        'collide',
        forceCollide<SimNode>((d) => d.r * 0.85 + padding)
          .strength(0.9)
          .iterations(2),
      )
      .force('x', forceX<SimNode>(0).strength(0.07))
      .force('y', forceY<SimNode>(0).strength(0.1))
      .force('center', forceCenter(0, 0))
      .stop()
    sim.tick(ticks)
  }

  const rects: Rect[] = simNodes.map((n) => ({ x: (n.x ?? 0) - n.w / 2, y: (n.y ?? 0) - n.h / 2, width: n.w, height: n.h }))
  resolveOverlaps(rects, padding)

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const r of rects) {
    minX = Math.min(minX, r.x)
    minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, r.x + r.width)
    maxY = Math.max(maxY, r.y + r.height)
  }
  const positions = new Map<string, Point>()
  const byId = new Map<string, Rect>()
  simNodes.forEach((n, i) => {
    const r = rects[i]
    const shifted = { ...r, x: r.x - minX, y: r.y - minY }
    positions.set(n.id, { x: shifted.x, y: shifted.y })
    byId.set(n.id, shifted)
  })
  const edgePoints = new Map<string, Point[]>()
  for (const l of merged) {
    const a = byId.get(l.source)
    const b = byId.get(l.target)
    if (a && b) edgePoints.set(edgeKey(l.source, l.target), [clipToRect(a, rectCenter(b)), clipToRect(b, rectCenter(a))])
  }
  return {
    positions,
    edgePoints,
    width: Number.isFinite(maxX) ? maxX - minX : 0,
    height: Number.isFinite(maxY) ? maxY - minY : 0,
  }
}

/** Push overlapping rectangles apart (in place) along the axis of least overlap until `padding` space separates them. */
export function resolveOverlaps(rects: Rect[], padding: number, maxIterations = 80): void {
  for (let iter = 0; iter < maxIterations; iter++) {
    let moved = false
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]
        const b = rects[j]
        const ox = Math.min(a.x + a.width + padding, b.x + b.width + padding) - Math.max(a.x, b.x)
        const oy = Math.min(a.y + a.height + padding, b.y + b.height + padding) - Math.max(a.y, b.y)
        if (ox <= 0.01 || oy <= 0.01) continue
        moved = true
        const acx = a.x + a.width / 2
        const bcx = b.x + b.width / 2
        const acy = a.y + a.height / 2
        const bcy = b.y + b.height / 2
        if (ox < oy) {
          const shift = ox / 2 + 0.01
          const sign = acx < bcx || (acx === bcx && i < j) ? -1 : 1
          a.x += sign * shift
          b.x -= sign * shift
        } else {
          const shift = oy / 2 + 0.01
          const sign = acy < bcy || (acy === bcy && i < j) ? -1 : 1
          a.y += sign * shift
          b.y -= sign * shift
        }
      }
    }
    if (!moved) return
  }
}

export function rectCenter(r: Rect): Point {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
}

/** Where the ray from the rectangle's center toward `toward` leaves the rectangle (grown by `gap`). */
export function clipToRect(r: Rect, toward: Point, gap = 3): Point {
  const c = rectCenter(r)
  const dx = toward.x - c.x
  const dy = toward.y - c.y
  if (dx === 0 && dy === 0) return c
  const hw = r.width / 2 + gap
  const hh = r.height / 2 + gap
  const t = Math.min(dx === 0 ? Infinity : hw / Math.abs(dx), dy === 0 ? Infinity : hh / Math.abs(dy))
  return { x: c.x + dx * t, y: c.y + dy * t }
}

const fmt = (n: number) => String(Math.round(n * 10) / 10)

/** Move the last point back toward the previous one by `trim` px (leaves room for an arrowhead). */
export function trimEnd(points: readonly Point[], trim: number): Point[] {
  if (points.length < 2 || trim <= 0) return points.slice()
  const out = points.slice()
  const last = out[out.length - 1]
  const prev = out[out.length - 2]
  const dx = last.x - prev.x
  const dy = last.y - prev.y
  const len = Math.hypot(dx, dy)
  if (len === 0) return out
  const t = Math.min(trim, len * 0.5) / len
  out[out.length - 1] = { x: last.x - dx * t, y: last.y - dy * t }
  return out
}

/** A smooth SVG path through routed points (quadratic midpoint smoothing; straight for 2 points). */
export function smoothPath(points: readonly Point[]): string {
  if (!points.length) return ''
  const p0 = points[0]
  let d = `M${fmt(p0.x)},${fmt(p0.y)}`
  if (points.length === 1) return d
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]
    const n = points[i + 1]
    d += ` Q${fmt(p.x)},${fmt(p.y)} ${fmt((p.x + n.x) / 2)},${fmt((p.y + n.y) / 2)}`
  }
  const last = points[points.length - 1]
  d += ` L${fmt(last.x)},${fmt(last.y)}`
  return d
}

/** The point halfway along a polyline. */
export function polylineMidpoint(points: readonly Point[]): Point {
  if (!points.length) return { x: 0, y: 0 }
  if (points.length === 1) return points[0]
  let total = 0
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
  let remaining = total / 2
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const seg = Math.hypot(b.x - a.x, b.y - a.y)
    if (seg >= remaining && seg > 0) {
      const t = remaining / seg
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    }
    remaining -= seg
  }
  return points[points.length - 1]
}

export interface EdgeGeometry {
  path: string
  labelX: number
  labelY: number
  /** Endpoints (and the quadratic control point for curves), for placing labels along the edge. */
  start?: Point
  end?: Point
  control?: Point
}

/** A point at t (0–1) along a straight or quadratic edge. */
export function pointOnEdge(geo: EdgeGeometry, t: number): Point {
  const { start, end, control } = geo
  if (!start || !end) return { x: geo.labelX, y: geo.labelY }
  if (!control) return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t }
  const u = 1 - t
  return {
    x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
    y: u * u * start.y + 2 * u * t * control.y + t * t * end.y,
  }
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

const LABEL_STOPS = [0.5, 0.42, 0.58, 0.34, 0.66, 0.27, 0.73]

/**
 * Slide each edge label along its edge to the first spot that collides with neither a node nor an earlier label
 * (falling back to the least-crowded spot). Returns label centers in input order.
 */
export function placeEdgeLabels(
  labels: readonly { geo: EdgeGeometry; width: number; height: number }[],
  obstacles: readonly Rect[],
  gap = 3,
): Point[] {
  const placed: Rect[] = [...obstacles]
  return labels.map(({ geo, width, height }) => {
    let best: { p: Point; box: Rect; cost: number } | null = null
    for (const t of LABEL_STOPS) {
      const p = pointOnEdge(geo, t)
      const box = { x: p.x - width / 2 - gap, y: p.y - height / 2 - gap, width: width + 2 * gap, height: height + 2 * gap }
      let cost = 0
      for (const r of placed) cost += overlapArea(box, r)
      if (!best || cost < best.cost) best = { p, box, cost }
      if (cost === 0) break
    }
    if (!best) return { x: geo.labelX, y: geo.labelY }
    placed.push(best.box)
    return best.p
  })
}

/** Rough pill size for an edge label (11px text). */
export function estimateLabelSize(text: string): { width: number; height: number } {
  return { width: Math.min(170, Math.ceil(text.length * 6.1) + 18), height: 20 }
}

/** Path + label anchor for a routed (dagre) edge, trimmed at the end for an arrowhead. */
export function routedEdgeGeometry(points: readonly Point[], arrowTrim = 5): EdgeGeometry {
  const mid = polylineMidpoint(points)
  return { path: smoothPath(trimEnd(points, arrowTrim)), labelX: mid.x, labelY: mid.y }
}

/**
 * Straight (bend = 0) or gently curved edge between two rectangles, clipped to their borders and trimmed for an
 * arrowhead. A positive/negative bend bows the curve to one side, so A→B and B→A don't sit on top of each other.
 */
export function rectEdgeGeometry(a: Rect, b: Rect, bend = 0, arrowTrim = 5): EdgeGeometry {
  const ca = rectCenter(a)
  const cb = rectCenter(b)
  if (bend === 0) {
    const start = clipToRect(a, cb)
    const end = clipToRect(b, ca)
    const [s, e] = trimEnd([start, end], arrowTrim)
    return {
      path: `M${fmt(s.x)},${fmt(s.y)} L${fmt(e.x)},${fmt(e.y)}`,
      labelX: (start.x + end.x) / 2,
      labelY: (start.y + end.y) / 2,
      start,
      end,
    }
  }
  const dx = cb.x - ca.x
  const dy = cb.y - ca.y
  const len = Math.hypot(dx, dy) || 1
  const nx = dy / len
  const ny = -dx / len
  // Control point at twice the apex offset (quadratic bezier apex = half the control offset).
  const control = { x: (ca.x + cb.x) / 2 + nx * bend * 2, y: (ca.y + cb.y) / 2 + ny * bend * 2 }
  const start = clipToRect(a, control)
  const end = clipToRect(b, control)
  const [, e] = trimEnd([control, end], arrowTrim)
  return {
    path: `M${fmt(start.x)},${fmt(start.y)} Q${fmt(control.x)},${fmt(control.y)} ${fmt(e.x)},${fmt(e.y)}`,
    labelX: 0.25 * start.x + 0.5 * control.x + 0.25 * end.x,
    labelY: 0.25 * start.y + 0.5 * control.y + 0.25 * end.y,
    start,
    end,
    control,
  }
}

/**
 * Spatial keyboard navigation: the nearest node in the arrow's direction (within a 45° cone, falling back to a
 * wider cone). Returns null when nothing lies that way.
 */
export function nearestInDirection(
  fromId: string,
  centers: ReadonlyMap<string, Point>,
  dir: 'left' | 'right' | 'up' | 'down',
): string | null {
  const from = centers.get(fromId)
  if (!from) return null
  const v = dir === 'left' ? { x: -1, y: 0 } : dir === 'right' ? { x: 1, y: 0 } : dir === 'up' ? { x: 0, y: -1 } : { x: 0, y: 1 }
  let best: string | null = null
  let bestScore = Infinity
  for (const minCos of [Math.SQRT1_2, 0.2]) {
    for (const [id, p] of centers) {
      if (id === fromId) continue
      const dx = p.x - from.x
      const dy = p.y - from.y
      const dist = Math.hypot(dx, dy)
      if (dist === 0) continue
      const cos = (dx * v.x + dy * v.y) / dist
      if (cos < minCos) continue
      const score = dist * (2 - cos)
      if (score < bestScore) {
        bestScore = score
        best = id
      }
    }
    if (best) return best
  }
  return best
}
