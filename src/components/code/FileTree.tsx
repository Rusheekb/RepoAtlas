import type { AnalyzedFile } from '@/core/types'

export interface FileTreeProps {
  files: AnalyzedFile[]
  selectedPath?: string | null
  onSelect: (path: string) => void
  /** Filter text. */
  query?: string
  className?: string
}

/** Collapsible folder tree with role emoji + layer dot per file, folders auto-expanded to the selection, keyboard navigable. */
export function FileTree(props: FileTreeProps) {
  return <div className={props.className} data-testid="file-tree" />
}
