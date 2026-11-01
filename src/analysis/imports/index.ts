import type { RawImport } from '@/core/types'
import { detectLanguage, languageFamily } from '../languages'
import { maskSource } from '../strip'
import { extractC } from './c'
import { extractCsharp } from './csharp'
import { extractGo } from './go'
import { extractJs } from './js'
import { extractJvm } from './jvm'
import { extractCss, extractHtml, extractMdx, extractSfc } from './markup'
import { otherExtractor } from './other'
import { extractPython, notebookToPython } from './python'
import { extractRust } from './rust'
import {
  extractDart,
  extractElixir,
  extractLua,
  extractPhp,
  extractR,
  extractRuby,
  extractShell,
  extractSwift,
} from './scripting'
import { LineIndex, type ImportSink, type Source } from './util'

export { expandUseTree } from './rust'
export { expandScalaImport } from './jvm'
export { expandPhpUse } from './scripting'
export { parseJsClause } from './js'
export type { Source, ImportSink } from './util'

/** Files bigger than this are skipped (generated bundles, data dumps); imports would be meaningless anyway. */
const MAX_CONTENT = 2_000_000
/** Hard cap so a pathological file can't flood the graph. */
const MAX_IMPORTS = 1000
const MAX_NAMES = 30

class Collector implements ImportSink {
  private readonly bySpec = new Map<string, RawImport>()
  private lines: LineIndex | null = null
  /** Source offset of each specifier's first occurrence (orders imports that share a line). */
  private readonly offsets = new Map<string, number>()
  constructor(private readonly content: string) {}

  add(specifier: string, offset: number, kind: string, names?: string[]): void {
    const spec = specifier.trim()
    if (!spec || spec.length > 300 || /[\n\r\0]/.test(spec)) return
    if (!this.lines) this.lines = new LineIndex(this.content)
    const line = this.lines.lineAt(Math.max(0, offset))
    const existing = this.bySpec.get(spec)
    if (existing) {
      if (line < existing.line) existing.line = line
      if (offset < (this.offsets.get(spec) ?? Infinity)) this.offsets.set(spec, offset)
      if (existing.kind === 'type' && kind !== 'type') existing.kind = kind
      if (names?.length) {
        const merged = new Set([...(existing.names ?? []), ...names])
        existing.names = [...merged].slice(0, MAX_NAMES)
      }
      return
    }
    if (this.bySpec.size >= MAX_IMPORTS) return
    const imp: RawImport = { specifier: spec, line, kind }
    if (names?.length) imp.names = [...new Set(names)].slice(0, MAX_NAMES)
    this.bySpec.set(spec, imp)
    this.offsets.set(spec, offset)
  }

  result(): RawImport[] {
    const off = this.offsets
    return [...this.bySpec.values()].sort(
      (a, b) => a.line - b.line || (off.get(a.specifier) ?? 0) - (off.get(b.specifier) ?? 0),
    )
  }
}

function makeSource(path: string, content: string, language: string): Source {
  const masked = maskSource(content, language)
  return { path, language, raw: content, text: masked.text, code: masked.code }
}

/**
 * Extract import/dependency statements from source code (regex-based, after stripComments).
 * Languages: JavaScript/TypeScript/JSX/TSX/Vue/Svelte/Astro/MDX (import … from, export … from, require(), import(),
 * import 'x', new URL(…, import.meta.url), /// <reference path>), Python & notebooks (import a.b, from .x import y,
 * from . import z, parenthesized lists), Go (single & grouped imports), Rust (mod x;, use trees, extern crate,
 * include!), Java/Kotlin/Scala/Groovy (import a.b.C; static imports; Scala selectors), C# (using X.Y;),
 * C/C++/Objective-C (#include "x.h" → kind "include", <x> → kind "include-system"), Ruby (require, require_relative,
 * load), PHP (use A\B; group use; require/include), Swift (import X), Dart (import/export/part), Elixir
 * (alias/import/use/require), Lua (require), R (library/source/pkg::), Shell (source/.), CSS/SCSS/Less (@import, @use),
 * HTML (<script src>, <link href>), plus Zig, Solidity, Protobuf, Haskell, OCaml, Julia, Perl, Nim, Erlang, Clojure,
 * Terraform, Nix, CMake, Make, Bazel, PowerShell and common template languages.
 * `language` is the display name from detectLanguage (falls back to detecting from the path when empty/unknown).
 * Line numbers are 1-based. Identical specifiers are deduplicated (first line kept, names merged).
 */
export function extractImports(path: string, content: string, language: string): RawImport[] {
  if (!content || content.length > MAX_CONTENT) return []
  try {
    return extract(path, content, language)
  } catch {
    // Best effort: a file we cannot parse simply contributes no imports.
    return []
  }
}

function extract(path: string, content: string, language: string): RawImport[] {
  const lang = language || detectLanguage(path)?.name || ''
  const lower = lang.toLowerCase()
  if (lower === 'jupyter notebook') {
    // The rebuilt Python source has the same line layout as the notebook, so its own offsets give the right lines.
    const py = notebookToPython(content)
    if (!py) return []
    const nbSink = new Collector(py)
    extractPython(makeSource(path, py, 'Python'), nbSink)
    return nbSink.result()
  }
  const sink = new Collector(content)

  if (lower === 'mdx') {
    extractMdx({ path, language: lang, raw: content, text: content, code: content }, sink)
    return sink.result()
  }

  const other = otherExtractor(lower)
  const family = languageFamily(lang)

  if (lower === 'blade' || (other && family === 'html')) {
    // Template languages: their own include/extends syntax plus ordinary HTML references.
    const src = makeSource(path, content, 'HTML')
    other?.({ ...src, language: lang }, sink)
    extractHtml(src, sink)
    return sink.result()
  }

  const src = makeSource(path, content, lang)
  switch (family) {
    case 'js':
      if (lower === 'vue' || lower === 'svelte' || lower === 'astro') extractSfc(src, sink)
      else extractJs(src, sink)
      break
    case 'python':
      extractPython(src, sink)
      break
    case 'go':
      extractGo(src, sink)
      break
    case 'rust':
      extractRust(src, sink)
      break
    case 'jvm':
      extractJvm(src, sink)
      break
    case 'csharp':
      extractCsharp(src, sink)
      break
    case 'c':
      extractC(src, sink)
      break
    case 'ruby':
      extractRuby(src, sink)
      break
    case 'php':
      extractPhp(src, sink)
      break
    case 'swift':
      extractSwift(src, sink)
      break
    case 'dart':
      extractDart(src, sink)
      break
    case 'elixir':
      extractElixir(src, sink)
      break
    case 'lua':
      extractLua(src, sink)
      break
    case 'r':
      extractR(src, sink)
      break
    case 'shell':
      extractShell(src, sink)
      break
    case 'css':
      extractCss(src, sink)
      break
    case 'html':
      extractHtml(src, sink)
      break
    case 'other':
      other?.(src, sink)
      break
  }
  return sink.result()
}
