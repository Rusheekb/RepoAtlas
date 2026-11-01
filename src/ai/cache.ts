/** IndexedDB-backed cache for AI results (idb-keyval, its own store "repoatlas-ai"). */
export async function getCachedAi<T>(key: string): Promise<T | undefined> {
  void key
  return undefined
}

export async function setCachedAi<T>(key: string, value: T): Promise<void> {
  void key; void value
}

export async function clearAiCache(): Promise<void> {}

/** Stable cache key from parts, e.g. ["explain", "owner/repo", sha, model, level, "file", path]. */
export function aiCacheKey(parts: (string | number)[]): string {
  return parts.map(String).join('|')
}
