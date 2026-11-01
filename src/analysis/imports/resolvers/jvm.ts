import { dirname } from '@/core/paths'
import type { RawImport } from '@/core/types'
import type { ResolvedImport } from '../../resolve'
import { maskSource } from '../../strip'
import { UNRESOLVED, builtin, byCloseness, external, internal, type RepoIndex } from './repo'

const JVM_EXT = /\.(?:java|kt|kts|scala|sc|groovy|gvy)$/
const BUILTIN_PREFIXES = ['java.', 'javax.', 'jdk.', 'sun.', 'com.sun.', 'kotlin.', 'scala.', 'groovy.', 'android.', 'dalvik.', 'org.w3c.dom', 'org.xml.sax', 'org.ietf.']
const TLDS = new Set(['com', 'org', 'net', 'io', 'dev', 'edu', 'gov', 'me', 'co', 'app', 'info', 'biz', 'uk', 'de', 'fr', 'nl', 'cn', 'jp', 'ru', 'br', 'ch', 'se', 'eu', 'us', 'ai', 'tech'])

/** Normalized external package name: drop class names, keep the organization + project part. */
export function jvmPackageName(spec: string): string {
  const segs = spec.replace(/\.\*$/, '').split('.')
  const pkg: string[] = []
  for (const s of segs) {
    if (/^[A-Z]/.test(s)) break
    pkg.push(s)
  }
  const n = TLDS.has(pkg[0] ?? '') ? 3 : 2
  const out = pkg.slice(0, n)
  return out.length ? out.join('.') : (segs[0] ?? spec)
}

interface JvmIndex {
  /** Fully-qualified name (package.Class, package.topLevelFunction) → files. */
  byFqn: Map<string, string[]>
  /** Package name → files declaring it. */
  byPackage: Map<string, string[]>
  /** First two package segments of every package the repo declares or lays out (to tell internal from external). */
  roots: Set<string>
}

function push(m: Map<string, string[]>, k: string, v: string): void {
  const l = m.get(k)
  if (l) {
    if (!l.includes(v)) l.push(v)
  } else m.set(k, [v])
}

export class JvmResolver {
  constructor(private readonly repo: RepoIndex) {}

  private index(): JvmIndex {
    return this.repo.memo('jvm-index', () => {
      const byFqn = new Map<string, string[]>()
      const byPackage = new Map<string, string[]>()
      const roots = new Set<string>()
      for (const p of this.repo.paths) {
        if (!JVM_EXT.test(p)) continue
        const layout = /(?:^|\/)src\/(?:main|test|androidTest|commonMain|jvmMain|[\w-]+)\/(?:java|kotlin|scala|groovy)\/(.+)\/[^/]+$/.exec(p)
        if (layout) {
          const segs = layout[1].split('/')
          if (segs.length >= 2) roots.add(segs.slice(0, 2).join('.'))
        }
        const text = this.repo.content(p)
        if (text === undefined) continue
        const { code } = maskSource(text.length > 400_000 ? text.slice(0, 400_000) : text, p.endsWith('.java') ? 'Java' : 'Kotlin')
        const pkg = /^[ \t]*package\s+([\w.]+)/m.exec(code)?.[1] ?? ''
        if (pkg) {
          push(byPackage, pkg, p)
          roots.add(pkg.split('.').slice(0, 2).join('.'))
        }
        const stem = /([^/]+?)\.[^.]+$/.exec(p)?.[1] ?? ''
        if (stem) push(byFqn, pkg ? `${pkg}.${stem}` : stem, p)
        // Top-level declarations (Kotlin/Scala files can hold many; Java files can hold extra package-private types).
        for (const m of code.matchAll(
          /^(?:(?:public|private|internal|protected|open|abstract|sealed|data|final|inline|value|annotation|enum|case|static|expect|actual)\s+)*(?:class|interface|object|enum|record|trait|typealias|fun|val|var|def)\s+(?:<[^>]*>\s*)?(?:[\w.]+\.)?([A-Za-z_]\w*)/gm,
        )) {
          push(byFqn, pkg ? `${pkg}.${m[1]}` : m[1], p)
        }
      }
      return { byFqn, byPackage, roots }
    })
  }

  private isBuiltin(spec: string): boolean {
    return BUILTIN_PREFIXES.some((b) => spec.startsWith(b) || spec === b.replace(/\.$/, ''))
  }

  private isInternalRoot(spec: string): boolean {
    const root = spec.split('.').slice(0, 2).join('.')
    return this.index().roots.has(root)
  }

  resolve(fromPath: string, imp: RawImport): ResolvedImport {
    const spec = imp.specifier.trim().replace(/\s+/g, '')
    if (!spec) return UNRESOLVED
    const idx = this.index()
    const wildcard = spec.endsWith('.*')
    const path = wildcard ? spec.slice(0, -2) : spec

    if (wildcard) {
      const files = idx.byPackage.get(path) ?? this.filesInPackageDir(path)
      if (files.length) return internal(files, fromPath)
      // "import com.x.Outer.*" (static members of a class).
      const cls = this.findClass(path)
      if (cls.length) return internal(cls, fromPath)
    } else {
      const segs = path.split('.')
      for (let k = segs.length; k >= 2; k--) {
        const hit = this.findClass(segs.slice(0, k).join('.'))
        if (hit.length) return internal(hit, fromPath)
      }
      // Kotlin top-level function/property in a known package whose file we didn't download.
      const pkg = segs.slice(0, -1).join('.')
      const pkgFiles = idx.byPackage.get(pkg) ?? []
      if (pkgFiles.length === 1) return internal(pkgFiles, fromPath)
    }
    if (this.isBuiltin(spec)) return builtin(spec.split('.').slice(0, 2).join('.'))
    return external(jvmPackageName(spec))
  }

  /** Files for a fully-qualified class name: declared index first, then path-suffix matching. */
  private findClass(fqn: string): string[] {
    const idx = this.index()
    const declared = idx.byFqn.get(fqn)
    if (declared?.length) return declared
    const segs = fqn.split('.')
    const cls = segs[segs.length - 1] ?? ''
    if (!cls) return []
    const suffix = segs.join('/')
    const candidates = this.repo.byStem(cls).filter((p) => JVM_EXT.test(p))
    const exact = candidates.filter((p) => p.replace(/\.[^.]+$/, '').endsWith(`/${suffix}`) || p.replace(/\.[^.]+$/, '') === suffix)
    if (exact.length) return exact
    // Package folders partially present (e.g. Kotlin projects that flatten package dirs).
    if (!this.isInternalRoot(fqn) || !/^[A-Z]/.test(cls)) return []
    const pkgSegs = segs.slice(0, -1)
    let best: string[] = []
    let bestScore = 0
    for (const c of candidates) {
      const dirSegs = dirname(c).split('/')
      let score = 0
      for (let i = pkgSegs.length - 1, j = dirSegs.length - 1; i >= 0 && j >= 0 && pkgSegs[i] === dirSegs[j]; i--, j--) score++
      if (score > bestScore) {
        bestScore = score
        best = [c]
      } else if (score === bestScore && score > 0) best.push(c)
    }
    if (best.length) return best
    return candidates.length === 1 ? candidates : []
  }

  private filesInPackageDir(pkg: string): string[] {
    return this.repo.memo(`jvm-pkgdir:${pkg}`, () => this.scanPackageDir(pkg))
  }

  private scanPackageDir(pkg: string): string[] {
    const suffix = `/${pkg.replace(/\./g, '/')}`
    const out: string[] = []
    for (const d of this.repo.dirSet) {
      if (`/${d}`.endsWith(suffix)) out.push(...this.repo.filesIn(d).filter((p) => JVM_EXT.test(p)))
    }
    return byCloseness('', out)
  }
}
