import { clear, createStore, del, get, keys, set, type UseStore } from 'idb-keyval'
import { abortAiJobs } from './jobs'

/**
 * Cache for AI results: an in-memory layer (instant, shared by every component in this tab, observable) on top of
 * IndexedDB (idb-keyval). Public repositories use the database "repoatlas-ai"; private ones use their own database,
 * "repoatlas-ai-private", so they can be forgotten in one go (forgetPrivateAiData) — and they are only written to
 * disk when the caller says so (see AiCacheOptions.persist), otherwise they live in this tab's memory only.
 *
 * Storage is best-effort: private browsing modes, blocked storage or a full disk must never break the app, so every
 * error is swallowed (reads resolve to `undefined`, writes resolve quietly).
 */

export interface AiCacheOptions {
  /** The result is about a private repository (kept apart, and removed by forgetPrivateAiData). */
  private?: boolean
  /** Also save it in this browser's storage (default true). `false` keeps it in this tab's memory only. */
  persist?: boolean
}

/** What the memory layer knows about a key. `value: undefined` means "looked it up: nothing saved". */
export interface AiCacheEntry {
  readonly value: unknown
  readonly private: boolean
}

const MEMORY_LIMIT = 500

const memory = new Map<string, AiCacheEntry>()
const listeners = new Set<(key: string | null) => void>()
const loading = new Map<string, Promise<unknown>>()
/** Bumped by clear/forget, so a read that started before them can't bring old data back. */
let generation = 0

let stores: { main: UseStore | null; secret: UseStore | null } | undefined

function getStores(): { main: UseStore | null; secret: UseStore | null } {
  if (stores) return stores
  const open = (db: string): UseStore | null => {
    try {
      return typeof indexedDB === 'undefined' ? null : createStore(db, 'results')
    } catch {
      return null
    }
  }
  stores = { main: open('repoatlas-ai'), secret: open('repoatlas-ai-private') }
  return stores
}

function notify(key: string | null) {
  for (const fn of [...listeners]) {
    try {
      fn(key)
    } catch {
      /* a broken listener must not stop the others */
    }
  }
}

function remember(key: string, entry: AiCacheEntry) {
  memory.delete(key)
  memory.set(key, entry)
  while (memory.size > MEMORY_LIMIT) {
    const oldest = memory.keys().next().value
    if (oldest === undefined) break
    memory.delete(oldest)
  }
}

async function safeGet(key: string, s: UseStore | null): Promise<unknown> {
  if (!s) return undefined
  try {
    return await get<unknown>(key, s)
  } catch {
    return undefined
  }
}

/** Listen for changes (key = the key that changed, or null when many did). Returns an unsubscribe function. */
export function subscribeAiCache(listener: (key: string | null) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** What memory currently holds for `key` (stable object until it changes), or undefined if it was never looked up. */
export function getAiCacheEntry(key: string): AiCacheEntry | undefined {
  return memory.get(key)
}

/** The value in memory for `key`, without touching storage. */
export function peekCachedAi<T>(key: string): T | undefined {
  return memory.get(key)?.value as T | undefined
}

/**
 * Read a cached result: memory first, then storage (private store before the public one). `fallback` is asked when
 * nothing is saved under `key` (e.g. to read an entry saved under an older key format). Whatever is found — or the
 * fact that nothing is — is remembered in memory and announced to subscribers.
 */
export function getCachedAi<T>(key: string, opts?: { fallback?: () => Promise<unknown>; private?: boolean }): Promise<T | undefined> {
  const hit = memory.get(key)
  if (hit) return Promise.resolve(hit.value as T | undefined)
  const pending = loading.get(key)
  if (pending) return pending as Promise<T | undefined>
  const gen = generation
  const promise = (async () => {
    const { main, secret } = getStores()
    let value = await safeGet(key, secret)
    let isPrivate = value !== undefined
    if (value === undefined) value = await safeGet(key, main)
    if (value === undefined && opts?.fallback) {
      try {
        value = await opts.fallback()
      } catch {
        value = undefined
      }
      isPrivate = Boolean(opts.private)
    }
    // Written (or cleared) while we were reading: the newer state wins.
    if (gen !== generation || memory.has(key)) return memory.get(key)?.value
    remember(key, { value, private: isPrivate || Boolean(opts?.private) })
    notify(key)
    return value
  })()
  loading.set(key, promise)
  void promise.finally(() => {
    if (loading.get(key) === promise) loading.delete(key)
  })
  return promise as Promise<T | undefined>
}

/** Save a result: in memory at once (subscribers are told synchronously), then in storage unless `persist` is false. */
export async function setCachedAi<T>(key: string, value: T, opts?: AiCacheOptions): Promise<void> {
  const isPrivate = Boolean(opts?.private)
  remember(key, { value, private: isPrivate })
  notify(key)
  if (opts?.persist === false) return
  const { main, secret } = getStores()
  const target = isPrivate ? secret : main
  if (!target) return
  try {
    await set(key, value, target)
    // An older copy of a private result in the public store (saved before private ones were kept apart) goes.
    if (isPrivate && main) await del(key, main)
  } catch {
    /* storage unavailable or full: caching is optional */
  }
}

/** Remove one cached result (e.g. after the user asks for a fresh answer and it fails). */
export async function deleteCachedAi(key: string): Promise<void> {
  remember(key, { value: undefined, private: memory.get(key)?.private ?? false })
  notify(key)
  const { main, secret } = getStores()
  for (const s of [main, secret]) {
    if (!s) continue
    try {
      await del(key, s)
    } catch {
      /* ignore */
    }
  }
}

/** Forget every cached AI answer, concept map, tour, quiz and chat (and stop anything Claude is still writing). */
export async function clearAiCache(): Promise<void> {
  generation++
  abortAiJobs()
  memory.clear()
  notify(null)
  const { main, secret } = getStores()
  for (const s of [main, secret]) {
    if (!s) continue
    try {
      await clear(s)
    } catch {
      /* ignore */
    }
  }
}

/** The repository ("owner/name") an AI cache key belongs to, or null. Keys look like "kind|owner/name|…". */
export function repoOfAiCacheKey(key: string): string | null {
  const part = key.split('|')[1]
  return part ? part.replace(/%7C/g, '|').replace(/%25/g, '%') : null
}

/**
 * Forget everything Claude wrote about private repositories: answers, chats, concept maps, tours and quizzes, in
 * memory and on disk, and stop any such request still running. Call it when the reader asks to forget their keys or
 * turns "remember my keys" off.
 *
 * `repos` ("owner/name", any case) also sweeps those repositories' results out of the public store, for answers
 * saved before private results were kept apart.
 */
export async function forgetPrivateAiData(opts?: { repos?: string[] }): Promise<void> {
  generation++
  const repos = new Set((opts?.repos ?? []).map((r) => r.toLowerCase()))
  const listed = (key: string) => repos.size > 0 && repos.has((repoOfAiCacheKey(key) ?? '').toLowerCase())
  abortAiJobs((job) => job.private || listed(job.key))
  for (const [key, entry] of [...memory]) if (entry.private || listed(key)) memory.delete(key)
  notify(null)
  const { main, secret } = getStores()
  if (secret) {
    try {
      await clear(secret)
    } catch {
      /* ignore */
    }
  }
  if (main && repos.size > 0) {
    try {
      const all = await keys(main)
      await Promise.all(all.filter((k): k is string => typeof k === 'string' && listed(k)).map((k) => del(k, main)))
    } catch {
      /* ignore */
    }
  }
}

/**
 * Stable cache key from parts, e.g. ["explain", "owner/repo", model, level, "file", path].
 * Parts are joined with "|"; any "|" or "%" inside a part is escaped so different part lists never collide.
 */
export function aiCacheKey(parts: (string | number)[]): string {
  return parts.map((p) => String(p).replace(/%/g, '%25').replace(/\|/g, '%7C')).join('|')
}

// ─────────────────────────────────────────────────────────────────────────────
// Stored results
// ─────────────────────────────────────────────────────────────────────────────

/** How explanations, concept maps, tours and quizzes are saved: the result plus the commit it was made for. */
export interface StoredAiResult<T> {
  v: 2
  commitSha: string
  data: T
  savedAt: number
}

export function storedAiResult<T>(data: T, commitSha: string): StoredAiResult<T> {
  return { v: 2, commitSha, data, savedAt: Date.now() }
}

export function isStoredAiResult(v: unknown): v is StoredAiResult<unknown> {
  return typeof v === 'object' && v !== null && (v as { v?: unknown }).v === 2 && typeof (v as { commitSha?: unknown }).commitSha === 'string' && 'data' in v
}
