import { groupText, matchAll, type ImportSink, type Source } from './util'

/**
 * Expand a Rust use-tree into full paths:
 * "crate::a::{b, c::{d, e as f}, self}" → ["crate::a::b", "crate::a::c::d", "crate::a::c::e", "crate::a"].
 * Globs ("a::b::*") become the module path ("a::b").
 */
export function expandUseTree(tree: string): string[] {
  const src = tree.replace(/\s+/g, ' ')
  const out: string[] = []
  let i = 0

  const ws = () => {
    while (src[i] === ' ') i++
  }
  const ident = (): string => {
    const m = /^(?:r#)?[A-Za-z_][\w]*/.exec(src.slice(i))
    if (!m) return ''
    i += m[0].length
    return m[0].replace(/^r#/, '')
  }
  const emit = (segs: string[]) => {
    const path = segs[segs.length - 1] === 'self' ? segs.slice(0, -1) : segs
    if (path.length) out.push(path.join('::'))
  }

  const parseList = (prefix: string[]) => {
    for (;;) {
      ws()
      if (src[i] === '}' || i >= src.length) return
      parseTree(prefix)
      ws()
      if (src[i] === ',') {
        i++
        continue
      }
      return
    }
  }

  const parseTree = (prefix: string[]) => {
    ws()
    if (src.startsWith('::', i)) i += 2
    ws()
    if (src[i] === '{') {
      i++
      parseList(prefix)
      ws()
      if (src[i] === '}') i++
      return
    }
    if (src[i] === '*') {
      i++
      emit(prefix)
      return
    }
    const segs = [...prefix]
    for (;;) {
      ws()
      const id = ident()
      if (!id) {
        // Unparseable — stop here rather than looping forever.
        i = src.length
        return
      }
      segs.push(id)
      ws()
      if (src.startsWith('::', i)) {
        i += 2
        ws()
        if (src[i] === '{') {
          i++
          parseList(segs)
          ws()
          if (src[i] === '}') i++
          return
        }
        if (src[i] === '*') {
          i++
          emit(segs)
          return
        }
        continue
      }
      break
    }
    ws()
    if (/^as\b/.test(src.slice(i))) {
      i += 2
      ws()
      ident()
    }
    emit(segs)
  }

  parseList([])
  return [...new Set(out)]
}

const MOD = /(?<![\w:])(?:pub(?:\s*\([^)]*\))?\s+)?mod\s+(?:r#)?([A-Za-z_]\w*)\s*;/dg
const USE = /(?<![\w:])(?:pub(?:\s*\([^)]*\))?\s+)?use\s+([^;]+);/dg
const EXTERN = /\bextern\s+crate\s+([A-Za-z_]\w*)(?:\s+as\s+\w+)?\s*;/dg
const INCLUDE = /\binclude(?:_str|_bytes)?!\s*\(\s*(")( *)"\s*\)/dg
const PATH_ATTR = /#\[\s*path\s*=\s*"([^"]+)"\s*\]\s*(?:#\[[^\]]*\]\s*)*$/

/** Rust: `mod x;` (incl. #[path]), `use` trees with nested groups / globs / `pub use`, `extern crate`, `include!`. */
export function extractRust(src: Source, sink: ImportSink): void {
  const { code, text } = src
  for (const m of matchAll(MOD, code)) {
    const before = text.slice(Math.max(0, m.index - 300), m.index)
    const attr = PATH_ATTR.exec(before)
    if (attr) sink.add(attr[1], m.index, 'mod-path', [m[1]])
    else sink.add(m[1], m.index, 'mod')
  }
  for (const m of matchAll(USE, code)) {
    for (const path of expandUseTree(m[1])) {
      const segs = path.split('::')
      sink.add(path, m.index, 'use', [segs[segs.length - 1]])
    }
  }
  for (const m of matchAll(EXTERN, code)) sink.add(m[1], m.index, 'extern')
  for (const m of matchAll(INCLUDE, code)) sink.add(groupText(text, m, 2), m.index, 'include')
}
