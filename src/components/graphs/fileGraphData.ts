/** Choosing which files a file-level dependency graph shows (pure, testable). */
import type { AnalyzedFile, FileEdge } from '@/core/types'

export const FILE_GRAPH_CAP = 120
/** Never let outside files crowd out the picture. */
export const MAX_NEIGHBORS = 24

export interface FileGraphSelection {
  /** Main files kept, most connected first. */
  main: string[]
  /** Outside files kept (only when neighbors are requested). */
  neighbors: string[]
  /** Deduplicated edges between kept files that touch at least one main file. */
  edges: FileEdge[]
  /** Main files left out because of the cap. */
  hiddenMain: number
  /** Outside files left out. */
  hiddenNeighbors: number
}

/**
 * Keep at most `cap` nodes: main files ranked by how connected they are, then (if requested) the outside files
 * with the most links to the kept main files, filling the remaining room.
 */
export function selectFileGraph(
  files: readonly AnalyzedFile[],
  edges: readonly FileEdge[],
  opts: { cap?: number; showNeighbors?: boolean; allFiles?: Record<string, AnalyzedFile> } = {},
): FileGraphSelection {
  const cap = Math.max(1, opts.cap ?? FILE_GRAPH_CAP)
  const mainSet = new Set(files.map((f) => f.path))
  const unique = new Map<string, FileEdge>()
  for (const e of edges) {
    if (e.source === e.target) continue
    if (!mainSet.has(e.source) && !mainSet.has(e.target)) continue
    const k = `${e.source}\u0000${e.target}`
    if (!unique.has(k)) unique.set(k, { source: e.source, target: e.target })
  }
  const allEdges = [...unique.values()]
  const canShowNeighbor = (p: string) => !mainSet.has(p) && (!opts.allFiles || p in opts.allFiles)

  const degree = new Map<string, number>()
  const bump = (p: string) => degree.set(p, (degree.get(p) ?? 0) + 1)
  for (const e of allEdges) {
    const inS = mainSet.has(e.source)
    const inT = mainSet.has(e.target)
    if (inS && (inT || opts.showNeighbors)) bump(e.source)
    if (inT && (inS || opts.showNeighbors)) bump(e.target)
  }
  const order = new Map(files.map((f, i) => [f.path, i]))
  const rankedMain = [...mainSet].sort(
    (a, b) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0) || (order.get(a) ?? 0) - (order.get(b) ?? 0),
  )
  const main = rankedMain.slice(0, cap)
  const keptMain = new Set(main)

  let neighbors: string[] = []
  let hiddenNeighbors = 0
  if (opts.showNeighbors) {
    const links = new Map<string, number>()
    for (const e of allEdges) {
      if (keptMain.has(e.source) && canShowNeighbor(e.target)) links.set(e.target, (links.get(e.target) ?? 0) + 1)
      if (keptMain.has(e.target) && canShowNeighbor(e.source)) links.set(e.source, (links.get(e.source) ?? 0) + 1)
    }
    const ranked = [...links.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([p]) => p)
    const room = Math.max(0, Math.min(cap - main.length, MAX_NEIGHBORS))
    neighbors = ranked.slice(0, room)
    hiddenNeighbors = ranked.length - neighbors.length
  }
  const kept = new Set([...main, ...neighbors])
  return {
    main,
    neighbors,
    edges: allEdges.filter((e) => kept.has(e.source) && kept.has(e.target)),
    hiddenMain: rankedMain.length - main.length,
    hiddenNeighbors,
  }
}
