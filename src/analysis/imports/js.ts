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
        .split(/\s+as\s+/)[0]
        ?.trim()
      if (name && /^[\w$]+$/.test(name)) names.push(name)
    }
  }
  return { names, typeOnly }
}

const STATIC_IMPORT = /(?<![\w$.])import(?:\s+|(?=[{*]))([\w$*{}\s,]+?)\s*from\s*(['"])( *)\2/dg
const EXPORT_FROM = /(?<![\w$.])export(?:\s+|(?=[{*]))([\w$*{}\s,]+?)\s*from\s*(['"])( *)\2/dg
const SIDE_EFFECT = /(?<![\w$.])import\s*(['"])( *)\1/dg
const REQUIRE =
  /(?:(?<![\w$.])(?:import|const|let|var)\s+(\{[^}]*\}|[\w$]+)\s*=\s*)?(?<![\w$.])require\s*\(\s*(['"`])( *)\2\s*\)/dg
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

  for (const m of matchAll(STATIC_IMPORT, code)) {
    const spec = groupText(text, m, 3)
    const { names, typeOnly } = parseJsClause(m[1])
    sink.add(spec, m.index, typeOnly ? 'type' : 'import', names)
  }
  for (const m of matchAll(EXPORT_FROM, code)) {
    const spec = groupText(text, m, 3)
    const { names, typeOnly } = parseJsClause(m[1])
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
