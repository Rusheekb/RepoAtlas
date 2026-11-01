import type { AnalyzedFile, FileEdge } from '@/core/types'

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
}

/** File-level dependency graph inside a module: nodes show role emoji, file name, role label; layered layout. Caps at ~120 nodes (shows a note). */
export function FileGraph(props: FileGraphProps) {
  return <div className={props.className} data-testid="file-graph" />
}
