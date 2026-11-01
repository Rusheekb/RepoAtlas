import { basename, dirname, joinPath } from '@/core/paths'
import type { RawImport } from '@/core/types'
import type { ResolvedImport } from '../../resolve'
import { PYTHON_STDLIB } from './builtins'
import { UNRESOLVED, builtin, byCloseness, external, internal, type RepoIndex } from './repo'

const PY_EXTS = ['.py', '.pyi', '.pyx']
const PROJECT_MARKERS = ['setup.py', 'pyproject.toml', 'setup.cfg', 'manage.py', 'requirements.txt', 'Pipfile', 'tox.ini']

export class PythonResolver {
  private rootsCache: string[] | null = null
  private pkgDirs: Map<string, string[]> | null = null

  constructor(private readonly repo: RepoIndex) {}

  resolve(fromPath: string, imp: RawImport): ResolvedImport {
    const spec = imp.specifier.trim()
    const names = imp.names?.filter((n) => n !== '*')
    if (spec.startsWith('.')) return this.relative(fromPath, spec, names)
    const segs = spec.split('.').filter(Boolean)
    if (!segs.length) return UNRESOLVED
    if (PYTHON_STDLIB.has(segs[0])) return builtin(segs[0])

    // Sibling modules (scripts importing a file next to them), then project roots.
    const fileDir = dirname(fromPath)
    const sibling = this.moduleFileAt(joinPath(fileDir, segs[0]))
    if (sibling) {
      const hit = this.resolveIn(fileDir, segs, names)
      if (hit) return internal(hit, fromPath)
    }
    for (const root of this.roots()) {
      const hit = this.resolveIn(root, segs, names)
      if (hit) return internal(hit, fromPath)
    }
    // Folders above the importing file (scripts run from a sub-folder put it on the import path).
    for (let d = dirname(fileDir); d; d = dirname(d)) {
      if (!this.moduleFileAt(joinPath(d, segs[0])) && !this.repo.isDir(joinPath(d, segs[0]))) continue
      const hit = this.resolveIn(d, segs, names)
      if (hit) return internal(hit, fromPath)
    }
    // Any package folder with that name, closest to the importing file first.
    for (const dir of byCloseness(fromPath, this.packageDirs().get(segs[0]) ?? [])) {
      const hit = this.resolveIn(dirname(dir), segs, names)
      if (hit) return internal(hit, fromPath)
    }
    // Top-level packages used as import roots ("from utils import x" meaning mypkg/utils.py).
    for (const root of this.topLevelPackages()) {
      if (!this.moduleFileAt(joinPath(root, segs[0]))) continue
      const hit = this.resolveIn(root, segs, names)
      if (hit) return internal(hit, fromPath)
    }
    return external(segs[0])
  }

  private relative(fromPath: string, spec: string, names: string[] | undefined): ResolvedImport {
    const level = /^\.+/.exec(spec)?.[0].length ?? 0
    let dir = dirname(fromPath)
    for (let i = 1; i < level; i++) {
      if (!dir) return UNRESOLVED
      dir = dirname(dir)
    }
    const rest = spec.slice(level).split('.').filter(Boolean)
    if (!rest.length) {
      const subs = (names ?? []).map((n) => this.moduleFileAt(joinPath(dir, n))).filter((p): p is string => !!p)
      const init = this.initFile(dir)
      const unmatched = (names ?? []).length > subs.length
      const out = [...subs, ...(unmatched || !subs.length ? (init ? [init] : []) : [])]
      return out.length ? internal(out, fromPath) : UNRESOLVED
    }
    const hit = this.resolveIn(dir, rest, names)
    return hit ? internal(hit, fromPath) : UNRESOLVED
  }

  /** "a/b" → "a/b.py" or "a/b/__init__.py" (or .pyi / .pyx); null when neither exists. */
  private moduleFileAt(base: string): string | null {
    for (const ext of PY_EXTS) if (this.repo.has(base + ext)) return base + ext
    return this.initFile(base)
  }

  private initFile(dir: string): string | null {
    const prefix = dir ? `${dir}/` : ''
    for (const f of ['__init__.py', '__init__.pyi']) if (this.repo.has(prefix + f)) return prefix + f
    return null
  }

  /**
   * Resolve dotted segments inside a root folder. For from-imports, imported names that are submodules
   * ("from app.api import users") resolve to those files. Falls back to the longest existing prefix
   * ("a.b.Klass" → a/b.py). Returns null when even the first segment is missing.
   */
  private resolveIn(root: string, segs: string[], names: string[] | undefined): string[] | null {
    const repo = this.repo
    const base = joinPath(root, segs.join('/'))
    const file = this.moduleFileAt(base)
    if (file || repo.isDir(base)) {
      const subs: string[] = []
      let unmatched = 0
      for (const n of names ?? []) {
        const sub = this.moduleFileAt(joinPath(base, n))
        if (sub) subs.push(sub)
        else unmatched++
      }
      if (file && (unmatched > 0 || !subs.length)) subs.push(file)
      if (subs.length) return subs
      // Namespace package folder with Python files: point at its first module so the folder link survives.
      const inDir = repo.filesIn(base).filter((p) => p.endsWith('.py')).sort()
      return inDir.length ? [inDir[0]] : null
    }
    for (let k = segs.length - 1; k >= 1; k--) {
      const prefix = this.moduleFileAt(joinPath(root, segs.slice(0, k).join('/')))
      if (prefix) return [prefix]
    }
    return null
  }

  /** Candidate import roots: repo root, src/, lib/, python/, and every Python project folder (+ its src/). */
  private roots(): string[] {
    if (this.rootsCache) return this.rootsCache
    const repo = this.repo
    const out = ['', 'src', 'lib', 'python']
    for (const marker of PROJECT_MARKERS) {
      for (const p of repo.byBasename(marker)) {
        const d = dirname(p)
        out.push(d, d ? `${d}/src` : 'src')
      }
    }
    this.rootsCache = [...new Set(out)].filter((d) => d === '' || repo.isDir(d))
    return this.rootsCache
  }

  /** Top-level folders that are Python packages (contain __init__.py). */
  private topLevelPackages(): string[] {
    return this.repo.memo('py-toplevel', () =>
      this.repo.byBasename('__init__.py').map(dirname).filter((d) => d && !d.includes('/')).sort(),
    )
  }

  /** Folder name → folders with that name that are Python packages (contain __init__.py). */
  private packageDirs(): Map<string, string[]> {
    if (this.pkgDirs) return this.pkgDirs
    const m = new Map<string, string[]>()
    for (const p of this.repo.byBasename('__init__.py')) {
      const d = dirname(p)
      if (!d) continue
      const name = basename(d)
      const list = m.get(name)
      if (list) list.push(d)
      else m.set(name, [d])
    }
    this.pkgDirs = m
    return m
  }
}
