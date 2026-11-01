import { dirname, joinPath } from '@/core/paths'
import type { RawImport } from '@/core/types'
import type { ResolvedImport } from '../../resolve'
import { UNRESOLVED, builtin, external, internal, isRelative, type RepoIndex } from './repo'

interface GoModule {
  /** Module path, e.g. "github.com/acme/app". */
  path: string
  /** Folder inside the repo that the module path maps to. */
  dir: string
}

/** Normalized package name for an external Go import ("github.com/a/b/sub/v2" → "github.com/a/b"). */
export function goPackageName(spec: string): string {
  const segs = spec.split('/')
  const host = segs[0] ?? ''
  let n = 2
  if (/^(?:github\.com|gitlab\.com|bitbucket\.org|codeberg\.org|git\.sr\.ht|golang\.org|cloud\.google\.com)$/.test(host)) n = 3
  const out = segs.slice(0, n)
  while (out.length > 1 && /^v\d+$/.test(out[out.length - 1] ?? '')) out.pop()
  return out.join('/')
}

export class GoResolver {
  private mods: GoModule[] | null = null

  constructor(
    private readonly repo: RepoIndex,
    private readonly rootModulePath?: string,
  ) {}

  /** Every module root (go.mod files plus local `replace` targets), longest module path first. */
  modules(): GoModule[] {
    if (this.mods) return this.mods
    const repo = this.repo
    const out: GoModule[] = []
    let rootSeen = false
    for (const p of repo.byBasename('go.mod')) {
      const dir = dirname(p)
      const text = repo.content(p)
      const declared = text ? /^\s*module\s+"?([^\s"]+)"?/m.exec(text)?.[1] : undefined
      const modPath = declared ?? (dir === '' ? this.rootModulePath : undefined)
      if (modPath) {
        out.push({ path: modPath, dir })
        if (dir === '') rootSeen = true
      }
      if (text) {
        // replace example.com/x => ./local/x   (single-line and block forms)
        for (const m of text.matchAll(/^\s*(?:replace\s+)?([^\s()]+)(?:\s+v[^\s]+)?\s*=>\s*(\.{1,2}\/[^\s]*)\s*$/gm)) {
          const target = joinPath(dir, m[2])
          if (repo.isDir(target)) out.push({ path: m[1], dir: target })
        }
      }
    }
    if (!rootSeen && this.rootModulePath) out.push({ path: this.rootModulePath, dir: '' })
    out.sort((a, b) => b.path.length - a.path.length)
    this.mods = out
    return out
  }

  resolve(fromPath: string, imp: RawImport): ResolvedImport {
    const spec = imp.specifier.trim()
    if (!spec) return UNRESOLVED
    if (spec === 'C') return builtin('C')
    if (isRelative(spec)) return this.packageFiles(joinPath(dirname(fromPath), spec), fromPath)
    for (const mod of this.modules()) {
      if (spec === mod.path || spec.startsWith(`${mod.path}/`)) {
        const rest = spec.slice(mod.path.length).replace(/^\//, '')
        return this.packageFiles(joinPath(mod.dir, rest), fromPath)
      }
    }
    const first = spec.split('/')[0] ?? ''
    if (!first.includes('.')) return builtin(spec)
    return external(goPackageName(spec))
  }

  /** All non-test .go files directly inside a folder (a Go package). */
  private packageFiles(dir: string, fromPath: string): ResolvedImport {
    const files = this.repo.filesIn(dir).filter((p) => p.endsWith('.go') && !p.endsWith('_test.go'))
    return files.length ? internal(files.sort(), fromPath) : UNRESOLVED
  }
}
