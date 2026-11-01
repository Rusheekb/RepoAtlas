import { groupText, matchAll, splitTopLevel, type ImportSink, type Source } from './util'

// ─── Ruby ────────────────────────────────────────────────────────────────────

const RUBY_REQUIRE = /(?<![\w.:])(require_relative|require|load|autoload)\b[ \t]*\(?[ \t]*(?::\w+\s*,\s*)?(['"])( *)\2/dg
const RUBY_FILE_CALL = /(?<![\w.:])require\b[ \t]*\(?[ \t]*File\.(expand_path|join)\(/dg
const RUBY_ANCHOR = /^(?:__dir__|__FILE__|File\.dirname\(\s*__FILE__\s*\)|File\.dirname\(\s*__dir__\s*\))$/

/** Resolve `File.join(__dir__, 'a', 'b')` / `File.expand_path('../x', __FILE__)` arguments to a relative path. */
function rubyFileCall(fn: string, args: string[]): string | null {
  const parts = args.map((a) => a.trim())
  const anchorIdx = parts.findIndex((p) => RUBY_ANCHOR.test(p))
  if (anchorIdx === -1) return null
  const strings: string[] = []
  for (let k = 0; k < parts.length; k++) {
    if (k === anchorIdx) continue
    const m = /^(['"])(.*)\1$/.exec(parts[k])
    if (!m || m[2].includes('#{')) return null
    strings.push(m[2])
  }
  if (!strings.length) return null
  let rel = strings.join('/')
  // expand_path('../x', __FILE__) is relative to the file itself, i.e. one level below its folder.
  if (fn === 'expand_path' && parts[anchorIdx] === '__FILE__') rel = rel.replace(/^\.\.\//, '')
  return rel.startsWith('.') ? rel : `./${rel}`
}

/** Ruby: require, require_relative, load, autoload, and require File.expand_path('../x', __FILE__) / File.join(__dir__, …). */
export function extractRuby(src: Source, sink: ImportSink): void {
  const { code, text } = src
  for (const m of matchAll(RUBY_REQUIRE, code)) {
    const spec = groupText(text, m, 3)
    if (spec.includes('#{')) continue
    sink.add(spec, m.index, m[1])
  }
  for (const m of matchAll(RUBY_FILE_CALL, code)) {
    const open = m.index + m[0].length
    let depth = 1
    let end = open
    for (; end < code.length && depth > 0; end++) {
      if (code[end] === '(') depth++
      else if (code[end] === ')') depth--
      else if (code[end] === '\n') break
    }
    if (depth !== 0) continue
    const spec = rubyFileCall(m[1], splitTopLevel(text.slice(open, end - 1)))
    if (spec) sink.add(spec, m.index, 'require_relative')
  }
}

// ─── PHP ─────────────────────────────────────────────────────────────────────

const PHP_USE = /^[ \t]*use\s+(function\s+|const\s+)?([^;]+);/dgm
const PHP_INCLUDE =
  /(?<![\w$>])(require_once|include_once|require|include)\b\s*\(?\s*((?:__DIR__|dirname\(\s*__FILE__\s*\))\s*\.\s*)?(['"])( *)\3/dg

/** Expand PHP use clauses: "A\B\{C, D as E}" / "A\B, C\D as E" → ["A\B\C", "A\B\D"] / ["A\B", "C\D"]. */
export function expandPhpUse(clause: string): string[] {
  const out: string[] = []
  const c = clause.trim()
  const brace = c.indexOf('{')
  if (brace !== -1) {
    const prefix = c.slice(0, brace).trim().replace(/\\$/, '')
    const inner = c.slice(brace + 1, c.lastIndexOf('}') === -1 ? undefined : c.lastIndexOf('}'))
    for (const part of inner.split(',')) {
      const name = part.trim().replace(/^(?:function|const)\s+/, '').split(/\s+as\s+/i)[0]?.trim()
      if (name) out.push(`${prefix}\\${name}`.replace(/^\\/, ''))
    }
    return out
  }
  for (const part of splitTopLevel(c)) {
    const name = part.trim().split(/\s+as\s+/i)[0]?.trim().replace(/^\\/, '')
    if (name) out.push(name)
  }
  return out
}

/** PHP: namespaced `use` (groups, comma lists, function/const), require/include (incl. __DIR__ . '/x.php'). */
export function extractPhp(src: Source, sink: ImportSink): void {
  const { code, text } = src
  for (const m of matchAll(PHP_USE, code)) {
    const clause = m[2]
    // Trait conflict blocks ("use A, B { … }") and closures are not namespace imports.
    if (/(^|[^\\])\{/.test(clause.replace(/\\\{/g, '')) || clause.includes('(') || clause.includes('$')) continue
    for (const name of expandPhpUse(clause)) {
      if (!name.includes('\\')) continue
      if (!/^[A-Za-z_\\][\w\\]*$/.test(name)) continue
      const segs = name.split('\\')
      sink.add(name, m.index, m[1] ? m[1].trim() : 'use', [segs[segs.length - 1]])
    }
  }
  for (const m of matchAll(PHP_INCLUDE, code)) {
    let spec = groupText(text, m, 4)
    if (m[2]) spec = `./${spec.replace(/^\/+/, '')}`
    if (!spec || spec.includes('$')) continue
    sink.add(spec, m.index, 'include')
  }
}

// ─── Swift ───────────────────────────────────────────────────────────────────

const SWIFT_IMPORT =
  /^[ \t]*(?:@(?:testable|_exported|_implementationOnly|preconcurrency)\s+)*import\s+(?:(?:typealias|struct|class|enum|protocol|let|var|func)\s+)?([A-Za-z_][\w]*(?:\.[A-Za-z_]\w*)*)/dgm

/** Swift: `import Foundation`, `@testable import App`, `import struct Module.Type`. */
export function extractSwift(src: Source, sink: ImportSink): void {
  for (const m of matchAll(SWIFT_IMPORT, src.code)) sink.add(m[1], m.index, 'import')
}

// ─── Dart ────────────────────────────────────────────────────────────────────

const DART_DIRECTIVE = /^[ \t]*(import|export|part)\s+(['"])( *)\2/dgm

/** Dart: import / export / part directives ('package:…', 'dart:…', relative). */
export function extractDart(src: Source, sink: ImportSink): void {
  const { code, text } = src
  for (const m of matchAll(DART_DIRECTIVE, code)) sink.add(groupText(text, m, 3), m.index, m[1])
}

// ─── Elixir ──────────────────────────────────────────────────────────────────

const ELIXIR_DIRECTIVE = /^[ \t]*(alias|import|use|require)\s+([A-Z][\w]*(?:\.[A-Z][\w]*)*)(\.\{([^}]*)\})?/dgm

/** Elixir: alias / import / use / require of modules, including `alias App.{A, B}`. */
export function extractElixir(src: Source, sink: ImportSink): void {
  for (const m of matchAll(ELIXIR_DIRECTIVE, src.code)) {
    if (m[3]) {
      for (const part of (m[4] ?? '').split(',')) {
        const name = part.trim()
        if (/^[A-Z][\w.]*$/.test(name)) sink.add(`${m[2]}.${name}`, m.index, m[1])
      }
    } else sink.add(m[2], m.index, m[1])
  }
}

// ─── Lua ─────────────────────────────────────────────────────────────────────

const LUA_REQUIRE = /(?<![\w.:])(require|dofile|loadfile)\s*\(?\s*(['"])( *)\2/dg

/** Lua: require 'a.b', require("a.b"), dofile / loadfile. */
export function extractLua(src: Source, sink: ImportSink): void {
  const { code, text } = src
  for (const m of matchAll(LUA_REQUIRE, code)) sink.add(groupText(text, m, 3), m.index, m[1])
}

// ─── R ───────────────────────────────────────────────────────────────────────

const R_LOAD =
  /(?<![\w.])(library|require|requireNamespace|loadNamespace|source|sys\.source)\s*\(\s*(?:(['"])( *)\2|([A-Za-z][\w.]*)\s*[,)])/dg
const R_NAMESPACE = /(?<![\w.:$@])([A-Za-z][\w.]*[A-Za-z0-9]):::?(?=[A-Za-z.`])/dg

/** R: library(x), require("x"), requireNamespace, source("file.R"), and pkg::fn references. */
export function extractR(src: Source, sink: ImportSink): void {
  const { code, text } = src
  for (const m of matchAll(R_LOAD, code)) {
    const fn = m[1]
    const spec = m[3] !== undefined ? groupText(text, m, 3) : (m[4] ?? '')
    if (!spec) continue
    if (fn === 'source' || fn === 'sys.source') {
      if (m[3] === undefined) continue
      sink.add(spec, m.index, 'source')
    } else sink.add(spec, m.index, 'library')
  }
  for (const m of matchAll(R_NAMESPACE, code)) sink.add(m[1], m.index, 'namespace')
}

// ─── Shell ───────────────────────────────────────────────────────────────────

const SHELL_SOURCE = /^[ \t]*(?:source|\.)[ \t]+([^\n;&|]+)/dgm

/** Normalize a sourced path: strip quotes and replace a leading "script folder" variable with "./". */
export function normalizeShellPath(raw: string): string | null {
  let p = raw.trim().split(/\s+(?=[^"']*(?:["'][^"']*["'][^"']*)*$)/)[0] ?? ''
  p = p.replace(/["']/g, '')
  p = p.replace(/^\$\(\s*cd\s+[^)]*\)\s*(?:&&\s*pwd\s*\))?/, '.')
  p = p.replace(/^\$\(\s*dirname\s+[^)]*\)/, '.')
  p = p.replace(/^\$\{BASH_SOURCE(?:\[0\])?%\/\*\}/, '.')
  p = p.replace(/^\$\{?[A-Za-z_]*(?:DIR|ROOT|BASE|HERE)[A-Za-z_]*\}?(?=\/)/, '.')
  if (!p || p.includes('$') || p.includes('`') || p.includes('*')) return null
  return p
}

/** Shell: `source file` and `. file` (dot-sourcing), with common "$(dirname "$0")/…" prefixes normalized. */
export function extractShell(src: Source, sink: ImportSink): void {
  for (const m of matchAll(SHELL_SOURCE, src.text)) {
    const spec = normalizeShellPath(m[1])
    if (spec && !/^\.?\/?$/.test(spec)) sink.add(spec, m.index, 'source')
  }
}
