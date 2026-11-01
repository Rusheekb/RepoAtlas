import type { RepoRef } from '@/core/types'

/** GitHub user / org names: 1–39 letters, digits or hyphens, never starting with a hyphen. */
const OWNER_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/
/** Repository names: letters, digits, '.', '_' and '-' (max 100). "." and ".." are not allowed. */
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/

/**
 * First path segments on github.com that are GitHub's own pages, not user or organization names
 * (GitHub reserves these, so no real account can have them).
 */
const RESERVED_OWNERS = new Set([
  'about',
  'account',
  'apps',
  'blog',
  'codespaces',
  'collections',
  'contact',
  'customer-stories',
  'dashboard',
  'enterprise',
  'events',
  'explore',
  'features',
  'gist',
  'issues',
  'join',
  'login',
  'logout',
  'marketplace',
  'new',
  'notifications',
  'orgs',
  'organizations',
  'pricing',
  'pulls',
  'readme',
  'search',
  'security',
  'sessions',
  'settings',
  'signup',
  'site',
  'sponsors',
  'stars',
  'team',
  'teams',
  'topics',
  'trending',
  'users',
])

/** github.com URL sections whose next path segment is a branch / tag / commit. */
const REF_SECTIONS = new Set(['tree', 'blob', 'commit', 'commits', 'raw', 'blame', 'edit', 'find'])

const GITHUB_HOSTS = new Set(['github.com', 'www.github.com'])

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** Remove one layer of wrapping a user might paste: <url>, "url", 'url', `url`, (url). */
function unwrap(s: string): string {
  const pairs: [string, string][] = [
    ['<', '>'],
    ['"', '"'],
    ["'", "'"],
    ['`', '`'],
    ['(', ')'],
    ['“', '”'],
    ['‘', '’'],
  ]
  let out = s
  for (let i = 0; i < 3; i++) {
    const pair = pairs.find(([open, close]) => out.length >= 2 && out.startsWith(open) && out.endsWith(close))
    if (!pair) break
    out = out.slice(pair[0].length, out.length - pair[1].length).trim()
  }
  return out
}

function stripGitSuffix(repo: string): string {
  return repo.toLowerCase().endsWith('.git') ? repo.slice(0, -4) : repo
}

function validOwner(owner: string): boolean {
  return OWNER_RE.test(owner) && !RESERVED_OWNERS.has(owner.toLowerCase())
}

function validRepo(repo: string): boolean {
  return REPO_RE.test(repo) && repo !== '.' && repo !== '..'
}

function cleanRef(raw: string | undefined): string | undefined {
  if (raw == null) return undefined
  const ref = safeDecode(raw).trim()
  return ref ? ref : undefined
}

/** How many path segments after /tree/ or /blob/ may still belong to a branch name ("release/1.x", "users/ann/fix"). */
export const MAX_REF_SEGMENTS = 6

/** Branch names that are almost never the start of a longer, slash-separated branch name. */
const WHOLE_BRANCH_NAMES = new Set([
  'main', 'master', 'develop', 'development', 'dev', 'trunk', 'stable', 'next', 'canary', 'staging', 'production', 'prod',
  'gh-pages', 'default', 'latest', 'head',
])

/** A first segment that is surely the whole ref: a common branch name, a commit SHA or a version tag like v1.2.3. */
function isWholeRef(first: string): boolean {
  return WHOLE_BRANCH_NAMES.has(first.toLowerCase()) || /^[0-9a-f]{7,40}$/i.test(first) || /^v?\d+(?:\.\d+)*(?:[-+.][\w.-]*)?$/i.test(first)
}

/**
 * The ref part of a github.com link's path ("…/tree/<these segments>"). A branch may itself contain slashes
 * ("release/1.x"), and the link does not say where the branch ends and the folder or file begins, so unless the first
 * segment is surely a whole ref, the first few segments are kept together ("release/1.x/src/dir"). Loading then tries
 * that, and its shorter beginnings, against GitHub (see refCandidates).
 * "refs/heads/<branch>" and "refs/tags/<tag>" lose their prefix.
 */
function refFromPath(segments: string[]): string | undefined {
  let segs = segments.map((x) => safeDecode(x).trim()).filter(Boolean)
  if (segs[0] === 'refs' && (segs[1] === 'heads' || segs[1] === 'tags') && segs.length > 2) segs = segs.slice(2)
  const first = segs[0]
  if (!first) return undefined
  if (segs.length === 1 || isWholeRef(first)) return first
  return segs.slice(0, MAX_REF_SEGMENTS).join('/')
}

/**
 * Refs to try, in order, for a ref taken from a pasted link: the whole thing first (a real "feature/x" branch costs
 * one request), then its beginnings from the shortest ("feature", "feature/x", …). Refs without a slash are tried as is.
 */
export function refCandidates(ref: string): string[] {
  const clean = ref.trim()
  if (!clean.includes('/')) return clean ? [clean] : []
  const segs = clean.split('/').filter(Boolean).slice(0, MAX_REF_SEGMENTS)
  const out = [segs.join('/')]
  for (let i = 1; i < segs.length; i++) out.push(segs.slice(0, i).join('/'))
  return [...new Set(out)]
}

/** Build the result from github.com-style path segments: owner / repo / [section / ref …]. */
function fromSegments(segments: string[]): RepoRef | null {
  if (segments.length < 2) return null
  const owner = safeDecode(segments[0])
  const repo = stripGitSuffix(safeDecode(segments[1]))
  if (!validOwner(owner) || !validRepo(repo)) return null

  let ref: string | undefined
  if (segments.length >= 4) {
    const section = segments[2].toLowerCase()
    if (section === 'commit') {
      ref = cleanRef(segments[3])
    } else if (REF_SECTIONS.has(section)) {
      ref = refFromPath(segments.slice(3))
    } else if (section === 'releases' && segments[3] === 'tag' && segments.length >= 5) {
      ref = refFromPath(segments.slice(4))
    }
  }

  return ref ? { owner, repo, ref } : { owner, repo }
}

/**
 * Parse what a user typed/pasted into a RepoRef. Must accept (case-insensitive host, trailing slashes, ".git", whitespace):
 *   "owner/repo"
 *   "github.com/owner/repo"
 *   "https://github.com/owner/repo"
 *   "https://github.com/owner/repo.git"
 *   "git@github.com:owner/repo.git"
 *   "https://github.com/owner/repo/tree/branch-name"            → ref "branch-name"
 *   "https://github.com/owner/repo/tree/feature/x/src/dir"       → ref "feature/x/src/dir" (the branch may contain
 *                                                                  slashes: loading tries it and "feature", "feature/x" …)
 *   "https://github.com/owner/repo/blob/main/src/index.ts"      → ref "main" (common branch names, SHAs and versions
 *                                                                  are taken as the whole ref)
 *   "https://github.com/owner/repo/commit/<sha>"                → ref "<sha>"
 *   "https://github.com/owner/repo?tab=readme"                  → ignore query/hash
 * Returns null when the input is not a GitHub repository reference.
 * Owner: 1–39 chars [A-Za-z0-9-]; repo: [A-Za-z0-9._-]+ (not "." or "..").
 *
 * Also understood: "owner/repo@ref", "ssh://git@github.com/owner/repo.git", "git://github.com/…",
 * "git+https://github.com/…", ".../releases/tag/v1.0" (→ ref "v1.0"), "https://api.github.com/repos/owner/repo",
 * "https://raw.githubusercontent.com/owner/repo/ref/path", and inputs wrapped in <…>, quotes or backticks.
 */
export function parseRepoInput(input: string): RepoRef | null {
  if (typeof input !== 'string') return null
  let s = unwrap(input.trim())
  if (!s || /\s/.test(s)) return null

  // SCP-style SSH: git@github.com:owner/repo.git
  const scp = /^(?:[A-Za-z0-9._-]+@)?(?:www\.)?github\.com:(?!\/\/)(?!\d+\/)(.+)$/i.exec(s)
  if (scp) {
    const path = scp[1].split(/[?#]/, 1)[0]
    return fromSegments(path.split('/').filter(Boolean))
  }

  // Scheme (https, http, ssh, git, git+https, git+ssh …).
  let hadScheme = false
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(s)
  if (scheme) {
    const name = scheme[1].toLowerCase()
    if (!['http', 'https', 'ssh', 'git', 'git+https', 'git+ssh', 'git+http'].includes(name)) return null
    hadScheme = true
    s = s.slice(scheme[0].length)
  }

  // Ignore query string and fragment.
  s = s.split(/[?#]/, 1)[0]

  const firstSlash = s.indexOf('/')
  let head = firstSlash === -1 ? s : s.slice(0, firstSlash)
  const rest = firstSlash === -1 ? '' : s.slice(firstSlash + 1)

  // Host-looking first segment ("github.com", "git@github.com", "github.com:443").
  const looksLikeHost = hadScheme || head.includes('.') || head.includes('@') || head.includes(':')
  if (!looksLikeHost) {
    // "owner/repo@ref" shorthand: everything after '@' is the ref (repo names can never contain '@').
    const atRef = s.indexOf('@')
    if (atRef !== -1) {
      const segments = s.slice(0, atRef).split('/').filter(Boolean)
      const ref = cleanRef(s.slice(atRef + 1))
      if (segments.length !== 2 || !ref) return null
      const base = fromSegments(segments)
      return base ? { ...base, ref } : null
    }
    // Bare "owner/repo[/tree/ref…]".
    return fromSegments(s.split('/').filter(Boolean))
  }

  // Drop userinfo ("git@") and port.
  const at = head.lastIndexOf('@')
  if (at !== -1) head = head.slice(at + 1)
  head = head.replace(/:\d*$/, '').toLowerCase()

  const segments = rest.split('/').filter(Boolean)

  if (GITHUB_HOSTS.has(head)) return fromSegments(segments)

  if (head === 'api.github.com') {
    if (segments[0]?.toLowerCase() !== 'repos') return null
    return fromSegments(segments.slice(1))
  }

  if (head === 'raw.githubusercontent.com') {
    if (segments.length < 2) return null
    // raw.githubusercontent.com/owner/repo/<ref>/<path> or …/refs/heads/<branch>/<path>
    const base = fromSegments(segments.slice(0, 2))
    if (!base) return null
    // The last segment is the file itself, never part of the branch.
    const ref = refFromPath(segments.slice(2, -1).length ? segments.slice(2, -1) : segments.slice(2))
    return ref ? { ...base, ref } : base
  }

  return null
}
