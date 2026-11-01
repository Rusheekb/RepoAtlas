import { groupText, matchAll, type ImportSink, type Source } from './util'

/** Named things in an import/export clause, for display: `React, { useState as s, type FC }` → ["React", "useState", "FC"]. */
export function parseJsClause(clause: string): { names: string[]; typeOnly: boolean } {
  let c = clause.trim()
  let typeOnly = false
  const typePrefix = /^(?:type|typeof)\s+(?=[\w${*])/.exec(c)
  if (typePrefix) {
    typeOnly = true
    c = c.slice(typePrefix[0].length)
  }
  const names: string[] = []
  const braces = /\{([^}]*)\}/.exec(c)
  const outside = braces ? c.replace(braces[0], ' ') : c
  const ns = /\*\s*as\s+([\w$]+)/.exec(outside)
  const rest = ns ? outside.replace(ns[0], ' ') : outside
  const def = /[\w$]+/.exec(rest)
  if (def) names.push(def[0])
  if (ns) names.push(ns[1])
  if (braces) {
    for (const part of braces[1].split(',')) {
      const name = part
        .trim()
        .replace(/^type\s+/, '')
        .split(/(?<!\s)\s+as\s+/)[0]
        ?.trim()
      if (name && /^[\w$]+$/.test(name)) names.push(name)
    }
  }
  return { names, typeOnly }
}

/** Characters an import/export clause can contain (`React, { a as b, type C }`, `* as ns`). */
const CLAUSE_CHAR = /[\w$*{}\s,]/
const WS = /\s/
const isClauseChar = (ch: string) => CLAUSE_CHAR.test(ch)
const isSpace = (ch: string) => WS.test(ch)

interface FromClause {
  /** Offset of the keyword. */
  index: number
  clause: string
  /** Range of the quoted specifier's contents. */
  specStart: number
  specEnd: number
}

/**
 * `import … from 'x'` and `export … from 'x'` (keyword not preceded by an identifier character or a dot).
 * A hand-written scan instead of a regex: the obvious pattern (`\s+` + a clause that may hold spaces + `\s*from`)
 * backtracks cubically on long runs of blank space (blanked comments and strings), freezing the page.
 * This walks each clause once and skips past any run it has already looked at, so it is linear in the file size.
 */
export function* fromClauses(code: string, keyword: 'import' | 'export'): Generator<FromClause> {
  const n = code.length
  let i = 0
  let runEndCache = -1
  while (i < n) {
    const k = code.indexOf(keyword, i)
    if (k === -1) return
    i = k + 1
    const before = k > 0 ? code[k - 1] : ''
    if (before && (before === '.' || before === '$' || /\w/.test(before))) continue
    let p = k + keyword.length
    const first = code[p] ?? ''
    if (!(isSpace(first) || first === '{' || first === '*')) continue
    // The clause runs to the first character that cannot be part of it (every start inside one run ends at the same place).
    let end = runEndCache > p ? runEndCache : p
    while (end < n && isClauseChar(code[end])) end++
    runEndCache = end
    const quote = code[end]
    if (quote !== '"' && quote !== "'") {
      i = Math.max(i, end)
      continue
    }
    // The run must end with `from` (plus optional blank space) and hold a non-empty clause before it.
    let tail = end
    while (tail > p && isSpace(code[tail - 1])) tail--
    if (tail - 4 < p || code.slice(tail - 4, tail) !== 'from') {
      i = Math.max(i, end)
      continue
    }
    while (p < tail && isSpace(code[p])) p++
    let clauseEnd = tail - 4
    while (clauseEnd > p && isSpace(code[clauseEnd - 1])) clauseEnd--
    if (clauseEnd <= p) {
      i = Math.max(i, end)
      continue
    }
    // The specifier's contents are blanked to spaces in the code view; the closing quote must follow them.
    let close = end + 1
    while (close < n && code[close] === ' ') close++
    if (code[close] !== quote) {
      i = Math.max(i, end)
      continue
    }
    yield { index: k, clause: code.slice(p, clauseEnd), specStart: end + 1, specEnd: close }
    i = close + 1
  }
}
const SIDE_EFFECT = /(?<![\w$.])import\s*(['"])( *)\1/dg
const REQUIRE =
  /(?:(?<![\w$.])(?:import|const|let|var)\s+(\{[^{};]{0,500}\}|[\w$]+)\s*=\s*)?(?<![\w$.])require\s*\(\s*(['"`])( *)\2\s*\)/dg
const DYNAMIC = /(?<![\w$.])import\s*\(\s*(['"`])( *)\1\s*[,)]/dg
const NEW_URL = /\bnew\s+URL\s*\(\s*(['"`])( *)\1\s*,\s*import\.meta\.url\s*\)/dg
const WORKER = /\bnew\s+(?:Shared)?Worker\s*\(\s*(['"`])( *)\1/dg
const REFERENCE = /^[ \t]*\/\/\/[ \t]*<reference\s+path\s*=\s*(['"])([^'"\n]+)\1/dgm

/**
 * JavaScript / TypeScript (also JSX/TSX and the script part of Vue/Svelte/Astro):
 * static imports (incl. multi-line and `import type`), `export … from`, side-effect imports, `require()`,
 * literal dynamic `import()`, `new URL('./x', import.meta.url)`, `new Worker('./x')` and `/// <reference path>`.
 */
export function extractJs(src: Source, sink: ImportSink): void {
  const { code, text, raw } = src

  for (const m of fromClauses(code, 'import')) {
    const spec = text.slice(m.specStart, m.specEnd)
    const { names, typeOnly } = parseJsClause(m.clause)
    sink.add(spec, m.index, typeOnly ? 'type' : 'import', names)
  }
  for (const m of fromClauses(code, 'export')) {
    const spec = text.slice(m.specStart, m.specEnd)
    const { names, typeOnly } = parseJsClause(m.clause)
    sink.add(spec, m.index, typeOnly ? 'type' : 'export', names.filter((n) => n !== 'default'))
  }
  for (const m of matchAll(SIDE_EFFECT, code)) sink.add(groupText(text, m, 2), m.index, 'import')
  for (const m of matchAll(REQUIRE, code)) {
    const spec = groupText(text, m, 3)
    let names: string[] | undefined
    if (m[1]) {
      names = m[1].startsWith('{')
        ? m[1]
            .slice(1, -1)
            .split(',')
            .map((p) => p.split(':')[0].trim())
            .filter((p) => /^[\w$]+$/.test(p))
        : [m[1]]
    }
    sink.add(spec, m.index, 'require', names)
  }
  for (const m of matchAll(DYNAMIC, code)) sink.add(groupText(text, m, 2), m.index, 'dynamic')
  for (const m of matchAll(NEW_URL, code)) {
    // Only file-like targets (workers, assets); "new URL('./src', import.meta.url)" names a folder.
    const spec = groupText(text, m, 2)
    if (/\.[A-Za-z0-9]+$/.test(spec)) sink.add(spec, m.index, 'url')
  }
  for (const m of matchAll(WORKER, code)) sink.add(groupText(text, m, 2), m.index, 'worker')
  if (raw.includes('///')) {
    for (const m of matchAll(REFERENCE, raw)) sink.add(m[2], m.index, 'reference')
  }
}
