/** Tiny POSIX path helpers for repo-relative paths (no leading slash). */

export function basename(path: string): string {
  const i = path.lastIndexOf('/')
  return i === -1 ? path : path.slice(i + 1)
}

export function dirname(path: string): string {
  const i = path.lastIndexOf('/')
  return i === -1 ? '' : path.slice(0, i)
}

/** Lower-case extension without the dot. "a/b.test.TS" → "ts"; "Makefile" → ""; ".env" → "" */
export function extname(path: string): string {
  const name = basename(path)
  const i = name.lastIndexOf('.')
  if (i <= 0) return ''
  return name.slice(i + 1).toLowerCase()
}

/** Join and normalize segments, resolving "." and "..". Never returns a leading slash. */
export function joinPath(...parts: string[]): string {
  const out: string[] = []
  for (const part of parts) {
    for (const seg of part.split('/')) {
      if (!seg || seg === '.') continue
      if (seg === '..') out.pop()
      else out.push(seg)
    }
  }
  return out.join('/')
}

/** Number of folders deep a path is. "a.ts" → 0, "src/a.ts" → 1 */
export function depthOf(path: string): number {
  let n = 0
  for (const ch of path) if (ch === '/') n++
  return n
}

/** All ancestor folders of a path, nearest last. "a/b/c.ts" → ["a", "a/b"] */
export function ancestors(path: string): string[] {
  const parts = path.split('/')
  const out: string[] = []
  for (let i = 1; i < parts.length; i++) out.push(parts.slice(0, i).join('/'))
  return out
}
