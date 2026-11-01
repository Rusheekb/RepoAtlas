import { act, fireEvent, render, screen } from '@testing-library/react'
import { useExplain } from '@/state/explain'
import { ArchitectureGraph, buildConceptLayout, FileGraph } from '../index'
import { estimateLabelSize, type Rect } from '../layout'
import { makeFile, makeModule, MODULE_EDGES, MODULES, stubLayout } from '../testFixtures'
import { arrowGeometry } from './PathEdge'

let restore: () => void
beforeEach(() => {
  restore = stubLayout(900, 600)
  useExplain.setState({ target: null, history: [] })
})
afterEach(() => {
  restore()
  useExplain.setState({ target: null, history: [] })
})

const nodeEl = (container: HTMLElement, id: string) =>
  [...container.querySelectorAll<HTMLElement>('.react-flow__node')].find((n) => n.dataset.id === id) as HTMLElement

/** The React Flow viewport transform as { x, y, zoom }. */
function viewportOf(container: HTMLElement) {
  const t = (container.querySelector('.react-flow__viewport') as HTMLElement).style.transform
  const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)\s*scale\((-?[\d.]+)\)/.exec(t)
  if (!m) throw new Error(`unexpected transform ${t}`)
  return { x: Number(m[1]), y: Number(m[2]), zoom: Number(m[3]) }
}

describe('first view', () => {
  it('opens a big map as a readable close-up with a button to see everything', async () => {
    // 30 files in one long chain: the whole picture would be drawn far too small to read.
    const files = Array.from({ length: 30 }, (_, i) => makeFile(`src/chain/f${i}.ts`))
    const edges = files.slice(1).map((f, i) => ({ source: files[i].path, target: f.path }))
    const { container } = render(<FileGraph files={files} edges={edges} />)
    expect(viewportOf(container).zoom).toBeGreaterThanOrEqual(0.65)
    const toggle = screen.getByTestId('flow-view-toggle')
    expect(toggle).toHaveTextContent('Show all 30 files')
    await act(async () => fireEvent.click(toggle))
    expect(screen.getByTestId('flow-view-toggle')).toHaveTextContent('Zoom back in to read')
  })

  it('shows a small map whole, without the toggle', () => {
    const { container } = render(<ArchitectureGraph modules={MODULES} edges={MODULE_EDGES} />)
    expect(screen.queryByTestId('flow-view-toggle')).not.toBeInTheDocument()
    const vp = viewportOf(container)
    for (const el of container.querySelectorAll<HTMLElement>('.react-flow__node')) {
      const x = Number(/translate\((-?[\d.]+)px/.exec(el.style.transform)?.[1] ?? 0)
      expect(x * vp.zoom + vp.x).toBeGreaterThanOrEqual(0)
    }
  })

  it('keeps the selected card clear of the open explain panel (regression: the panel covered the clicked box)', () => {
    useExplain.setState({ target: { type: 'module', id: 'src/utils' }, history: [] })
    const { container } = render(<ArchitectureGraph modules={MODULES} edges={MODULE_EDGES} selectedId="src/utils" />)
    // jsdom: the canvas is 900px wide and the window 1024px, so the 440px drawer covers x ≥ 584.
    const vp = viewportOf(container)
    const el = nodeEl(container, 'src/utils')
    const x = Number(/translate\((-?[\d.]+)px/.exec(el.style.transform)?.[1])
    const right = (x + 236) * vp.zoom + vp.x
    expect(right).toBeLessThanOrEqual(584)
  })
})

describe('refitting', () => {
  it('fits the new picture as soon as the slice changes (regression: the tour’s last step showed a cropped map)', async () => {
    const original = window.matchMedia
    // Reduced motion: view changes apply at once, so the test can read them.
    window.matchMedia = ((query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia
    try {
      const { container, rerender } = render(<ArchitectureGraph modules={MODULES.slice(0, 1)} edges={[]} />)
      const before = viewportOf(container)
      await act(async () => {
        rerender(<ArchitectureGraph modules={MODULES} edges={MODULE_EDGES} />)
      })
      const vp = viewportOf(container)
      expect(vp).not.toEqual(before)
      for (const el of container.querySelectorAll<HTMLElement>('.react-flow__node')) {
        const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(el.style.transform)
        const x = Number(m?.[1]) * vp.zoom + vp.x
        const y = Number(m?.[2]) * vp.zoom + vp.y
        expect(x).toBeGreaterThanOrEqual(0)
        expect(y).toBeGreaterThanOrEqual(0)
        expect(x + 236 * vp.zoom).toBeLessThanOrEqual(900)
        expect(y + 104 * vp.zoom).toBeLessThanOrEqual(600)
      }
    } finally {
      window.matchMedia = original
    }
  })
})

describe('tooltips', () => {
  it('stay hidden for taps and for focus handed back to a card after a tap (regression: tooltip stuck over the map)', () => {
    const { container } = render(<ArchitectureGraph modules={MODULES} edges={MODULE_EDGES} />)
    const card = nodeEl(container, 'src/state')
    fireEvent.pointerDown(card, { pointerType: 'touch' })
    fireEvent.mouseEnter(card, { clientX: 10, clientY: 10 })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    act(() => card.focus())
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    // A mouse pointer gets the tooltip again.
    fireEvent.pointerOver(card, { pointerType: 'mouse' })
    fireEvent.mouseEnter(card, { clientX: 10, clientY: 10 })
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
  })

  it('show module descriptions as plain words, without Markdown backticks', () => {
    const mods = [makeModule('src/app', { description: 'Holds `__init__.py`, `cli.py` and **the main app**.' }), makeModule('src/lib')]
    const { container } = render(<ArchitectureGraph modules={mods} edges={[]} />)
    fireEvent.mouseEnter(nodeEl(container, 'src/app'), { clientX: 10, clientY: 10 })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Holds __init__.py, cli.py and the main app.')
    expect(screen.getByRole('tooltip').textContent).not.toContain('`')
  })
})

describe('legend', () => {
  it('lists every color the cards draw, including the mini bars (regression: unexplained bar colors)', () => {
    const mods = [makeModule('src/app', { layer: 'logic', layerBreakdown: { logic: 10, test: 3, infra: 1 } })]
    render(<ArchitectureGraph modules={mods} edges={[]} />)
    const legend = screen.getByLabelText('Color legend')
    expect(legend).toHaveTextContent('Core logic')
    expect(legend).toHaveTextContent('Tests')
    expect(legend).toHaveTextContent('Build & deploy')
  })
})

describe('arrowheads', () => {
  it('grow in flow units as the map zooms out, so they stay about 9px on screen, tip at the same spot', () => {
    expect(arrowGeometry(1)).toEqual({ size: 10, refX: 5 })
    const far = arrowGeometry(0.4)
    expect(far.size * 0.4).toBeGreaterThanOrEqual(8.9)
    // The tip stays 5 flow units past the path's end: (10 - refX) viewBox units × size/10.
    expect(((10 - far.refX) * far.size) / 10).toBeCloseTo(5, 1)
    expect(arrowGeometry(0).size).toBe(10)
  })
})

describe('concept map labels', () => {
  it('never draws an always-on relation label over a card', () => {
    const concepts = Array.from({ length: 12 }, (_, i) => ({
      id: `c${i}`,
      name: `Idea ${i}`,
      emoji: '💡',
      category: 'idea' as const,
      summary: '',
      explanation: '',
      analogy: '',
      files: [],
      importance: i === 0 ? 5 : 2 + (i % 3),
    }))
    const relations = [
      ...concepts.slice(1).map((c) => ({ from: 'c0', to: c.id, label: 'is made of' })),
      { from: 'c1', to: 'c2', label: 'packages and ships' },
      { from: 'c3', to: 'c4', label: 'shows how to use' },
      { from: 'c5', to: 'c9', label: 'checks' },
    ]
    const layout = buildConceptLayout({ source: 'starter', concepts, relations })
    const cards: Rect[] = layout.nodes.map((n) => ({ x: n.position.x, y: n.position.y, width: n.width ?? 0, height: n.height ?? 0 }))
    for (const e of layout.edges) {
      if (e.data?.labelOnlyWhenActive) continue
      const { width, height } = estimateLabelSize(e.data?.label ?? '')
      const box = { x: (e.data?.labelX ?? 0) - width / 2, y: (e.data?.labelY ?? 0) - height / 2, width, height }
      for (const c of cards) {
        const overlap = box.x < c.x + c.width && c.x < box.x + box.width && box.y < c.y + c.height && c.y < box.y + box.height
        expect(overlap).toBe(false)
      }
    }
    expect(layout.rank[0]).toBe('c0')
  })
})
