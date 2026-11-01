import { ancestors, basename, depthOf, dirname, extname, joinPath } from './paths'

describe('paths', () => {
  it('splits paths', () => {
    expect(basename('a/b/c.ts')).toBe('c.ts')
    expect(dirname('a/b/c.ts')).toBe('a/b')
    expect(dirname('c.ts')).toBe('')
    expect(extname('a/b.test.TS')).toBe('ts')
    expect(extname('Makefile')).toBe('')
    expect(extname('.env')).toBe('')
    expect(depthOf('src/a.ts')).toBe(1)
    expect(ancestors('a/b/c.ts')).toEqual(['a', 'a/b'])
  })
  it('joins and normalizes', () => {
    expect(joinPath('src/app', '../lib/x')).toBe('src/lib/x')
    expect(joinPath('src', './a', 'b')).toBe('src/a/b')
    expect(joinPath('', '../x')).toBe('x')
  })
})
