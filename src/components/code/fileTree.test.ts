import { makeFile } from '@/ai/testFixtures'
import { buildTree, filterFiles, FOLDER_PAGE_SIZE, foldersToReveal, matchRange, queryTerms, visibleRows } from './fileTree'

const FILES = [
  'src/app/main.ts',
  'src/app/Button.tsx',
  'src/app/api.ts',
  'src/app/utils/format.ts',
  'README.md',
  'package.json',
  'docs/guide/intro.md',
  'a/b/c/deep.ts',
  'file10.ts',
  'file2.ts',
].map((p) => makeFile(p))

describe('buildTree', () => {
  it('puts folders first, then files, alphabetically (numbers in natural order)', () => {
    const root = buildTree(FILES)
    expect(root.folders.map((f) => f.name)).toEqual(['a/b/c', 'docs/guide', 'src/app'])
    expect(root.files.map((f) => f.name)).toEqual(['file2.ts', 'file10.ts', 'package.json', 'README.md'])
    expect(root.fileCount).toBe(FILES.length)
  })

  it('folds chains of single-child folders into one row whose path is the deepest folder', () => {
    const root = buildTree(FILES)
    const chain = root.folders.find((f) => f.name === 'a/b/c')
    expect(chain?.path).toBe('a/b/c')
    expect(chain?.files.map((f) => f.name)).toEqual(['deep.ts'])
    const src = root.folders.find((f) => f.name === 'src/app')
    expect(src?.folders.map((f) => f.name)).toEqual(['utils'])
    expect(src?.files.map((f) => f.name)).toEqual(['api.ts', 'Button.tsx', 'main.ts'])
  })

  it('can keep every folder level when compacting is off', () => {
    const root = buildTree(FILES, { compact: false })
    expect(root.folders.map((f) => f.name)).toEqual(['a', 'docs', 'src'])
  })
})

describe('filtering', () => {
  it('splits the query into lower-case terms', () => {
    expect(queryTerms('  App  MAIN ')).toEqual(['app', 'main'])
    expect(queryTerms('')).toEqual([])
  })

  it('keeps files whose path contains every term', () => {
    expect(filterFiles(FILES, 'app').map((f) => f.path)).toEqual(['src/app/main.ts', 'src/app/Button.tsx', 'src/app/api.ts', 'src/app/utils/format.ts'])
    expect(filterFiles(FILES, 'app format').map((f) => f.path)).toEqual(['src/app/utils/format.ts'])
    expect(filterFiles(FILES, 'nothing-here')).toEqual([])
    expect(filterFiles(FILES, '')).toHaveLength(FILES.length)
  })

  it('finds where a term matches a name', () => {
    expect(matchRange('Button.tsx', ['butt'])).toEqual({ start: 0, end: 4 })
    expect(matchRange('main.ts', ['zzz'])).toBeNull()
  })
})

describe('visibleRows', () => {
  it('lists only the children of expanded folders, with tree positions', () => {
    const root = buildTree(FILES)
    const collapsed = visibleRows(root, () => false)
    expect(collapsed.map((r) => r.name)).toEqual(['a/b/c', 'docs/guide', 'src/app', 'file2.ts', 'file10.ts', 'package.json', 'README.md'])
    expect(collapsed[0]).toMatchObject({ kind: 'folder', depth: 0, expanded: false, setSize: 7, posInSet: 1 })

    const open = new Set(foldersToReveal('src/app/utils/format.ts'))
    expect([...open]).toEqual(['src', 'src/app', 'src/app/utils'])
    const rows = visibleRows(root, (p) => open.has(p))
    const names = rows.map((r) => `${'  '.repeat(r.depth)}${r.name}`)
    expect(names).toEqual([
      'a/b/c',
      'docs/guide',
      'src/app',
      '  utils',
      '    format.ts',
      '  api.ts',
      '  Button.tsx',
      '  main.ts',
      'file2.ts',
      'file10.ts',
      'package.json',
      'README.md',
    ])
    const format = rows.find((r) => r.name === 'format.ts')
    expect(format).toMatchObject({ kind: 'file', depth: 2, parentPath: 'src/app/utils' })
  })

  it('pages very long folders with a "Show more" row', () => {
    const many = Array.from({ length: FOLDER_PAGE_SIZE + 25 }, (_, i) => makeFile(`icons/icon-${i}.svg`))
    const root = buildTree(many)
    const rows = visibleRows(root, () => true)
    expect(rows).toHaveLength(1 + FOLDER_PAGE_SIZE + 1)
    expect(rows[rows.length - 1]).toMatchObject({ kind: 'more', hidden: 25, folderPath: 'icons' })
    const more = visibleRows(root, () => true, new Map([['icons', FOLDER_PAGE_SIZE + 100]]))
    expect(more.filter((r) => r.kind === 'file')).toHaveLength(FOLDER_PAGE_SIZE + 25)
  })

  it('stays fast for 10,000 files', () => {
    const big = Array.from({ length: 10_000 }, (_, i) => makeFile(`pkg${i % 50}/mod${i % 7}/file${i}.ts`))
    const t = performance.now()
    const root = buildTree(big)
    const rows = visibleRows(root, (p) => p === 'pkg3')
    expect(performance.now() - t).toBeLessThan(1500)
    expect(rows.length).toBeLessThan(100)
    expect(root.fileCount).toBe(10_000)
  })
})
