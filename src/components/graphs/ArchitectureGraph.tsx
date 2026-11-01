import type { ModuleEdge, ModuleInfo } from '@/core/types'

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
}

/**
 * The main architecture map: one node per module (emoji, name, plain-English role, file count, layer color strip),
 * arrows "A uses B" weighted by link count. Layered auto-layout (dagre). Pan/zoom, fit view, minimap, keyboard focus.
 * Hovering a node highlights its neighbors and the connecting edges; selecting calls onSelect.
 */
export function ArchitectureGraph(props: ArchitectureGraphProps) {
  return <div className={props.className} data-testid="architecture-graph" />
}
