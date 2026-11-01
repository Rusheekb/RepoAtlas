import { useCallback, useMemo } from 'react'
import type { EdgeTypes, NodeTypes } from '@xyflow/react'
import { EmptyState } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { pluralize } from '@/core/format'
import type { Concept, ConceptCategory, ConceptMap } from '@/core/types'
import { CONCEPT_CATEGORIES, CONCEPT_CATEGORY_INFO, conceptCategoryInfo } from './categories'
import { FlowCanvas } from './flow/FlowCanvas'
import { PathEdge, type PathFlowEdge } from './flow/PathEdge'
import type { TooltipContent } from './GraphTooltip'
import { buildNeighbors, estimateLabelSize, layoutForce, placeEdgeLabels, rectEdgeGeometry, type EdgeGeometry, type Rect } from './layout'
import { centerHandles } from './nodes/common'
import { ConceptNode, conceptNodeSize, type ConceptFlowNode } from './nodes/ConceptNode'

export interface ConceptGraphProps {
  map: ConceptMap
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  className?: string
  /** Concepts to emphasize; others dim. */
  highlightIds?: string[]
  /** Concepts the reader has already read about (small check). */
  seenIds?: string[]
}

const nodeTypes: NodeTypes = { concept: ConceptNode }
const edgeTypes: EdgeTypes = { path: PathEdge }

/** Above this many relations, labels only show for the hovered / selected concept's relations. */
const ALWAYS_LABEL_LIMIT = 24

export interface ConceptLayout {
  nodes: ConceptFlowNode[]
  edges: PathFlowEdge[]
  neighbors: Map<string, Set<string>>
  categories: ConceptCategory[]
  key: string
}

/** Settle a force layout up front and turn it into static React Flow nodes + labeled, clipped edges. */
export function buildConceptLayout(map: ConceptMap): ConceptLayout {
  const concepts = dedupeConcepts(map.concepts)
  const ids = new Set(concepts.map((c) => c.id))
  const relations = map.relations.filter((r) => r.from !== r.to && ids.has(r.from) && ids.has(r.to))
  const sized = concepts.map((c) => ({ id: c.id, ...conceptNodeSize(c.importance) }))
  const layout = layoutForce(
    sized,
    relations.map((r) => ({ source: r.from, target: r.to })),
    { linkDistance: 160 },
  )
  const rects = new Map<string, Rect>()
  for (const s of sized) {
    const p = layout.positions.get(s.id) ?? { x: 0, y: 0 }
    rects.set(s.id, { x: p.x, y: p.y, width: s.width, height: s.height })
  }
  const nodes: ConceptFlowNode[] = concepts.map((c) => {
    const r = rects.get(c.id) as Rect
    return {
      id: c.id,
      type: 'concept',
      position: { x: r.x, y: r.y },
      width: r.width,
      height: r.height,
      handles: centerHandles(r.width, r.height),
      data: { concept: c },
      ariaLabel: `${c.name} (${conceptCategoryInfo(c.category).label}): ${c.summary}`,
    }
  })
  const pairCount = new Map<string, number>()
  const pairKey = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`)
  for (const r of relations) pairCount.set(pairKey(r.from, r.to), (pairCount.get(pairKey(r.from, r.to)) ?? 0) + 1)
  const seenPair = new Map<string, number>()
  const geos: EdgeGeometry[] = relations.map((r) => {
    const k = pairKey(r.from, r.to)
    const count = pairCount.get(k) ?? 1
    const nth = seenPair.get(k) ?? 0
    seenPair.set(k, nth + 1)
    // Several relations between the same two ideas fan out as gentle curves instead of overlapping.
    const bend = count > 1 ? (nth - (count - 1) / 2) * 44 * (r.from < r.to ? 1 : -1) : 0
    return rectEdgeGeometry(rects.get(r.from) as Rect, rects.get(r.to) as Rect, bend)
  })
  const labels = relations.map((r) => r.label.trim() || 'relates to')
  // Slide labels along their edges so they don't sit on cards or on each other.
  const spots = placeEdgeLabels(
    geos.map((geo, i) => ({ geo, ...estimateLabelSize(labels[i]) })),
    [...rects.values()],
  )
  const edges: PathFlowEdge[] = relations.map((r, i) => ({
    id: `rel-${i}-${r.from}->${r.to}`,
    source: r.from,
    target: r.to,
    type: 'path',
    data: { path: geos[i].path, labelX: spots[i].x, labelY: spots[i].y, width: 1.5, label: labels[i] },
  }))
  const present = new Set(concepts.map((c) => c.category))
  return {
    nodes,
    edges,
    neighbors: buildNeighbors(relations.map((r) => ({ source: r.from, target: r.to }))),
    categories: CONCEPT_CATEGORIES.filter((c) => present.has(c)),
    key: `${concepts.map((c) => `${c.id}:${c.importance}`).join(',')}|${relations.map((r) => `${r.from}>${r.to}`).join(',')}`,
  }
}

function dedupeConcepts(concepts: readonly Concept[]): Concept[] {
  const seen = new Set<string>()
  const out: Concept[] = []
  for (const c of concepts) {
    if (!c.id || seen.has(c.id)) continue
    seen.add(c.id)
    out.push(c)
  }
  return out
}

/** Legend of concept categories (plain-English names), for the categories present. */
export function ConceptLegend({ categories, className }: { categories: ConceptCategory[]; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-2', className)} aria-label="Color legend">
      {categories.map((c) => (
        <li key={c} className="inline-flex items-center gap-1.5" title={CONCEPT_CATEGORY_INFO[c].description}>
          <span className="size-2.5 rounded-full" style={{ background: CONCEPT_CATEGORY_INFO[c].color }} aria-hidden />
          {CONCEPT_CATEGORY_INFO[c].label}
        </li>
      ))}
    </ul>
  )
}

/** Concept map: concept nodes (emoji + name, size by importance, colored by category with a legend) and labeled relation edges ("is stored in"). Force-directed layout settled up front, then static. */
export function ConceptGraph({ map, selectedId, onSelect, className, highlightIds, seenIds }: ConceptGraphProps) {
  const graph = useMemo(() => buildConceptLayout(map), [map])
  const byId = useMemo(() => new Map(map.concepts.map((c) => [c.id, c])), [map.concepts])

  const tooltipFor = useCallback(
    (id: string): TooltipContent | null => {
      const c = byId.get(id)
      if (!c) return null
      const cat = conceptCategoryInfo(c.category)
      const rows: TooltipContent['rows'] = []
      if (c.analogy) rows.push({ value: 'Like:', label: c.analogy.replace(/^like\s+/i, '') })
      if (c.files.length) rows.push({ value: pluralize(c.files.length, 'file'), label: 'in the code' })
      return {
        title: `${c.emoji ? `${c.emoji} ` : ''}${c.name}`,
        subtitle: cat.label,
        color: cat.color,
        description: c.summary,
        rows,
        hint: 'Click to read more',
      }
    },
    [byId],
  )

  if (!graph.nodes.length) {
    return (
      <div className={cn('flex h-full w-full items-center justify-center', className)} data-testid="concept-graph">
        <EmptyState icon="💡" title="No key ideas yet">
          We couldn’t spot the big ideas in this project on our own. Add a Claude key in Settings for a richer concept map.
        </EmptyState>
      </div>
    )
  }

  return (
    <FlowCanvas
      className={className}
      testId="concept-graph"
      ariaLabel={`Concept map of ${pluralize(graph.nodes.length, 'key idea')} and ${pluralize(graph.edges.length, 'connection')} between them`}
      nodes={graph.nodes}
      edges={graph.edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      neighbors={graph.neighbors}
      selectedId={selectedId}
      highlightIds={highlightIds}
      seenIds={seenIds}
      onSelect={onSelect}
      tooltipFor={tooltipFor}
      layoutKey={graph.key}
      edgeLabels={graph.edges.length > ALWAYS_LABEL_LIMIT ? 'focus' : 'always'}
      fitPadding={24}
      panel={
        <div className="space-y-1.5">
          {graph.categories.length >= 2 && <ConceptLegend categories={graph.categories} />}
          <p className="text-[11px] text-ink-3">
            Bigger cards are more central ideas. Read each arrow as a sentence: idea → phrase → idea.
            {graph.edges.length > ALWAYS_LABEL_LIMIT && ' Hover or select an idea to see its links spelled out.'}
          </p>
        </div>
      }
    />
  )
}
