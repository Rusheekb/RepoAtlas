import { basename, dirname, joinPath } from '@/core/paths'
import type { RawImport } from '@/core/types'
import type { ResolvedImport } from '../../resolve'
import { NODE_BUILTINS } from './builtins'
import {
  UNRESOLVED,
  builtin,
  external,
  internal,
  isObject,
  isRelative,
  parseJsonc,
  type RepoIndex,
} from './repo'

/** Extension preference when an import omits it. Lower = preferred. */
const EXT_RANK: Record<string, number> = {
  ts: 0,
  tsx: 1,
  js: 3,
  jsx: 4,
  mjs: 5,
  cjs: 6,
  mts: 7,
  cts: 8,
  vue: 9,
  svelte: 10,
  astro: 11,
  json: 12,
  node: 13,
}
const SCRIPT_EXT = /\.(?:[cm]?[jt]sx?)$/
const TS_FOR_JS: Record<string, string[]> = {
  '.js': ['.ts', '.tsx'],
  '.jsx': ['.tsx'],
  '.mjs': ['.mts'],
  '.cjs': ['.cts'],
}

interface PathPattern {
  prefix: string
  suffix: string
  wildcard: boolean
  targets: string[]
}

/** Effective alias settings from one tsconfig/jsconfig (after following "extends"). */
interface AliasConfig {
  path: string
  baseUrl?: string
  /** Folder that "paths" targets are relative to. */
  pathsBase?: string
  patterns: PathPattern[]
}

interface RawConfig {
  baseUrl?: string
  paths?: Record<string, string[]>
  pathsDir?: string
}

interface WorkspacePackage {
  name: string
  dir: string
  json: Record<string, unknown>
}

const CONDITION_ORDER = ['source', 'development', 'import', 'module', 'browser', 'default', 'require', 'node', 'types']

/** Resolve a package.json "exports"/"imports" target (string, array or conditions object) to one relative path. */
function pickTarget(t: unknown): string | null {
  if (typeof t === 'string') return t
  if (Array.isArray(t)) {
    for (const x of t) {
      const r = pickTarget(x)
      if (r) return r
    }
    return null
  }
  if (isObject(t)) {
    for (const c of CONDITION_ORDER) if (c in t) {
      const r = pickTarget(t[c])
      if (r) return r
    }
    for (const v of Object.values(t)) {
      const r = pickTarget(v)
      if (r) return r
    }
  }
  return null
}

/** Match a subpath against an exports/imports map with "*" patterns. */
function matchSubpathMap(map: Record<string, unknown>, key: string): string | null {
  if (key in map) return pickTarget(map[key])
  let best: { prefix: string; target: unknown; star: string } | null = null
  for (const [k, v] of Object.entries(map)) {
    const star = k.indexOf('*')
    if (star === -1) continue
    const prefix = k.slice(0, star)
    const suffix = k.slice(star + 1)
    if (key.startsWith(prefix) && key.endsWith(suffix) && key.length >= prefix.length + suffix.length) {
      if (!best || prefix.length > best.prefix.length) {
        best = { prefix, target: v, star: key.slice(prefix.length, key.length - suffix.length) }
      }
    }
  }
  if (!best) return null
  const t = pickTarget(best.target)
  return t ? t.split('*').join(best.star) : null
}

/** Map a built-output path back to its likely source ("./dist/esm/index.js" → "src/index"). */
export function distToSrc(p: string): string | null {
  let s = p.replace(/^\.\//, '')
  if (!/^(?:dist|build|lib|out|esm|cjs|es|umd|types|typings|bundle|output)\//.test(s)) return null
  s = s.replace(/^[^/]+\//, 'src/').replace(/^src\/(?:esm|cjs|es|umd|mjs|types|node|browser)\//, 'src/')
  return s.replace(/\.d\.[cm]?ts$/, '').replace(/\.[cm]?jsx?$/, '')
}

/** Normalized npm package name for a bare specifier: "@scope/pkg/sub" → "@scope/pkg", "lodash/fp" → "lodash". */
export function npmPackageName(spec: string): string {
  let s = spec.replace(/^(?:npm|jsr):/, '')
  const parts = s.split('/')
  s = s.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? '')
  // Strip a version suffix (Deno / CDN style: "react@18.2.0", "@std/path@1").
  const at = s.indexOf('@', 1)
  return at > 0 ? s.slice(0, at) : s
}

function urlPackageName(spec: string): string {
  try {
    const u = new URL(spec)
    const first = u.pathname.split('/').filter(Boolean)[0] ?? ''
    const clean = first.replace(/@[^/]*$/, '')
    return clean ? `${u.host}/${clean}` : u.host
  } catch {
    return spec
  }
}

const FRAMEWORK_VIRTUAL = /^(?:virtual:|astro:|\$app\/|\$env\/|\$service-worker$|~icons\/|~react-pages$|virtual-|uno\.css$|@vite\/|vite\/|\0)/

export class JsResolver {
  private configsByPath = new Map<string, AliasConfig | null>()
  private governing = new Map<string, AliasConfig[]>()
  private packages: WorkspacePackage[] | null = null
  private deps: Set<string> | null = null
  private readonly wsCache = new Map<string, string | null>()

  constructor(private readonly repo: RepoIndex) {}

  resolve(fromPath: string, imp: RawImport): ResolvedImport {
    let spec = imp.specifier.trim()
    // Webpack loader chains ("style-loader!css-loader!./x.css") and query/hash suffixes ("./a.svg?react").
    if (spec.includes('!') && !spec.startsWith('!')) spec = spec.slice(spec.lastIndexOf('!') + 1)
    spec = spec.replace(/\?.*$/, '')
    if (!spec) return UNRESOLVED
    if (/^https?:\/\//i.test(spec)) return external(urlPackageName(spec))
    if (spec.startsWith('node:')) return builtin(spec.slice(5).split('/')[0] ?? spec)
    if (spec === 'bun' || spec.startsWith('bun:')) return builtin(spec)
    if (FRAMEWORK_VIRTUAL.test(spec)) return builtin(spec)

    if (isRelative(spec) || spec.startsWith('/')) {
      const base = spec.startsWith('/') ? joinPath(this.projectRoot(fromPath), spec) : joinPath(dirname(fromPath), spec)
      const hit = this.resolveFile(base) ?? (spec.startsWith('/') ? this.resolveFile(joinPath(spec)) : null)
      return hit ? internal([hit], fromPath) : UNRESOLVED
    }
    if (spec.startsWith('#')) {
      const hit = this.subpathImport(fromPath, spec)
      if (hit) return internal([hit], fromPath)
    }

    const configs = this.configsFor(fromPath)
    for (const cfg of configs) {
      const hit = this.matchPaths(cfg, spec)
      if (hit) return internal([hit], fromPath)
    }
    // TypeScript looks names up under baseUrl before node_modules.
    for (const cfg of configs) {
      if (cfg.baseUrl === undefined) continue
      const hit = this.resolveFile(joinPath(cfg.baseUrl, spec), 0, true)
      if (hit) return internal([hit], fromPath)
    }

    const ws = this.workspace(spec)
    if (ws) return internal([ws], fromPath)

    const name = npmPackageName(spec)
    if (this.declaredDeps().has(name)) return external(name)
    const first = spec.split('/')[0] ?? spec
    if (NODE_BUILTINS.has(first)) return builtin(first)

    const alias = /^(?:@|~|\$lib|@@)\/(.*)$/.exec(spec) ?? (spec === '~' || spec === '@' ? ['', ''] : null)
    if (alias) {
      const rest = alias[1] ?? ''
      const roots = spec.startsWith('$lib') ? this.libRoots(fromPath) : this.srcRoots(fromPath)
      for (const root of roots) {
        const hit = this.resolveFile(joinPath(root, rest), 0, true)
        if (hit) return internal([hit], fromPath)
      }
      if (!spec.startsWith('@') || spec.startsWith('@/')) return UNRESOLVED
    }

    // Bare specifiers that point into the repo without any config (webpack resolve.modules, babel module-resolver …).
    if (!spec.startsWith('@')) {
      for (const root of this.bareRoots(fromPath)) {
        const hit = this.resolveFile(joinPath(root, spec), 0, true)
        if (hit && SCRIPT_EXT.test(hit)) return internal([hit], fromPath)
      }
    }
    return external(name)
  }

  // ─── Files ────────────────────────────────────────────────────────────────

  /**
   * Node/bundler-style file resolution: exact, TS-for-JS swap, extension probing, folder index, package.json main.
   * `strict` (used for every non-relative lookup) only probes script/JSON extensions, so a bare "react" can never
   * land on "src/react.svg".
   */
  resolveFile(base: string, depth = 0, strict = false): string | null {
    const repo = this.repo
    if (!base && depth > 0) return null
    if (base && repo.has(base)) return base
    const ext = /\.[cm]?jsx?$/.exec(base)?.[0]
    if (ext) {
      const stem = base.slice(0, -ext.length)
      for (const alt of TS_FOR_JS[ext] ?? []) if (repo.has(stem + alt)) return stem + alt
    }
    const probed = this.probe(base, strict)
    if (probed) return probed
    if (repo.isDir(base)) {
      const pkgPath = base ? `${base}/package.json` : 'package.json'
      const pkg = depth < 2 ? this.readJson(pkgPath) : null
      if (pkg) {
        for (const field of ['source', 'module', 'main']) {
          const v = pkg[field]
          if (typeof v === 'string') {
            const hit = this.resolveFile(joinPath(base, v), depth + 1, strict)
            if (hit) return hit
          }
        }
      }
      const idx = this.probe(base ? `${base}/index` : 'index', true)
      if (idx) return idx
    }
    return null
  }

  private probe(base: string, scriptsOnly = false): string | null {
    if (!base) return null
    const repo = this.repo
    let best: string | null = null
    let bestRank = Infinity
    for (const p of repo.withoutExt(base)) {
      const e = p.slice(base.length + 1).toLowerCase()
      const rank = EXT_RANK[e] ?? (scriptsOnly ? Infinity : 50)
      if (rank < bestRank) {
        best = p
        bestRank = rank
      }
    }
    if (best && bestRank < 50) return best
    for (const dts of [`${base}.d.ts`, `${base}.d.mts`]) if (repo.has(dts)) return dts
    return best
  }

  private readJson(path: string): Record<string, unknown> | null {
    const text = this.repo.content(path)
    if (text === undefined) return null
    const v = parseJsonc(text)
    return isObject(v) ? v : null
  }

  /** Folder a "/x" import is relative to: the nearest folder with package.json or index.html, else the repo root. */
  private projectRoot(fromPath: string): string {
    return this.repo.nearest(fromPath, (d) => this.repo.has(d ? `${d}/package.json` : 'package.json') || this.repo.has(d ? `${d}/index.html` : 'index.html')) ?? ''
  }

  // ─── tsconfig / jsconfig ──────────────────────────────────────────────────

  private rawConfig(path: string, seen: Set<string>): RawConfig {
    const json = this.readJson(path)
    if (!json || seen.has(path)) return {}
    seen.add(path)
    let merged: RawConfig = {}
    const ext = json.extends
    const parents = typeof ext === 'string' ? [ext] : Array.isArray(ext) ? ext.filter((x): x is string => typeof x === 'string') : []
    for (const parent of parents) {
      const target = this.configTarget(path, parent)
      if (target) merged = { ...merged, ...this.rawConfig(target, seen) }
    }
    const co = isObject(json.compilerOptions) ? json.compilerOptions : {}
    const dir = dirname(path)
    if (typeof co.baseUrl === 'string') merged.baseUrl = joinPath(dir, co.baseUrl)
    if (isObject(co.paths)) {
      const paths: Record<string, string[]> = {}
      for (const [k, v] of Object.entries(co.paths)) {
        if (Array.isArray(v)) paths[k] = v.filter((x): x is string => typeof x === 'string')
      }
      merged.paths = paths
      merged.pathsDir = dir
    }
    return merged
  }

  /** Resolve an "extends" value to a config path inside the repo. */
  private configTarget(fromConfig: string, ext: string): string | null {
    const candidates: string[] = []
    if (isRelative(ext) || ext.startsWith('/')) {
      const p = joinPath(dirname(fromConfig), ext)
      candidates.push(p, `${p}.json`, `${p}/tsconfig.json`)
    } else {
      // A workspace package that ships a shared config ("@acme/tsconfig/base.json").
      const pkg = this.workspacePackages().find((w) => ext === w.name || ext.startsWith(`${w.name}/`))
      if (pkg) {
        const rest = ext.slice(pkg.name.length).replace(/^\//, '')
        const p = joinPath(pkg.dir, rest || 'tsconfig.json')
        candidates.push(p, `${p}.json`)
      }
    }
    return candidates.find((c) => this.repo.has(c)) ?? null
  }

  private aliasConfig(path: string): AliasConfig | null {
    if (this.configsByPath.has(path)) return this.configsByPath.get(path) ?? null
    const raw = this.rawConfig(path, new Set())
    let cfg: AliasConfig | null = null
    if (raw.baseUrl !== undefined || raw.paths) {
      const pathsBase = raw.baseUrl ?? raw.pathsDir ?? dirname(path)
      const patterns: PathPattern[] = []
      for (const [key, targets] of Object.entries(raw.paths ?? {})) {
        const star = key.indexOf('*')
        patterns.push({
          prefix: star === -1 ? key : key.slice(0, star),
          suffix: star === -1 ? '' : key.slice(star + 1),
          wildcard: star !== -1,
          targets,
        })
      }
      // Longest prefix first (TypeScript's matching rule).
      patterns.sort((a, b) => b.prefix.length - a.prefix.length)
      cfg = { path, baseUrl: raw.baseUrl, pathsBase, patterns }
    }
    this.configsByPath.set(path, cfg)
    return cfg
  }

  /** Alias configs that apply to a file: the nearest folder's tsconfig/jsconfig (+ its references and siblings). */
  configsFor(fromPath: string): AliasConfig[] {
    const dir = dirname(fromPath)
    const cached = this.governing.get(dir)
    if (cached) return cached
    const repo = this.repo
    let result: AliasConfig[] = []
    let d: string | null = dir
    while (d !== null) {
      const prefix = d ? `${d}/` : ''
      const main = [`${prefix}tsconfig.json`, `${prefix}jsconfig.json`].filter((p) => repo.content(p) !== undefined)
      if (main.length) {
        const ordered: string[] = [...main]
        for (const m of main) {
          const json = this.readJson(m)
          const refs = Array.isArray(json?.references) ? json.references : []
          for (const r of refs) {
            if (!isObject(r) || typeof r.path !== 'string') continue
            const p = joinPath(d, r.path)
            ordered.push(p.endsWith('.json') ? p : `${p}/tsconfig.json`)
          }
        }
        for (const sib of repo.filesIn(d)) {
          if (/^tsconfig\..+\.json$/.test(basename(sib))) ordered.push(sib)
        }
        result = [...new Set(ordered)].map((p) => this.aliasConfig(p)).filter((c): c is AliasConfig => c !== null)
        if (result.length) break
      }
      d = d ? dirname(d) : null
    }
    this.governing.set(dir, result)
    return result
  }

  private matchPaths(cfg: AliasConfig, spec: string): string | null {
    for (const p of cfg.patterns) {
      let star = ''
      if (p.wildcard) {
        if (!spec.startsWith(p.prefix) || !spec.endsWith(p.suffix) || spec.length < p.prefix.length + p.suffix.length) continue
        star = spec.slice(p.prefix.length, spec.length - p.suffix.length)
      } else if (spec !== p.prefix) continue
      for (const t of p.targets) {
        const target = p.wildcard ? t.split('*').join(star) : t
        const hit = this.resolveFile(joinPath(cfg.pathsBase ?? '', target), 0, true)
        if (hit) return hit
        const fromDist = distToSrc(target)
        if (fromDist) {
          const alt = this.resolveFile(joinPath(cfg.pathsBase ?? '', fromDist), 0, true)
          if (alt) return alt
        }
      }
    }
    return null
  }

  // ─── Workspaces & package.json ────────────────────────────────────────────

  private workspacePackages(): WorkspacePackage[] {
    if (this.packages) return this.packages
    const out: WorkspacePackage[] = []
    for (const p of this.repo.paths) {
      if (basename(p) !== 'package.json' || p.includes('node_modules/')) continue
      const json = this.readJson(p)
      if (json && typeof json.name === 'string' && json.name) out.push({ name: json.name, dir: dirname(p), json })
    }
    out.sort((a, b) => b.name.length - a.name.length)
    this.packages = out
    return out
  }

  private declaredDeps(): Set<string> {
    if (this.deps) return this.deps
    const deps = new Set<string>()
    for (const pkg of this.repo.paths) {
      if (basename(pkg) !== 'package.json' || pkg.includes('node_modules/')) continue
      const json = this.readJson(pkg)
      if (!json) continue
      for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
        const v = json[field]
        if (isObject(v)) for (const k of Object.keys(v)) deps.add(k)
      }
    }
    // A workspace package is never "external", even when another package lists it as a dependency.
    for (const w of this.workspacePackages()) deps.delete(w.name)
    this.deps = deps
    return deps
  }

  private workspace(spec: string): string | null {
    const cached = this.wsCache.get(spec)
    if (cached !== undefined) return cached
    const hit = this.findWorkspace(spec)
    this.wsCache.set(spec, hit)
    return hit
  }

  private findWorkspace(spec: string): string | null {
    const pkg = this.workspacePackages().find((w) => spec === w.name || spec.startsWith(`${w.name}/`))
    if (pkg) return this.packageEntry(pkg.dir, pkg.json, spec.slice(pkg.name.length).replace(/^\//, ''))
    // Scoped package whose package.json wasn't downloaded: a folder with that name and a package.json.
    if (spec.startsWith('@')) {
      const [scope, name, ...rest] = spec.split('/')
      if (!scope || !name) return null
      for (const dir of this.repo.byBasename('package.json').map(dirname)) {
        if (basename(dir) !== name || dir.includes('node_modules')) continue
        if (this.repo.content(`${dir}/package.json`) !== undefined) continue
        if (!/(?:^|\/)(?:packages|apps|libs|modules|plugins|tools|services|shared|internal)\//.test(`${dir}/`)) continue
        return this.packageEntry(dir, {}, rest.join('/'))
      }
    }
    return null
  }

  private packageEntry(dir: string, json: Record<string, unknown>, sub: string): string | null {
    const tryPath = (rel: string | null | undefined): string | null => {
      if (!rel) return null
      const hit = this.resolveFile(joinPath(dir, rel), 0, true)
      if (hit) return hit
      const alt = distToSrc(rel)
      return alt ? this.resolveFile(joinPath(dir, alt), 0, true) : null
    }
    const exp = json.exports
    let map: Record<string, unknown> | null = null
    if (typeof exp === 'string' || Array.isArray(exp)) map = { '.': exp }
    else if (isObject(exp)) map = Object.keys(exp).some((k) => k.startsWith('.')) ? exp : { '.': exp }
    const key = sub ? `./${sub}` : '.'
    const fromExports = map ? matchSubpathMap(map, key) : null
    const direct = tryPath(fromExports)
    if (direct) return direct
    if (sub) {
      return tryPath(sub) ?? tryPath(`src/${sub}`) ?? tryPath(`lib/${sub}`) ?? null
    }
    for (const field of ['source', 'module', 'main', 'types', 'typings']) {
      const v = json[field]
      const hit = typeof v === 'string' ? tryPath(v) : null
      if (hit) return hit
    }
    const conventional = tryPath('src/index') ?? tryPath('index') ?? tryPath('lib/index') ?? tryPath('src/main') ?? tryPath('mod')
    if (conventional) return conventional
    // Anything in the package keeps the module-level link correct.
    const files = [...this.repo.filesIn(dir ? `${dir}/src` : 'src'), ...this.repo.filesIn(dir)].filter((p) => SCRIPT_EXT.test(p))
    return files.sort()[0] ?? null
  }

  private subpathImport(fromPath: string, spec: string): string | null {
    const repo = this.repo
    const dir = repo.nearest(fromPath, (d) => {
      const json = this.readJson(d ? `${d}/package.json` : 'package.json')
      return !!json && isObject(json.imports)
    })
    if (dir === null) return null
    const json = this.readJson(dir ? `${dir}/package.json` : 'package.json')
    if (!json || !isObject(json.imports)) return null
    const target = matchSubpathMap(json.imports, spec)
    if (!target) return null
    const hit = this.resolveFile(joinPath(dir, target), 0, true)
    if (hit) return hit
    const alt = distToSrc(target)
    return alt ? this.resolveFile(joinPath(dir, alt), 0, true) : null
  }

  // ─── Fallback roots ───────────────────────────────────────────────────────

  /** Candidate folders for "@/x" and "~/x": nearest src folders, then package roots, then the repo root. */
  private srcRoots(fromPath: string): string[] {
    const repo = this.repo
    const out: string[] = []
    let d: string | null = dirname(fromPath)
    while (d !== null) {
      if (basename(d) === 'src') out.push(d)
      const src = d ? `${d}/src` : 'src'
      if (repo.isDir(src)) out.push(src)
      if (repo.has(d ? `${d}/package.json` : 'package.json')) out.push(d)
      d = d ? dirname(d) : null
    }
    out.push('src', '')
    return [...new Set(out)]
  }

  private libRoots(fromPath: string): string[] {
    const out: string[] = []
    let d: string | null = dirname(fromPath)
    while (d !== null) {
      const lib = d ? `${d}/src/lib` : 'src/lib'
      if (this.repo.isDir(lib)) out.push(lib)
      if (basename(d) === 'src' && this.repo.isDir(`${d}/lib`)) out.push(`${d}/lib`)
      d = d ? dirname(d) : null
    }
    return [...new Set(out)]
  }

  private bareRoots(fromPath: string): string[] {
    const pkgRoot = this.projectRoot(fromPath)
    return [...new Set([pkgRoot ? `${pkgRoot}/src` : 'src', pkgRoot, 'src', ''])]
  }
}
