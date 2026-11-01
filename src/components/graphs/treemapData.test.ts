import {
  buildTreemapTree,
  fileWeight,
  fitLabel,
  focusOrder,
  folderTrail,
  layoutTreemap,
  normalizeFolder,
  parentFolder,
  type TreemapDatum,
} from './treemapData'
import { makeFile } from './testFixtures'

const files = [
  makeFile('README.md', { lines: 10, layer: 'docs', language: null }),
  makeFile('src/main.ts', { lines: 100, layer: 'logic' }),
  makeFile('src/app/App.tsx', { lines: 300, layer: 'ui', language: 'TSX' }),
  makeFile('src/app/deep/a.tsx', { lines: 50, layer: 'ui', language: 'TSX' }),
  makeFile('src/app/deep/b.tsx', { lines: 70, layer: 'ui', language: 'TSX' }),
  makeFile('src/app/deep/c.ts', { lines: 10, layer: 'logic' }),
  makeFile('src/lib/util.ts', { lines: null, size: 4000, fetched: false }),
  makeFile('docs/guide.md', { lines: 0, size: 10, layer: 'docs', language: null }),
]

function child(d: TreemapDatum, name: string): TreemapDatum {
  const c = d.children?.find((x) => x.name === name)
  if (!c) throw new Error(`no child ${name}`)
  return c
}

describe('fileWeight', () => {
  it('uses lines, falls back to bytes / 40, never zero', () => {
    expect(fileWeight({ lines: 30, size: 99 }, 'lines')).toBe(30)
    expect(fileWeight({ lines: null, size: 4000 }, 'lines')).toBe(100)
    expect(fileWeight({ lines: 0, size: 0 }, 'lines')).toBe(1)
    expect(fileWeight({ lines: 30, size: 999 }, 'bytes')).toBe(999)
  })
})

describe('buildTreemapTree', () => {
  it('shows two levels and folds deeper folders into aggregate tiles', () => {
    const tree = buildTreemapTree(files, '')
    expect(tree.kind).toBe('root')
    expect(tree.fileCount).toBe(files.length)
    const src = child(tree, 'src')
    expect(src.kind).toBe('folder')
    expect(src.fileCount).toBe(6)
    const app = child(src, 'app')
    expect(app.kind).toBe('aggregate')
    expect(app.key).toBe('src/app')
    expect(app.fileCount).toBe(4)
    expect(app.value).toBe(300 + 50 + 70 + 10)
    expect(app.layer).toBe('ui')
    expect(app.language).toBe('TSX')
    expect(app.children).toBeUndefined()
    const main = child(src, 'main.ts')
    expect(main.kind).toBe('file')
    expect(main.file?.path).toBe('src/main.ts')
    expect(child(tree, 'README.md').kind).toBe('file')
    // Children sorted biggest first.
    expect(src.children?.[0].name).toBe('app')
  })

  it('zooms into a folder', () => {
    const tree = buildTreemapTree(files, 'src/app/')
    expect(tree.key).toBe('src/app')
    expect(tree.name).toBe('app')
    expect(tree.fileCount).toBe(4)
    const deep = child(tree, 'deep')
    expect(deep.kind).toBe('folder')
    expect(deep.children?.map((c) => c.name).sort()).toEqual(['a.tsx', 'b.tsx', 'c.ts'])
    expect(child(tree, 'App.tsx').kind).toBe('file')
  })

  it('does not match folders that merely share a prefix', () => {
    const tree = buildTreemapTree([...files, makeFile('srcery/x.ts')], 'src')
    expect(tree.fileCount).toBe(6)
  })

  it('returns an empty root for unknown folders', () => {
    const tree = buildTreemapTree(files, 'nope')
    expect(tree.children).toEqual([])
    expect(tree.fileCount).toBe(0)
  })

  it('handles thousands of files quickly', () => {
    const many = Array.from({ length: 5000 }, (_, i) => makeFile(`pkg${i % 20}/dir${i % 7}/sub${i % 3}/f${i}.ts`))
    const t0 = performance.now()
    const tree = buildTreemapTree(many, '')
    const layout = layoutTreemap(tree, 1200, 800)
    const order = focusOrder(layout)
    expect(performance.now() - t0).toBeLessThan(1500)
    expect(tree.fileCount).toBe(5000)
    expect(tree.children).toHaveLength(20)
    expect(order.length).toBe(layout.folders.length + layout.leaves.length)
  })
})

describe('layoutTreemap', () => {
  it('keeps every tile inside the box and folders hold their children below the header', () => {
    const tree = buildTreemapTree(files, '')
    const { folders, leaves } = layoutTreemap(tree, 600, 400)
    expect(folders.map((f) => f.datum.key).sort()).toEqual(['docs', 'src'])
    for (const r of [...folders, ...leaves]) {
      expect(r.x0).toBeGreaterThanOrEqual(0)
      expect(r.y0).toBeGreaterThanOrEqual(0)
      expect(r.x1).toBeLessThanOrEqual(600)
      expect(r.y1).toBeLessThanOrEqual(400)
    }
    const src = folders.find((f) => f.datum.key === 'src')!
    for (const l of leaves.filter((x) => x.datum.key.startsWith('src/'))) {
      expect(l.y0).toBeGreaterThanOrEqual(src.y0 + 20)
      expect(l.x0).toBeGreaterThanOrEqual(src.x0)
      expect(l.x1).toBeLessThanOrEqual(src.x1)
    }
    // Siblings never overlap.
    for (let i = 0; i < leaves.length; i++)
      for (let j = i + 1; j < leaves.length; j++) {
        const a = leaves[i]
        const b = leaves[j]
        const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
        expect(overlap).toBe(false)
      }
  })

  it('returns nothing for an empty box or empty tree', () => {
    expect(layoutTreemap(buildTreemapTree(files, ''), 0, 400).leaves).toEqual([])
    expect(layoutTreemap(buildTreemapTree([], ''), 600, 400).leaves).toEqual([])
  })

  it('orders keyboard focus: each folder followed by its own children', () => {
    const layout = layoutTreemap(buildTreemapTree(files, ''), 600, 400)
    const keys = focusOrder(layout).map((r) => r.datum.key)
    const srcIdx = keys.indexOf('src')
    const srcChildren = keys.filter((k) => k.startsWith('src/'))
    expect(keys.slice(srcIdx + 1, srcIdx + 1 + srcChildren.length).sort()).toEqual([...srcChildren].sort())
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('path helpers', () => {
  it('fits labels', () => {
    expect(fitLabel('short', 100)).toBe('short')
    expect(fitLabel('a-very-long-file-name.ts', 66, 6.6)).toBe('a-very-lo…')
    expect(fitLabel('abcdef', 20)).toBeNull()
  })

  it('builds the breadcrumb trail and parent folders', () => {
    expect(folderTrail('')).toEqual([])
    expect(folderTrail('/a/b/c/')).toEqual(['a', 'a/b', 'a/b/c'])
    expect(parentFolder('a/b/c')).toBe('a/b')
    expect(parentFolder('a')).toBe('')
    expect(normalizeFolder('/x/')).toBe('x')
  })
})
