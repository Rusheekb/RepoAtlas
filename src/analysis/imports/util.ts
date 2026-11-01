/** Shared helpers for the per-language import extractors. */

/**
 * Three aligned views of one source file (identical lengths and line breaks):
 *  - raw:  the original text
 *  - text: comments blanked, strings intact (read specifiers here)
 *  - code: comments and string contents blanked (match statement structure here)
 */
export interface Source {
  path: string
  language: string
  raw: string
  text: string
  code: string
}

/** Receives imports as they are found. `offset` is a character offset into the source (converted to a line). */
export interface ImportSink {
  add(specifier: string, offset: number, kind: string, names?: string[]): void
}

/** Maps character offsets to 1-based line numbers (binary search over newline positions). */
export class LineIndex {
  private readonly starts: number[]
  constructor(text: string) {
    const starts = [0]
    for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) starts.push(i + 1)
    this.starts = starts
  }
  lineAt(offset: number): number {
    const a = this.starts
    let lo = 0
    let hi = a.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (a[mid] <= offset) lo = mid
      else hi = mid - 1
    }
    return lo + 1
  }
}

/** Text of capture group `g` of a match made with the `d` flag, read from `view` (usually Source.text). */
export function groupText(view: string, m: RegExpExecArray, g: number): string {
  const span = m.indices?.[g]
  return span ? view.slice(span[0], span[1]) : (m[g] ?? '')
}

/** Start offset of capture group `g` (falls back to the match start). */
export function groupStart(m: RegExpExecArray, g: number): number {
  return m.indices?.[g]?.[0] ?? m.index
}

/** Iterate all matches of a global regex. */
export function* matchAll(re: RegExp, s: string): Generator<RegExpExecArray> {
  re.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) !== null) {
    if (m[0].length === 0) re.lastIndex++
    yield m
  }
}

/** Replace everything outside the given [start, end) ranges with spaces (newlines kept). */
export function keepRanges(s: string, ranges: [number, number][]): string {
  if (!ranges.length) return s.replace(/[^\r\n]/g, ' ')
  const parts: string[] = []
  let last = 0
  for (const [a, b] of [...ranges].sort((x, y) => x[0] - y[0])) {
    if (a < last) continue
    parts.push(s.slice(last, a).replace(/[^\r\n]/g, ' '), s.slice(a, b))
    last = b
  }
  parts.push(s.slice(last).replace(/[^\r\n]/g, ' '))
  return parts.join('')
}

export interface TagBlock {
  /** Raw attribute text of the opening tag. */
  attrs: string
  /** Offset of "<tag". */
  tagStart: number
  /** Inner content range. */
  start: number
  end: number
}

/** Find <tag …>…</tag> blocks (case-insensitive), e.g. every <script> in an HTML or Vue file. */
export function findTagBlocks(s: string, tag: string): TagBlock[] {
  const out: TagBlock[] = []
  const lower = s.toLowerCase()
  const open = `<${tag}`
  const close = `</${tag}`
  let i = 0
  while (i < s.length) {
    const k = lower.indexOf(open, i)
    if (k === -1) break
    const after = lower.charCodeAt(k + open.length)
    // Must be followed by whitespace, ">" or "/" (so <scripts> or <script-x> don't count).
    if (!(after === 62 || after === 47 || after === 32 || after === 9 || after === 10 || after === 13)) {
      i = k + open.length
      continue
    }
    const gt = s.indexOf('>', k)
    if (gt === -1) break
    const attrs = s.slice(k + open.length, gt)
    if (attrs.trimEnd().endsWith('/')) {
      out.push({ attrs, tagStart: k, start: gt + 1, end: gt + 1 })
      i = gt + 1
      continue
    }
    let c = lower.indexOf(close, gt + 1)
    if (c === -1) c = s.length
    out.push({ attrs, tagStart: k, start: gt + 1, end: c })
    i = c + close.length
  }
  return out
}

/** Read an attribute value from a tag's attribute text. Returns null when absent. */
export function attrValue(attrs: string, name: string): string | null {
  const re = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>"']+))`, 'i')
  const m = re.exec(attrs)
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null
}

/** Offset of an attribute's value within the whole file, given the block's tagStart. */
export function attrOffset(s: string, tagStart: number, name: string): number {
  const k = s.toLowerCase().indexOf(name.toLowerCase(), tagStart)
  return k === -1 ? tagStart : k
}

/** Absolute URLs, protocol-relative URLs, data URIs, anchors and template placeholders are not repo files. */
export function isNonFileReference(spec: string): boolean {
  return (
    /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(spec) ||
    /^(?:data|mailto|tel|javascript|blob|about):/i.test(spec) ||
    spec.startsWith('#') ||
    /\{\{|\{%|<%|\$\{/.test(spec)
  )
}

/** Split on a separator (default ",") that is not inside (), [] or {} — and also not inside <> when `angles` is set. */
export function splitTopLevel(s: string, sep = ',', angles = false): string[] {
  const out: string[] = []
  let depth = 0
  let last = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '(' || c === '[' || c === '{' || (angles && c === '<')) depth++
    else if (c === ')' || c === ']' || c === '}' || (angles && c === '>')) depth = Math.max(0, depth - 1)
    else if (c === sep && depth === 0) {
      out.push(s.slice(last, i))
      last = i + 1
    }
  }
  out.push(s.slice(last))
  return out
}
