import { basename, dirname, joinPath } from '@/core/paths'
import type { RawImport } from '@/core/types'
import type { ResolvedImport } from '../../resolve'
import { UNRESOLVED, builtin, external, internal, type RepoIndex } from './repo'

const RUST_BUILTIN = new Set(['std', 'core', 'alloc', 'proc_macro', 'test'])

interface Crate {
  /** Folder containing Cargo.toml. */
  dir: string
  /** Crate name as used in code (dashes → underscores; the [lib] name when it has one). */
  name: string | null
  /** Library root (src/lib.rs or [lib] path), if any. */
  lib: string | null
  /** Main binary root (src/main.rs, or the first [[bin]] path), if any. */
  main: string | null
  /** Every binary root: src/main.rs plus each [[bin]] `path` (e.g. ripgrep's crates/core/main.rs). */
  bins: string[]
}

/** One `[table]` or `[[array-table]]` of a Cargo.toml, with its `key = "string"` entries. */
interface TomlTable {
  header: string
  values: Map<string, string>
}

/**
 * Just enough TOML for Cargo.toml: table headers and plain string values.
 * Line by line (no regex over the whole file), so a huge or odd manifest can never stall the page.
 */
export function cargoTables(text: string): TomlTable[] {
  const out: TomlTable[] = [{ header: '', values: new Map() }]
  let inMultiline = false
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    // Skip the inside of multi-line strings (`description = """ … """`), which may hold anything.
    const fences = line.split('"""').length - 1 + line.split("'''").length - 1
    if (inMultiline) {
      if (fences % 2 === 1) inMultiline = false
      continue
    }
    if (fences % 2 === 1) inMultiline = true
    if (!line || line.startsWith('#')) continue
    if (line.startsWith('[')) {
      const h = /^\[\[?\s*([^\]]+?)\s*\]\]?/.exec(line.length > 500 ? line.slice(0, 500) : line)
      if (h) {
        out.push({ header: line.startsWith('[[') ? `[${h[1]}]` : h[1], values: new Map() })
        continue
      }
    }
    const kv = /^([A-Za-z0-9_.-]+)[ \t]*=[ \t]*(?:"([^"]*)"|'([^']*)')/.exec(line.length > 2000 ? line.slice(0, 2000) : line)
    if (kv) {
      const table = out[out.length - 1]
      if (!table.values.has(kv[1])) table.values.set(kv[1], kv[2] ?? kv[3] ?? '')
    }
  }
  return out
}

export class RustResolver {
  private cratesCache: Crate[] | null = null

  constructor(private readonly repo: RepoIndex) {}

  private crates(): Crate[] {
    if (this.cratesCache) return this.cratesCache
    const repo = this.repo
    const out: Crate[] = []
    const existing = (dir: string, rel: string | undefined): string | null => {
      if (!rel) return null
      const p = joinPath(dir, rel)
      return repo.has(p) ? p : null
    }
    for (const p of repo.byBasename('Cargo.toml')) {
      const dir = dirname(p)
      const prefix = dir ? `${dir}/` : ''
      const tables = cargoTables(repo.content(p) ?? '')
      const pkg = tables.find((t) => t.header === 'package')
      const libTable = tables.find((t) => t.header === 'lib')
      const pkgName = pkg?.values.get('name')
      const libName = libTable?.values.get('name')
      const name = (libName || pkgName)?.replace(/-/g, '_') ?? null
      const lib = existing(dir, libTable?.values.get('path')) ?? (repo.has(`${prefix}src/lib.rs`) ? `${prefix}src/lib.rs` : null)
      const bins: string[] = []
      const conventional = repo.has(`${prefix}src/main.rs`) ? `${prefix}src/main.rs` : null
      if (conventional) bins.push(conventional)
      for (const t of tables) {
        if (t.header !== '[bin]') continue
        const bin = existing(dir, t.values.get('path'))
        if (bin && !bins.includes(bin)) bins.push(bin)
      }
      out.push({ dir, name, lib, main: bins[0] ?? null, bins })
    }
    // Repos without Cargo.toml in the file list: infer crates from src/lib.rs / src/main.rs.
    if (!out.length) {
      for (const p of [...repo.byBasename('lib.rs'), ...repo.byBasename('main.rs')]) {
        if (basename(dirname(p)) !== 'src') continue
        const dir = dirname(dirname(p))
        if (out.some((c) => c.dir === dir)) continue
        const prefix = dir ? `${dir}/` : ''
        const main = repo.has(`${prefix}src/main.rs`) ? `${prefix}src/main.rs` : null
        out.push({
          dir,
          name: null,
          lib: repo.has(`${prefix}src/lib.rs`) ? `${prefix}src/lib.rs` : null,
          main,
          bins: main ? [main] : [],
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
    if (crate.bins.includes(file)) return file
    // A file belongs to the root whose folder holds it most closely: ripgrep's crates/core/flags/mod.rs belongs to
    // the [[bin]] at crates/core/main.rs, while src/x.rs of a crate with both src/lib.rs and src/main.rs belongs to the library.
    let best: string | null = null
    let bestDepth = -1
    for (const root of [crate.lib, ...crate.bins]) {
      if (!root) continue
      const d = dirname(root)
      if (d && !file.startsWith(`${d}/`)) continue
      const depth = d ? d.split('/').length : 0
      if (depth > bestDepth) {
        best = root
        bestDepth = depth
      }
    }
    return best ?? crate.lib ?? crate.main
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
