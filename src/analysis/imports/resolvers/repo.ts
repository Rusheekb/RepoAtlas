import { basename, dirname, joinPath } from '@/core/paths'
import type { ResolvedImport } from '../../resolve'
import { stripComments } from '../../strip'

/**
 * Precomputed lookups over the repo's file list, shared by every language resolver.
 * Heavier maps are built lazily on first use, so a JS-only repo never pays for the C or Java indexes.
 */
export class RepoIndex {
  readonly pathSet: Set<string>
  readonly dirSet: Set<string>
  private noExt?: Map<string, string[]>
  private children?: Map<string, string[]>
  private basenames?: Map<string, string[]>
  private stems?: Map<string, string[]>
  private lowerPaths?: Map<string, string>
  private readonly cache = new Map<string, unknown>()

  constructor(
    readonly paths: string[],
    readonly files: Record<string, string>,
  ) {
    this.pathSet = new Set(paths)
    const dirs = new Set<string>([''])
    for (const p of paths) {
      let i = p.lastIndexOf('/')
      while (i > 0) {
        const d = p.slice(0, i)
        if (dirs.has(d)) break
        dirs.add(d)
        i = d.lastIndexOf('/')
      }
    }
    this.dirSet = dirs
  }

  has(path: string): boolean {
    return this.pathSet.has(path)
  }

  isDir(path: string): boolean {
    return this.dirSet.has(path)
  }

  content(path: string): string | undefined {
    const c = this.files[path]
    return typeof c === 'string' ? c : undefined
  }

  /** Files whose path minus its last extension equals `base` ("src/a" → ["src/a.ts", "src/a.css"]). */
  withoutExt(base: string): string[] {
    if (!this.noExt) {
      const m = new Map<string, string[]>()
      for (const p of this.paths) {
        const slash = p.lastIndexOf('/')
        const dot = p.lastIndexOf('.')
        if (dot <= slash + 1) continue
        push(m, p.slice(0, dot), p)
      }
      this.noExt = m
    }
    return this.noExt.get(base) ?? []
  }

  /** Direct child files of a folder. */
  filesIn(dir: string): string[] {
    if (!this.children) {
      const m = new Map<string, string[]>()
      for (const p of this.paths) push(m, dirname(p), p)
      this.children = m
    }
    return this.children.get(dir) ?? []
  }

  /** Every file with this exact base name, anywhere. */
  byBasename(name: string): string[] {
    if (!this.basenames) {
      const m = new Map<string, string[]>()
      for (const p of this.paths) push(m, basename(p), p)
      this.basenames = m
    }
    return this.basenames.get(name) ?? []
  }

  /** Every file whose base name minus its last extension is `stem` ("User" → "app/User.php", "src/User.java"). */
  byStem(stem: string): string[] {
    if (!this.stems) {
      const m = new Map<string, string[]>()
      for (const p of this.paths) {
        const b = basename(p)
        const dot = b.lastIndexOf('.')
        push(m, dot > 0 ? b.slice(0, dot) : b, p)
      }
      this.stems = m
    }
    return this.stems.get(stem) ?? []
  }

  /** Case-insensitive exact path lookup. */
  findInsensitive(path: string): string | undefined {
    if (this.has(path)) return path
    if (!this.lowerPaths) {
      const m = new Map<string, string>()
      for (const p of this.paths) {
        const k = p.toLowerCase()
        if (!m.has(k)) m.set(k, p)
      }
      this.lowerPaths = m
    }
    return this.lowerPaths.get(path.toLowerCase())
  }

  /** Nearest ancestor folder of `from` (its own folder first, then up to the root) for which `test` is true. */
  nearest(from: string, test: (dir: string) => boolean): string | null {
    let dir = dirname(from)
    for (;;) {
      if (test(dir)) return dir
      if (!dir) return null
      dir = dirname(dir)
    }
  }

  /** Memoize per-repo derived data under a key. */
  memo<T>(key: string, build: () => T): T {
    if (this.cache.has(key)) return this.cache.get(key) as T
    const v = build()
    this.cache.set(key, v)
    return v
  }
}

function push(m: Map<string, string[]>, k: string, v: string): void {
  const list = m.get(k)
  if (list) list.push(v)
  else m.set(k, [v])
}

// ─────────────────────────────────────────────────────────────────────────────
// Result helpers
// ─────────────────────────────────────────────────────────────────────────────

export const UNRESOLVED: ResolvedImport = { type: 'unresolved' }

/** Internal result, de-duplicated and never pointing back at the importing file itself. */
export function internal(paths: string[], fromPath?: string): ResolvedImport {
  const out = [...new Set(paths)].filter((p) => p !== fromPath)
  return { type: 'internal', paths: out }
}

export function external(packageName: string): ResolvedImport {
  return packageName ? { type: 'external', packageName } : UNRESOLVED
}

export function builtin(name: string): ResolvedImport {
  return { type: 'builtin', name }
}

/** Number of leading path segments two paths share (used to prefer the candidate closest to the importer). */
export function sharedPrefix(a: string, b: string): number {
  const x = a.split('/')
  const y = b.split('/')
  let n = 0
  while (n < x.length && n < y.length && x[n] === y[n]) n++
  return n
}

/** Sort candidates so those closest to `from` come first (then shallower, then alphabetical). */
export function byCloseness(from: string, candidates: string[]): string[] {
  return [...candidates].sort(
    (a, b) =>
      sharedPrefix(from, b) - sharedPrefix(from, a) ||
      a.split('/').length - b.split('/').length ||
      (a < b ? -1 : a > b ? 1 : 0),
  )
}

export function isRelative(spec: string): boolean {
  return spec === '.' || spec === '..' || spec.startsWith('./') || spec.startsWith('../')
}

/** Resolve a path relative to the importing file's folder (leading "/" = repo root). */
export function relativeTo(fromPath: string, spec: string): string {
  if (spec.startsWith('/')) return joinPath(spec)
  return joinPath(dirname(fromPath), spec)
}

/** Lenient JSON-with-comments parser (tsconfig.json, jsconfig.json …). Returns null when unparseable. */
export function parseJsonc(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    // fall through to the tolerant path
  }
  const stripped = stripComments(text.replace(/^﻿/, ''), 'JSON')
  // Remove trailing commas outside strings.
  let out = ''
  let inString = false
  for (let i = 0; i < stripped.length; i++) {
    const c = stripped[i]
    if (inString) {
      out += c
      if (c === '\\') {
        out += stripped[i + 1] ?? ''
        i++
      } else if (c === '"') inString = false
      continue
    }
    if (c === '"') {
      inString = true
      out += c
      continue
    }
    if (c === ',') {
      let j = i + 1
      while (j < stripped.length && /\s/.test(stripped[j])) j++
      if (stripped[j] === '}' || stripped[j] === ']') continue
    }
    out += c
  }
  try {
    return JSON.parse(out)
  } catch {
    return null
  }
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
