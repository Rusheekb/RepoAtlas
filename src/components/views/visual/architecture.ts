/** Pure helpers for the "How It Connects" view: table rows, sorting and per-module file lists. */
import { LAYERS, type AnalyzedFile, type Layer, type ModuleEdge, type ModuleInfo } from '@/core/types'

export interface ModuleRow {
  module: ModuleInfo
  /** Parts this part uses (distinct, by name). */
  uses: ModuleInfo[]
  /** Parts that use this part (distinct, by name). */
  usedBy: ModuleInfo[]
}

export type ModuleSortKey = 'name' | 'role' | 'files' | 'lines' | 'uses' | 'usedBy'
export type SortDirection = 'asc' | 'desc'

const byName = (a: ModuleInfo, b: ModuleInfo) => a.name.localeCompare(b.name)

/** One row per module with the parts it uses and the parts that use it (self-links and unknown ids ignored). */
export function moduleRows(modules: readonly ModuleInfo[], edges: readonly ModuleEdge[]): ModuleRow[] {
  const byId = new Map(modules.map((m) => [m.id, m]))
  const uses = new Map<string, Set<string>>()
  const usedBy = new Map<string, Set<string>>()
  for (const e of edges) {
    if (e.source === e.target || !byId.has(e.source) || !byId.has(e.target)) continue
    if (!uses.has(e.source)) uses.set(e.source, new Set())
    uses.get(e.source)?.add(e.target)
    if (!usedBy.has(e.target)) usedBy.set(e.target, new Set())
    usedBy.get(e.target)?.add(e.source)
  }
  const resolve = (ids: Set<string> | undefined) =>
    [...(ids ?? [])].map((id) => byId.get(id)).filter((m): m is ModuleInfo => Boolean(m)).sort(byName)
  return modules.map((m) => ({ module: m, uses: resolve(uses.get(m.id)), usedBy: resolve(usedBy.get(m.id)) }))
}

function sortValue(row: ModuleRow, key: ModuleSortKey): number | string {
  switch (key) {
    case 'name':
      return row.module.name.toLowerCase()
    case 'role':
      return row.module.role.toLowerCase()
    case 'files':
      return row.module.fileCount
    case 'lines':
      return row.module.lines
    case 'uses':
      return row.uses.length
    case 'usedBy':
      return row.usedBy.length
  }
}

/** Sort rows by a column. Ties fall back to the part's name so the order is stable and predictable. */
export function sortModuleRows(rows: readonly ModuleRow[], key: ModuleSortKey, dir: SortDirection): ModuleRow[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const va = sortValue(a, key)
    const vb = sortValue(b, key)
    const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
    return cmp !== 0 ? cmp * sign : byName(a.module, b.module)
  })
}

/** The natural first direction for a column: words A→Z, numbers biggest first. */
export function defaultSortDirection(key: ModuleSortKey): SortDirection {
  return key === 'name' || key === 'role' ? 'asc' : 'desc'
}

/** The analyzed files of a module (skipping paths the analysis doesn't know). */
export function moduleFiles(module: ModuleInfo, files: Record<string, AnalyzedFile>): AnalyzedFile[] {
  const out: AnalyzedFile[] = []
  for (const p of module.files) {
    const f = files[p]
    if (f) out.push(f)
  }
  return out
}

/** Layers present among the modules, in the fixed palette order. */
export function presentLayers(modules: readonly ModuleInfo[]): Layer[] {
  const present = new Set(modules.map((m) => m.layer))
  return LAYERS.filter((l) => present.has(l))
}

/** "a, b and c" / "a, b, c and 2 more" for short inline lists of names. */
export function nameList(names: readonly string[], max = 3): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  if (names.length <= max) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return `${names.slice(0, max).join(', ')} and ${names.length - max} more`
}

/**
 * A module and its most strongly connected neighbors (by link weight), with the edges among them — a small,
 * readable slice of the architecture map. Unknown ids give an empty slice.
 */
export function moduleNeighborhood(
  moduleId: string,
  modules: readonly ModuleInfo[],
  edges: readonly ModuleEdge[],
  maxNeighbors = 4,
): { modules: ModuleInfo[]; edges: ModuleEdge[] } {
  const byId = new Map(modules.map((m) => [m.id, m]))
  if (!byId.has(moduleId)) return { modules: [], edges: [] }
  const weight = new Map<string, number>()
  for (const e of edges) {
    if (e.source === e.target) continue
    const other = e.source === moduleId ? e.target : e.target === moduleId ? e.source : null
    if (other && byId.has(other)) weight.set(other, (weight.get(other) ?? 0) + e.weight)
  }
  const neighbors = [...weight.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(0, maxNeighbors))
    .map(([id]) => id)
  const keep = new Set([moduleId, ...neighbors])
  return {
    modules: modules.filter((m) => keep.has(m.id)),
    edges: edges.filter((e) => e.source !== e.target && keep.has(e.source) && keep.has(e.target)),
  }
}

/** The bounding box of laid-out nodes. */
function boundsOf(nodes: readonly { position: { x: number; y: number }; width?: number; height?: number }[]): { width: number; height: number } {
  if (!nodes.length) return { width: 0, height: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    minX = Math.min(minX, n.position.x)
    minY = Math.min(minY, n.position.y)
    maxX = Math.max(maxX, n.position.x + (n.width ?? 0))
    maxY = Math.max(maxY, n.position.y + (n.height ?? 0))
  }
  return { width: maxX - minX, height: maxY - minY }
}

/**
 * Which arrow direction lets a small map of these modules fill a box of the given size best (bigger boxes = easier
 * to read). Ties go to top-down, which suits narrow side columns.
 */
export function bestFitDirection(
  modules: readonly ModuleInfo[],
  edges: readonly ModuleEdge[],
  box: { width: number; height: number },
  layout: (modules: readonly ModuleInfo[], edges: readonly ModuleEdge[], direction: 'LR' | 'TB') => {
    nodes: readonly { position: { x: number; y: number }; width?: number; height?: number }[]
  },
): 'LR' | 'TB' {
  if (modules.length <= 1) return 'TB'
  const scale = (direction: 'LR' | 'TB') => {
    const b = boundsOf(layout(modules, edges, direction).nodes)
    if (b.width <= 0 || b.height <= 0) return Infinity
    return Math.min(box.width / b.width, box.height / b.height)
  }
  return scale('LR') > scale('TB') * 1.05 ? 'LR' : 'TB'
}

/** How many distinct files outside `inside` use, or are used by, those files. */
export function outsideNeighborCount(inside: readonly AnalyzedFile[], all: Record<string, AnalyzedFile>): number {
  const own = new Set(inside.map((f) => f.path))
  const outside = new Set<string>()
  for (const f of inside) {
    for (const p of f.imports) if (!own.has(p) && p in all) outside.add(p)
    for (const p of f.importedBy) if (!own.has(p) && p in all) outside.add(p)
  }
  return outside.size
}
