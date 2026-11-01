/**
 * Hover / selection / emphasis state shared by every node and edge of a React Flow graph.
 * Nodes and edges read it from context, so hovering never rebuilds the node or edge arrays.
 */
import { createContext, useContext } from 'react'

export type EdgeLabelMode = 'hover' | 'focus' | 'always'

export interface FlowHighlight {
  /** The node whose neighborhood is emphasized (hovered or keyboard-focused, else the selection). */
  focus: string | null
  /** Nodes drawn at full strength; null = everything is. */
  emphasized: ReadonlySet<string> | null
  /** Externally highlighted nodes (e.g. the current tour step). */
  highlighted: ReadonlySet<string>
  selectedId: string | null
  seen: ReadonlySet<string>
  hoverEdgeId: string | null
  markers: { normal: string; active: string }
  edgeLabels: EdgeLabelMode
}

export interface HighlightInput {
  hoverId: string | null
  focusId: string | null
  selectedId: string | null
  highlightIds?: readonly string[]
  seenIds?: readonly string[]
  neighbors: ReadonlyMap<string, ReadonlySet<string>>
  nodeIds: ReadonlySet<string>
  hoverEdgeId: string | null
  markers: { normal: string; active: string }
  edgeLabels?: EdgeLabelMode
}

const EMPTY: ReadonlySet<string> = new Set()

export function computeHighlight(input: HighlightInput): FlowHighlight {
  const highlighted = input.highlightIds?.length ? new Set(input.highlightIds.filter((id) => input.nodeIds.has(id))) : EMPTY
  const pointerFocus = [input.hoverId, input.focusId].find((id): id is string => !!id && input.nodeIds.has(id)) ?? null
  const selected = input.selectedId && input.nodeIds.has(input.selectedId) ? input.selectedId : null
  const focus = pointerFocus ?? (highlighted.size ? null : selected)
  let emphasized: ReadonlySet<string> | null = null
  if (focus) {
    const set = new Set<string>([focus])
    for (const n of input.neighbors.get(focus) ?? []) set.add(n)
    emphasized = set
  } else if (highlighted.size) {
    emphasized = highlighted
  }
  return {
    focus,
    emphasized,
    highlighted,
    selectedId: selected,
    seen: input.seenIds?.length ? new Set(input.seenIds) : EMPTY,
    hoverEdgeId: input.hoverEdgeId,
    markers: input.markers,
    edgeLabels: input.edgeLabels ?? 'hover',
  }
}

export interface NodeVisual {
  dimmed: boolean
  selected: boolean
  seen: boolean
  /** Part of an external highlight (tour step). */
  highlighted: boolean
}

export function nodeVisual(h: FlowHighlight, id: string): NodeVisual {
  return {
    dimmed: !!h.emphasized && !h.emphasized.has(id),
    selected: h.selectedId === id,
    seen: h.seen.has(id),
    highlighted: h.highlighted.has(id),
  }
}

export type EdgeState = 'normal' | 'active' | 'dim'

export function edgeState(h: FlowHighlight, id: string, source: string, target: string): EdgeState {
  if (h.hoverEdgeId === id) return 'active'
  if (h.focus) return source === h.focus || target === h.focus ? 'active' : 'dim'
  if (h.highlighted.size) return h.highlighted.has(source) && h.highlighted.has(target) ? 'active' : 'dim'
  return 'normal'
}

/** Whether an edge's text label is visible. */
export function edgeLabelVisible(h: FlowHighlight, id: string, state: EdgeState): boolean {
  if (h.hoverEdgeId === id) return true
  if (h.edgeLabels === 'always') return state !== 'dim'
  if (h.edgeLabels === 'focus') return state === 'active'
  return false
}

export const DEFAULT_HIGHLIGHT: FlowHighlight = {
  focus: null,
  emphasized: null,
  highlighted: EMPTY,
  selectedId: null,
  seen: EMPTY,
  hoverEdgeId: null,
  markers: { normal: 'atlas-arrow', active: 'atlas-arrow-active' },
  edgeLabels: 'hover',
}

export const FlowHighlightContext = createContext<FlowHighlight>(DEFAULT_HIGHLIGHT)

export function useFlowHighlight(): FlowHighlight {
  return useContext(FlowHighlightContext)
}
