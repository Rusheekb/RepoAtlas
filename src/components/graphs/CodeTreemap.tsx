import type { AnalyzedFile } from '@/core/types'

export interface CodeTreemapProps {
  files: AnalyzedFile[]
  colorBy: 'layer' | 'language'
  /** Folder currently zoomed into ('' = repo root). Controlled. */
  rootPath: string
  onRootChange: (path: string) => void
  selectedPath?: string | null
  onSelectFile?: (path: string) => void
  /** Size tiles by lines of code (default) or bytes (files without downloaded contents fall back to bytes/40). */
  sizeBy?: 'lines' | 'bytes'
  className?: string
}

/**
 * Zoomable treemap ("city map") of the codebase: nested folders → file tiles sized by code amount and colored by layer
 * or language, with direct labels on tiles large enough, a breadcrumb for the zoomed folder, hover tooltip
 * (path, role, lines), click folder to zoom in, click file to select. SVG, responsive (ResizeObserver).
 */
export function CodeTreemap(props: CodeTreemapProps) {
  return <div className={props.className} data-testid="code-treemap" />
}
