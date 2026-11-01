import { basename, dirname, joinPath } from '@/core/paths'
import type { RawImport } from '@/core/types'
import type { ResolvedImport } from '../../resolve'
import { maskSource } from '../../strip'
import { ELIXIR_STDLIB, LUA_BUILTINS, R_BASE, RUBY_STDLIB } from './builtins'
import { UNRESOLVED, builtin, byCloseness, external, internal, isObject, isRelative, parseJsonc, type RepoIndex } from './repo'

/** Try a path as-is and with each extension. */
function withExts(repo: RepoIndex, base: string, exts: string[]): string | null {
  if (repo.has(base)) return base
  for (const e of exts) if (repo.has(base + e)) return base + e
  return null
}

// ─── Ruby ────────────────────────────────────────────────────────────────────

export class RubyResolver {
  constructor(private readonly repo: RepoIndex) {}

  private libDirs(): string[] {
    return this.repo.memo('ruby-lib', () => {
      const out = ['lib', '', 'app', 'config']
      for (const d of this.repo.dirSet) if (basename(d) === 'lib') out.push(d)
      return [...new Set(out)].filter((d) => d === '' || this.repo.isDir(d))
    })
  }

  resolve(fromPath: string, imp: RawImport): ResolvedImport {
    const spec = imp.specifier.trim()
    if (!spec) return UNRESOLVED
    const repo = this.repo
    const kind = imp.kind ?? 'require'
    if (kind === 'require_relative' || isRelative(spec)) {
      const hit = withExts(repo, joinPath(dirname(fromPath), spec), ['.rb']) ?? (isRelative(spec) ? withExts(repo, joinPath(spec), ['.rb']) : null)
      return hit ? internal([hit], fromPath) : UNRESOLVED
    }
    if (kind === 'load') {
      const hit = withExts(repo, joinPath(dirname(fromPath), spec), ['.rb']) ?? withExts(repo, spec, ['.rb'])
      if (hit) return internal([hit], fromPath)
    }
    if (RUBY_STDLIB.has(spec)) return builtin(spec)
    for (const root of byCloseness(fromPath, this.libDirs())) {
      const hit = withExts(repo, joinPath(root, spec), ['.rb'])
      if (hit && hit !== fromPath) return internal([hit], fromPath)
    }
    const first = spec.split('/')[0] ?? spec
    if (RUBY_STDLIB.has(first)) return builtin(first)
    return external(first)
  }
}

// ─── PHP ─────────────────────────────────────────────────────────────────────

export class PhpResolver {
  constructor(
    private readonly repo: RepoIndex,
    private readonly psr4?: Record<string, string>,
  ) {}

  /** PSR-4 prefixes ("App\\" → ["app/"]) from the given map and every composer.json found, longest first. */
  private map(): [prefix: string, dirs: string[]][] {
    return this.repo.memo('php-psr4', () => {
      const m = new Map<string, string[]>()
      const add = (prefix: string, dir: string) => {
        const key = prefix.replace(/\\+$/, '') + '\\'
        const list = m.get(key) ?? []
        list.push(dir.replace(/\/+$/, ''))
        m.set(key, list)
      }
      for (const [k, v] of Object.entries(this.psr4 ?? {})) add(k, joinPath(v))
      for (const p of this.repo.byBasename('composer.json')) {
        const json = parseJsonc(this.repo.content(p) ?? '')
        if (!isObject(json)) continue
        const base = dirname(p)
        for (const section of ['autoload', 'autoload-dev']) {
          const auto = json[section]
          if (!isObject(auto) || !isObject(auto['psr-4'])) continue
          for (const [prefix, dirs] of Object.entries(auto['psr-4'])) {
            for (const d of Array.isArray(dirs) ? dirs : [dirs]) if (typeof d === 'string') add(prefix, joinPath(base, d))
          }
        }
      }
      return [...m.entries()].sort((a, b) => b[0].length - a[0].length)
    })
  }

  resolve(fromPath: string, imp: RawImport): ResolvedImport {
    const spec = imp.specifier.trim()
    if (!spec) return UNRESOLVED
    const repo = this.repo
    if (imp.kind === 'include') {
      const hit =
        withExts(repo, joinPath(dirname(fromPath), spec), []) ??
        withExts(repo, joinPath(spec), []) ??
        byCloseness(fromPath, repo.byBasename(basename(spec)).filter((p) => p.endsWith(`/${spec.replace(/^\.?\//, '')}`)))[0] ??
        null
      return hit ? internal([hit], fromPath) : UNRESOLVED
    }
    const name = spec.replace(/^\\/, '')
    for (const [prefix, dirs] of this.map()) {
      if (!(name + '\\').startsWith(prefix)) continue
      const rest = name.slice(prefix.length).replace(/\\/g, '/')
      for (const d of dirs) {
        const p = joinPath(d, `${rest}.php`)
        const hit = repo.findInsensitive(p)
        if (hit) return internal([hit], fromPath)
      }
      // `use function App\helpers\fn;` → the file is the namespace part.
      const parent = rest.split('/').slice(0, -1).join('/')
      if (parent) {
        for (const d of dirs) {
          const hit = repo.findInsensitive(joinPath(d, `${parent}.php`))
          if (hit) return internal([hit], fromPath)
        }
      }
    }
    const fallback = this.suffixMatch(name)
    if (fallback) return internal([fallback], fromPath)
    return external(name.split('\\')[0] ?? name)
  }

  /** "App\Models\User" → a .php file named User whose folders match at least one more trailing namespace part. */
  private suffixMatch(name: string): string | null {
    const segs = name.split('\\')
    const cls = segs[segs.length - 1] ?? ''
    const candidates = this.repo.byStem(cls).filter((p) => p.endsWith('.php') && !p.includes('vendor/'))
    let best: string | null = null
    let bestScore = 1
    for (const c of candidates) {
      const dirSegs = dirname(c).toLowerCase().split('/')
      let score = 1
      for (let i = segs.length - 2, j = dirSegs.length - 1; i >= 0 && j >= 0 && segs[i].toLowerCase() === dirSegs[j]; i--, j--) score++
      if (score > bestScore) {
        best = c
        bestScore = score
      }
    }
    return best
  }
}

// ─── Dart ────────────────────────────────────────────────────────────────────

export class DartResolver {
  constructor(private readonly repo: RepoIndex) {}

  private packages(): Map<string, string> {
    return this.repo.memo('dart-pubspec', () => {
      const m = new Map<string, string>()
      for (const p of this.repo.byBasename('pubspec.yaml')) {
        const name = /^name:\s*["']?([\w-]+)/m.exec(this.repo.content(p) ?? '')?.[1]
        if (name) m.set(name, dirname(p))
      }
      return m
    })
  }

  resolve(fromPath: string, imp: RawImport): ResolvedImport {
    const spec = imp.specifier.trim()
    if (spec.startsWith('dart:')) return builtin(spec)
    const pkg = /^package:([\w-]+)\/(.+)$/.exec(spec)
    if (pkg) {
      const dir = this.packages().get(pkg[1])
      if (dir !== undefined) {
        const p = joinPath(dir, 'lib', pkg[2])
        return this.repo.has(p) ? internal([p], fromPath) : UNRESOLVED
      }
      return external(pkg[1])
    }
    const p = joinPath(dirname(fromPath), spec)
    return this.repo.has(p) ? internal([p], fromPath) : UNRESOLVED
  }
}

// ─── Elixir ──────────────────────────────────────────────────────────────────

/** "MyApp.UserController" → "my_app/user_controller" */
function underscore(mod: string): string {
  return mod
    .split('.')
    .map((s) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2').toLowerCase())
    .join('/')
}

export class ElixirResolver {
  constructor(private readonly repo: RepoIndex) {}

  private modules(): Map<string, string> {
    return this.repo.memo('ex-modules', () => {
      const m = new Map<string, string>()
      for (const p of this.repo.paths) {
        if (!/\.exs?$/.test(p)) continue
        const text = this.repo.content(p)
        if (text === undefined) continue
        const { code } = maskSource(text, 'Elixir')
        for (const d of code.matchAll(/\bdefmodule\s+([A-Z][\w.]*)\s+do\b/g)) if (!m.has(d[1])) m.set(d[1], p)
      }
      return m
    })
  }

  resolve(fromPath: string, imp: RawImport): ResolvedImport {
    const mod = imp.specifier.trim()
    if (!mod) return UNRESOLVED
    const first = mod.split('.')[0] ?? mod
    const mods = this.modules()
    const declared = mods.get(mod)
    if (declared) return internal([declared], fromPath)
    // Conventional file layout: MyApp.Accounts.User → lib/my_app/accounts/user.ex
    const guess = underscore(mod)
    const stem = guess.split('/').pop() ?? guess
    const candidates = [...this.repo.byBasename(`${stem}.ex`), ...this.repo.byBasename(`${stem}.exs`)].filter((p) =>
      p.replace(/\.exs?$/, '').endsWith(guess),
    )
    if (candidates.length) return internal([byCloseness(fromPath, candidates)[0]], fromPath)
    // A module nested inside a parent module's file.
    const segs = mod.split('.')
    for (let k = segs.length - 1; k >= 2; k--) {
      const hit = mods.get(segs.slice(0, k).join('.'))
      if (hit) return internal([hit], fromPath)
    }
    if (ELIXIR_STDLIB.has(first)) return builtin(first)
    return external(first)
  }
}

// ─── Lua, R, Shell ───────────────────────────────────────────────────────────

export class LuaResolver {
  constructor(private readonly repo: RepoIndex) {}

  resolve(fromPath: string, imp: RawImport): ResolvedImport {
    const spec = imp.specifier.trim()
    if (!spec) return UNRESOLVED
    const repo = this.repo
    if (imp.kind === 'dofile' || imp.kind === 'loadfile' || spec.endsWith('.lua')) {
      const hit = withExts(repo, joinPath(dirname(fromPath), spec), []) ?? withExts(repo, joinPath(spec), [])
      return hit ? internal([hit], fromPath) : UNRESOLVED
    }
    const rel = spec.replace(/\./g, '/')
    const roots = [...new Set(['', 'lua', 'src', 'lib', dirname(fromPath), ...this.luaRoots()])]
    for (const root of roots) {
      const hit = withExts(repo, joinPath(root, rel), ['.lua', '/init.lua', '.luau', '/init.luau'])
      if (hit && hit !== joinPath(root, rel)) return internal([hit], fromPath)
    }
    const first = spec.split(/[./]/)[0] ?? spec
    if (LUA_BUILTINS.has(first)) return builtin(first)
    return external(first)
  }

  private luaRoots(): string[] {
    return this.repo.memo('lua-roots', () => [...this.repo.dirSet].filter((d) => basename(d) === 'lua'))
  }
}

export class RResolver {
  constructor(private readonly repo: RepoIndex) {}

  resolve(fromPath: string, imp: RawImport): ResolvedImport {
    const spec = imp.specifier.trim()
    if (!spec) return UNRESOLVED
    if (imp.kind === 'source') {
      const hit = withExts(this.repo, joinPath(dirname(fromPath), spec), []) ?? withExts(this.repo, joinPath(spec), [])
      return hit ? internal([hit], fromPath) : UNRESOLVED
    }
    if (R_BASE.has(spec)) return builtin(spec)
    return external(spec)
  }
}

export class ShellResolver {
  constructor(private readonly repo: RepoIndex) {}

  resolve(fromPath: string, imp: RawImport): ResolvedImport {
    const spec = imp.specifier.trim()
    if (!spec) return UNRESOLVED
    const hit =
      withExts(this.repo, joinPath(dirname(fromPath), spec), ['.sh', '.bash']) ?? withExts(this.repo, joinPath(spec), ['.sh', '.bash'])
    return hit ? internal([hit], fromPath) : UNRESOLVED
  }
}
