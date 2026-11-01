import { makeFile, makeFixture } from '@/ai/testFixtures'
import { breadcrumbs, defaultFilePath, describeRange, fileAvailability, formatLineParam, MAX_VIEWABLE_BYTES, parseLineParam, skipNote } from './explorer'
import { suggestedQuestions } from './suggestions'

describe('line ranges in the URL', () => {
  it('parses single lines and ranges', () => {
    expect(parseLineParam('120')).toEqual({ start: 120, end: 120 })
    expect(parseLineParam('10-20')).toEqual({ start: 10, end: 20 })
    expect(parseLineParam('20-10')).toEqual({ start: 10, end: 20 })
    expect(parseLineParam('L5-L9')).toEqual({ start: 5, end: 9 })
    expect(parseLineParam('0')).toBeNull()
    expect(parseLineParam('abc')).toBeNull()
    expect(parseLineParam(null)).toBeNull()
  })

  it('writes them back and describes them in words', () => {
    expect(formatLineParam({ start: 4, end: 4 })).toBe('4')
    expect(formatLineParam({ start: 4, end: 9 })).toBe('4-9')
    expect(formatLineParam(null)).toBeUndefined()
    expect(describeRange({ start: 4, end: 4 })).toBe('line 4')
    expect(describeRange({ start: 4, end: 9 })).toBe('lines 4–9')
  })
})

describe('defaultFilePath', () => {
  it('prefers the README, then the first starting point, then any source file', () => {
    const { analysis } = makeFixture()
    expect(defaultFilePath(analysis)).toBe('README.md')
    expect(defaultFilePath({ ...analysis, readme: null })).toBe('src/main.tsx')
    expect(defaultFilePath({ ...analysis, readme: null, entryPoints: [] })).toBe('src/api/client.ts')
    expect(defaultFilePath({ files: {}, readme: null, entryPoints: [] })).toBeNull()
  })
})

describe('fileAvailability', () => {
  const snapshot = { files: { 'a.ts': 'code' }, skipped: [{ path: 'logo.png', reason: 'binary' as const }, { path: 'yarn.lock', reason: 'lockfile' as const }] }

  it('knows what is already here, what to download and what can only be described', () => {
    expect(fileAvailability(makeFile('a.ts'), snapshot)).toEqual({ kind: 'ready', content: 'code' })
    expect(fileAvailability(makeFile('logo.png', { kind: 'asset', language: null }), snapshot)).toEqual({ kind: 'binary' })
    expect(fileAvailability(makeFile('icon.svg', { kind: 'asset', language: null }), snapshot)).toEqual({ kind: 'binary' })
    expect(fileAvailability(makeFile('yarn.lock'), snapshot)).toEqual({ kind: 'download', reason: 'lockfile' })
    expect(fileAvailability(makeFile('other.ts'), snapshot)).toEqual({ kind: 'download', reason: null })
    expect(fileAvailability(makeFile('huge.json', { size: MAX_VIEWABLE_BYTES + 1 }), snapshot)).toEqual({ kind: 'too-large', size: MAX_VIEWABLE_BYTES + 1 })
  })

  it('explains skipped files in plain words', () => {
    expect(skipNote('lockfile')).toMatch(/lockfile/)
    expect(skipNote(null)).toBeNull()
  })
})

describe('breadcrumbs', () => {
  it('splits a path into clickable folders and the file', () => {
    expect(breadcrumbs('src/flask/app.py')).toEqual([
      { name: 'src', path: 'src', isFile: false },
      { name: 'flask', path: 'src/flask', isFile: false },
      { name: 'app.py', path: 'src/flask/app.py', isFile: true },
    ])
  })
})

describe('suggestedQuestions', () => {
  it('mixes the classics with questions about this project', () => {
    const { analysis } = makeFixture()
    const texts = suggestedQuestions(analysis).map((s) => s.text)
    expect(texts).toContain('What does this project do, in simple terms?')
    expect(texts).toContain('Where does the program start?')
    expect(texts).toContain('How is information stored?')
    expect(texts).toContain('What would I change to add a feature?')
    expect(texts).toContain('Explain the main parts like I’m 10')
    expect(texts).toContain('What is React, and how does this project use it?')
    expect(texts.some((t) => /What does the “.+” part do/.test(t))).toBe(true)
    expect(texts.length).toBeLessThanOrEqual(7)
  })
})
