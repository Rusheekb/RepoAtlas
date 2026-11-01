import { clear, createStore, del, delMany, get, keys, set, update, type UseStore } from 'idb-keyval'
import { formatNumber, pluralize } from '@/core/format'
import type { AnalysisDepth, LoadProgress, RepoMeta, RepoRef, RepoSnapshot, SkipReason } from '@/core/types'
import { fetchRepoMeta, fetchTree, resolveCommit } from './api'
import { GitHubError, MESSAGES, throwIfAborted } from './errors'
import { fetchManyFiles } from './files'
import { refCandidates } from './parse'
import { selectFilesToFetch } from './select'
import { dict } from '@/core/dict'

export interface LoadSnapshotOptions {
  token?: string
  depth: AnalysisDepth
  onProgress?: (p: LoadProgress) => void
  signal?: AbortSignal
  /** Ignore the IndexedDB cache. */
  force?: boolean
  /**
   * Also keep private repositories (their files and commit lookups) in IndexedDB, so they survive closing the tab.
   * Off by default: private code then stays in this tab's memory only. The app turns it on with "Remember my keys".
   */
  persistPrivate?: boolean
}

/** A light summary of one cached snapshot (for "recently opened" lists). */
export interface CachedSnapshotInfo {
  key: string
  fullName: string
  ref: string
  commitSha: string
  depth: AnalysisDepth
  /** When the snapshot was downloaded (ms since epoch). */
  fetchedAt: number
  /** When it was last opened (ms since epoch). */
  usedAt: number
  fileCount: number
  /** A private repository (only ever stored when the user chose to remember their keys). Missing in older entries. */
  isPrivate?: boolean
}

const DB_NAME = 'repoatlas-snapshots'
const STORE_NAME = 'snapshots'
/** Bump when the RepoSnapshot shape changes so old cache entries are ignored. */
const CACHE_VERSION = 1
export const MAX_CACHED_SNAPSHOTS = 8
/** How long a (owner, repo, ref) → commit lookup is reused without asking GitHub again. */
export const REF_CACHE_TTL_MS = 10 * 60 * 1000

const INDEX_KEY = 'index'
const REFS_KEY = 'refs'
const snapKey = (key: string) => `snap:${key}`

interface StoredSnapshot {
  v: number
  snapshot: RepoSnapshot
}

interface RefCacheEntry {
  at: number
  meta: RepoMeta
  ref: string
  commitSha: string
}

// ─── Private repositories ─────────────────────────────────────────────────────
// Their snapshots and commit lookups live here, in this tab's memory, unless the caller passes persistPrivate.

const privateSnapshots = new Map<string, RepoSnapshot>()
const privateRefs = new Map<string, RefCacheEntry>()

function rememberPrivateSnapshot(key: string, snapshot: RepoSnapshot): void {
  privateSnapshots.delete(key)
  privateSnapshots.set(key, snapshot)
  while (privateSnapshots.size > MAX_CACHED_SNAPSHOTS) {
    const oldest = privateSnapshots.keys().next().value
    if (oldest === undefined) break
    privateSnapshots.delete(oldest)
  }
}

/**
 * A short, one-way fingerprint of the GitHub token ("anon" without one), so commit lookups made with a token are only
 * ever reused with that same token: a visitor without it can never open a private project from the cache.
 */
export async function tokenFingerprint(token: string | undefined): Promise<string> {
  const t = token?.trim()
  if (!t) return 'anon'
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`repoatlas:${t}`))
    return [...new Uint8Array(digest).slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    // No Web Crypto (very old browsers, insecure contexts): FNV-1a still separates tokens, it just isn't cryptographic.
    let h = 0x811c9dc5
    for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 0x01000193) >>> 0
    return `f${h.toString(16).padStart(8, '0')}`
  }
}

const SHA_RE = /^[0-9a-f]{40}$/i

// ─── Storage plumbing (every failure is swallowed: caching must never break a load) ──

let cachedStore: UseStore | null | undefined
/** Set when IndexedDB stops answering (some browsers can hang on open); caching is then skipped for this session. */
let storageUnresponsive = false
const READ_TIMEOUT_MS = 3000
const WRITE_TIMEOUT_MS = 8000

function getStore(): UseStore | null {
  if (storageUnresponsive) return null
  if (cachedStore !== undefined) return cachedStore
  try {
    cachedStore = typeof indexedDB === 'undefined' ? null : createStore(DB_NAME, STORE_NAME)
  } catch {
    cachedStore = null
  }
  return cachedStore
}

/** Resolve with `fallback` if `p` rejects or takes longer than `ms`. Never rejects. */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      storageUnresponsive = true
      resolve(fallback)
    }, ms)
    p.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      () => {
        clearTimeout(timer)
        resolve(fallback)
      },
    )
  })
}

async function safely<T>(fn: (store: UseStore) => Promise<T>, fallback: T, ms = READ_TIMEOUT_MS): Promise<T> {
  const store = getStore()
  if (!store) return fallback
  let attempt: Promise<T>
  try {
    attempt = fn(store)
  } catch {
    return fallback
  }
  return withTimeout(attempt, ms, fallback)
}

/** Cache key for a snapshot: lower-case "owner/repo", the commit and the analysis depth. */
export function snapshotCacheKey(owner: string, repo: string, commitSha: string, depth: AnalysisDepth): string {
  return `${`${owner}/${repo}`.toLowerCase()}@${commitSha}:${depth}`
}

function refCacheKey(owner: string, repo: string, ref: string | undefined, fingerprint: string): string {
  // Branch names are case-sensitive; owner and repo names are not.
  return `${`${owner}/${repo}`.toLowerCase()}@${ref ?? ''}#${fingerprint}`
}

function isRefEntry(v: unknown): v is RefCacheEntry {
  if (!v || typeof v !== 'object') return false
  const e = v as Partial<RefCacheEntry>
  return typeof e.at === 'number' && typeof e.ref === 'string' && typeof e.commitSha === 'string' && !!e.meta && typeof e.meta === 'object'
}

const isFresh = (entry: RefCacheEntry) => {
  const age = Date.now() - entry.at
  return age >= 0 && age < REF_CACHE_TTL_MS
}

/**
 * The remembered commit for (owner, repo, ref), looked up for this token's fingerprint (private repositories are only
 * stored under the token that opened them) and then under "anon" (public repositories, which anyone may reuse).
 */
async function readRefCache(owner: string, repo: string, ref: string | undefined, fingerprint: string): Promise<RefCacheEntry | null> {
  const own = refCacheKey(owner, repo, ref, fingerprint)
  const mem = privateRefs.get(own)
  if (mem && isFresh(mem)) return mem
  const keysToTry = fingerprint === 'anon' ? [own] : [own, refCacheKey(owner, repo, ref, 'anon')]
  return safely(async (store) => {
    const all = await get<Record<string, unknown>>(REFS_KEY, store)
    if (!all || typeof all !== 'object') return null
    for (const key of keysToTry) {
      if (!Object.hasOwn(all, key)) continue
      const entry = all[key]
      if (!isRefEntry(entry) || !isFresh(entry)) continue
      // Public lookups are shared; a private one must have been stored under this very token.
      if (entry.meta.isPrivate && key !== own) continue
      return entry
    }
    return null
  }, null)
}

async function writeRefCache(
  owner: string,
  repo: string,
  ref: string | undefined,
  fingerprint: string,
  entry: RefCacheEntry,
  persistPrivate: boolean,
): Promise<void> {
  const isPrivate = entry.meta.isPrivate
  const key = refCacheKey(owner, repo, ref, isPrivate ? fingerprint : 'anon')
  if (isPrivate) {
    privateRefs.set(key, entry)
    if (!persistPrivate) return
  }
  await safely(async (store) => {
    const now = Date.now()
    await update<Record<string, RefCacheEntry>>(
      REFS_KEY,
      (old) => {
        const next: Record<string, RefCacheEntry> = {}
        if (old && typeof old === 'object') {
          for (const [k, v] of Object.entries(old)) if (isRefEntry(v) && now - v.at < REF_CACHE_TTL_MS) next[k] = v
        }
        next[key] = entry
        return next
      },
      store,
    )
  }, undefined)
}

function isSnapshot(v: unknown): v is RepoSnapshot {
  if (!v || typeof v !== 'object') return false
  const s = v as Partial<RepoSnapshot>
  return (
    !!s.meta &&
    typeof s.commitSha === 'string' &&
    typeof s.ref === 'string' &&
    Array.isArray(s.tree) &&
    !!s.files &&
    typeof s.files === 'object' &&
    Array.isArray(s.skipped)
  )
}

function readIndex(v: unknown): CachedSnapshotInfo[] {
  return Array.isArray(v) ? v.filter((e): e is CachedSnapshotInfo => !!e && typeof e === 'object' && typeof e.key === 'string') : []
}

async function readSnapshot(key: string): Promise<RepoSnapshot | null> {
  return safely(async (store) => {
    const stored = await get<StoredSnapshot>(snapKey(key), store)
    if (!stored || stored.v !== CACHE_VERSION || !isSnapshot(stored.snapshot)) return null
    // Mark as most recently used (failure here is harmless).
    try {
      await update<CachedSnapshotInfo[]>(
        INDEX_KEY,
        (old) => {
          const list = readIndex(old)
          const i = list.findIndex((e) => e.key === key)
          if (i === -1) return [...list, summarize(key, stored.snapshot)]
          const [hit] = list.splice(i, 1)
          return [...list, { ...hit, usedAt: Date.now() }]
        },
        store,
      )
    } catch {
      /* ignore */
    }
    return stored.snapshot
  }, null)
}

function depthFromKey(key: string): AnalysisDepth {
  const d = key.slice(key.lastIndexOf(':') + 1)
  return d === 'quick' || d === 'deep' ? d : 'standard'
}

function summarize(key: string, snapshot: RepoSnapshot): CachedSnapshotInfo {
  return {
    key,
    fullName: snapshot.meta.fullName,
    ref: snapshot.ref,
    commitSha: snapshot.commitSha,
    depth: depthFromKey(key),
    fetchedAt: snapshot.fetchedAt,
    usedAt: Date.now(),
    fileCount: snapshot.tree.length,
    isPrivate: snapshot.meta.isPrivate === true,
  }
}

async function writeSnapshot(key: string, snapshot: RepoSnapshot): Promise<void> {
  await safely((store) => writeSnapshotTo(store, key, snapshot), undefined, WRITE_TIMEOUT_MS)
}

async function writeSnapshotTo(store: UseStore, key: string, snapshot: RepoSnapshot): Promise<void> {
  const value: StoredSnapshot = { v: CACHE_VERSION, snapshot }
  try {
    await set(snapKey(key), value, store)
  } catch {
    // Probably out of space: drop every other cached snapshot and try once more.
    try {
      const others = readIndex(await get(INDEX_KEY, store)).filter((e) => e.key !== key)
      await delMany(
        others.map((e) => snapKey(e.key)),
        store,
      )
      await set(INDEX_KEY, [], store)
      await set(snapKey(key), value, store)
    } catch {
      return
    }
  }

  try {
    let kept: CachedSnapshotInfo[] = []
    await update<CachedSnapshotInfo[]>(
      INDEX_KEY,
      (old) => {
        const list = readIndex(old).filter((e) => e.key !== key)
        list.push(summarize(key, snapshot))
        kept = list.slice(-MAX_CACHED_SNAPSHOTS)
        return kept
      },
      store,
    )
    // Evict everything not in the index: the oldest entries, plus any orphans left by an earlier failed write.
    const keep = new Set(kept.map((e) => snapKey(e.key)))
    const stale = (await keys(store)).filter((k): k is string => typeof k === 'string' && k.startsWith('snap:') && !keep.has(k))
    if (stale.length) await delMany(stale, store)
  } catch {
    /* ignore */
  }
}

/** Snapshots currently in the cache, most recently opened first. */
export async function listCachedSnapshots(): Promise<CachedSnapshotInfo[]> {
  const list = await safely(async (store) => readIndex(await get(INDEX_KEY, store)), [] as CachedSnapshotInfo[])
  // The index is kept in least- to most-recently-used order.
  return [...list].reverse()
}

/** Remove one cached snapshot by its key (see snapshotCacheKey). */
export async function removeCachedSnapshot(key: string): Promise<void> {
  privateSnapshots.delete(key)
  await safely(async (store) => {
    await del(snapKey(key), store)
    await update<CachedSnapshotInfo[]>(INDEX_KEY, (old) => readIndex(old).filter((e) => e.key !== key), store)
  }, undefined)
}

// ─── Loading ──────────────────────────────────────────────────────────────────

function report(onProgress: LoadSnapshotOptions['onProgress'], p: LoadProgress): void {
  if (!onProgress) return
  try {
    onProgress(p)
  } catch {
    /* a progress listener's bug must never break loading */
  }
}

/**
 * The commit for a ref. A ref from a pasted link may run on into a folder or file ("release/1.x/src/dir", because
 * branch names can contain slashes), so when the whole thing is not a branch, tag or commit, its beginnings are
 * tried in turn ("release", then "release/1.x" …). The ref that worked is returned with the commit.
 */
async function resolveRef(
  meta: RepoMeta,
  wanted: string,
  req: { token?: string; signal?: AbortSignal },
): Promise<{ ref: string; commitSha: string }> {
  if (SHA_RE.test(wanted)) return { ref: wanted, commitSha: wanted.toLowerCase() }
  const candidates = refCandidates(wanted)
  if (!candidates.length) candidates.push(wanted)
  let firstMiss: GitHubError | null = null
  for (const ref of candidates) {
    try {
      return { ref, commitSha: await resolveCommit(meta.owner, meta.repo, ref, req) }
    } catch (err) {
      // Only "no such ref" moves on to the next guess; rate limits, network trouble and the like stop here.
      if (!(err instanceof GitHubError) || err.kind !== 'not-found') throw err
      firstMiss ??= err
      throwIfAborted(req.signal)
    }
  }
  if (candidates.length > 1) {
    throw new GitHubError(
      'not-found',
      `We couldn't find a branch, tag or commit matching the start of “${wanted}” in ${meta.fullName}. Check the link, or open the project without choosing a branch.`,
      { detail: `Tried: ${candidates.join(', ')}` },
    )
  }
  throw firstMiss ?? new GitHubError('not-found', MESSAGES.notFound)
}

/**
 * Full ingestion: meta → resolve commit → tree → select → download files → RepoSnapshot.
 * Caches snapshots in IndexedDB (idb-keyval) keyed by `${owner}/${repo}@${commitSha}:${depth}` (lower-case owner/repo)
 * so revisiting is instant; keeps at most ~8 cached snapshots (evict oldest).
 * Reports friendly progress messages for each stage ("Finding the repository…", "Listing 1,204 files…",
 * "Reading 120 of 400 files…"). Throws GitHubError (kind 'empty' for repos with no files).
 *
 * The repository details and resolved commit for (owner, repo, ref) are also remembered for 10 minutes, so
 * reopening a project soon after costs no GitHub API requests at all. `force: true` skips both caches.
 * Private repositories are kept in this tab's memory only, unless `persistPrivate` is set, and their commit lookups
 * are tied to a fingerprint of the token that opened them (see forgetPrivateData).
 * Failed downloads are listed in `skipped` as 'fetch-failed' (or 'binary' for non-text content).
 */
export async function loadRepoSnapshot(ref: RepoRef, opts: LoadSnapshotOptions): Promise<RepoSnapshot> {
  const { token, depth, onProgress, signal, force } = opts
  const persistPrivate = opts.persistPrivate === true
  const owner = ref.owner?.trim() ?? ''
  const repo = ref.repo?.trim() ?? ''
  const wantedRef = ref.ref?.trim() || undefined
  if (!owner || !repo) {
    throw new GitHubError('invalid-input', 'Please enter a GitHub repository, like “facebook/react”.', {
      detail: `owner=${JSON.stringify(ref.owner)} repo=${JSON.stringify(ref.repo)}`,
    })
  }
  const req = { token: token?.trim() || undefined, signal }
  throwIfAborted(signal)
  const fingerprint = await tokenFingerprint(req.token)

  // 1. Repository details + the commit to read.
  // Only a lookup made with this same token (or a public one) is reused, so the cache never opens a private
  // project for someone who could not open it on GitHub.
  report(onProgress, { stage: 'meta', message: `Finding ${owner}/${repo} on GitHub…` })
  let resolved = force ? null : await readRefCache(owner, repo, wantedRef, fingerprint)
  throwIfAborted(signal)
  if (!resolved) {
    const meta = await fetchRepoMeta(owner, repo, req)
    throwIfAborted(signal)
    const found = await resolveRef(meta, wantedRef ?? meta.defaultBranch, req)
    throwIfAborted(signal)
    resolved = { at: Date.now(), meta, ref: found.ref, commitSha: found.commitSha }
    await writeRefCache(owner, repo, wantedRef, fingerprint, resolved, persistPrivate)
  }
  const { meta, commitSha } = resolved
  const refName = resolved.ref
  const keepInMemoryOnly = meta.isPrivate && !persistPrivate

  // 2. A snapshot of this exact commit we downloaded before?
  const key = snapshotCacheKey(meta.owner, meta.repo, commitSha, depth)
  if (!force) {
    let cached = meta.isPrivate ? (privateSnapshots.get(key) ?? null) : null
    if (!cached) {
      cached = await readSnapshot(key)
      throwIfAborted(signal)
      // Private code saved on disk earlier (by an older version, or before "Remember my keys" was turned off) moves
      // to memory and off the disk.
      if (cached && cached.meta.isPrivate && keepInMemoryOnly) {
        await removeCachedSnapshot(key)
        rememberPrivateSnapshot(key, cached)
      }
    }
    if (cached) {
      report(onProgress, { stage: 'files', message: 'Opening the copy saved from your last visit — no download needed.' })
      return cached
    }
  }

  // 3. The full file list.
  report(onProgress, { stage: 'tree', message: 'Listing every file in the project…' })
  const { tree, truncated } = await fetchTree(meta.owner, meta.repo, commitSha, req)
  throwIfAborted(signal)
  if (tree.length === 0) throw new GitHubError('empty', MESSAGES.empty, { detail: `No files in the tree at ${commitSha}` })

  // 4. Choose what to read.
  report(onProgress, {
    stage: 'tree',
    message: `Found ${pluralize(tree.length, 'file')}. Picking the most important ones to read…`,
  })
  const selection = selectFilesToFetch(tree, depth)
  const sizes = new Map(tree.map((e) => [e.path, e.size]))
  // Empty files need no download.
  const toDownload = selection.fetch.filter((path) => sizes.get(path) !== 0)
  let downloaded: Record<string, string> = dict<string>()

  // 5. Download.
  const skipped: { path: string; reason: SkipReason }[] = [...selection.skipped]
  let fetchFailures = 0
  if (toDownload.length > 0) {
    const total = toDownload.length
    const readingMessage = (done: number) => `Reading ${formatNumber(done)} of ${pluralize(total, 'file')}…`
    report(onProgress, { stage: 'files', message: readingMessage(0), done: 0, total })
    const result = await fetchManyFiles(
      { owner: meta.owner, repo: meta.repo, commitSha, token: req.token, isPrivate: meta.isPrivate, signal },
      toDownload,
      (done) => report(onProgress, { stage: 'files', message: readingMessage(done), done, total }),
    )
    throwIfAborted(signal)
    downloaded = result.files
    for (const path of result.failed) {
      const reason = result.failedReasons[path] ?? 'fetch-failed'
      if (reason === 'fetch-failed') fetchFailures++
      skipped.push({ path, reason })
    }
  }

  // Keep `files` in priority order (README first …), like the selection.
  const files: Record<string, string> = dict<string>()
  for (const path of selection.fetch) {
    if (sizes.get(path) === 0) files[path] = ''
    else if (Object.hasOwn(downloaded, path)) files[path] = downloaded[path]
  }

  const snapshot: RepoSnapshot = {
    meta,
    ref: refName,
    commitSha,
    tree,
    treeTruncated: truncated,
    files,
    skipped,
    fetchedAt: Date.now(),
  }

  // Don't remember a snapshot where many downloads failed (likely a flaky connection): next visit should retry.
  if (fetchFailures <= Math.max(2, toDownload.length * 0.1)) {
    if (keepInMemoryOnly) rememberPrivateSnapshot(key, snapshot)
    else await writeSnapshot(key, snapshot)
  }
  return snapshot
}

/** Remove all cached snapshots (Settings → "Clear cached data"). */
export async function clearSnapshotCache(): Promise<void> {
  privateSnapshots.clear()
  privateRefs.clear()
  await safely((store) => clear(store), undefined)
}

/**
 * Forget every private repository this browser remembers: the copies in memory, plus any saved on disk
 * (snapshots and commit lookups). Public projects stay cached. Call it for "Forget my keys" and when
 * "Remember my keys" is turned off. Resolves with the names of the private repositories it forgot.
 */
export async function forgetPrivateData(): Promise<string[]> {
  const names = new Set<string>()
  for (const s of privateSnapshots.values()) names.add(s.meta.fullName)
  for (const e of privateRefs.values()) names.add(e.meta.fullName)
  privateSnapshots.clear()
  privateRefs.clear()
  await safely(
    async (store) => {
      await update<Record<string, unknown>>(
        REFS_KEY,
        (old) => {
          const next: Record<string, unknown> = {}
          if (old && typeof old === 'object') {
            for (const [k, v] of Object.entries(old)) {
              // Anything we cannot read is dropped too: better to ask GitHub again than to keep unknown data.
              if (!isRefEntry(v)) continue
              if (v.meta.isPrivate) names.add(v.meta.fullName)
              else next[k] = v
            }
          }
          return next
        },
        store,
      )
      // Every stored snapshot is checked (not only the index), so orphans left by an interrupted write go too.
      const removed = new Set<string>()
      for (const k of await keys(store)) {
        if (typeof k !== 'string' || !k.startsWith('snap:')) continue
        const stored = await get<StoredSnapshot>(k, store)
        const meta = stored?.snapshot?.meta
        if (meta && meta.isPrivate === false) continue
        if (meta?.fullName) names.add(meta.fullName)
        await del(k, store)
        removed.add(k.slice('snap:'.length))
      }
      if (removed.size) await update<CachedSnapshotInfo[]>(INDEX_KEY, (old) => readIndex(old).filter((e) => !removed.has(e.key)), store)
    },
    undefined,
    WRITE_TIMEOUT_MS,
  )
  return [...names]
}
