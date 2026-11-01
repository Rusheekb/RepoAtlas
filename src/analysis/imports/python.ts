import { groupText, matchAll, type ImportSink, type Source } from './util'

const MODULE = /^[A-Za-z_][\w]*(?:\.[A-Za-z_]\w*)*$/
const FROM_MODULE = /^(?:\.+(?:[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)?|[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)$/
const DYNAMIC = /(?<![\w.])(?:importlib\s*\.\s*)?(?:import_module|__import__)\s*\(\s*(['"])( *)\1/dg

function handleStatement(stmt: string, offset: number, sink: ImportSink): void {
  const s = stmt.trim()
  let m = /^(?:import|cimport)\s+(.+)$/s.exec(s)
  if (m) {
    for (const part of m[1].split(',')) {
      const [mod, alias] = part.trim().split(/\s+as\s+/)
      const spec = mod?.trim() ?? ''
      if (MODULE.test(spec)) sink.add(spec, offset, 'import', alias ? [alias.trim()] : undefined)
    }
    return
  }
  m = /^from\s+(\S+)\s+c?import\s+(.+)$/s.exec(s)
  if (m) {
    const spec = m[1]
    if (!FROM_MODULE.test(spec)) return
    const names = m[2]
      .replace(/[()\\]/g, ' ')
      .split(',')
      .map((p) => p.trim().split(/\s+as\s+/)[0]?.trim() ?? '')
      .filter((p) => p === '*' || /^[A-Za-z_]\w*$/.test(p))
    sink.add(spec, offset, 'from', names)
  }
}

/**
 * Python: `import a.b as c`, comma lists, `from .. import x`, `from .a.b import c`, parenthesized multi-line
 * from-imports, backslash continuations, `;`-separated statements, imports inside blocks (try/if), Cython cimport,
 * and literal importlib.import_module / __import__ calls.
 */
export function extractPython(src: Source, sink: ImportSink): void {
  const { code, text } = src
  const n = code.length
  let pos = 0
  while (pos <= n) {
    let nl = code.indexOf('\n', pos)
    if (nl === -1) nl = n
    const line = code.slice(pos, nl)
    const trimmed = line.trimStart()
    if (/^(?:from|import|cimport)\s/.test(trimmed)) {
      // Build the logical line: join while brackets are open or the line ends with a backslash.
      const start = pos + (line.length - trimmed.length)
      let logical = line
      let end = nl
      let depth = bracketDelta(line)
      while ((depth > 0 || /\\\s*$/.test(logical)) && end < n) {
        const nextNl = code.indexOf('\n', end + 1)
        const next = code.slice(end + 1, nextNl === -1 ? n : nextNl)
        logical = logical.replace(/\\\s*$/, ' ') + ' ' + next
        depth += bracketDelta(next)
        end = nextNl === -1 ? n : nextNl
      }
      let offset = start
      for (const stmt of logical.trimStart().split(';')) {
        handleStatement(stmt, offset, sink)
        offset += stmt.length + 1
      }
      pos = end + 1
      continue
    }
    pos = nl + 1
  }
  if (code.includes('import_module') || code.includes('__import__')) {
    for (const m of matchAll(DYNAMIC, code)) sink.add(groupText(text, m, 2), m.index, 'dynamic')
  }
}

function bracketDelta(line: string): number {
  let d = 0
  for (let i = 0; i < line.length; i++) {
    const c = line.charCodeAt(i)
    if (c === 40 || c === 91 || c === 123) d++
    else if (c === 41 || c === 93 || c === 125) d--
  }
  return d
}

/**
 * Jupyter notebooks are JSON. Rebuild a Python source where each code-cell line sits on the same line number
 * as in the .ipynb file, so line numbers still point into the original file. Returns null for invalid JSON.
 */
export function notebookToPython(raw: string): string | null {
  let nb: unknown
  try {
    nb = JSON.parse(raw)
  } catch {
    return null
  }
  const cells = (nb as { cells?: unknown }).cells
  if (!Array.isArray(cells)) return null
  const codeLines = new Set<string>()
  for (const cell of cells) {
    if (!cell || typeof cell !== 'object') continue
    const c = cell as { cell_type?: unknown; source?: unknown }
    if (c.cell_type !== 'code') continue
    const source = Array.isArray(c.source) ? c.source.join('') : typeof c.source === 'string' ? c.source : ''
    for (const l of source.split('\n')) if (l.trim()) codeLines.add(l)
  }
  const rawLines = raw.split('\n')
  const out = rawLines.map((l) => {
    const m = /^\s*("(?:[^"\\]|\\.)*")\s*,?\s*$/.exec(l)
    if (!m) return ''
    let decoded: unknown
    try {
      decoded = JSON.parse(m[1])
    } catch {
      return ''
    }
    if (typeof decoded !== 'string') return ''
    const line = decoded.replace(/\r?\n$/, '')
    if (line.includes('\n') || !codeLines.has(line)) return ''
    return line
  })
  return out.join('\n')
}
