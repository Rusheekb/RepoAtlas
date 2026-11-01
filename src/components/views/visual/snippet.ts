/**
 * Finding a tour step's quoted line of code inside a file, and cutting a short excerpt around it
 * (pure helpers, so the tour player can show "the exact line we're talking about" with real line numbers).
 */

/** Lines around the found line shown in an excerpt (above and below). */
export const EXCERPT_RADIUS = 6

/** Collapse every run of whitespace to one space and trim, so indentation / tabs / line breaks never block a match. */
export function squashWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** Split file text into lines (handles \r\n), ignoring the empty "line" after a final newline. */
export function splitLines(content: string): string[] {
  const lines = content.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l))
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

/**
 * The 1-based line where `snippet` appears in `content`, or null if it can't be found.
 *
 * Tries, in order:
 *  1. a line whose trimmed text equals the snippet (the snippet *is* the line);
 *  2. a line containing the snippet verbatim (snippets may be the start of a long line);
 *  3. the same, ignoring differences in spaces and tabs.
 *
 * Multi-line snippets are matched by their first non-blank line. Snippets with fewer than two visible characters
 * (a lone "}" would match almost anywhere) are treated as "not found".
 */
export function findSnippetLine(content: string | null | undefined, snippet: string | null | undefined): number | null {
  if (!content || !snippet) return null
  const first = snippet.split(/\r?\n/).find((l) => l.trim().length > 0)
  if (!first) return null
  const trimmed = first.trim()
  const squashed = squashWhitespace(trimmed)
  if (squashed.replace(/\s/g, '').length < 2) return null

  const lines = splitLines(content)
  for (let i = 0; i < lines.length; i++) if (lines[i].trim() === trimmed) return i + 1
  for (let i = 0; i < lines.length; i++) if (lines[i].includes(trimmed)) return i + 1
  for (let i = 0; i < lines.length; i++) if (squashWhitespace(lines[i]).includes(squashed)) return i + 1
  return null
}

export interface CodeExcerpt {
  /** The excerpt's text (whole lines joined with \n). */
  code: string
  /** Real 1-based line number of the excerpt's first line. */
  start: number
  /** Real 1-based line number of the excerpt's last line. */
  end: number
  /** The line to highlight (the found snippet), or null when nothing was found. */
  line: number | null
  /** Total lines in the file. */
  totalLines: number
}

/**
 * A short excerpt of `content`: `radius` lines either side of `line`, or — when there's no line to centre on —
 * the first `2 × radius + 1` lines of the file.
 */
export function excerptAround(content: string, line: number | null, radius: number = EXCERPT_RADIUS): CodeExcerpt {
  const lines = splitLines(content)
  const total = lines.length
  const r = Math.max(0, Math.floor(radius))
  const valid = line != null && Number.isInteger(line) && line >= 1 && line <= total ? line : null
  const start = valid == null ? 1 : Math.max(1, valid - r)
  const end = valid == null ? Math.min(total, 2 * r + 1) : Math.min(total, valid + r)
  return { code: lines.slice(start - 1, end).join('\n'), start, end, line: valid, totalLines: total }
}

/** Find a step's snippet and cut the excerpt around it in one go. */
export function snippetExcerpt(content: string, snippet: string | null | undefined, radius: number = EXCERPT_RADIUS): CodeExcerpt {
  return excerptAround(content, findSnippetLine(content, snippet), radius)
}
