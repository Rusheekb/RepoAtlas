import type { AnalyzedFile } from '@/core/types'
import { stripComments } from '../strip'

/** Languages where classes in the same package (folder) use each other without import statements. */
const SAME_PACKAGE_LANGUAGES = new Set(['Java', 'Kotlin', 'Scala', 'Groovy'])
const IDENT = /[A-Za-z_$][\w$]*/g
const MAX_GROUP = 400

/**
 * Java/Kotlin/Scala/Groovy files in the same folder share a package, so they can use each other's classes with no
 * `import` line at all (e.g. a Spring controller using the `Greeting` class next to it). Add an internal import when a
 * file mentions a same-folder file's class name (its file name) as a whole identifier outside comments.
 * Mutates `imports` on the given files; returns how many links were added.
 */
export function addSamePackageImports(files: Record<string, AnalyzedFile>, contents: Record<string, string>): number {
  const byDir = new Map<string, AnalyzedFile[]>()
  for (const f of Object.values(files)) {
    if (!f.fetched || !f.language || !SAME_PACKAGE_LANGUAGES.has(f.language)) continue
    const group = byDir.get(f.dir)
    if (group) group.push(f)
    else byDir.set(f.dir, [f])
  }
  let added = 0
  for (const group of byDir.values()) {
    if (group.length < 2 || group.length > MAX_GROUP) continue
    const named = group
      .map((f) => ({ f, cls: f.name.replace(/\.[^.]+$/, '') }))
      .filter((x) => /^[A-Za-z_$][\w$]*$/.test(x.cls))
    for (const a of group) {
      const text = contents[a.path]
      if (!text) continue
      const idents = new Set(stripComments(text, a.language ?? '').match(IDENT) ?? [])
      for (const { f: b, cls } of named) {
        if (b === a || !idents.has(cls) || a.imports.includes(b.path)) continue
        a.imports.push(b.path)
        added++
      }
    }
  }
  return added
}
