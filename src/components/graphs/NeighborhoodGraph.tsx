import type { AnalyzedFile } from '@/core/types'

export interface NeighborhoodGraphProps {
  /** The focused file. */
  file: AnalyzedFile
  allFiles: Record<string, AnalyzedFile>
  onSelect?: (path: string) => void
  className?: string
}

/** Small "who uses this / what it uses" diagram: importers on the left → file in the middle → imports on the right (max ~8 each side, "+N more"). */
export function NeighborhoodGraph(props: NeighborhoodGraphProps) {
  return <div className={props.className} data-testid="neighborhood-graph" />
}
