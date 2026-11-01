import { useCallback, useMemo } from 'react'
import type { EdgeTypes, NodeTypes } from '@xyflow/react'
import { EmptyState, LayerLegend } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { formatBytes, formatNumber, pluralize } from '@/core/format'
import { LAYER_INFO, ROLE_INFO } from '@/core/labels'
import { basename, dirname, extname } from '@/core/paths'
import { LAYERS, type AnalyzedFile, type FileEdge } from '@/core/types'
import { selectFileGraph, FILE_GRAPH_CAP } from './fileGraphData'
import { FlowCanvas } from './flow/FlowCanvas'
import { PathEdge, type PathFlowEdge } from './flow/PathEdge'
import type { TooltipContent } from './GraphTooltip'
import { buildNeighbors, edgeKey, layoutLayered, routedEdgeGeometry } from './layout'
import { centerHandles } from './nodes/common'
import { FILE_NODE_HEIGHT, FILE_NODE_WIDTH, FileNode, type FileFlowNode } from './nodes/FileNode'

export interface FileGraphProps {
  /** Files to show as main nodes (e.g. one module's files). */
  files: AnalyzedFile[]
  /** File edges; edges to files outside `files` are drawn to faded neighbor nodes when showNeighbors is set. */
  edges: FileEdge[]
  /** All files (to render neighbor nodes outside the set). */
  allFiles?: Record<string, AnalyzedFile>
  showNeighbors?: boolean
  selectedPath?: string | null
  onSelect?: (path: string | null) => void
  onOpen?: (path: string) => void
  className?: string
  direction?: 'LR' | 'TB'
  /** Files the reader has already opened (small check). */
  seenPaths?: string[]
  /** Maximum number of cards (default 120). */
  maxNodes?: number
  /** Width ÷ height of the space the map is shown in, so files that use nothing else are laid out to fill it. */
  aspect?: number
}

export interface FileGraphOptions {
  allFiles?: Record<string, AnalyzedFile>
  showNeighbors?: boolean
  direction?: 'LR' | 'TB'
  maxNodes?: number
  aspect?: number
}

/** Which files a file map shows and how they are laid out (pure; also used to pick the arrow direction that fits best). */
export function buildFileGraphLayout(files: readonly AnalyzedFile[], edges: readonly FileEdge[], opts: FileGraphOptions = {}) {
  const direction = opts.direction ?? 'LR'
  const sel = selectFileGraph(files, edges, { cap: opts.maxNodes ?? FILE_GRAPH_CAP, showNeighbors: opts.showNeighbors, allFiles: opts.allFiles })
  const ids = [...sel.main, ...sel.neighbors]
  const layout = layoutLayered(
    ids.map((id) => ({ id, width: FILE_NODE_WIDTH, height: FILE_NODE_HEIGHT })),
    sel.edges,
    {
      direction,
      nodesep: direction === 'LR' ? 16 : 28,
      ranksep: direction === 'LR' ? 80 : 60,
      gridGap: 16,
      targetAspect: opts.aspect,
    },
  )
  return { sel, ids, layout }
}

const nodeTypes: NodeTypes = { file: FileNode }
const edgeTypes: EdgeTypes = { path: PathEdge }

/** A stand-in for a file we only know by path (no analysis entry). */
function placeholderFile(path: string): AnalyzedFile {
  return {
    path,
    name: basename(path),
    dir: dirname(path),
    ext: extname(path),
    language: null,
    size: 0,
    lines: null,
    fetched: false,
    kind: 'other',
    role: 'other',
    layer: 'other',
    isEntry: false,
    moduleId: '',
    imports: [],
    externalImports: [],
    unresolvedImports: [],
    importedBy: [],
    symbols: [],
    routes: [],
    summary: '',
  }
}

/** File-level dependency graph inside a module: nodes show role emoji, file name, role label; layered layout. Caps at ~120 nodes (shows a note). */
export function FileGraph({
  files,
  edges,
  allFiles,
  showNeighbors = false,
  selectedPath,
  onSelect,
  onOpen,
  className,
  direction = 'LR',
  seenPaths,
  maxNodes = FILE_GRAPH_CAP,
  aspect,
}: FileGraphProps) {
  // Only the rough shape of the space matters for the layout: don't re-lay out on every pixel of a resize.
  const shape = aspect && Number.isFinite(aspect) ? Math.round(Math.min(3, Math.max(0.5, aspect)) * 4) / 4 : undefined
  const graph = useMemo(() => {
    const { sel, ids, layout } = buildFileGraphLayout(files, edges, { allFiles, showNeighbors, direction, maxNodes, aspect: shape })
    const byPath = new Map(files.map((f) => [f.path, f]))
    const fileOf = (p: string) => byPath.get(p) ?? allFiles?.[p] ?? placeholderFile(p)
    const neighborSet = new Set(sel.neighbors)
    const nodes: FileFlowNode[] = ids.map((id) => {
      const f = fileOf(id)
      const neighbor = neighborSet.has(id)
      return {
        id,
        type: 'file',
        position: layout.positions.get(id) ?? { x: 0, y: 0 },
        width: FILE_NODE_WIDTH,
        height: FILE_NODE_HEIGHT,
        handles: centerHandles(FILE_NODE_WIDTH, FILE_NODE_HEIGHT),
        data: { file: f, neighbor },
        ariaLabel: `${f.name}: ${(ROLE_INFO[f.role] ?? ROLE_INFO.other).label}${neighbor ? `, in another part (${f.dir || 'top level'})` : ''}`,
      }
    })
    const flowEdges: PathFlowEdge[] = []
    for (const e of sel.edges) {
      const points = layout.edgePoints.get(edgeKey(e.source, e.target))
      if (!points) continue
      flowEdges.push({
        id: `${e.source}->${e.target}`,
        source: e.source,
        target: e.target,
        type: 'path',
        data: {
          ...routedEdgeGeometry(points),
          width: 1.5,
          label: 'uses',
          faint: neighborSet.has(e.source) || neighborSet.has(e.target),
        },
      })
    }
    const present = new Set(ids.map((id) => fileOf(id).layer))
    return {
      sel,
      nodes,
      edges: flowEdges,
      neighbors: buildNeighbors(sel.edges),
      layers: LAYERS.filter((l) => present.has(l)),
      fileOf,
      key: `${direction}|${shape ?? ''}|${ids.join(',')}|${sel.edges.length}`,
    }
  }, [files, edges, allFiles, showNeighbors, direction, maxNodes, shape])

  const tooltipFor = useCallback(
    (id: string): TooltipContent | null => {
      const f = graph.fileOf(id)
      const role = ROLE_INFO[f.role] ?? ROLE_INFO.other
      const uses = f.imports.length
      const usedBy = f.importedBy.length
      const rows: TooltipContent['rows'] = [{ value: role.label, color: LAYER_INFO[f.layer]?.color }]
      if (f.lines != null) rows.push({ value: formatNumber(f.lines), label: 'lines' })
      else if (f.size) rows.push({ value: formatBytes(f.size), label: 'in size' })
      if (uses) rows.push({ value: formatNumber(uses), label: uses === 1 ? 'project file it uses' : 'project files it uses' })
      if (usedBy) rows.push({ value: formatNumber(usedBy), label: usedBy === 1 ? 'file uses it' : 'files use it' })
      return {
        title: f.name,
        subtitle: f.dir || 'Top level of the project',
        rows,
        description: f.summary || role.description,
        hint: onOpen ? 'Click to learn more · double-click to open the file' : 'Click to learn more',
      }
    },
    [graph, onOpen],
  )

  if (!files.length) {
    return (
      <div className={cn('flex h-full w-full items-center justify-center', className)} data-testid="file-graph">
        <EmptyState icon="📄" title="No files to show">
          This part of the project doesn’t contain any files we could map.
        </EmptyState>
      </div>
    )
  }

  const { sel } = graph
  const notes: string[] = []
  if (sel.hiddenMain > 0) notes.push(`Showing the ${formatNumber(sel.main.length)} most connected files (of ${formatNumber(files.length)}).`)
  if (sel.hiddenNeighbors > 0) notes.push(`${pluralize(sel.hiddenNeighbors, 'outside file')} left out to keep the picture readable.`)
  if (!graph.edges.length) notes.push('None of these files use each other directly.')

  return (
    <FlowCanvas
      className={className}
      testId="file-graph"
      ariaLabel={`Map of ${pluralize(graph.nodes.length, 'file')} and which ones use each other`}
      nodes={graph.nodes}
      edges={graph.edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      neighbors={graph.neighbors}
      selectedId={selectedPath}
      seenIds={seenPaths}
      onSelect={onSelect}
      onOpen={onOpen}
      tooltipFor={tooltipFor}
      layoutKey={graph.key}
      focusRank={sel.main}
      overviewLabel={sel.hiddenMain > 0 ? 'Show the whole map' : `Show all ${formatNumber(graph.nodes.length)} files`}
      showMiniMap={graph.nodes.length > 30}
      miniMapColor={(n) => LAYER_INFO[n.data.file.layer]?.color ?? 'var(--layer-other)'}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5">
          {graph.layers.length >= 2 ? <LayerLegend layers={graph.layers} /> : <span />}
          <div className="space-y-0.5 text-xs">
            <p className="text-ink-3">
              Arrows point from a file to the file it uses.
              {sel.neighbors.length > 0 && ' Faded cards with dashed borders live in other parts of the project.'}
            </p>
            {notes.map((n) => (
              <p key={n} className="font-medium text-ink-2">
                {n}
              </p>
            ))}
          </div>
        </div>
      }
    />
  )
}
