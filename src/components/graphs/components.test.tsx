import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { LanguageStat } from '@/core/types'
import {
  ArchitectureGraph,
  CodeTreemap,
  ConceptGraph,
  FileGraph,
  LanguageBar,
  LayerBar,
  NeighborhoodGraph,
  TechStackDiagram,
  TourDiagram,
} from './index'
import { CONCEPTS, MODULE_EDGES, MODULES, TECH, TOUR, linkFiles, makeFile, stubLayout } from './testFixtures'

let restore: () => void
beforeEach(() => {
  restore = stubLayout()
})
afterEach(() => restore())

const nodeEl = (container: HTMLElement, id: string) =>
  [...container.querySelectorAll<HTMLElement>('.react-flow__node')].find((n) => n.dataset.id === id) as HTMLElement

describe('ArchitectureGraph', () => {
  it('renders one card per module with plain-English details and a legend', () => {
    const { container } = render(<ArchitectureGraph modules={MODULES} edges={MODULE_EDGES} seenIds={['src/state']} />)
    expect(screen.getByTestId('architecture-graph')).toBeInTheDocument()
    expect(container.querySelectorAll('.react-flow__node')).toHaveLength(MODULES.length)
    expect(screen.getByText('Reusable screen pieces')).toBeInTheDocument()
    expect(screen.getAllByText(/3 files · 1\.2k lines/).length).toBeGreaterThan(0)
    expect(screen.getByText('3 files · 2 KB')).toBeInTheDocument()
    expect(screen.getByLabelText('Color legend')).toBeInTheDocument()
    expect(screen.getByText('Explored')).toBeInTheDocument()
    expect(container.querySelectorAll('.react-flow__edge').length).toBe(MODULE_EDGES.length)
    // Cards carry a layer dot, never an emoji.
    for (const card of container.querySelectorAll('.react-flow__node')) expect(card.textContent).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it('marks the selected part with the “you are here” pin', () => {
    const { container } = render(<ArchitectureGraph modules={MODULES} edges={MODULE_EDGES} selectedId="src/pages" />)
    const pin = 'path[fill="var(--accent)"]'
    expect(nodeEl(container, 'src/pages').querySelector(pin)).toBeInTheDocument()
    expect(nodeEl(container, 'src/utils').querySelector(pin)).not.toBeInTheDocument()
  })

  it('selects with click and keyboard, opens with double-click or Enter on the selected card, clears with Escape', () => {
    const onSelect = vi.fn()
    const onOpen = vi.fn()
    const { container, rerender } = render(
      <ArchitectureGraph modules={MODULES} edges={MODULE_EDGES} onSelect={onSelect} onOpen={onOpen} />,
    )
    const card = nodeEl(container, 'src/components')
    fireEvent.click(card)
    expect(onSelect).toHaveBeenLastCalledWith('src/components')
    fireEvent.doubleClick(card)
    expect(onOpen).toHaveBeenLastCalledWith('src/components')

    fireEvent.keyDown(nodeEl(container, 'src/pages'), { key: 'Enter' })
    expect(onSelect).toHaveBeenLastCalledWith('src/pages')
    fireEvent.keyDown(nodeEl(container, 'src/pages'), { key: ' ' })
    expect(onSelect).toHaveBeenLastCalledWith('src/pages')

    rerender(<ArchitectureGraph modules={MODULES} edges={MODULE_EDGES} onSelect={onSelect} onOpen={onOpen} selectedId="src/pages" />)
    fireEvent.keyDown(nodeEl(container, 'src/pages'), { key: 'Enter' })
    expect(onOpen).toHaveBeenLastCalledWith('src/pages')
    fireEvent.keyDown(nodeEl(container, 'src/pages'), { key: 'Escape' })
    expect(onSelect).toHaveBeenLastCalledWith(null)
  })

  it('dims parts outside the highlight and shows a tooltip on hover', () => {
    const { container } = render(<ArchitectureGraph modules={MODULES} edges={MODULE_EDGES} highlightIds={['src/pages']} />)
    expect(nodeEl(container, 'docs').querySelector('.atlas-node')).toHaveClass('opacity-35')
    expect(nodeEl(container, 'src/pages').querySelector('.atlas-node')).not.toHaveClass('opacity-35')
    fireEvent.mouseEnter(nodeEl(container, 'src/state'), { clientX: 10, clientY: 10 })
    const tip = screen.getByRole('tooltip')
    // The tooltip names the part in words; no emoji.
    expect(within(tip).getByText('state')).toBeInTheDocument()
    expect(within(tip).getByText('pages, utils')).toBeInTheDocument()
    expect(within(tip).getByText('The src/state part of the project.')).toBeInTheDocument()
    fireEvent.mouseLeave(nodeEl(container, 'src/state'))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('shows a friendly empty state', () => {
    render(<ArchitectureGraph modules={[]} edges={[]} />)
    expect(screen.getByText('No parts to map yet')).toBeInTheDocument()
  })
})

describe('FileGraph', () => {
  const files = ['a', 'b', 'c'].map((n) => makeFile(`src/m/${n}.ts`, { moduleId: 'src/m' }))
  const outside = makeFile('src/other/x.ts', { layer: 'ui', role: 'component' })
  const all = linkFiles([...files, outside], [
    ['src/m/a.ts', 'src/m/b.ts'],
    ['src/m/b.ts', 'src/m/c.ts'],
    ['src/m/a.ts', 'src/other/x.ts'],
  ])
  const edges = [
    { source: 'src/m/a.ts', target: 'src/m/b.ts' },
    { source: 'src/m/b.ts', target: 'src/m/c.ts' },
    { source: 'src/m/a.ts', target: 'src/other/x.ts' },
  ]

  it('renders files and faded neighbors outside the set', () => {
    const onSelect = vi.fn()
    const { container } = render(
      <FileGraph files={files.map((f) => all[f.path])} edges={edges} allFiles={all} showNeighbors onSelect={onSelect} />,
    )
    expect(container.querySelectorAll('.react-flow__node')).toHaveLength(4)
    expect(screen.getByText('Elsewhere: src/other')).toBeInTheDocument()
    expect(screen.getByText(/Faded cards with dashed borders/)).toBeInTheDocument()
    fireEvent.click(nodeEl(container, 'src/m/b.ts'))
    expect(onSelect).toHaveBeenCalledWith('src/m/b.ts')
  })

  it('caps the number of cards and says so', () => {
    const many = Array.from({ length: 10 }, (_, i) => makeFile(`src/big/f${i}.ts`))
    const { container } = render(<FileGraph files={many} edges={[{ source: 'src/big/f1.ts', target: 'src/big/f2.ts' }]} maxNodes={4} />)
    expect(container.querySelectorAll('.react-flow__node')).toHaveLength(4)
    expect(screen.getByText('Showing the 4 most connected files of 10')).toBeInTheDocument()
  })
})

describe('ConceptGraph', () => {
  it('renders concepts, relation labels and a category legend', () => {
    const onSelect = vi.fn()
    const { container } = render(<ConceptGraph map={CONCEPTS} onSelect={onSelect} />)
    expect(container.querySelectorAll('.react-flow__node')).toHaveLength(5)
    expect(screen.getByText('Repository')).toBeInTheDocument()
    expect(screen.getByText('reads')).toBeInTheDocument()
    expect(screen.queryByText('ignored')).not.toBeInTheDocument()
    const legend = screen.getByLabelText('Color legend')
    expect(within(legend).getByText('Information')).toBeInTheDocument()
    expect(within(legend).getByText('Who’s involved')).toBeInTheDocument()
    fireEvent.click(nodeEl(container, 'repo'))
    expect(onSelect).toHaveBeenCalledWith('repo')
  })

  it('emphasizes the selected idea’s relations', () => {
    const { container } = render(<ConceptGraph map={CONCEPTS} selectedId="reader" />)
    expect(nodeEl(container, 'lonely').querySelector('.atlas-node')).toHaveClass('opacity-30')
    expect(nodeEl(container, 'map').querySelector('.atlas-node')).not.toHaveClass('opacity-30')
    expect(screen.getByText('looks at')).toBeInTheDocument()
    expect(screen.queryByText('reads')).not.toBeInTheDocument()
  })

  it('shows an empty state', () => {
    render(<ConceptGraph map={{ concepts: [], relations: [], source: 'starter' }} />)
    expect(screen.getByText('No key ideas yet')).toBeInTheDocument()
  })
})

describe('NeighborhoodGraph', () => {
  it('lists who uses the file and what it uses, with +N more', async () => {
    const user = userEvent.setup()
    const center = makeFile('src/core.ts', { externalImports: ['react', 'zod'] })
    const users = Array.from({ length: 10 }, (_, i) => makeFile(`src/users/u${i}.ts`))
    const deps = [makeFile('src/lib/dep.ts')]
    const all = linkFiles([center, ...users, ...deps], [
      ...users.map((u): [string, string] => [u.path, center.path]),
      [center.path, 'src/lib/dep.ts'],
    ])
    const onSelect = vi.fn()
    render(<NeighborhoodGraph file={all[center.path]} allFiles={all} onSelect={onSelect} />)
    expect(screen.getByText('Used by 10 files')).toBeInTheDocument()
    expect(screen.getByText('Uses 1 file')).toBeInTheDocument()
    expect(screen.getByText(/Also uses 2 outside packages: react, zod/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Open src\/users/ })).toHaveLength(8)
    await user.click(screen.getByRole('button', { name: '+2 more' }))
    expect(screen.getAllByRole('button', { name: /^Open src\/users/ })).toHaveLength(10)
    await user.click(screen.getByRole('button', { name: /Open src\/lib\/dep\.ts/ }))
    expect(onSelect).toHaveBeenCalledWith('src/lib/dep.ts')
  })

  it('explains empty sides', () => {
    const lonely = makeFile('a.ts')
    render(<NeighborhoodGraph file={lonely} allFiles={{ 'a.ts': lonely }} />)
    expect(screen.getByText('No other file in the project uses this one directly')).toBeInTheDocument()
    expect(screen.getByText('It doesn’t use any other file in this project')).toBeInTheDocument()
  })
})

describe('CodeTreemap', () => {
  const files = [
    makeFile('README.md', { lines: 40, layer: 'docs', language: 'Markdown' }),
    makeFile('src/main.ts', { lines: 200 }),
    makeFile('src/ui/App.tsx', { lines: 400, layer: 'ui', role: 'component', language: 'TSX' }),
    makeFile('src/ui/deep/Button.tsx', { lines: 120, layer: 'ui', language: 'TSX' }),
  ]

  it('draws folders and tiles; clicking a folder zooms, clicking a file selects', () => {
    const onRootChange = vi.fn()
    const onSelectFile = vi.fn()
    const { container } = render(
      <CodeTreemap files={files} colorBy="layer" rootPath="" onRootChange={onRootChange} onSelectFile={onSelectFile} />,
    )
    const tiles = container.querySelectorAll('rect.tm-item')
    expect(tiles.length).toBe(4) // src folder, README, main.ts, ui aggregate
    expect(screen.getByRole('button', { name: /^Folder src:/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Folder ui:/ }))
    expect(onRootChange).toHaveBeenCalledWith('src/ui')
    fireEvent.click(screen.getByRole('button', { name: /^main\.ts:/ }))
    expect(onSelectFile).toHaveBeenCalledWith('src/main.ts')
    expect(screen.getByLabelText('Color legend')).toBeInTheDocument()
  })

  it('shows a breadcrumb when zoomed, and Escape goes back up', () => {
    const onRootChange = vi.fn()
    const { container } = render(<CodeTreemap files={files} colorBy="layer" rootPath="src/ui" onRootChange={onRootChange} />)
    const nav = screen.getByRole('navigation', { name: 'Folder you are viewing' })
    expect(within(nav).getByText('ui')).toHaveAttribute('aria-current', 'location')
    fireEvent.keyDown(container.querySelector('rect.tm-item') as Element, { key: 'Escape' })
    expect(onRootChange).toHaveBeenLastCalledWith('src')
    fireEvent.click(within(nav).getByRole('button', { name: 'src' }))
    expect(onRootChange).toHaveBeenLastCalledWith('src')
    fireEvent.click(within(nav).getByRole('button', { name: /All files/ }))
    expect(onRootChange).toHaveBeenLastCalledWith('')
  })

  it('uses a roving tab stop with arrow keys and Enter', () => {
    const onSelectFile = vi.fn()
    const { container } = render(
      <CodeTreemap files={files} colorBy="layer" rootPath="" onRootChange={() => {}} onSelectFile={onSelectFile} />,
    )
    const items = [...container.querySelectorAll<SVGElement>('rect.tm-item')]
    expect(items.filter((i) => i.getAttribute('tabindex') === '0')).toHaveLength(1)
    const first = items.find((i) => i.getAttribute('tabindex') === '0') as SVGElement
    act(() => first.focus())
    fireEvent.keyDown(first, { key: 'End' })
    const last = container.querySelector('[data-idx="3"]') as SVGElement
    expect(document.activeElement).toBe(last)
    expect(last.getAttribute('tabindex')).toBe('0')
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
  })

  it('colors by language and shows the language legend', () => {
    const languages: LanguageStat[] = [
      { name: 'TSX', bytes: 10, files: 2, percent: 50, color: '#3178c6' },
      { name: 'TypeScript', bytes: 10, files: 1, percent: 50, color: '#2b7489' },
    ]
    const { container } = render(<CodeTreemap files={files} colorBy="language" rootPath="src" onRootChange={() => {}} languages={languages} />)
    const legend = screen.getByLabelText('Color legend')
    expect(within(legend).getByText('TSX')).toBeInTheDocument()
    expect(within(legend).getByText('TypeScript')).toBeInTheDocument()
    expect(container.querySelector('rect.tm-tile')).toBeInTheDocument()
  })

  it('shows hover tooltips with the file’s job', () => {
    const { container } = render(<CodeTreemap files={files} colorBy="layer" rootPath="src/ui" onRootChange={() => {}} />)
    const app = screen.getByRole('button', { name: /^App\.tsx:/ })
    fireEvent.pointerMove(app, { clientX: 20, clientY: 20 })
    const tip = screen.getByRole('tooltip')
    expect(within(tip).getByText('UI building block')).toBeInTheDocument()
    expect(within(tip).getByText('400')).toBeInTheDocument()
    fireEvent.pointerLeave(container.querySelector('svg[role="group"]') as Element)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('offers a way back from an empty folder', () => {
    const onRootChange = vi.fn()
    render(<CodeTreemap files={files} colorBy="layer" rootPath="missing" onRootChange={onRootChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Back to all files' }))
    expect(onRootChange).toHaveBeenCalledWith('')
  })
})

describe('TourDiagram', () => {
  it('numbers the steps, checks finished ones and marks the current one', async () => {
    const user = userEvent.setup()
    const onStepClick = vi.fn()
    const files = { 'src/main.tsx': makeFile('src/main.tsx', { layer: 'logic' }) }
    render(<TourDiagram tour={TOUR} activeStep={1} onStepClick={onStepClick} modules={[]} files={files} />)
    const steps = screen.getAllByRole('button')
    expect(steps).toHaveLength(3)
    expect(steps[0]).toHaveTextContent('(done)')
    expect(steps[1]).toHaveAttribute('aria-current', 'step')
    expect(steps[1]).toHaveTextContent('Home.tsx')
    expect(steps[2]).toHaveTextContent('Big-picture idea')
    // The current step carries the "you are here" pin; the others don't.
    expect(steps[1].querySelector('path[fill="var(--accent)"]')).toBeInTheDocument()
    expect(steps[0].querySelector('path[fill="var(--accent)"]')).not.toBeInTheDocument()
    await user.click(steps[2])
    expect(onStepClick).toHaveBeenCalledWith(2)
  })

  it('renders read-only when not clickable', () => {
    render(<TourDiagram tour={TOUR} activeStep={0} orientation="vertical" />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByText('The front door')).toBeInTheDocument()
  })
})

describe('bars', () => {
  it('LanguageBar shows a legend with shares and a hover tooltip', () => {
    const languages: LanguageStat[] = [
      { name: 'TypeScript', bytes: 750, files: 30, percent: 75, color: '#3178c6' },
      { name: 'CSS', bytes: 250, files: 4, percent: 25, color: '#663399' },
    ]
    const { container } = render(<LanguageBar languages={languages} />)
    expect(screen.getByRole('img', { name: 'Languages used: TypeScript 75%, CSS 25%' })).toBeInTheDocument()
    expect(screen.getByText('75%')).toBeInTheDocument()
    const segment = container.querySelector('[role="img"] > div') as Element
    fireEvent.pointerEnter(segment, { clientX: 5, clientY: 5 })
    expect(within(screen.getByRole('tooltip')).getByText('30 files')).toBeInTheDocument()
  })

  it('LayerBar uses plain-English layer names and handles no data', () => {
    const { rerender } = render(<LayerBar breakdown={{ ui: 300, test: 100 }} />)
    expect(screen.getByText('Screens & visuals')).toBeInTheDocument()
    expect(screen.getByText('Tests')).toBeInTheDocument()
    rerender(<LayerBar breakdown={{}} />)
    expect(screen.getByRole('img', { name: 'No code measured yet' })).toBeInTheDocument()
  })
})

describe('TechStackDiagram', () => {
  it('stacks rows in plain English with clickable chips', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<TechStackDiagram tech={TECH} onSelect={onSelect} />)
    expect(screen.getByText('What you see')).toBeInTheDocument()
    expect(screen.getByText('The engine')).toBeInTheDocument()
    expect(screen.getByText('Tools behind the scenes')).toBeInTheDocument()
    expect(screen.queryByText('Where data lives')).not.toBeInTheDocument()
    expect(screen.getByText('Like LEGO bricks for web pages')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /React/ }))
    expect(onSelect).toHaveBeenCalledWith('react')
  })

  it('says so when nothing was recognized', () => {
    render(<TechStackDiagram tech={[]} />)
    expect(screen.getByText(/didn’t recognize any specific tools/)).toBeInTheDocument()
  })
})
