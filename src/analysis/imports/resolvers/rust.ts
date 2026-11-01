import { basename, dirname, joinPath } from '@/core/paths'
import type { RawImport } from '@/core/types'
import type { ResolvedImport } from '../../resolve'
import { UNRESOLVED, builtin, external, internal, type RepoIndex } from './repo'

const RUST_BUILTIN = new Set(['std', 'core', 'alloc', 'proc_macro', 'test'])

interface Crate {
  /** Folder containing Cargo.toml. */
  dir: string
  /** Crate name as used in code (dashes → underscores). */
  name: string | null
  /** Library root (src/lib.rs or [lib] path), if any. */
  lib: string | null
  /** Binary root (src/main.rs), if any. */
  main: string | null
}

export class RustResolver {
  private cratesCache: Crate[] | null = null

  constructor(private readonly repo: RepoIndex) {}

  private crates(): Crate[] {
    if (this.cratesCache) return this.cratesCache
    const repo = this.repo
    const out: Crate[] = []
    for (const p of repo.byBasename('Cargo.toml')) {
      const dir = dirname(p)
      const prefix = dir ? `${dir}/` : ''
      const text = repo.content(p) ?? ''
      const pkgSection = /^\s*\[package\]([\s\S]*?)(?=^\s*\[|$(?![\s\S]))/m.exec(text)?.[1] ?? ''
      const name = /^\s*name\s*=\s*["']([^"']+)["']/m.exec(pkgSection)?.[1]?.replace(/-/g, '_') ?? null
      const libSection = /^\s*\[lib\]([\s\S]*?)(?=^\s*\[|$(?![\s\S]))/m.exec(text)?.[1] ?? ''
      const libPath = /^\s*path\s*=\s*["']([^"']+)["']/m.exec(libSection)?.[1]
      const lib = libPath && repo.has(joinPath(dir, libPath)) ? joinPath(dir, libPath) : repo.has(`${prefix}src/lib.rs`) ? `${prefix}src/lib.rs` : null
      const main = repo.has(`${prefix}src/main.rs`) ? `${prefix}src/main.rs` : null
      out.push({ dir, name, lib, main })
    }
    // Repos without Cargo.toml in the file list: infer crates from src/lib.rs / src/main.rs.
    if (!out.length) {
      for (const p of [...repo.byBasename('lib.rs'), ...repo.byBasename('main.rs')]) {
        if (basename(dirname(p)) !== 'src') continue
        const dir = dirname(dirname(p))
        if (out.some((c) => c.dir === dir)) continue
        const prefix = dir ? `${dir}/` : ''
        out.push({
          dir,
          name: null,
          lib: repo.has(`${prefix}src/lib.rs`) ? `${prefix}src/lib.rs` : null,
          main: repo.has(`${prefix}src/main.rs`) ? `${prefix}src/main.rs` : null,
        })
      }
    }
    out.sort((a, b) => b.dir.length - a.dir.length)
    this.cratesCache = out
    return out
  }

  private crateOf(file: string): Crate | null {
    for (const c of this.crates()) if (c.dir === '' || file.startsWith(`${c.dir}/`)) return c
    return null
  }

  /** The crate root file that `crate::` means for this file (bins, tests, examples and benches are their own roots). */
  private crateRootFor(file: string, crate: Crate | null): string | null {
    const rel = crate && crate.dir ? file.slice(crate.dir.length + 1) : file
    const prefix = crate && crate.dir ? `${crate.dir}/` : ''
    let m = /^src\/bin\/([^/]+)\.rs$/.exec(rel)
    if (m) return file
    m = /^src\/bin\/([^/]+)\//.exec(rel)
    if (m && this.repo.has(`${prefix}src/bin/${m[1]}/main.rs`)) return `${prefix}src/bin/${m[1]}/main.rs`
    m = /^(tests|examples|benches)\/([^/]+?)(?:\.rs$|\/)/.exec(rel)
    if (m) {
      const single = `${prefix}${m[1]}/${m[2]}.rs`
      if (this.repo.has(single)) return single
      const nested = `${prefix}${m[1]}/${m[2]}/main.rs`
      if (this.repo.has(nested)) return nested
    }
    if (rel === 'build.rs') return file
    if (!crate) return null
    if (crate.main && file === crate.main) return crate.main
    return crate.lib ?? crate.main
  }

  private isRoot(file: string): boolean {
    const crate = this.crateOf(file)
    return this.crateRootFor(file, crate) === file
  }

  /** Folder holding a module's child modules. */
  moduleDirOf(file: string): string {
    const base = basename(file)
    if (base === 'mod.rs' || this.isRoot(file)) return dirname(file)
    return joinPath(dirname(file), base.replace(/\.rs$/, ''))
  }

  private moduleFile(dir: string, seg: string): string | null {
    const a = joinPath(dir, `${seg}.rs`)
    if (this.repo.has(a)) return a
    const b = joinPath(dir, `${seg}/mod.rs`)
    return this.repo.has(b) ? b : null
  }

  /** Walk path segments down the module tree; returns the deepest module file reached. */
  private walk(startFile: string, startDir: string, segs: string[]): string {
    let file = startFile
    let dir = startDir
    for (const seg of segs) {
      const next = this.moduleFile(dir, seg)
      if (!next) break
      file = next
      dir = joinPath(dir, seg)
    }
    return file
  }

  /** The file defining the module whose children live in `dir`. */
  private fileForModuleDir(dir: string, crateRoot: string | null): string | null {
    if (crateRoot && dirname(crateRoot) === dir) return crateRoot
    if (this.repo.has(`${dir}.rs`)) return `${dir}.rs`
    if (this.repo.has(`${dir}/mod.rs`)) return `${dir}/mod.rs`
    return null
  }

  resolve(fromPath: string, imp: RawImport): ResolvedImport {
    const spec = imp.specifier.trim()
    const kind = imp.kind ?? 'use'
    if (kind === 'mod') {
      const hit = this.moduleFile(this.moduleDirOf(fromPath), spec)
      return hit ? internal([hit], fromPath) : UNRESOLVED
    }
    if (kind === 'mod-path' || kind === 'include') {
      const p = joinPath(dirname(fromPath), spec)
      return this.repo.has(p) ? internal([p], fromPath) : UNRESOLVED
    }
    const segs = spec.replace(/^::/, '').split('::').filter(Boolean)
    if (!segs.length) return UNRESOLVED
    const crate = this.crateOf(fromPath)
    const root = this.crateRootFor(fromPath, crate)
    const head = segs[0]

    if (head === 'crate') {
      if (!root) return UNRESOLVED
      return internal([this.walk(root, dirname(root), segs.slice(1))], fromPath)
    }
    if (head === 'self') {
      return internal([this.walk(fromPath, this.moduleDirOf(fromPath), segs.slice(1))], fromPath)
    }
    if (head === 'super') {
      let dir = this.moduleDirOf(fromPath)
      let file: string | null = fromPath
      let i = 0
      while (segs[i] === 'super') {
        dir = dirname(dir)
        file = this.fileForModuleDir(dir, root)
        if (!file) return UNRESOLVED
        i++
      }
      return internal([this.walk(file, dir, segs.slice(i))], fromPath)
    }
    if (RUST_BUILTIN.has(head)) return builtin(head)

    // Another crate in this workspace, used by name.
    const other = this.crates().find((c) => c.name === head && (c.lib || c.main))
    if (other) {
      const r = (other.lib ?? other.main) as string
      return internal([this.walk(r, dirname(r), segs.slice(1))], fromPath)
    }
    // 2018-edition relative path: a child module of the current module.
    const local = this.moduleFile(this.moduleDirOf(fromPath), head)
    if (local) return internal([this.walk(local, joinPath(this.moduleDirOf(fromPath), head), segs.slice(1))], fromPath)
    if (root && crate) {
      const fromRoot = this.moduleFile(dirname(root), head)
      if (fromRoot && imp.kind !== 'extern') {
        // Only when the crate root actually declares the module (otherwise it's an external crate with the same name).
        const rootText = this.repo.content(root)
        if (!rootText || new RegExp(`\\bmod\\s+${head}\\b`).test(rootText)) {
          return internal([this.walk(fromRoot, joinPath(dirname(root), head), segs.slice(1))], fromPath)
        }
      }
    }
    return external(head)
  }
}
