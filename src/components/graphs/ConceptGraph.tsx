import type { ConceptMap } from '@/core/types'

export interface ConceptGraphProps {
  map: ConceptMap
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  className?: string
}

/** Concept map: concept nodes (emoji + name, size by importance, colored by category with a legend) and labeled relation edges ("is stored in"). Force-directed layout settled up front, then static. */
export function ConceptGraph(props: ConceptGraphProps) {
  return <div className={props.className} data-testid="concept-graph" />
}
