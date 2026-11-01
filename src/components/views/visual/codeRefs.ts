/** Turning file mentions in tour text (`app.py`, `./src/app.py:12`) into real repo paths. */
import { normalizeCodeRef } from '@/components/shell/urls'
import { basename, dirname } from '@/core/paths'

/**
 * Build a resolver for inline-code mentions: an exact repo path wins; otherwise a bare file name resolves when only
 * one file has that name, or when one of them sits in `nearDir` (the folder of the file the step is about).
 */
export function makeCodeRefResolver(paths: Iterable<string>): (code: string, nearDir?: string | null) => string | null {
  const known = new Set<string>()
  const byName = new Map<string, string[]>()
  for (const p of paths) {
    known.add(p)
    const name = basename(p)
    const list = byName.get(name)
    if (list) list.push(p)
    else byName.set(name, [p])
  }
  return (code, nearDir) => {
    const ref = normalizeCodeRef(code)
    if (!ref || /\s/.test(ref)) return null
    if (known.has(ref)) return ref
    if (ref.includes('/')) {
      // "flask/app.py" written relative to a source folder: accept a single path that ends with it.
      const matches = [...(byName.get(basename(ref)) ?? [])].filter((p) => p.endsWith(`/${ref}`))
      return matches.length === 1 ? matches[0] : null
    }
    const candidates = byName.get(ref)
    if (!candidates?.length) return null
    if (candidates.length === 1) return candidates[0]
    if (nearDir != null) {
      const near = candidates.filter((p) => dirname(p) === nearDir)
      if (near.length === 1) return near[0]
    }
    return null
  }
}
