import { basename, dirname, joinPath } from '@/core/paths'
import type { RawImport } from '@/core/types'
import type { ResolvedImport } from '../../resolve'
import { C_STD_HEADERS, SWIFT_FRAMEWORKS } from './builtins'
import { UNRESOLVED, builtin, byCloseness, external, internal, type RepoIndex } from './repo'

/** C / C++ / Objective-C includes. */
export class CResolver {
  constructor(private readonly repo: RepoIndex) {}

  /** Include search folders: every include/ and inc/ folder, src/, and the repo root. */
  private roots(): string[] {
    return this.repo.memo('c-roots', () => {
      const out = ['', 'src']
      for (const d of this.repo.dirSet) {
        const b = basename(d)
        if (b === 'include' || b === 'inc' || b === 'includes' || b === 'headers') out.push(d)
      }
      return [...new Set(out)].filter((d) => d === '' || this.repo.isDir(d))
    })
  }

  private find(fromPath: string, spec: string, allowRelative: boolean): string | null {
    const repo = this.repo
    if (allowRelative) {
      const rel = joinPath(dirname(fromPath), spec)
      if (repo.has(rel)) return rel
      // Parent folders of the importing file (common for "#include "module/x.h"" from deeper files).
      let d = dirname(fromPath)
      while (d) {
        d = dirname(d)
        const p = joinPath(d, spec)
        if (repo.has(p)) return p
      }
    }
    for (const root of this.roots()) {
      const p = joinPath(root, spec)
      if (repo.has(p)) return p
    }
    // Suffix match anywhere ("mylib/foo.h" → "libs/mylib/include/mylib/foo.h"), closest to the importer.
    const name = basename(spec)
    const candidates = repo.byBasename(name).filter((p) => p === spec || p.endsWith(`/${spec}`))
    if (candidates.length && (spec.includes('/') || allowRelative || candidates.length === 1)) {
      return byCloseness(fromPath, candidates)[0] ?? null
    }
    return null
  }

  resolve(fromPath: string, imp: RawImport): ResolvedImport {
    const spec = imp.specifier.trim()
    if (!spec) return UNRESOLVED
    if (imp.kind === 'module') {
      // Objective-C @import Module;
      return builtin(spec.split('.')[0] ?? spec)
    }
    const system = imp.kind === 'include-system'
    if (system && C_STD_HEADERS.has(spec)) return builtin(spec)
    const hit = this.find(fromPath, spec, !system)
    if (hit) return internal([hit], fromPath)
    if (!system) return UNRESOLVED
    if (/^(?:sys|bits|linux|asm|mach|netinet|arpa|net)\//.test(spec)) return builtin(spec)
    const first = spec.split('/')[0] ?? spec
    return external(first.replace(/\.(?:h|hh|hpp|hxx)$/, ''))
  }
}

/** Swift modules: Apple frameworks are builtin; SwiftPM targets (Sources/<Name>) are internal. */
export class SwiftResolver {
  constructor(private readonly repo: RepoIndex) {}

  resolve(fromPath: string, imp: RawImport): ResolvedImport {
    const mod = imp.specifier.trim().split('.')[0] ?? ''
    if (!mod) return UNRESOLVED
    if (SWIFT_FRAMEWORKS.has(mod)) return builtin(mod)
    const dir = this.moduleDir(mod)
    if (dir !== null) {
      const preferred = [`${dir}/${mod}.swift`, `${dir}/main.swift`, `${dir}/${mod}App.swift`].find((p) => this.repo.has(p))
      if (preferred) return internal([preferred], fromPath)
      const files = this.repo.filesIn(dir).filter((p) => p.endsWith('.swift')).sort()
      if (files.length) return internal([files[0]], fromPath)
      const deeper = this.repo.paths.filter((p) => p.startsWith(`${dir}/`) && p.endsWith('.swift')).sort()
      if (deeper.length) return internal([deeper[0]], fromPath)
    }
    return external(mod)
  }

  private moduleDir(mod: string): string | null {
    return this.repo.memo(`swift-mod:${mod}`, () => {
      for (const d of this.repo.dirSet) {
        if (basename(d) !== mod) continue
        const parent = basename(dirname(d))
        if (parent === 'Sources' || parent === 'Tests' || dirname(d) === '' || parent === 'Packages') return d
      }
      return null
    })
  }
}
