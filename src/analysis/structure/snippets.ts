/**
 * Helpers for quoting real code in tours: every snippet returned here is a verbatim substring of the file
 * (a whole trimmed line, or the start of one), so the UI can find and highlight it.
 */
import type { CodeSymbol } from '@/core/types'

const MAX_SNIPPET = 120

/** The raw text of a 1-based line, or null. */
export function lineAt(content: string, line: number): string | null {
  if (!content || line < 1) return null
  let start = 0
  for (let i = 1; i < line; i++) {
    const nl = content.indexOf('\n', start)
    if (nl === -1) return null
    start = nl + 1
  }
  const end = content.indexOf('\n', start)
  return content.slice(start, end === -1 ? undefined : end).replace(/\r$/, '')
}

/** A trimmed line, shortened at a word boundary if needed (still a verbatim substring). Null for blank lines. */
export function toSnippet(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const t = raw.trim()
  if (!t) return null
  if (t.length <= MAX_SNIPPET) return t
  const cut = t.slice(0, MAX_SNIPPET)
  const sp = cut.lastIndexOf(' ')
  return (sp > 40 ? cut.slice(0, sp) : cut).trimEnd()
}

const COMMENT_OR_NOISE = /^(\/\/|\/\*|\*|#(?!\[)|--|;|<!--|"""|'''|$)|^(['"]use strict['"];?|package\s|import\s|from\s+\S+\s+import\s|using\s|require\(|#include|@file|}\)?;?|\{|\)|\];?|export\s*\{\s*\}|<\?php)/

/** The first line that looks like real code (not a comment, import, or bare bracket). */
export function firstMeaningfulLine(content: string): { line: number; text: string } | null {
  const lines = content.split('\n')
  for (let i = 0; i < lines.length && i < 400; i++) {
    const t = lines[i].trim()
    if (t.length < 4 || COMMENT_OR_NOISE.test(t)) continue
    if (/^(const|let|var)\s+\w+\s*=\s*require\(/.test(t)) continue
    const snippet = toSnippet(lines[i])
    if (snippet) return { line: i + 1, text: snippet }
  }
  return null
}

/** First line matching `re` (tested against each trimmed line). */
export function findLine(content: string, re: RegExp, maxLines = 5000): { line: number; text: string } | null {
  const lines = content.split('\n')
  for (let i = 0; i < lines.length && i < maxLines; i++) {
    const t = lines[i].trim()
    if (t && re.test(t)) {
      const snippet = toSnippet(lines[i])
      if (snippet) return { line: i + 1, text: snippet }
    }
  }
  return null
}

/** The definition line of a symbol, verified to mention its name (falls back to searching for it). */
export function symbolSnippet(content: string, symbol: CodeSymbol): string | null {
  const direct = toSnippet(lineAt(content, symbol.line))
  if (direct && direct.includes(symbol.name)) return direct
  const escaped = symbol.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const def = findLine(content, new RegExp(`\\b(class|def|function|func|fn|struct|interface|type|enum|trait|const|let|var|export|pub|module|model)\\b.*\\b${escaped}\\b`))
  return def?.text ?? null
}

/** A snippet for a 1-based line, or null if blank. */
export function snippetAtLine(content: string, line: number): string | null {
  return toSnippet(lineAt(content, line))
}

const NOT_FIELDS = new Set([
  'return', 'if', 'for', 'def', 'class', 'function', 'const', 'let', 'var', 'self', 'this', 'super', 'pass', 'raise',
  'import', 'from', 'async', 'await', 'yield', 'else', 'elif', 'try', 'except', 'with', 'while', 'case', 'switch',
  'break', 'continue', 'new', 'throw', 'delete', 'Meta', 'objects', 'model_config', 'Config', 'func', 'fn', 'impl',
  'public', 'private', 'protected', 'static', 'final', 'override', 'get', 'set', 'constructor', 'type', 'interface',
  'export', 'default', 'abstract', 'readonly', 'struct', 'enum', 'module', 'end', 'do', 'then', 'in', 'of', 'and', 'or',
  'not', 'is', 'true', 'false', 'null', 'None', 'nil', 'void', 'id_', 'pk',
])

/**
 * The field names of a data model (class / interface / struct / Prisma model / schema object), read from the lines
 * right after its definition. Best effort, at most 8, in order.
 */
export function modelFields(content: string, symbol: CodeSymbol): string[] {
  const lines = content.split('\n')
  const startIdx = symbol.line - 1
  if (startIdx < 0 || startIdx >= lines.length) return []
  const head = lines[startIdx]
  const baseIndent = head.length - head.trimStart().length
  const python = /^\s*class\s+\w+.*:\s*(#.*)?$/.test(head)
  const fields: string[] = []
  for (let i = startIdx + 1; i < lines.length && i < startIdx + 60 && fields.length < 8; i++) {
    const raw = lines[i]
    const t = raw.trim()
    if (!t) continue
    const indent = raw.length - raw.trimStart().length
    if (python ? indent <= baseIndent : indent <= baseIndent && /^[}\])]/.test(t)) break
    if (!python && indent <= baseIndent && !/^[}\])]/.test(t) && i > startIdx + 1) break
    if (/^(#|\/\/|\/\*|\*|"""|'''|@)/.test(t)) continue // comments and annotations such as @Id / @Column
    if (/^(def|fn|func|function|async|(?:public|private|protected)\s+(?:static\s+)?[\w<>[\]]+\s+\w+\s*\()/.test(t)) {
      // Methods end the field list for most languages.
      if (fields.length > 0) break
      continue
    }
    const m =
      /^(?:(?:readonly|public|private|protected|final|static|pub|declare|val|var|let)\s+)*([A-Za-z_][\w]*)\??!?\s*[:=]/.exec(t) ??
      /^(?:(?:private|public|protected|final|static|readonly|internal)\s+)+[\w<>[\],.?]+\s+([A-Za-z_]\w*)\s*[;={]/.exec(t) ??
      /^([A-Za-z_]\w*)\s+[A-Za-z_*[\]][\w*[\].<>?]*(\s+@|\s+`|\s*$|\s+\/\/)/.exec(t)
    if (!m) continue
    const name = m[1]
    if (NOT_FIELDS.has(name) || name.startsWith('__') || fields.includes(name)) continue
    fields.push(name)
  }
  return fields
}
