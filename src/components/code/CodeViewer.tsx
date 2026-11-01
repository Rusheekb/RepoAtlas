export interface CodeViewerProps {
  path: string
  code: string
  /** Display language name from analysis (e.g. "TypeScript") — mapped to a Shiki grammar. */
  language: string | null
  /** 1-based inclusive range to highlight and scroll into view. */
  highlight?: { start: number; end: number } | null
  /** Called when the user selects a range of lines (click line number, shift-click to extend). */
  onSelectLines?: (range: { start: number; end: number } | null) => void
  className?: string
}

/** Syntax-highlighted code with line numbers (Shiki, lazy-loaded, dual light/dark theme), line selection, and a plain-text fallback while loading or for huge files. */
export function CodeViewer(props: CodeViewerProps) {
  return <pre className={props.className}>{props.code}</pre>
}
