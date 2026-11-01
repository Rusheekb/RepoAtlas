import { createStore, get as idbGet, set as idbSet } from 'idb-keyval'
import {
  aiCacheKey,
  clearAiCache,
  deleteCachedAi,
  forgetPrivateAiData,
  getAiCacheEntry,
  getCachedAi,
  peekCachedAi,
  repoOfAiCacheKey,
  setCachedAi,
  subscribeAiCache,
} from './cache'

describe('AI cache', () => {
  beforeEach(() => clearAiCache())

  it('round-trips strings and objects', async () => {
    await setCachedAi('k1', 'hello')
    await setCachedAi('k2', { concepts: [{ id: 'a' }], relations: [] })
    expect(await getCachedAi<string>('k1')).toBe('hello')
    expect(await getCachedAi('k2')).toEqual({ concepts: [{ id: 'a' }], relations: [] })
    expect(await getCachedAi('missing')).toBeUndefined()
  })

  it('deletes one entry or clears everything', async () => {
    await setCachedAi('a', 1)
    await setCachedAi('b', 2)
    await deleteCachedAi('a')
    expect(await getCachedAi('a')).toBeUndefined()
    expect(await getCachedAi('b')).toBe(2)
    await clearAiCache()
    expect(await getCachedAi('b')).toBeUndefined()
  })

  it('builds stable, collision-free keys', () => {
    expect(aiCacheKey(['explain', 'acme/shop', 'abc', 'claude-opus-5-5', 'beginner', 'file:src/a.ts'])).toBe(
      'explain|acme/shop|abc|claude-opus-5-5|beginner|file:src/a.ts',
    )
    expect(aiCacheKey(['a|b', 'c'])).not.toBe(aiCacheKey(['a', 'b|c']))
    expect(aiCacheKey([1, 'x'])).toBe('1|x')
  })
})

describe('AI cache: memory layer and private repositories', () => {
  const mainStore = () => createStore('repoatlas-ai', 'results')
  const privateStore = () => createStore('repoatlas-ai-private', 'results')

  beforeEach(() => clearAiCache())

  it('serves from memory at once and tells subscribers about changes', async () => {
    const seen: (string | null)[] = []
    const off = subscribeAiCache((k) => seen.push(k))
    void setCachedAi('k', 'v')
    expect(peekCachedAi('k')).toBe('v')
    expect(getAiCacheEntry('k')).toEqual({ value: 'v', private: false })
    expect(seen).toEqual(['k'])
    off()
    void setCachedAi('k', 'w')
    expect(seen).toEqual(['k'])
  })

  it('remembers misses, and asks a fallback (e.g. an older key format) when nothing is saved', async () => {
    expect(await getCachedAi('nothing')).toBeUndefined()
    expect(getAiCacheEntry('nothing')).toEqual({ value: undefined, private: false })
    const fallback = vi.fn(async () => 'from the old key')
    expect(await getCachedAi('new-key', { fallback })).toBe('from the old key')
    expect(peekCachedAi('new-key')).toBe('from the old key')
    expect(await getCachedAi('new-key', { fallback })).toBe('from the old key')
    expect(fallback).toHaveBeenCalledTimes(1)
  })

  it('keeps private results off the disk unless asked to persist them, and apart from public ones', async () => {
    await setCachedAi('chat|corp/secret', ['hello'], { private: true, persist: false })
    expect(await getCachedAi('chat|corp/secret')).toEqual(['hello'])
    expect(await idbGet('chat|corp/secret', privateStore())).toBeUndefined()
    expect(await idbGet('chat|corp/secret', mainStore())).toBeUndefined()

    await setCachedAi('chat|corp/remembered', ['kept'], { private: true, persist: true })
    expect(await idbGet('chat|corp/remembered', privateStore())).toEqual(['kept'])
    expect(await idbGet('chat|corp/remembered', mainStore())).toBeUndefined()
  })

  it('forgetPrivateAiData forgets private results in memory and on disk (and sweeps listed repos), keeping public ones', async () => {
    await setCachedAi('explain|corp/secret|m', 'secret answer', { private: true })
    await setCachedAi('explain|corp/memory|m', 'in memory only', { private: true, persist: false })
    await setCachedAi('explain|acme/shop|m', 'public answer')
    await idbSet('quiz|corp/legacy|abc|m', { questions: [] }, mainStore()) // saved before private results were kept apart
    await forgetPrivateAiData({ repos: ['Corp/Legacy'] })
    expect(peekCachedAi('explain|corp/secret|m')).toBeUndefined()
    expect(peekCachedAi('explain|corp/memory|m')).toBeUndefined()
    expect(await idbGet('explain|corp/secret|m', privateStore())).toBeUndefined()
    expect(await idbGet('quiz|corp/legacy|abc|m', mainStore())).toBeUndefined()
    expect(await getCachedAi('explain|corp/secret|m')).toBeUndefined()
    expect(await getCachedAi('explain|acme/shop|m')).toBe('public answer')
    expect(await idbGet('explain|acme/shop|m', mainStore())).toBe('public answer')
  })

  it('repoOfAiCacheKey reads the repository back out of a key', () => {
    expect(repoOfAiCacheKey(aiCacheKey(['chat', 'acme/shop']))).toBe('acme/shop')
    expect(repoOfAiCacheKey('x')).toBeNull()
  })
})
