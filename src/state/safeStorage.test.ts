import { isStorageBlocked, safeLocalStorage } from './safeStorage'
import { trimSeen, useProgress } from './progress'
import { useSettings } from './settings'

function quotaError() {
  return new DOMException("Setting the value of 'x' exceeded the quota.", 'QuotaExceededError')
}

describe('safeLocalStorage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('never throws when the browser storage is full', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quotaError()
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = safeLocalStorage()
    expect(() => s.setItem('repoatlas:test', 'value')).not.toThrow()
    expect(isStorageBlocked()).toBe(true)
  })

  it('retries once with a smaller value when space runs out', () => {
    const real = Storage.prototype.setItem
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (v.length > 10) throw quotaError()
      real.call(this, k, v)
    })
    const s = safeLocalStorage(() => 'small')
    s.setItem('repoatlas:test', 'a value that is too long')
    expect(spy).toHaveBeenCalledTimes(2)
    expect(localStorage.getItem('repoatlas:test')).toBe('small')
  })

  it('treats storage that cannot even be accessed as empty', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(safeLocalStorage().getItem('anything')).toBeNull()
  })
})

describe('stores keep working when storage is full', () => {
  afterEach(() => vi.restoreAllMocks())

  it('adding a recent project and marking progress do not throw', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quotaError()
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => useProgress.getState().addRecent('pallets/flask', 'A web framework')).not.toThrow()
    expect(() => useProgress.getState().markSeen('pallets/flask', 'file:src/flask/app.py')).not.toThrow()
    expect(() => useSettings.getState().set({ readingLevel: 'expert' })).not.toThrow()
    // Still works in memory for this visit.
    expect(useProgress.getState().recent[0].fullName).toBe('pallets/flask')
    expect(useProgress.getState().isSeen('pallets/flask', 'file:src/flask/app.py')).toBe(true)
    expect(useSettings.getState().readingLevel).toBe('expert')
  })
})

describe('trimSeen', () => {
  it('keeps the most recently explored repositories and their newest items', () => {
    const seen = {
      old: { a: 1 },
      mid: { a: 5, b: 6 },
      new: { a: 10, b: 9, c: 8 },
    }
    expect(Object.keys(trimSeen(seen, 2))).toEqual(['new', 'mid'])
    expect(trimSeen(seen, 3, 2).new).toEqual({ a: 10, b: 9 })
  })
})
