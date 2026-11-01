import { useCallback, useMemo } from 'react'
import { Position, type EdgeTypes, type NodeTypes } from '@xyflow/react'
import { EmptyState, LayerLegend } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { pluralize } from '@/core/format'
import { LAYER_INFO } from '@/core/labels'
import { LAYERS, type Layer, type ModuleEdge, type ModuleInfo } from '@/core/types'
import { FlowCanvas } from './flow/FlowCanvas'
import { PathEdge, type PathFlowEdge } from './flow/PathEdge'
import type { Insets } from './flow/viewport'
import type { TooltipContent } from './GraphTooltip'
import { buildNeighbors, edgeKey, edgeStrokeWidth, layoutLayered, mergeLinks, routedEdgeGeometry } from './layout'
import { centerHandles } from './nodes/common'
import { MODULE_NODE_HEIGHT, MODULE_NODE_WIDTH, ModuleNode, moduleSizeLabel, type ModuleFlowNode } from './nodes/ModuleNode'

export interface ArchitectureGraphProps {
  modules: ModuleInfo[]
  edges: ModuleEdge[]
  selectedId?: string | null
  /** Modules to emphasize (e.g. the current tour step); others dim. Empty/undefined = no emphasis. */
  highlightIds?: string[]
  /** Modules the reader already explored (shows a small check). */
  seenIds?: string[]
  onSelect?: (id: string | null) => void
  /** "Open" a module (double-click / Enter) → drill into its files. */
  onOpen?: (id: string) => void
  direction?: 'LR' | 'TB'
  className?: string
  /** Show the mini map (default: when there are more than 12 parts). */
  showMiniMap?: boolean
  /** Show the color legend under the map (default true). */
  showLegend?: boolean
  /** Show the zoom buttons (default true). Small embedded maps can leave them out. */
  showControls?: boolean
  /** Space (px) kept free along the map's edges for buttons the page draws on top of it. */
  reserve?: Partial<Insets>
  /** Breathing room (px) around the fitted picture (default 28; small embedded maps can use less). */
  fitPadding?: number
}

const nodeTypes: NodeTypes = { module: ModuleNode }
const edgeTypes: EdgeTypes = { path: PathEdge }

export interface ArchitectureLayout {
  nodes: ModuleFlowNode[]
  edges: PathFlowEdge[]
  neighbors: Map<string, Set<string>>
  /** Every layer color drawn on the cards (main layer strips and mini bars), in palette order. */
  layers: Layer[]
  key: string
  /** Module ids, most connected first (what a close-up starts from). */
  rank: string[]
}

/** Build the React Flow nodes/edges (with dagre positions and routed edge paths) for a set of modules. */
export function buildArchitectureLayout(modules: readonly ModuleInfo[], moduleEdges: readonly ModuleEdge[], direction: 'LR' | 'TB'): ArchitectureLayout {
  const known = new Set(modules.map((m) => m.id))
  const links = mergeLinks(
    moduleEdges.map((e) => ({ source: e.source, target: e.target, weight: e.weight })),
    known,
  )
  const layout = layoutLayered(
    modules.map((m) => ({ id: m.id, width: MODULE_NODE_WIDTH, height: MODULE_NODE_HEIGHT })),
    links,
    { direction },
  )
  const sourcePosition = direction === 'LR' ? Position.Right : Position.Bottom
  const targetPosition = direction === 'LR' ? Position.Left : Position.Top
  const nodes: ModuleFlowNode[] = modules.map((m) => ({
    id: m.id,
    type: 'module',
    position: layout.positions.get(m.id) ?? { x: 0, y: 0 },
    width: MODULE_NODE_WIDTH,
    height: MODULE_NODE_HEIGHT,
    handles: centerHandles(MODULE_NODE_WIDTH, MODULE_NODE_HEIGHT),
    sourcePosition,
    targetPosition,
    data: { module: m },
    ariaLabel: `${m.name}: ${m.role}. ${moduleSizeLabel(m)}. Mostly ${LAYER_INFO[m.layer]?.label ?? 'other files'}.`,
  }))
  const maxWeight = links.reduce((mx, l) => Math.max(mx, l.weight), 1)
  const edges: PathFlowEdge[] = []
  for (const l of links) {
    const points = layout.edgePoints.get(edgeKey(l.source, l.target))
    if (!points) continue
    const geo = routedEdgeGeometry(points)
    edges.push({
      id: `${l.source}->${l.target}`,
      source: l.source,
      target: l.target,
      type: 'path',
      data: { ...geo, width: edgeStrokeWidth(l.weight, maxWeight), label: `uses · ${pluralize(l.weight, 'link')}` },
    })
  }
  const present = new Set<Layer>()
  for (const m of modules) {
    present.add(m.layer)
    for (const l of LAYERS) if ((m.layerBreakdown?.[l] ?? 0) > 0) present.add(l)
  }
  const linkWeight = new Map<string, number>()
  for (const l of links) {
    linkWeight.set(l.source, (linkWeight.get(l.source) ?? 0) + l.weight)
    linkWeight.set(l.target, (linkWeight.get(l.target) ?? 0) + l.weight)
  }
  const rank = modules
    .map((m, i) => ({ id: m.id, w: linkWeight.get(m.id) ?? 0, files: m.fileCount, i }))
    .sort((a, b) => b.w - a.w || b.files - a.files || a.i - b.i)
    .map((m) => m.id)
  return {
    nodes,
    edges,
    neighbors: buildNeighbors(links),
    layers: LAYERS.filter((l) => present.has(l)),
    key: `${direction}|${modules.map((m) => m.id).join(',')}|${links.map((l) => `${l.source}>${l.target}:${l.weight}`).join(',')}`,
    rank,
  }
}

/**
 * The main architecture map: one node per module (emoji, name, plain-English role, file count, layer color strip),
 * arrows "A uses B" weighted by link count. Layered auto-layout (dagre). Pan/zoom, fit view, minimap, keyboard focus.
 * Hovering a node highlights its neighbors and the connecting edges; selecting calls onSelect.
 */
export function ArchitectureGraph({
  modules,
  edges,
  selectedId,
  highlightIds,
  seenIds,
  onSelect,
  onOpen,
  direction = 'LR',
  className,
  showMiniMap,
  showLegend = true,
  showControls = true,
  reserve,
  fitPadding,
}: ArchitectureGraphProps) {
  const graph = useMemo(() => buildArchitectureLayout(modules, edges, direction), [modules, edges, direction])
  const byId = useMemo(() => new Map(modules.map((m) => [m.id, m])), [modules])

  const tooltipFor = useCallback(
    (id: string): TooltipContent | null => {
      const m = byId.get(id)
      if (!m) return null
      const uses: string[] = []
      const usedBy: string[] = []
      for (const e of graph.edges) {
        if (e.source === id) uses.push(byId.get(e.target)?.name ?? e.target)
        if (e.target === id) usedBy.push(byId.get(e.source)?.name ?? e.source)
      }
      const list = (names: string[]) => (names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3} more` : names.join(', '))
      const rows: TooltipContent['rows'] = [{ value: moduleSizeLabel(m) }]
      if (uses.length) rows.push({ value: 'Uses:', label: list(uses) })
      if (usedBy.length) rows.push({ value: 'Used by:', label: list(usedBy) })
      return {
        title: `${m.emoji ? `${m.emoji} ` : ''}${m.name}`,
        subtitle: m.path ? m.path : 'Top-level files',
        color: LAYER_INFO[m.layer]?.color,
        rows,
        description: m.description,
        hint: onOpen ? 'Click to learn more · double-click to see its files' : 'Click to learn more',
      }
    },
    [byId, graph.edges, onOpen],
  )

  if (!modules.length) {
    return (
      <div className={cn('flex h-full w-full items-center justify-center', className)} data-testid="architecture-graph">
        <EmptyState icon="🗺️" title="No parts to map yet">
          Once the project is analyzed, its main parts and how they connect will appear here.
        </EmptyState>
      </div>
    )
  }

  const linkCount = graph.edges.length
  return (
    <FlowCanvas
      className={className}
      testId="architecture-graph"
      ariaLabel={`Map of ${pluralize(modules.length, 'part')} of the project and ${pluralize(linkCount, 'connection')} between them`}
      nodes={graph.nodes}
      edges={graph.edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      neighbors={graph.neighbors}
      selectedId={selectedId}
      highlightIds={highlightIds}
      seenIds={seenIds}
      onSelect={onSelect}
      onOpen={onOpen}
      tooltipFor={tooltipFor}
      layoutKey={graph.key}
      showMiniMap={showMiniMap ?? modules.length > 12}
      miniMapColor={(n) => LAYER_INFO[n.data.module.layer]?.color ?? 'var(--layer-other)'}
      showControls={showControls}
      reserve={reserve}
      fitPadding={fitPadding}
      focusRank={graph.rank}
      overviewLabel={`Show all ${pluralize(modules.length, 'part')}`}
      footer={
        showLegend ? (
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5">
            {graph.layers.length >= 2 ? <LayerLegend layers={graph.layers} /> : <span />}
            <p className="text-xs text-ink-3">
              {linkCount
                ? 'Each card is one part of the project. Arrows point from a part to the part it uses; thicker arrows mean more links.'
                : 'Each card is one part of the project. These parts don’t use each other directly.'}
            </p>
          </div>
        ) : undefined
      }
    />
  )
}
