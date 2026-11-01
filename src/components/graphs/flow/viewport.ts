/**
 * Pure viewport maths for our React Flow canvases (no React, no DOM): where to look first so the picture is
 * readable, how to keep overlays (zoom buttons, mini map, the explain panel) from covering cards, and how to pan
 * just enough to bring one card back into view.
 *
 * Coordinates: node boxes are in flow space; a viewport { x, y, zoom } maps a flow point p to the screen point
 * (p.x * zoom + x, p.y * zoom + y), relative to the canvas' top-left corner.
 */
import type { Rect } from '../layout'

export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface Viewport {
  x: number
  y: number
  zoom: number
}

export interface Box {
  width: number
  height: number
}

/** A node's box in flow space. */
export interface NodeBox extends Rect {
  id: string
}

/** Something drawn in a corner of the canvas (zoom buttons, mini map …). Width and height include its margin. */
export interface CornerObstacle {
  corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  width: number
  height: number
}

/** Below this zoom, 11–14px card text shrinks under ~7–9px: too small for comfortable reading. */
export const READABLE_ZOOM = 0.65
/** A close-up never zooms in further than this, so it still shows some of what lies around. */
export const FOCUS_MAX_ZOOM = 0.9
/** To keep a card's direct neighbors in a close-up we accept slightly smaller text, down to this. */
export const RING_MIN_ZOOM = 0.6
/** A picture of this many cards or fewer is shown whole if it can be drawn at least at SMALL_PICTURE_MIN_ZOOM. */
export const SMALL_PICTURE = 5
export const SMALL_PICTURE_MIN_ZOOM = 0.5
/** Never blow small pictures up beyond this when fitting them. */
export const FIT_MAX_ZOOM = 1.1

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

export function uniformInsets(n: number): Insets {
  return { top: n, right: n, bottom: n, left: n }
}

export function addInsets(a: Insets, b: Partial<Insets>): Insets {
  return {
    top: a.top + (b.top ?? 0),
    right: a.right + (b.right ?? 0),
    bottom: a.bottom + (b.bottom ?? 0),
    left: a.left + (b.left ?? 0),
  }
}

/** The bounding box of some nodes (all of them when `ids` is omitted). Null when none match. */
export function boundsOf(nodes: readonly NodeBox[], ids?: Iterable<string> | null): Rect | null {
  const wanted = ids ? new Set(ids) : null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    if (wanted && !wanted.has(n.id)) continue
    minX = Math.min(minX, n.x)
    minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x + n.width)
    maxY = Math.max(maxY, n.y + n.height)
  }
  if (!Number.isFinite(minX)) return null
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** The zoom at which `bounds` exactly fills the box minus its padding (unclamped; 0 when there is no room). */
export function fitZoom(bounds: Rect, box: Box, pad: Insets): number {
  const w = box.width - pad.left - pad.right
  const h = box.height - pad.top - pad.bottom
  if (w <= 0 || h <= 0) return 0
  const zx = bounds.width > 0 ? w / bounds.width : Infinity
  const zy = bounds.height > 0 ? h / bounds.height : Infinity
  const z = Math.min(zx, zy)
  return Number.isFinite(z) ? z : FIT_MAX_ZOOM
}

/** A viewport that centers `bounds` in the padded box at `zoom`. */
export function centeredViewport(bounds: Rect, box: Box, pad: Insets, zoom: number): Viewport {
  const w = box.width - pad.left - pad.right
  const h = box.height - pad.top - pad.bottom
  return {
    x: pad.left + (w - bounds.width * zoom) / 2 - bounds.x * zoom,
    y: pad.top + (h - bounds.height * zoom) / 2 - bounds.y * zoom,
    zoom,
  }
}

/**
 * Corner overlays only cover a corner, so for each one we can keep cards out of either the strip along its side
 * (its width) or the strip along its edge (its height). Try every combination and keep the padding that lets
 * `bounds` be drawn biggest.
 */
export function bestPadding(bounds: Rect, box: Box, base: Insets, corners: readonly CornerObstacle[]): { pad: Insets; zoom: number } {
  let best: { pad: Insets; zoom: number } | null = null
  const combos = 1 << corners.length
  for (let mask = 0; mask < combos; mask++) {
    const pad = { ...base }
    corners.forEach((c, i) => {
      const vertical = (mask >> i) & 1 // 1 = keep clear the strip along the left/right side
      const [v, h] = c.corner.split('-') as ['top' | 'bottom', 'left' | 'right']
      if (vertical) pad[h] = Math.max(pad[h], c.width)
      else pad[v] = Math.max(pad[v], c.height)
    })
    const zoom = fitZoom(bounds, box, pad)
    if (!best || zoom > best.zoom + 1e-9) best = { pad, zoom }
  }
  return best ?? { pad: base, zoom: fitZoom(bounds, box, base) }
}

/**
 * Reading order for a close-up: start at `startId` and walk outwards through its neighbors (breadth first),
 * taking more important nodes first within each ring. Nodes not reachable from the start follow, by importance.
 * `rank` lists node ids from most to least important; unlisted nodes come last (by how many links they have).
 */
export function focusSequence(
  nodeIds: readonly string[],
  neighbors: ReadonlyMap<string, ReadonlySet<string>>,
  rank: readonly string[] | undefined,
  startId: string | null,
): string[] {
  const known = new Set(nodeIds)
  const pos = new Map<string, number>()
  rank?.forEach((id, i) => {
    if (known.has(id) && !pos.has(id)) pos.set(id, i)
  })
  const degree = (id: string) => neighbors.get(id)?.size ?? 0
  const order = [...known].sort((a, b) => {
    const pa = pos.get(a) ?? Infinity
    const pb = pos.get(b) ?? Infinity
    if (pa !== pb) return pa - pb
    return degree(b) - degree(a) || (a < b ? -1 : a > b ? 1 : 0)
  })
  const priority = new Map(order.map((id, i) => [id, i]))
  const out: string[] = []
  const seen = new Set<string>()
  const walk = (from: string) => {
    let ring = [from]
    seen.add(from)
    while (ring.length) {
      out.push(...ring)
      const next: string[] = []
      for (const id of ring) {
        for (const n of neighbors.get(id) ?? []) {
          if (!known.has(n) || seen.has(n)) continue
          seen.add(n)
          next.push(n)
        }
      }
      next.sort((a, b) => (priority.get(a) ?? 0) - (priority.get(b) ?? 0))
      ring = next
    }
  }
  if (startId && known.has(startId)) walk(startId)
  for (const id of order) if (!seen.has(id)) walk(id)
  return out
}

export interface ViewPlanInput {
  nodes: readonly NodeBox[]
  box: Box
  /** Padding that always applies (breathing room, the explain panel, buttons drawn over the top edge …). */
  base: Insets
  corners: readonly CornerObstacle[]
  /** Fit the overview to these nodes only (default: all). */
  overviewIds?: readonly string[] | null
  /** Close-up order (see focusSequence). */
  sequence: readonly string[]
  /**
   * How many leading entries of `sequence` are the starting card and its direct neighbors. A close-up keeps them
   * all in view when that is possible at a still-legible size (RING_MIN_ZOOM).
   */
  ringSize?: number
  /** 'auto': the whole picture when it is readable, else a readable close-up. 'all': always the whole picture. */
  mode: 'auto' | 'all'
  /** Extra bottom room for the "Show all" button, which only appears when the picture doesn't fit readably. */
  toggleReserve?: number
  readableZoom?: number
  maxZoom?: number
}

export interface ViewPlan {
  viewport: Viewport
  /** True when the view is a close-up of part of the picture. */
  focused: boolean
  /** Whether the whole picture is too small to read when fitted (so a close-up / overview toggle makes sense). */
  crowded: boolean
  /** The zoom that fits the whole picture (for the canvas' minimum zoom). */
  overviewZoom: number
  /** How many nodes the planned view was fitted to. */
  fittedCount: number
  /** The padding the plan was fitted with (what counts as "visible" when revealing a card later). */
  pad: Insets
}

/**
 * Where to look first. The whole picture when it can be drawn at a readable size; otherwise the longest stretch of
 * `sequence` (the selected card and its neighbors, or the busiest part) that still fits readably.
 */
export function planView(input: ViewPlanInput): ViewPlan | null {
  const { nodes, box, base, corners, mode } = input
  const readable = input.readableZoom ?? READABLE_ZOOM
  const maxZoom = input.maxZoom ?? FIT_MAX_ZOOM
  if (!nodes.length || box.width <= 0 || box.height <= 0) return null
  const overviewSet = input.overviewIds?.length ? input.overviewIds : null
  const overview = boundsOf(nodes, overviewSet) ?? boundsOf(nodes)
  if (!overview) return null
  const first = bestPadding(overview, box, base, corners)
  const fitted = overviewSet?.length ?? nodes.length
  // Cropping a picture of only a handful of cards hides more than slightly smaller text does.
  const crowded = first.zoom < (fitted <= SMALL_PICTURE ? Math.min(readable, SMALL_PICTURE_MIN_ZOOM) : readable)
  const withToggle = crowded && input.toggleReserve ? addInsets(base, { bottom: input.toggleReserve }) : base

  if (mode === 'all' || !crowded) {
    const fit = crowded ? bestPadding(overview, box, withToggle, corners) : first
    const zoom = Math.min(fit.zoom, maxZoom)
    return {
      viewport: centeredViewport(overview, box, fit.pad, zoom),
      focused: false,
      crowded,
      overviewZoom: fit.zoom,
      fittedCount: fitted,
      pad: fit.pad,
    }
  }

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const seq = input.sequence.filter((id) => byId.has(id))
  if (!seq.length) seq.push(nodes[0].id)
  let chosen: { bounds: Rect; pad: Insets; zoom: number; count: number } | null = null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let k = 0; k < seq.length; k++) {
    const n = byId.get(seq[k]) as NodeBox
    minX = Math.min(minX, n.x)
    minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x + n.width)
    maxY = Math.max(maxY, n.y + n.height)
    const bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    const fit = bestPadding(bounds, box, withToggle, corners)
    if (k > 0 && fit.zoom < readable) break
    chosen = { bounds, pad: fit.pad, zoom: fit.zoom, count: k + 1 }
  }
  let pick = chosen as { bounds: Rect; pad: Insets; zoom: number; count: number }
  const overviewZoom = bestPadding(overview, box, withToggle, corners).zoom
  const ring = Math.min(seq.length, Math.max(1, Math.floor(input.ringSize ?? 1)))
  if (pick.count < ring) {
    const bounds = boundsOf(nodes, seq.slice(0, ring)) as Rect
    const fit = bestPadding(bounds, box, withToggle, corners)
    if (fit.zoom >= RING_MIN_ZOOM) {
      pick = { bounds, pad: fit.pad, zoom: fit.zoom, count: ring }
    } else {
      // The card's neighbors are too spread out to show together: a readable window that keeps the card itself in
      // full view and fits as many of its neighbors as it can.
      const zoom = Math.min(readable, maxZoom)
      const ringBoxes = seq.slice(0, ring).map((id) => byId.get(id) as NodeBox)
      const start = ringBoxes[0]
      const centered = windowViewport(ringBoxes, start, box, fit.pad, zoom)
      return {
        viewport: centered,
        focused: true,
        crowded,
        overviewZoom,
        fittedCount: ring,
        pad: fit.pad,
      }
    }
  }
  const zoom = Math.min(pick.zoom, maxZoom, FOCUS_MAX_ZOOM)
  return {
    viewport: centeredViewport(pick.bounds, box, pick.pad, zoom),
    focused: true,
    crowded,
    overviewZoom,
    fittedCount: pick.count,
    pad: pick.pad,
  }
}

/**
 * Along one axis: where a window of `span` flow units should start so that `must` is fully inside and as many of
 * the `items` intervals as possible are too (ties: closest to centering them all).
 */
function bestWindowStart(items: readonly [number, number][], must: [number, number], span: number): number {
  const lo = Math.min(...items.map((i) => i[0]))
  const hi = Math.max(...items.map((i) => i[1]))
  const centered = (lo + hi) / 2 - span / 2
  if (must[1] - must[0] > span) return (must[0] + must[1]) / 2 - span / 2
  const candidates = [centered, ...items.map((i) => i[0]), ...items.map((i) => i[1] - span), must[0], must[1] - span]
  let best = { start: centered, count: -1, off: Infinity }
  for (const c of candidates) {
    const start = Math.min(Math.max(c, must[1] - span), must[0])
    let count = 0
    for (const [a, b] of items) if (a >= start - 0.5 && b <= start + span + 0.5) count++
    const off = Math.abs(start - centered)
    if (count > best.count || (count === best.count && off < best.off)) best = { start, count, off }
  }
  return best.start
}

/** A viewport at `zoom` that shows `must` in full and as many of `items` as fit in the padded box. */
export function windowViewport(items: readonly Rect[], must: Rect, box: Box, pad: Insets, zoom: number): Viewport {
  const spanX = Math.max(0, box.width - pad.left - pad.right) / zoom
  const spanY = Math.max(0, box.height - pad.top - pad.bottom) / zoom
  const x0 = bestWindowStart(items.map((r) => [r.x, r.x + r.width]), [must.x, must.x + must.width], spanX)
  const y0 = bestWindowStart(items.map((r) => [r.y, r.y + r.height]), [must.y, must.y + must.height], spanY)
  return { x: pad.left - x0 * zoom, y: pad.top - y0 * zoom, zoom }
}

/** Where a flow-space rectangle lands on screen. */
export function toScreen(r: Rect, vp: Viewport): Rect {
  return { x: r.x * vp.zoom + vp.x, y: r.y * vp.zoom + vp.y, width: r.width * vp.zoom, height: r.height * vp.zoom }
}

/**
 * The smallest pan (same zoom) that brings `target` fully inside the padded box, or null when it is already
 * visible. A target bigger than the free area is centered in it.
 */
export function revealViewport(vp: Viewport, target: Rect, box: Box, pad: Insets): Viewport | null {
  const s = toScreen(target, vp)
  const left = pad.left
  const top = pad.top
  const right = box.width - pad.right
  const bottom = box.height - pad.bottom
  if (right <= left || bottom <= top) return null
  const shift = (start: number, size: number, lo: number, hi: number) => {
    if (size > hi - lo) return lo + (hi - lo - size) / 2 - start
    if (start < lo) return lo - start
    if (start + size > hi) return hi - (start + size)
    return 0
  }
  const dx = shift(s.x, s.width, left, right)
  const dy = shift(s.y, s.height, top, bottom)
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return null
  return { x: vp.x + dx, y: vp.y + dy, zoom: vp.zoom }
}

/** The wide-screen explain panel: a drawer this wide on the right, below the 64px header, from 768px up. */
export const EXPLAIN_PANEL = { minViewport: 768, width: 440, gutter: 32, top: 64 } as const

/**
 * How much of a canvas (its on-screen rectangle) the open explain drawer covers on the right, plus a little gap.
 * 0 when the drawer is closed, on narrow screens (it is a bottom sheet there), when it doesn't reach the canvas,
 * or when it covers so much that moving the picture wouldn't help.
 */
export function explainPanelInset(canvas: { left: number; right: number; bottom: number; width: number }, viewportWidth: number, open: boolean): number {
  if (!open || viewportWidth < EXPLAIN_PANEL.minViewport || canvas.width <= 0) return 0
  if (canvas.bottom <= EXPLAIN_PANEL.top) return 0
  const panelLeft = viewportWidth - Math.min(EXPLAIN_PANEL.width, viewportWidth - EXPLAIN_PANEL.gutter)
  const overlap = canvas.right - panelLeft
  if (overlap <= 0) return 0
  const left = canvas.width - overlap
  if (left < Math.max(260, canvas.width * 0.35)) return 0
  return Math.round(overlap + 12)
}

export function sameViewport(a: Viewport, b: Viewport): boolean {
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.zoom - b.zoom) < 0.001
}
