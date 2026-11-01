import { clear, createStore, del, get, set, type UseStore } from 'idb-keyval'

/**
 * IndexedDB-backed cache for AI results (idb-keyval, its own database "repoatlas-ai" with one store "results").
 *
 * Storage is best-effort: private browsing modes, blocked storage or a full disk must never break the app, so every
 * error is swallowed (reads resolve to `undefined`, writes resolve quietly).
 */

let store: UseStore | null | undefined

function getStore(): UseStore | null {
  if (store !== undefined) return store
  try {
    store = typeof indexedDB === 'undefined' ? null : createStore('repoatlas-ai', 'results')
  } catch {
    store = null
  }
  return store
}

export async function getCachedAi<T>(key: string): Promise<T | undefined> {
  const s = getStore()
  if (!s) return undefined
  try {
    return await get<T>(key, s)
  } catch {
    return undefined
  }
}

export async function setCachedAi<T>(key: string, value: T): Promise<void> {
  const s = getStore()
  if (!s) return
  try {
    await set(key, value, s)
  } catch {
    /* storage unavailable or full: caching is optional */
  }
}

/** Remove one cached result (e.g. after the user asks for a fresh answer and it fails). */
export async function deleteCachedAi(key: string): Promise<void> {
  const s = getStore()
  if (!s) return
  try {
    await del(key, s)
  } catch {
    /* ignore */
  }
}

/** Forget every cached AI answer, concept map, tour, quiz and chat. */
export async function clearAiCache(): Promise<void> {
  const s = getStore()
  if (!s) return
  try {
    await clear(s)
  } catch {
    /* ignore */
  }
}

/**
 * Stable cache key from parts, e.g. ["explain", "owner/repo", sha, model, level, "file", path].
 * Parts are joined with "|"; any "|" or "%" inside a part is escaped so different part lists never collide.
 */
export function aiCacheKey(parts: (string | number)[]): string {
  return parts.map((p) => String(p).replace(/%/g, '%25').replace(/\|/g, '%7C')).join('|')
}
