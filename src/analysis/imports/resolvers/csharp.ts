import type { RawImport } from '@/core/types'
import type { ResolvedImport } from '../../resolve'
import { maskSource } from '../../strip'
import { UNRESOLVED, builtin, external, internal, type RepoIndex } from './repo'

const MAX_NAMESPACE_FILES = 25

interface CsIndex {
  /** Namespace → files declaring it. */
  byNamespace: Map<string, string[]>
  /** File → type names it declares (class/record/struct/interface/enum/delegate), plus its file stem. */
  typesByFile: Map<string, string[]>
  /** First segment of every namespace declared in the repo. */
  roots: Set<string>
}

/** External NuGet-style name: two segments ("Newtonsoft.Json", "Microsoft.EntityFrameworkCore"). */
export function csharpPackageName(ns: string): string {
  return ns.split('.').slice(0, 2).join('.')
}

export class CsharpResolver {
  private words = new Map<string, Set<string>>()

  constructor(private readonly repo: RepoIndex) {}

  private index(): CsIndex {
    return this.repo.memo('cs-index', () => {
      const byNamespace = new Map<string, string[]>()
      const typesByFile = new Map<string, string[]>()
      const roots = new Set<string>()
      for (const p of this.repo.paths) {
        if (!p.endsWith('.cs')) continue
        const text = this.repo.content(p)
        if (text === undefined) continue
        const { code } = maskSource(text.length > 400_000 ? text.slice(0, 400_000) : text, 'C#')
        for (const m of code.matchAll(/^[ \t]*namespace\s+([\w.]+)/gm)) {
          const list = byNamespace.get(m[1])
          if (list) list.push(p)
          else byNamespace.set(m[1], [p])
          roots.add(m[1].split('.')[0] ?? m[1])
        }
        const types = [/([^/]+)\.cs$/.exec(p)?.[1] ?? '']
        for (const m of code.matchAll(/\b(?:class|record|struct|interface|enum|delegate\s+\w+(?:<[^>]*>)?)\s+([A-Z]\w*)/g)) types.push(m[1])
        typesByFile.set(p, [...new Set(types.filter(Boolean))])
      }
      return { byNamespace, typesByFile, roots }
    })
  }

  private wordsOf(path: string): Set<string> {
    const cached = this.words.get(path)
    if (cached) return cached
    const text = this.repo.content(path) ?? ''
    const { code } = maskSource(text, 'C#')
    const set = new Set(code.match(/[A-Z]\w*/g) ?? [])
    this.words.set(path, set)
    return set
  }

  resolve(fromPath: string, imp: RawImport): ResolvedImport {
    const ns = imp.specifier.trim()
    if (!ns) return UNRESOLVED
    const idx = this.index()
    let files = idx.byNamespace.get(ns) ?? []
    // `using static X.Y.Klass;` names a type, not a namespace.
    if (!files.length && imp.kind === 'static') {
      const parts = ns.split('.')
      const cls = parts.pop() ?? ''
      files = (idx.byNamespace.get(parts.join('.')) ?? []).filter((f) => idx.typesByFile.get(f)?.includes(cls))
    }
    if (!files.length) files = this.folderMatch(ns)
    if (files.length) {
      // Keep only files whose types this file actually mentions; otherwise the whole (capped) namespace.
      const words = this.wordsOf(fromPath)
      const used = files.filter((f) => (idx.typesByFile.get(f) ?? [/([^/]+)\.cs$/.exec(f)?.[1] ?? '']).some((t) => words.has(t)))
      return internal((used.length ? used : files).slice(0, MAX_NAMESPACE_FILES), fromPath)
    }
    if (ns === 'System' || ns.startsWith('System.')) return builtin(ns.split('.').slice(0, 2).join('.'))
    if (idx.roots.has(ns.split('.')[0] ?? '')) return UNRESOLVED
    return external(csharpPackageName(ns))
  }

  /** Folders whose path spells the namespace ("MyApp/Services", "src/MyApp.Services", "MyApp.Core/Models"). */
  private folderMatch(ns: string): string[] {
    return this.repo.memo(`cs-folder:${ns}`, () => this.scanFolders(ns))
  }

  private scanFolders(ns: string): string[] {
    const segs = ns.split('.')
    const suffixes = new Set<string>()
    for (let k = 0; k < segs.length; k++) {
      const head = segs.slice(0, k + 1).join('.')
      const tail = segs.slice(k + 1).join('/')
      suffixes.add(tail ? `${head}/${tail}` : head)
    }
    // Also allow the project folder to be omitted ("Services" under the project root named like the first segment).
    const out: string[] = []
    for (const d of this.repo.dirSet) {
      if (!d) continue
      for (const s of suffixes) {
        if (d === s || d.endsWith(`/${s}`)) {
          out.push(...this.repo.filesIn(d).filter((p) => p.endsWith('.cs')))
          break
        }
      }
    }
    return [...new Set(out)].sort()
  }
}
