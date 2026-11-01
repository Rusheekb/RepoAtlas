import { matchAll, splitTopLevel, type ImportSink, type Source } from './util'

const JAVA_IMPORT = /^[ \t]*import\s+(static\s+)?([A-Za-z_][\w]*(?:\s*\.\s*[A-Za-z_`][\w`]*)*(?:\s*\.\s*\*)?)(?:\s+as\s+([\w`]+))?\s*;?/dgm
const SCALA_IMPORT = /^[ \t]*import\s+([^\n;]+)/dgm

function clean(path: string): string {
  return path.replace(/\s+/g, '').replace(/`/g, '')
}

/** Expand Scala import selectors: "a.b.{C, D => E, _}" → ["a.b.C", "a.b.D", "a.b.*"]. */
export function expandScalaImport(clause: string): string[] {
  const out: string[] = []
  for (const part of splitTopLevel(clause)) {
    const p = part.trim()
    if (!p) continue
    const brace = p.indexOf('{')
    if (brace === -1) {
      const path = clean(p.split(/\s+as\s+/)[0]).replace(/\.(?:_|given)$/, '.*')
      if (/^[\w.]+(?:\.\*)?$/.test(path)) out.push(path)
      continue
    }
    const prefix = clean(p.slice(0, brace)).replace(/\.$/, '')
    const inner = p.slice(brace + 1, p.lastIndexOf('}') === -1 ? undefined : p.lastIndexOf('}'))
    for (const sel of inner.split(',')) {
      const name = sel.trim().split(/\s*(?:=>|\bas\b)\s*/)[0]?.trim() ?? ''
      if (!name) continue
      if (name === '_' || name === '*' || name === 'given' || name.startsWith('given ')) out.push(`${prefix}.*`)
      else if (/^[\w`]+$/.test(name)) out.push(`${prefix}.${name.replace(/`/g, '')}`)
    }
  }
  return out
}

/**
 * Java / Kotlin / Groovy (`import a.b.C;`, `import static a.b.C.m;`, `import a.b.*`, Kotlin `as` aliases) and
 * Scala (`import a.b.{C, D => E}`, `import a.b._`, comma lists).
 */
export function extractJvm(src: Source, sink: ImportSink): void {
  const { code } = src
  if (src.language.toLowerCase() === 'scala') {
    for (const m of matchAll(SCALA_IMPORT, code)) {
      for (const path of expandScalaImport(m[1])) {
        const segs = path.split('.')
        sink.add(path, m.index, 'import', [segs[segs.length - 1]])
      }
    }
    return
  }
  for (const m of matchAll(JAVA_IMPORT, code)) {
    const path = clean(m[2])
    const segs = path.split('.')
    const names = m[3] ? [m[3].replace(/`/g, '')] : [segs[segs.length - 1]]
    sink.add(path, m.index, m[1] ? 'static' : 'import', names)
  }
}
