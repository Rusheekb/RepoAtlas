import { dirname, joinPath } from '@/core/paths'

/**
 * Small, dependency-free URL builders for links to GitHub. (The GitHub module has its own versions; these are kept
 * local so the shell never depends on files that are being edited elsewhere.)
 */

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** Encode each segment of a slash-separated path, tolerating segments that are already percent-encoded. */
export function encodeSegments(path: string): string {
  return path
    .split('/')
    .filter((s) => s.length > 0)
    .map((s) => encodeURIComponent(safeDecode(s)))
    .join('/')
}

function repoBase(owner: string, repo: string): string {
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
}

/** Direct download URL for a file at a commit: https://raw.githubusercontent.com/o/r/sha/path */
export function rawUrl(owner: string, repo: string, sha: string, path: string): string {
  return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeSegments(sha)}/${encodeSegments(path)}`
}

/** "Open on GitHub" link for a file, optionally at a line: https://github.com/o/r/blob/ref/path#L10 */
export function blobUrl(owner: string, repo: string, ref: string, path: string, line?: number): string {
  const base = `${repoBase(owner, repo)}/blob/${encodeSegments(ref)}/${encodeSegments(path)}`
  return line != null && Number.isInteger(line) && line > 0 ? `${base}#L${line}` : base
}

/** "Open on GitHub" link for a folder ('' = the repository root at that ref). */
export function treeUrl(owner: string, repo: string, ref: string, path: string): string {
  const base = `${repoBase(owner, repo)}/tree/${encodeSegments(ref)}`
  const clean = encodeSegments(path)
  return clean ? `${base}/${clean}` : base
}

/** True only for absolute http(s) URLs that parse. Everything else (javascript:, data:, mailto: …) is rejected. */
export function isSafeHttpUrl(url: string | null | undefined): url is string {
  if (!url) return false
  const trimmed = url.trim()
  if (!/^https?:\/\//i.test(trimmed)) return false
  try {
    const u = new URL(trimmed)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/** Returns the URL if it is a safe http(s) URL, otherwise null. */
export function safeHttpUrl(url: string | null | undefined): string | null {
  return isSafeHttpUrl(url) ? url.trim() : null
}

const GITHUB_FILE_RE = /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/i

export interface ReadmeResolverOptions {
  owner: string
  repo: string
  /** Commit SHA (or ref) the README was read at. */
  sha: string
  /** Repo path of the README, e.g. "docs/README.md". Relative links resolve against its folder. */
  readmePath: string
}

/**
 * Build a `resolveUrl` for <Markdown> that makes a README's relative links and images work outside GitHub:
 *  - images → raw.githubusercontent.com/{owner}/{repo}/{sha}/{dir}/{path}
 *  - links  → github.com/{owner}/{repo}/blob/{sha}/{dir}/{path}
 *  - absolute http(s) URLs pass through (github.com blob/raw image URLs are rewritten to raw downloads)
 *  - "//host/x" becomes https://host/x
 *  - in-page "#anchors" and every non-http(s) scheme (mailto:, javascript:, data: …) are dropped (null)
 */
export function makeReadmeResolver(opts: ReadmeResolverOptions): (url: string, kind: 'link' | 'image') => string | null {
  const { owner, repo, sha, readmePath } = opts
  const dir = dirname(readmePath)
  return (input, kind) => {
    const url = input.trim()
    if (!url) return null
    if (url.startsWith('//')) return safeHttpUrl(`https:${url}`)
    if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
      const safe = safeHttpUrl(url)
      if (!safe) return null
      if (kind === 'image') {
        const m = GITHUB_FILE_RE.exec(safe.split(/[?#]/, 1)[0])
        if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`
      }
      return safe
    }
    if (url.startsWith('#')) return null

    const hashAt = url.indexOf('#')
    const hash = hashAt === -1 ? '' : url.slice(hashAt + 1)
    const pathPart = (hashAt === -1 ? url : url.slice(0, hashAt)).split('?', 1)[0]
    const resolved = joinPath(pathPart.startsWith('/') ? '' : dir, safeDecode(pathPart))
    if (!resolved) return kind === 'link' ? treeUrl(owner, repo, sha, '') : null
    if (kind === 'image') return rawUrl(owner, repo, sha, resolved)
    const link = blobUrl(owner, repo, sha, resolved)
    return hash ? `${link}#${encodeURIComponent(safeDecode(hash))}` : link
  }
}

/** Normalize a path-ish string Claude or a README might write ("./src/a.ts", "/src/a.ts:12") to a repo path. */
export function normalizeCodeRef(code: string): string {
  let s = code.trim()
  s = s.replace(/^\.\//, '').replace(/^\/+/, '')
  // Trailing ":12" / ":12-30" / "#L12" line references.
  s = s.replace(/(?::\d+(?:-\d+)?|#L\d+(?:-L?\d+)?)$/, '')
  return s
}
