import { aiCacheKey, clearAiCache, deleteCachedAi, getCachedAi, setCachedAi } from './cache'

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
