import { basename, dirname, joinPath } from '@/core/paths'
import type { RawImport } from '@/core/types'
import type { ResolvedImport } from '../../resolve'
import { npmPackageName } from './js'
import { UNRESOLVED, builtin, external, internal, isRelative, type RepoIndex } from './repo'

const STYLE_EXTS = ['.scss', '.sass', '.css', '.less', '.styl', '.pcss']

/** CSS / SCSS / Less / Stylus imports: relative files, Sass partials (_x.scss) and index files, ~package and bare packages. */
export class CssResolver {
  constructor(private readonly repo: RepoIndex) {}

  private probe(base: string): string | null {
    const repo = this.repo
    if (repo.has(base)) return base
    const dir = dirname(base)
    const name = basename(base)
    const candidates: string[] = []
    for (const e of STYLE_EXTS) {
      candidates.push(base + e, joinPath(dir, `_${name}${e}`))
    }
    for (const e of STYLE_EXTS) candidates.push(joinPath(base, `_index${e}`), joinPath(base, `index${e}`))
    if (!/\.[a-z]+$/i.test(name)) candidates.push(joinPath(dir, `_${name}`))
    return candidates.find((c) => repo.has(c)) ?? null
  }

  resolve(fromPath: string, imp: RawImport): ResolvedImport {
    let spec = imp.specifier.trim().replace(/[?#].*$/, '')
    if (!spec) return UNRESOLVED
    if (/^sass:/.test(spec)) return builtin(spec)
    if (spec.startsWith('~')) return external(npmPackageName(spec.replace(/^~\/?/, '')))
    const fromDir = dirname(fromPath)
    if (spec.startsWith('/')) {
      const hit = this.probe(joinPath(spec)) ?? this.probe(joinPath('public', spec)) ?? this.probe(joinPath(fromDir, spec))
      return hit ? internal([hit], fromPath) : UNRESOLVED
    }
    const relative = this.probe(joinPath(fromDir, spec))
    if (relative) return internal([relative], fromPath)
    if (isRelative(spec)) return UNRESOLVED
    // Load-path style: relative to src/, styles/, the repo root.
    for (const root of ['src', 'styles', 'src/styles', 'assets', 'src/assets', 'scss', 'sass', '']) {
      const hit = this.probe(joinPath(root, spec))
      if (hit) return internal([hit], fromPath)
    }
    spec = spec.replace(/^(?:@|~)\//, '')
    for (const root of ['src', '']) {
      const hit = this.probe(joinPath(root, spec))
      if (hit) return internal([hit], fromPath)
    }
    return external(npmPackageName(imp.specifier.trim()))
  }
}

/** HTML <script src> / <link href>: relative paths, and "/x" relative to the page's folder, the repo root or public/. */
export class HtmlResolver {
  constructor(private readonly repo: RepoIndex) {}

  resolve(fromPath: string, imp: RawImport): ResolvedImport {
    const spec = imp.specifier.trim().replace(/[?#].*$/, '')
    if (!spec) return UNRESOLVED
    const fromDir = dirname(fromPath)
    const candidates = spec.startsWith('/') ? this.siteRoots(fromDir).map((root) => joinPath(root, spec)) : [joinPath(fromDir, spec), joinPath(fromDir, 'public', spec)]
    const hit = candidates.find((c) => this.repo.has(c))
    if (hit) return internal([hit], fromPath)
    if (/^(?:node_modules\/)/.test(spec)) return external(npmPackageName(spec.replace(/^node_modules\//, '')))
    return UNRESOLVED
  }

  /**
   * Folders a "/x" URL may be served from: the page's own folder and every folder above it, each also through
   * its public/, static/, assets/ or www/ sub-folder (e.g. Express views next to a public/ folder).
   */
  private siteRoots(fromDir: string): string[] {
    const out: string[] = []
    for (let d: string | null = fromDir; d !== null; d = d ? dirname(d) : null) {
      out.push(d)
      for (const sub of ['public', 'static', 'assets', 'www']) out.push(joinPath(d, sub))
    }
    return out
  }
}
