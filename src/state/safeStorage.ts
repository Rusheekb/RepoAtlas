import type { StateStorage } from 'zustand/middleware'

/**
 * localStorage that never throws.
 *
 * Saving can fail for reasons outside RepoAtlas: the browser blocks site storage (some privacy settings), or the
 * storage for this web address is already full — on GitHub Pages every site of the same account shares one address
 * (e.g. rusheekb.github.io) and therefore one storage allowance. None of that should ever break the app: settings and
 * progress simply stay in memory for this visit.
 *
 * When a write fails for lack of space, `shrink` (if given) gets one chance to return a smaller value to retry with.
 */
export function safeLocalStorage(shrink?: (value: string) => string | null): StateStorage {
  return {
    getItem: (name) => {
      try {
        return storage()?.getItem(name) ?? null
      } catch {
        return null
      }
    },
    setItem: (name, value) => {
      const s = storage()
      if (!s) return markBlocked(name, null)
      try {
        s.setItem(name, value)
        return
      } catch (err) {
        if (isQuotaError(err) && shrink) {
          try {
            const smaller = shrink(value)
            if (smaller != null && smaller.length < value.length) {
              s.setItem(name, smaller)
              return
            }
          } catch {
            /* fall through */
          }
        }
        markBlocked(name, err)
      }
    },
    removeItem: (name) => {
      try {
        storage()?.removeItem(name)
      } catch {
        /* nothing to do */
      }
    },
  }
}

let blocked = false
const warned = new Set<string>()

/** True once the browser has refused to save something this visit (shown as a hint in Settings). */
export function isStorageBlocked(): boolean {
  return blocked
}

function markBlocked(name: string, err: unknown) {
  blocked = true
  if (warned.has(name)) return
  warned.add(name)
  console.warn(`RepoAtlas couldn't save "${name}" in this browser (storage is full or blocked), so it will only last for this visit.`, err ?? '')
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    // Accessing localStorage itself throws when site storage is disabled.
    return null
  }
}

function isQuotaError(err: unknown): boolean {
  if (!(err instanceof DOMException)) return false
  return err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22 || err.code === 1014
}
