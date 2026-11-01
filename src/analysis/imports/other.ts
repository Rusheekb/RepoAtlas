import { extractJs } from './js'
import { groupText, matchAll, type ImportSink, type Source } from './util'

type Extractor = (src: Source, sink: ImportSink) => void

/** Add every match of `re` (run on `view`), taking the specifier from group `g` of the same offsets in `text`. */
function each(src: Source, sink: ImportSink, re: RegExp, g: number, kind: string, view: 'code' | 'text' | 'raw' = 'code'): void {
  const target = src[view]
  for (const m of matchAll(re, target)) {
    const spec = groupText(view === 'raw' ? src.raw : src.text, m, g).trim()
    if (spec) sink.add(spec, m.index, kind)
  }
}

const zig: Extractor = (src, sink) => each(src, sink, /@import\s*\(\s*(")( *)"\s*\)/dg, 2, 'import')

const solidity: Extractor = (src, sink) =>
  each(src, sink, /^[ \t]*import\s+(?:[^'";]*?\bfrom\s+)?(['"])( *)\1/dgm, 2, 'import')

const proto: Extractor = (src, sink) =>
  each(src, sink, /^[ \t]*import\s+(?:public\s+|weak\s+)?(["'])( *)\1/dgm, 2, 'import')

const thrift: Extractor = (src, sink) => each(src, sink, /^[ \t]*include\s+(["'])( *)\1/dgm, 2, 'include')

const graphql: Extractor = (src, sink) => each(src, sink, /^#import\s+(["'])([^"'\n]+)\1/dgm, 2, 'import', 'raw')

const haskell: Extractor = (src, sink) =>
  each(src, sink, /^import\s+(?:safe\s+)?(?:qualified\s+)?(?:"[^"]*"\s+)?([A-Z][\w']*(?:\.[A-Z][\w']*)*)/dgm, 1, 'import')

const ocaml: Extractor = (src, sink) => each(src, sink, /^[ \t]*open!?\s+([A-Z][\w']*(?:\.[A-Z][\w']*)*)/dgm, 1, 'open')

const fsharp: Extractor = (src, sink) => {
  each(src, sink, /^[ \t]*open\s+(?:type\s+)?([A-Za-z_][\w]*(?:\.[A-Za-z_]\w*)*)/dgm, 1, 'open')
  each(src, sink, /^[ \t]*#load\s+(")( *)"/dgm, 2, 'load')
}

const julia: Extractor = (src, sink) => {
  for (const m of matchAll(/^[ \t]*(?:using|import)\s+([^\n]+)/dgm, src.code)) {
    const list = m[1].split(':')[0] ?? ''
    for (const part of list.split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0]?.trim() ?? ''
      if (/^\.*[A-Za-z_][\w.]*$/.test(name)) sink.add(name, m.index, 'using')
    }
  }
  each(src, sink, /(?<![\w.])include\s*\(\s*(")( *)"\s*\)/dg, 2, 'include')
}

const perl: Extractor = (src, sink) => {
  each(src, sink, /^[ \t]*(?:use|require|no)\s+([A-Za-z][\w]*(?:::\w+)*)/dgm, 1, 'use')
  each(src, sink, /^[ \t]*(?:require|do)\s+(['"])( *)\1/dgm, 2, 'require')
}

const crystal: Extractor = (src, sink) => each(src, sink, /(?<![\w.])require\s+(["'])( *)\1/dg, 2, 'require')

const nim: Extractor = (src, sink) => {
  for (const m of matchAll(/^[ \t]*(import|include|from)\s+([^\n]+)/dgm, src.code)) {
    const body = m[1] === 'from' ? (m[2].split(/\s+import\s+/)[0] ?? '') : m[2].split(/\s+except\s+/)[0] ?? ''
    for (const part of body.split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0]?.trim().replace(/["]/g, '') ?? ''
      if (/^[\w./]+$/.test(name)) sink.add(name, m.index, m[1])
    }
  }
}

const erlang: Extractor = (src, sink) => each(src, sink, /^-include(?:_lib)?\s*\(\s*(")( *)"\s*\)/dgm, 2, 'include')

const clojure: Extractor = (src, sink) => {
  const code = src.code
  for (const m of matchAll(/\(\s*:?(require|use|import)\b/dg, code)) {
    // Take the balanced form that starts here.
    let depth = 0
    let end = m.index
    for (; end < code.length; end++) {
      const c = code[end]
      if (c === '(') depth++
      else if (c === ')') {
        depth--
        if (depth === 0) break
      }
    }
    const body = code.slice(m.index + m[0].length, end)
    for (const n of matchAll(/[[(\s']([a-z][\w-]*(?:\.[\w-]+)+)(?=[\s\])])/g, body)) {
      sink.add(n[1], m.index, m[1])
    }
  }
}

const hcl: Extractor = (src, sink) => each(src, sink, /\bsource\s*=\s*(")( *)"/dg, 2, 'module')

const nix: Extractor = (src, sink) => {
  for (const m of matchAll(/(?<![\w-])(?:import|callPackage)\s+(\.{0,2}\/[\w./+-]+)/dg, src.code)) {
    sink.add(m[1], m.index, 'import')
  }
}

const cmake: Extractor = (src, sink) => {
  for (const m of matchAll(/\b(add_subdirectory|include)\s*\(\s*([^\s)]+)/dgi, src.code)) {
    const spec = groupText(src.text, m, 2).replace(/^"|"$/g, '')
    if (spec && !spec.includes('$')) sink.add(spec, m.index, m[1].toLowerCase())
  }
}

const make: Extractor = (src, sink) => {
  for (const m of matchAll(/^[ \t]*-?s?include[ \t]+([^\n]+)/dgm, src.code)) {
    for (const part of m[1].trim().split(/\s+/)) {
      if (part && !part.includes('$')) sink.add(part, m.index, 'include')
    }
  }
}

const starlark: Extractor = (src, sink) => each(src, sink, /(?<![\w.])load\s*\(\s*(["'])( *)\1/dg, 2, 'load')

const powershell: Extractor = (src, sink) => {
  for (const m of matchAll(/^[ \t]*\.[ \t]+(["']?)([^\s"']+)\1/dgm, src.text)) {
    const spec = m[2].replace(/^\$PSScriptRoot[\\/]/i, './').replace(/\\/g, '/')
    if (!spec.includes('$')) sink.add(spec, m.index, 'source')
  }
  for (const m of matchAll(/\bImport-Module\s+(?:-Name\s+)?(["']?)([\w./\\$:-]+)\1/dgi, src.text)) {
    const spec = m[2].replace(/^\$PSScriptRoot[\\/]/i, './').replace(/\\/g, '/')
    if (!spec.includes('$')) sink.add(spec, m.index, 'module')
  }
}

const pug: Extractor = (src, sink) => {
  for (const m of matchAll(/^[ \t]*(include|extends)(?::\w+)?\s+(\S+)/dgm, src.text)) sink.add(m[2], m.index, m[1])
}

const jinja: Extractor = (src, sink) => {
  for (const m of matchAll(/\{%-?\s*(extends|include|import|from|embed|use)\s+(["'])([^"'\n]+)\2/dg, src.text)) {
    sink.add(m[3], m.index, m[1])
  }
}

const blade: Extractor = (src, sink) => {
  for (const m of matchAll(/@(extends|include(?:If|When|First)?|component|each)\s*\(\s*(["'])([\w.\-:/]+)\2/dg, src.text)) {
    sink.add(m[3], m.index, 'view')
  }
}

const ejs: Extractor = (src, sink) => {
  for (const m of matchAll(/<%[-=_]?\s*include\s*\(?\s*(["'])([^"'\n]+)\1/dg, src.text)) sink.add(m[2], m.index, 'include')
}

const handlebars: Extractor = (src, sink) => {
  for (const m of matchAll(/\{\{>\s*["']?([\w./-]+)["']?/dg, src.text)) sink.add(m[1], m.index, 'partial')
}

const gleam: Extractor = (src, sink) => each(src, sink, /^[ \t]*import\s+([a-z][\w/]*)/dgm, 1, 'import')

const rescript: Extractor = (src, sink) => each(src, sink, /^[ \t]*open\s+([A-Z][\w.]*)/dgm, 1, 'open')

const OTHER: Record<string, Extractor> = {
  zig,
  solidity,
  vyper: (src, sink) => {
    for (const m of matchAll(/^[ \t]*(?:from\s+([\w.]+)\s+)?import\s+([\w.]+)/dgm, src.code)) {
      sink.add(m[1] ?? m[2], m.index, m[1] ? 'from' : 'import', m[1] ? [m[2]] : undefined)
    }
  },
  'protocol buffer': proto,
  thrift,
  graphql,
  haskell,
  elm: haskell,
  purescript: haskell,
  ocaml,
  'f#': fsharp,
  rescript,
  julia,
  perl,
  raku: perl,
  crystal,
  nim,
  erlang,
  clojure,
  hcl,
  nix,
  cmake,
  makefile: make,
  starlark,
  powershell,
  pug,
  jinja,
  twig: jinja,
  liquid: jinja,
  blade,
  ejs,
  handlebars,
  mustache: handlebars,
  gleam,
  coffeescript: extractJs,
}

/** Extractor for languages outside the main families, or undefined when we have none. */
export function otherExtractor(language: string): Extractor | undefined {
  return OTHER[language.toLowerCase()]
}
