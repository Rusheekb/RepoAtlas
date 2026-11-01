/**
 * Data side of the code treemap: turns a flat file list into a shallow folder tree (two levels below the zoomed
 * folder, deeper folders folded into single "aggregate" tiles) and lays it out with d3-hierarchy's squarified treemap.
 */
import { hierarchy, treemap, treemapSquarify } from 'd3-hierarchy'
import { LAYERS, type AnalyzedFile, type FileKind, type Layer } from '@/core/types'

export type TreemapKind = 'root' | 'folder' | 'aggregate' | 'file'

export interface TreemapDatum {
  /** Repo path ('' for the repository root). */
  key: string
  name: string
  kind: TreemapKind
  /** Size used for the tile area (leaves only; folders sum their children). */
  value: number
  fileCount: number
  /** Lines across downloaded files. */
  lines: number
  bytes: number
  /** Total tile weight (the area it gets). */
  weight?: number
  /** The part of `weight` that isn't a real line count (size estimates for files we didn't read, images …). */
  estimated?: number
  /** The file's layer, or the dominant layer by size for folders. */
  layer: Layer
  /** The file's language, or the dominant language by size for folders (null = not code). */
  language: string | null
  file?: AnalyzedFile
  children?: TreemapDatum[]
}

export type SizeBy = 'lines' | 'bytes'

/** Images, fonts and machine-made files (lock files …): not code anyone wrote, so they get only a small tile. */
const NOT_CODE_KINDS: ReadonlySet<FileKind> = new Set<FileKind>(['asset', 'generated'])
/** The most a not-code file weighs, in "lines". */
export const NOT_CODE_MAX_WEIGHT = 25

/** Whether a file's tile size by lines is an estimate rather than its real line count. */
export function isEstimatedWeight(file: Pick<AnalyzedFile, 'lines' | 'size'> & { kind?: FileKind }): boolean {
  return (file.kind != null && NOT_CODE_KINDS.has(file.kind)) || !(file.lines != null && file.lines > 0)
}

/**
 * Tile weight. By lines: the file's lines of code (bytes/40 for source files we didn't download); images and
 * machine-made files get a small fixed-ish weight, so "bigger rectangles hold more code" stays true. By bytes: raw
 * size. Never zero.
 */
export function fileWeight(file: Pick<AnalyzedFile, 'lines' | 'size'> & { kind?: FileKind }, sizeBy: SizeBy): number {
  let v: number
  if (sizeBy === 'bytes') v = file.size
  else if (file.kind != null && NOT_CODE_KINDS.has(file.kind)) v = Math.min(file.size / 400, NOT_CODE_MAX_WEIGHT)
  else v = file.lines != null && file.lines > 0 ? file.lines : file.size / 40
  return Number.isFinite(v) && v > 1 ? v : 1
}

export function normalizeFolder(path: string): string {
  return path.replace(/^\/+|\/+$/g, '')
}

interface Builder {
  datum: TreemapDatum
  layerWeights: Map<Layer, number>
  languageWeights: Map<string, number>
  childMap?: Map<string, Builder>
}

function newBuilder(key: string, name: string, kind: TreemapKind): Builder {
  return {
    datum: { key, name, kind, value: 0, fileCount: 0, lines: 0, bytes: 0, weight: 0, estimated: 0, layer: 'other', language: null },
    layerWeights: new Map(),
    languageWeights: new Map(),
    childMap: kind === 'file' || kind === 'aggregate' ? undefined : new Map(),
  }
}

function account(b: Builder, file: AnalyzedFile, weight: number, estimated: boolean) {
  b.datum.fileCount += 1
  b.datum.lines += file.lines ?? 0
  b.datum.bytes += file.size
  b.datum.weight = (b.datum.weight ?? 0) + weight
  if (estimated) b.datum.estimated = (b.datum.estimated ?? 0) + weight
  b.layerWeights.set(file.layer, (b.layerWeights.get(file.layer) ?? 0) + weight)
  const lang = file.language ?? ''
  b.languageWeights.set(lang, (b.languageWeights.get(lang) ?? 0) + weight)
}

function finish(b: Builder): TreemapDatum {
  const d = b.datum
  if (d.kind !== 'file') {
    let bestLayer: Layer = 'other'
    let bestLayerW = -1
    for (const l of LAYERS) {
      const w = b.layerWeights.get(l) ?? 0
      if (w > bestLayerW) {
        bestLayer = l
        bestLayerW = w
      }
    }
    d.layer = bestLayer
    let bestLang = ''
    let bestLangW = -1
    for (const [lang, w] of b.languageWeights) {
      if (w > bestLangW || (w === bestLangW && lang < bestLang)) {
        bestLang = lang
        bestLangW = w
      }
    }
    d.language = bestLang || null
  }
  if (b.childMap) {
    d.children = [...b.childMap.values()].map(finish)
    d.children.sort((x, y) => sizeOf(y) - sizeOf(x) || x.name.localeCompare(y.name))
  }
  return d
}

function sizeOf(d: TreemapDatum): number {
  if (!d.children) return d.value
  let s = 0
  for (const c of d.children) s += sizeOf(c)
  return s
}

/**
 * Build the tree for the folder `rootPath` ('' = whole repo). `levels` levels are shown below it: with the default 2,
 * the folder's direct sub-folders get a header and contain files plus one aggregate tile per deeper sub-folder.
 * Returns a root with no children when nothing lives under rootPath.
 */
export function buildTreemapTree(
  files: readonly AnalyzedFile[],
  rootPath: string,
  sizeBy: SizeBy = 'lines',
  levels = 2,
): TreemapDatum {
  const root = normalizeFolder(rootPath)
  const prefix = root ? `${root}/` : ''
  const depthLimit = Math.max(1, Math.floor(levels))
  const rootB = newBuilder(root, root ? root.slice(root.lastIndexOf('/') + 1) : 'All files', 'root')

  for (const file of files) {
    if (prefix && !file.path.startsWith(prefix)) continue
    const rel = file.path.slice(prefix.length)
    if (!rel) continue
    const segs = rel.split('/')
    const weight = fileWeight(file, sizeBy)
    const estimated = sizeBy === 'lines' && isEstimatedWeight(file)
    account(rootB, file, weight, estimated)
    let parent = rootB
    let key = root
    // Walk expanded folders (depth < depthLimit).
    const fileDepth = segs.length // 1 = directly in root
    const expandedFolders = Math.min(fileDepth - 1, depthLimit - 1)
    for (let i = 0; i < expandedFolders; i++) {
      key = key ? `${key}/${segs[i]}` : segs[i]
      const map = parent.childMap as Map<string, Builder>
      let child = map.get(`d:${segs[i]}`)
      if (!child) map.set(`d:${segs[i]}`, (child = newBuilder(key, segs[i], 'folder')))
      account(child, file, weight, estimated)
      parent = child
    }
    const map = parent.childMap as Map<string, Builder>
    if (fileDepth <= depthLimit) {
      const leaf = newBuilder(file.path, segs[segs.length - 1], 'file')
      leaf.datum.value = weight
      leaf.datum.fileCount = 1
      leaf.datum.lines = file.lines ?? 0
      leaf.datum.bytes = file.size
      leaf.datum.weight = weight
      leaf.datum.estimated = estimated ? weight : 0
      leaf.datum.layer = file.layer
      leaf.datum.language = file.language
      leaf.datum.file = file
      map.set(`f:${segs[segs.length - 1]}`, leaf)
    } else {
      const seg = segs[expandedFolders]
      const aggKey = key ? `${key}/${seg}` : seg
      let agg = map.get(`d:${seg}`)
      if (!agg) map.set(`d:${seg}`, (agg = newBuilder(aggKey, seg, 'aggregate')))
      account(agg, file, weight, estimated)
      agg.datum.value += weight
    }
  }
  return finish(rootB)
}

export interface TreemapRect {
  datum: TreemapDatum
  depth: number
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface TreemapLayout {
  /** Folders with a header (drawn behind their children). */
  folders: TreemapRect[]
  /** File and aggregate tiles. */
  leaves: TreemapRect[]
}

export const FOLDER_HEADER = 20

/** Squarified layout of the tree into a width × height box (2px gaps between tiles, header strip on folders). */
export function layoutTreemap(tree: TreemapDatum, width: number, height: number): TreemapLayout {
  const folders: TreemapRect[] = []
  const leaves: TreemapRect[] = []
  if (width <= 0 || height <= 0 || !tree.children?.length) return { folders, leaves }
  const h = hierarchy<TreemapDatum>(tree, (d) => d.children)
    .sum((d) => (d.children ? 0 : d.value))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  const laidOut = treemap<TreemapDatum>()
    .size([width, height])
    .tile(treemapSquarify.ratio(1.4))
    .paddingInner(2)
    .paddingOuter(3)
    .paddingTop((n) => (n.depth === 0 ? 3 : FOLDER_HEADER))
    .round(true)(h)
  for (const n of laidOut.descendants()) {
    if (n.depth === 0) continue
    const r: TreemapRect = { datum: n.data, depth: n.depth, x0: n.x0, y0: n.y0, x1: n.x1, y1: n.y1 }
    if (n.x1 - n.x0 < 1 || n.y1 - n.y0 < 1) continue
    if (n.data.kind === 'folder') folders.push(r)
    else leaves.push(r)
  }
  return { folders, leaves }
}

/**
 * Keyboard order: top-level items in reading order (top→bottom, left→right); a folder is followed by its own
 * children in reading order.
 */
export function focusOrder(layout: TreemapLayout): TreemapRect[] {
  const byParent = new Map<string, TreemapRect[]>()
  const parentOf = (r: TreemapRect): string => {
    if (r.depth <= 1) return ''
    const k = r.datum.key
    return k.slice(0, k.lastIndexOf('/'))
  }
  const all = [...layout.folders, ...layout.leaves]
  for (const r of all) {
    const p = parentOf(r)
    const list = byParent.get(p) ?? []
    list.push(r)
    byParent.set(p, list)
  }
  const reading = (a: TreemapRect, b: TreemapRect) => a.y0 - b.y0 || a.x0 - b.x0
  const out: TreemapRect[] = []
  const visit = (parentKey: string) => {
    for (const r of (byParent.get(parentKey) ?? []).sort(reading)) {
      out.push(r)
      if (r.datum.kind === 'folder') visit(r.datum.key)
    }
  }
  visit('')
  return out
}

/** Above this share of a tile's area coming from estimates, its size is given as a file count, not lines. */
const ESTIMATE_SHARE = 0.15

/** Whether a tile's counted lines describe (almost) all of its area. */
export function linesMatchArea(d: Pick<TreemapDatum, 'lines' | 'weight' | 'estimated'>): boolean {
  const weight = d.weight ?? 0
  const share = weight > 0 ? (d.estimated ?? 0) / weight : 0
  return d.lines > 0 && share <= ESTIMATE_SHARE
}

/**
 * The size written on a tile, in words that match its area: "1,204 lines" when (almost) all of it is real code
 * we counted, otherwise the file count for folders ("407 files") or the size on disk for a single file ("12 KB").
 */
export function tileSizeText(
  d: Pick<TreemapDatum, 'kind' | 'lines' | 'bytes' | 'fileCount' | 'weight' | 'estimated'>,
  sizeBy: SizeBy,
  fmt: { compact: (n: number) => string; bytes: (n: number) => string },
): string {
  if (sizeBy === 'bytes') return fmt.bytes(d.bytes)
  if (linesMatchArea(d)) return `${fmt.compact(d.lines)} ${d.lines === 1 ? 'line' : 'lines'}`
  if (d.kind !== 'file') return `${fmt.compact(d.fileCount)} ${d.fileCount === 1 ? 'file' : 'files'}`
  return d.lines > 0 ? `${fmt.compact(d.lines)} ${d.lines === 1 ? 'line' : 'lines'}` : fmt.bytes(d.bytes)
}

/** Truncate a label to fit `maxWidth` px at roughly `charWidth` px per character; null when even 3 chars won't fit. */
export function fitLabel(text: string, maxWidth: number, charWidth = 6.6): string | null {
  const fits = Math.floor(maxWidth / charWidth)
  if (fits >= text.length) return text
  if (fits < 4) return null
  return `${text.slice(0, fits - 1)}…`
}

/** Ancestor folders of a folder path, for the breadcrumb: "a/b/c" → ["a", "a/b", "a/b/c"]. */
export function folderTrail(path: string): string[] {
  const p = normalizeFolder(path)
  if (!p) return []
  const parts = p.split('/')
  return parts.map((_, i) => parts.slice(0, i + 1).join('/'))
}

/** The folder one level up ('' at the top). */
export function parentFolder(path: string): string {
  const p = normalizeFolder(path)
  const i = p.lastIndexOf('/')
  return i === -1 ? '' : p.slice(0, i)
}
