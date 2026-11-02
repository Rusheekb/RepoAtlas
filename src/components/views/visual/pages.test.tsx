import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import type { ReactNode } from 'react'
import type { StructuredAi } from '@/ai'
import type { CodeViewerProps } from '@/components/code/CodeViewer'
import type { ArchitectureGraphProps, CodeTreemapProps, ConceptGraphProps, FileGraphProps } from '@/components/graphs'
import type { ConceptMap, Tour } from '@/core/types'
import ArchitecturePage from '@/pages/ArchitecturePage'
import CodeMapPage from '@/pages/CodeMapPage'
import ConceptsPage from '@/pages/ConceptsPage'
import ToursPage from '@/pages/ToursPage'
import { useExplain } from '@/state/explain'
import { useProgress } from '@/state/progress'
import { useRepoStore } from '@/state/repo'
import { useSettings } from '@/state/settings'
import { useUi } from '@/state/ui'
import { APP_TS, makeAnalysis, makeSnapshot } from './testFixtures'

// ── Light stand-ins for the heavy graph components: they expose their props as plain buttons. ──
vi.mock('@/components/graphs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/graphs')>()
  return {
    ...actual,
    ArchitectureGraph: (p: ArchitectureGraphProps) => (
      <div
        data-testid="architecture-graph"
        data-direction={p.direction}
        data-selected={p.selectedId ?? ''}
        data-highlight={(p.highlightIds ?? []).join(',')}
        data-reserve-top={p.reserve?.top ?? 0}
        data-controls={String(p.showControls ?? true)}
      >
        {p.modules.map((m) => (
          <span key={m.id}>
            <button type="button" onClick={() => p.onSelect?.(m.id)}>{`node ${m.id}`}</button>
            <button type="button" onClick={() => p.onOpen?.(m.id)}>{`open ${m.id}`}</button>
            {p.seenIds?.includes(m.id) && <span>{`seen ${m.id}`}</span>}
          </span>
        ))}
        <button type="button" onClick={() => p.onSelect?.(null)}>
          pane
        </button>
      </div>
    ),
    FileGraph: (p: FileGraphProps) => (
      <div data-testid="file-graph" data-neighbors={String(Boolean(p.showNeighbors))} data-max={p.maxNodes ?? ''} data-direction={p.direction}>
        {p.files.map((f) => (
          <span key={f.path}>
            <button type="button" onClick={() => p.onSelect?.(f.path)}>{`file ${f.path}`}</button>
            <button type="button" onClick={() => p.onOpen?.(f.path)}>{`read ${f.path}`}</button>
          </span>
        ))}
      </div>
    ),
    ConceptGraph: (p: ConceptGraphProps) => (
      <div data-testid="concept-graph" data-source={p.map.source} data-selected={p.selectedId ?? ''}>
        {p.map.concepts.map((c) => (
          <button key={c.id} type="button" onClick={() => p.onSelect?.(c.id)}>{`idea ${c.id}`}</button>
        ))}
        <button type="button" onClick={() => p.onSelect?.(null)}>
          concept pane
        </button>
      </div>
    ),
    CodeTreemap: (p: CodeTreemapProps) => (
      <div data-testid="code-treemap" data-root={p.rootPath} data-color={p.colorBy} data-languages={String(p.languages?.length ?? 0)}>
        <button type="button" onClick={() => p.onRootChange('src/ui')}>
          zoom ui
        </button>
        <button type="button" onClick={() => p.onSelectFile?.('src/ui/Cart.tsx')}>
          tile cart
        </button>
      </div>
    ),
  }
})

vi.mock('@/components/code/CodeViewer', () => ({
  CodeViewer: (p: CodeViewerProps) => (
    <pre data-testid="code-viewer" data-first={p.firstLineNumber} data-highlight={p.highlight ? `${p.highlight.start}-${p.highlight.end}` : ''} data-max={p.maxHeight}>
      {p.code}
    </pre>
  ),
}))

// ── Controllable AI hooks ──
function idleAi<T>(over: Partial<StructuredAi<T>> = {}): StructuredAi<T> {
  return { data: null, state: 'idle', aiStatus: null, progressChars: 0, error: null, errorKind: null, fromCache: false, run: vi.fn(), cancel: vi.fn(), ...over }
}
const ai = vi.hoisted(() => ({
  concepts: null as unknown,
  tours: null as unknown,
}))
vi.mock('@/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/ai')>()
  return {
    ...actual,
    useConceptMap: () => ai.concepts,
    useTours: () => ai.tours,
  }
})

function setConcepts(over: Partial<StructuredAi<ConceptMap>> = {}) {
  const v = idleAi<ConceptMap>(over)
  ai.concepts = v
  return v
}
function setTours(over: Partial<StructuredAi<Tour[]> & { askTour: (q: string) => void; asking: boolean }> = {}) {
  const v = { ...idleAi<Tour[]>(), askTour: vi.fn(), asking: false, ...over }
  ai.tours = v
  return v
}

function LocationProbe() {
  const loc = useLocation()
  return <output data-testid="location">{`${loc.pathname}${loc.search}`}</output>
}

function renderAt(url: string, page: ReactNode) {
  const router = createMemoryRouter(
    [
      {
        path: '/gh/:owner/:repo/:view',
        element: (
          <>
            {page}
            <LocationProbe />
          </>
        ),
      },
    ],
    { initialEntries: [url] },
  )
  const utils = render(<RouterProvider router={router} />)
  return { ...utils, router }
}

const location = () => screen.getByTestId('location').textContent ?? ''
const search = () => new URLSearchParams(location().split('?')[1] ?? '')

beforeEach(() => {
  const analysis = makeAnalysis()
  useRepoStore.setState({ analysis, snapshot: makeSnapshot(analysis), status: 'ready', key: 'acme/shop' })
  useExplain.setState({ target: null, history: [] })
  useProgress.setState({ seen: {} })
  useSettings.setState({ anthropicApiKey: '' })
  useUi.setState({ settingsOpen: false })
  setConcepts()
  setTours()
})

// ─────────────────────────────────────────────────────────────────────────────

describe('ArchitecturePage', () => {
  it('shows the map with a plain-English hint, a legend and counts', () => {
    renderAt('/gh/acme/shop/map', <ArchitecturePage />)
    expect(screen.getByRole('heading', { level: 1, name: /How it connects/ })).toBeInTheDocument()
    expect(screen.getByText(/An arrow from A to B means A uses something from B/)).toBeInTheDocument()
    expect(screen.getByTestId('architecture-graph')).toBeInTheDocument()
    expect(screen.getByLabelText('Color legend')).toHaveTextContent('Screens & visuals')
    expect(screen.getByText(/4 parts · 2 connections/)).toBeInTheDocument()
  })

  it('selecting a box explains it, remembers it as explored and offers a way inside', async () => {
    const user = userEvent.setup()
    renderAt('/gh/acme/shop/map', <ArchitecturePage />)
    await user.click(screen.getByRole('button', { name: 'node src/db' }))
    expect(useExplain.getState().target).toEqual({ type: 'module', id: 'src/db' })
    expect(useProgress.getState().isSeen('acme/shop', 'module:src/db')).toBe(true)
    expect(search().get('select')).toBe('src/db')
    expect(screen.getByText('seen src/db')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /See the files in db/ }))
    expect(search().get('module')).toBe('src/db')
    expect(screen.getByTestId('file-graph')).toBeInTheDocument()
  })

  it('?select= preselects a part and explains it', () => {
    renderAt('/gh/acme/shop/map?select=src/ui', <ArchitecturePage />)
    expect(screen.getByTestId('architecture-graph')).toHaveAttribute('data-selected', 'src/ui')
    expect(useExplain.getState().target).toEqual({ type: 'module', id: 'src/ui' })
  })

  it('clicking empty space clears the selection', async () => {
    const user = userEvent.setup()
    renderAt('/gh/acme/shop/map?select=src/ui', <ArchitecturePage />)
    await user.click(screen.getByRole('button', { name: 'pane' }))
    expect(search().get('select')).toBeNull()
  })

  it('drills into a part: breadcrumb, file map, file explanations and reading a file', async () => {
    const user = userEvent.setup()
    renderAt('/gh/acme/shop/map', <ArchitecturePage />)
    await user.click(screen.getByRole('button', { name: 'open src/ui' }))
    const crumbs = screen.getByRole('navigation', { name: 'Where you are' })
    expect(within(crumbs).getByText('All parts')).toBeInTheDocument()
    expect(within(crumbs).getByText('ui')).toBeInTheDocument()
    // Small parts show their outside connections by default.
    expect(screen.getByTestId('file-graph')).toHaveAttribute('data-neighbors', 'true')

    await user.click(screen.getByRole('button', { name: 'file src/ui/Cart.tsx' }))
    expect(useExplain.getState().target).toEqual({ type: 'file', path: 'src/ui/Cart.tsx' })
    expect(useProgress.getState().isSeen('acme/shop', 'file:src/ui/Cart.tsx')).toBe(true)

    await user.click(screen.getByRole('radio', { name: 'Only this part' }))
    expect(screen.getByTestId('file-graph')).toHaveAttribute('data-neighbors', 'false')

    await user.click(screen.getByRole('button', { name: 'read src/ui/Button.tsx' }))
    expect(location()).toBe('/gh/acme/shop/explore?file=src%2Fui%2FButton.tsx')
  })

  it('keeps the top of the map free for the “See the files” button while a part is selected', async () => {
    const user = userEvent.setup()
    renderAt('/gh/acme/shop/map', <ArchitecturePage />)
    expect(screen.getByTestId('architecture-graph')).toHaveAttribute('data-reserve-top', '0')
    await user.click(screen.getByRole('button', { name: 'node src/ui' }))
    expect(screen.getByRole('button', { name: /See the files in/ })).toBeInTheDocument()
    expect(Number(screen.getByTestId('architecture-graph').getAttribute('data-reserve-top'))).toBeGreaterThan(0)
  })

  it('starts a big part with its best-connected files and offers the rest (regression: 120 cards at 0.2 zoom)', async () => {
    const user = userEvent.setup()
    const base = makeAnalysis()
    const many = Array.from({ length: 55 }, (_, i) => `src/big/f${i}.ts`)
    const files = { ...base.files }
    for (const p of many) files[p] = { ...base.files[Object.keys(base.files)[0]], path: p, name: p.split('/').pop() as string, dir: 'src/big', moduleId: 'src/big' }
    const big = { ...base.modules[0], id: 'src/big', name: 'big', path: 'src/big', files: many, fileCount: many.length }
    const analysis = { ...base, files, modules: [...base.modules, big] }
    useRepoStore.setState({ analysis, snapshot: makeSnapshot(analysis), status: 'ready', key: 'acme/shop' })
    renderAt('/gh/acme/shop/map?module=src/big', <ArchitecturePage />)
    expect(screen.getByTestId('file-graph')).toHaveAttribute('data-max', '40')
    await user.click(screen.getByRole('button', { name: 'Show all 55 files' }))
    expect(screen.getByTestId('file-graph')).toHaveAttribute('data-max', '')
    expect(screen.getByRole('button', { name: /Just the 40 best-connected files/ })).toBeInTheDocument()
    // The drill-down has its own arrow-direction toggle.
    await user.click(screen.getByRole('radio', { name: /Top-down/ }))
    expect(screen.getByTestId('file-graph')).toHaveAttribute('data-direction', 'TB')
  })

  it('Back returns from the drill-down to all parts', async () => {
    const user = userEvent.setup()
    renderAt('/gh/acme/shop/map?module=src/ui', <ArchitecturePage />)
    await user.click(screen.getByRole('button', { name: /Back to all parts/ }))
    expect(search().get('module')).toBeNull()
    expect(screen.getByTestId('architecture-graph')).toBeInTheDocument()
  })

  it('explains when a drill-down link points to a part that does not exist', () => {
    renderAt('/gh/acme/shop/map?module=nope', <ArchitecturePage />)
    expect(screen.getByText('We couldn’t find that part')).toBeInTheDocument()
  })

  it('switches to an accessible, sortable list view', async () => {
    const user = userEvent.setup()
    renderAt('/gh/acme/shop/map', <ArchitecturePage />)
    await user.click(screen.getByRole('radio', { name: /List view/ }))
    expect(search().get('as')).toBe('list')
    const table = screen.getByRole('table')
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers.join('|')).toMatch(/Part.*What it does.*Files.*Lines.*Uses.*Used by/)
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(4)
    // Biggest first by default.
    expect(within(rows[0]).getByRole('rowheader')).toHaveTextContent('ui')
    const linesHeader = within(table).getByRole('columnheader', { name: /Lines/ })
    expect(linesHeader).toHaveAttribute('aria-sort', 'descending')

    await user.click(within(table).getByRole('button', { name: /^Part/ }))
    expect(within(table).getByRole('columnheader', { name: /Part/ })).toHaveAttribute('aria-sort', 'ascending')
    expect(within(within(table).getAllByRole('row')[1]).getByRole('rowheader')).toHaveTextContent('db')

    // "src" uses two parts.
    const srcRow = within(table).getAllByRole('row').find((r) => within(r).queryByRole('rowheader')?.textContent?.includes('Main code'))
    expect(srcRow).toBeDefined()
    if (!srcRow) return
    await user.click(within(srcRow).getAllByRole('button')[0])
    expect(useExplain.getState().target).toEqual({ type: 'module', id: 'src' })
    await user.click(within(srcRow).getByRole('button', { name: 'See the files in src' }))
    expect(search().get('module')).toBe('src')
  })

  it('lets the reader flip the arrow direction', async () => {
    const user = userEvent.setup()
    renderAt('/gh/acme/shop/map', <ArchitecturePage />)
    expect(screen.getByTestId('architecture-graph')).toHaveAttribute('data-direction', 'LR')
    await user.click(screen.getByRole('radio', { name: /Top-down/ }))
    expect(screen.getByTestId('architecture-graph')).toHaveAttribute('data-direction', 'TB')
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('CodeMapPage', () => {
  it('renders the treemap with a hint, folder stats and the biggest files', () => {
    renderAt('/gh/acme/shop/codemap', <CodeMapPage />)
    expect(screen.getByRole('heading', { level: 1, name: /Where code lives/ })).toBeInTheDocument()
    expect(screen.getByText(/Every rectangle is a file/)).toBeInTheDocument()
    const map = screen.getByTestId('code-treemap')
    expect(map).toHaveAttribute('data-root', '')
    expect(map).toHaveAttribute('data-languages', '2')
    expect(screen.getByText('The whole project')).toBeInTheDocument()
    const biggest = screen.getByRole('heading', { name: /Biggest files/ }).closest('section') as HTMLElement
    const items = within(biggest).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Cart.tsx')
    expect(items[0]).toHaveTextContent('120 lines')
  })

  it('keeps the zoomed folder in ?path= and ignores folders that don’t exist', async () => {
    const user = userEvent.setup()
    const { unmount } = renderAt('/gh/acme/shop/codemap', <CodeMapPage />)
    await user.click(screen.getByRole('button', { name: 'zoom ui' }))
    expect(search().get('path')).toBe('src/ui')
    expect(screen.getByTestId('code-treemap')).toHaveAttribute('data-root', 'src/ui')
    expect(screen.getByText('ui/')).toBeInTheDocument()
    unmount()
    renderAt('/gh/acme/shop/codemap?path=nowhere', <CodeMapPage />)
    expect(screen.getByTestId('code-treemap')).toHaveAttribute('data-root', '')
  })

  it('explains files from the map or the biggest-files list, and switches colors', async () => {
    const user = userEvent.setup()
    renderAt('/gh/acme/shop/codemap?path=src', <CodeMapPage />)
    await user.click(screen.getByRole('button', { name: 'tile cart' }))
    expect(useExplain.getState().target).toEqual({ type: 'file', path: 'src/ui/Cart.tsx' })
    expect(useProgress.getState().isSeen('acme/shop', 'file:src/ui/Cart.tsx')).toBe(true)
    await user.click(screen.getByRole('button', { name: /orders\.py/ }))
    expect(useExplain.getState().target).toEqual({ type: 'file', path: 'src/db/orders.py' })
    await user.click(screen.getByRole('button', { name: /What’s in this folder/ }))
    expect(useExplain.getState().target).toEqual({ type: 'folder', path: 'src' })
    await user.click(screen.getByRole('radio', { name: /Language/ }))
    expect(screen.getByTestId('code-treemap')).toHaveAttribute('data-color', 'language')
  })
})

// ─────────────────────────────────────────────────────────────────────────────

const AI_MAP: ConceptMap = {
  source: 'ai',
  concepts: [
    { id: 'checkout', name: 'Checkout', emoji: '💳', category: 'process', summary: 'Paying for things.', explanation: 'Pay.', analogy: 'Like a till', files: [], importance: 5 },
  ],
  relations: [],
}

describe('ConceptsPage', () => {
  it('works without a key: the quick map, idea cards and a gentle invitation', () => {
    renderAt('/gh/acme/shop/concepts', <ConceptsPage />)
    expect(screen.getByRole('heading', { level: 1, name: /Key ideas/ })).toBeInTheDocument()
    expect(screen.getByTestId('concept-graph')).toHaveAttribute('data-source', 'starter')
    expect(screen.getAllByTestId('concept-card')).toHaveLength(2)
    expect(screen.getAllByTestId('concept-card')[0]).toHaveTextContent('Orders')
    // Inline code in summaries renders as code, not backticks.
    expect(screen.getAllByTestId('concept-card')[0].querySelector('code')).toHaveTextContent('src/db')
    expect(screen.getByRole('button', { name: /Add a Claude key/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Copy a prompt/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /claude\.ai/ })).toHaveAttribute('href', 'https://claude.ai/new')
    expect(screen.queryByRole('button', { name: /Generate/ })).not.toBeInTheDocument()
  })

  it('opens Settings from the invitation', async () => {
    const user = userEvent.setup()
    renderAt('/gh/acme/shop/concepts', <ConceptsPage />)
    await user.click(screen.getByRole('button', { name: /Add a Claude key/ }))
    expect(useUi.getState()).toMatchObject({ settingsOpen: true, settingsSection: 'ai' })
  })

  it('copies a ready-made prompt for claude.ai', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderAt('/gh/acme/shop/concepts', <ConceptsPage />)
    await user.click(screen.getByRole('button', { name: /Copy a prompt/ }))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(String(writeText.mock.calls[0][0]).length).toBeGreaterThan(100)
    expect(await screen.findByText(/^Copied, now paste it into Claude$/)).toBeInTheDocument()
  })

  it('selecting an idea (graph or card) explains it and marks it read', async () => {
    const user = userEvent.setup()
    renderAt('/gh/acme/shop/concepts', <ConceptsPage />)
    await user.click(screen.getByRole('button', { name: 'idea cart' }))
    expect(useExplain.getState().target).toMatchObject({ type: 'concept', concept: { id: 'cart' } })
    expect(useProgress.getState().isSeen('acme/shop', 'concept:cart')).toBe(true)
    expect(screen.getByTestId('concept-graph')).toHaveAttribute('data-selected', 'cart')

    await user.click(screen.getAllByTestId('concept-card')[0])
    expect(useExplain.getState().target).toMatchObject({ type: 'concept', concept: { id: 'orders' } })
    expect(screen.getAllByTestId('concept-card')[0]).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'concept pane' }))
    expect(useExplain.getState().target).toBeNull()
  })

  it('with a key offers "Generate a smarter map with Claude"', async () => {
    const user = userEvent.setup()
    useSettings.setState({ anthropicApiKey: 'sk-ant-test' })
    const state = setConcepts()
    renderAt('/gh/acme/shop/concepts', <ConceptsPage />)
    await user.click(screen.getByRole('button', { name: 'Generate a smarter map with Claude' }))
    expect(state.run).toHaveBeenCalledTimes(1)
  })

  it('shows progress with Cancel while Claude works', async () => {
    const user = userEvent.setup()
    useSettings.setState({ anthropicApiKey: 'sk-ant-test' })
    const state = setConcepts({ state: 'streaming', aiStatus: 'writing', progressChars: 2400 })
    renderAt('/gh/acme/shop/concepts', <ConceptsPage />)
    const progress = screen.getByTestId('ai-progress')
    expect(progress).toHaveTextContent('Claude is writing it up')
    expect(progress).toHaveTextContent('2.4k characters written so far')
    expect(within(progress).getByRole('progressbar')).toBeInTheDocument()
    await user.click(within(progress).getByRole('button', { name: /Cancel/ }))
    expect(state.cancel).toHaveBeenCalledTimes(1)
  })

  it('a rejected key gets an Open Settings button', async () => {
    const user = userEvent.setup()
    useSettings.setState({ anthropicApiKey: 'sk-ant-bad' })
    setConcepts({ state: 'error', error: 'Claude didn’t accept your API key.', errorKind: 'invalid-key' })
    renderAt('/gh/acme/shop/concepts', <ConceptsPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('Claude didn’t accept your API key.')
    await user.click(screen.getByRole('button', { name: /Open Settings/ }))
    expect(useUi.getState().settingsOpen).toBe(true)
  })

  it('other errors offer to try again', async () => {
    const user = userEvent.setup()
    useSettings.setState({ anthropicApiKey: 'sk-ant-test' })
    const state = setConcepts({ state: 'error', error: 'Claude is very busy right now.', errorKind: 'overloaded' })
    renderAt('/gh/acme/shop/concepts', <ConceptsPage />)
    // The error replaces the invitation rather than stacking a second "Generate" button under it.
    expect(screen.queryByRole('button', { name: /Generate a smarter map/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Try again/ }))
    expect(state.run).toHaveBeenCalled()
  })

  it('shows Claude’s map when there is one, with a toggle back to the quick map', async () => {
    const user = userEvent.setup()
    useSettings.setState({ anthropicApiKey: 'sk-ant-test' })
    setConcepts({ data: AI_MAP, state: 'done' })
    renderAt('/gh/acme/shop/concepts', <ConceptsPage />)
    expect(screen.getByTestId('concept-graph')).toHaveAttribute('data-source', 'ai')
    expect(screen.getAllByTestId('concept-card')).toHaveLength(1)
    expect(screen.getByRole('button', { name: /Regenerate with Claude/ })).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /Quick map/ }))
    expect(screen.getByTestId('concept-graph')).toHaveAttribute('data-source', 'starter')
    expect(screen.getAllByTestId('concept-card')).toHaveLength(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

const AI_TOUR: Tour = {
  id: 'startup',
  title: 'Claude’s start-up tour',
  question: 'How does it start?',
  emoji: '🚶',
  summary: 'By Claude.',
  source: 'ai',
  steps: [{ title: 'Begin', explanation: 'Hi.', file: null, snippet: null, moduleId: null }],
}

describe('ToursPage', () => {
  it('lists the starter tours with steps and progress, and invites adding a key', () => {
    useProgress.getState().markSeen('acme/shop', 'tour:startup:step:1')
    renderAt('/gh/acme/shop/tours', <ToursPage />)
    expect(screen.getByRole('heading', { level: 1, name: /Guided tours/ })).toBeInTheDocument()
    const cards = screen.getAllByTestId('tour-card')
    expect(cards).toHaveLength(2)
    expect(cards[0]).toHaveTextContent('What happens when the shop opens?')
    expect(cards[0]).toHaveTextContent('3 steps')
    expect(cards[0]).toHaveTextContent('Pick up where you left off')
    // Resumes at the first unseen step.
    expect(cards[0]).toHaveAttribute('href', '/gh/acme/shop/tours?tour=startup&step=2')
    expect(within(cards[0]).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33')
    expect(cards[1]).toHaveTextContent('Start the tour')
    expect(screen.getByRole('button', { name: /Add a Claude key/ })).toBeInTheDocument()
    expect(screen.queryByLabelText('Ask for a tour')).not.toBeInTheDocument()
  })

  it('with a key: generate tours, and ask for a tour of your own', async () => {
    const user = userEvent.setup()
    useSettings.setState({ anthropicApiKey: 'sk-ant-test' })
    const state = setTours()
    renderAt('/gh/acme/shop/tours', <ToursPage />)
    await user.click(screen.getByRole('button', { name: 'Generate tours with Claude' }))
    expect(state.run).toHaveBeenCalledTimes(1)
    const input = screen.getByLabelText('Ask for a tour')
    expect(input).toHaveAttribute('placeholder', 'How does ___ work?')
    await user.type(input, 'How does checkout work?{Enter}')
    expect(state.askTour).toHaveBeenCalledWith('How does checkout work?')
  })

  it('jumps into the new tour once Claude has written it', async () => {
    const user = userEvent.setup()
    useSettings.setState({ anthropicApiKey: 'sk-ant-test' })
    const state = setTours()
    renderAt('/gh/acme/shop/tours', <ToursPage />)
    await user.type(screen.getByLabelText('Ask for a tour'), 'How does paying work?{Enter}')
    expect(state.askTour).toHaveBeenCalledWith('How does paying work?')
    // The hook reports progress, then the finished tour (a progress update re-renders the page each time).
    ai.tours = { ...state, asking: true }
    act(() => useProgress.getState().markSeen('acme/shop', 'file:a'))
    expect(screen.getByTestId('ai-progress')).toHaveTextContent('Claude is building a tour for your question')
    ai.tours = { ...state, asking: false, state: 'done', data: [{ ...AI_TOUR, id: 'paying', title: 'How paying works' }] }
    act(() => useProgress.getState().markSeen('acme/shop', 'file:b'))
    await waitFor(() => expect(search().get('tour')).toBe('paying'))
    expect(screen.getByRole('heading', { level: 1, name: 'How paying works' })).toBeInTheDocument()
  })

  it('shows Claude’s tours in their own section, with clashing ids made unique', () => {
    useSettings.setState({ anthropicApiKey: 'sk-ant-test' })
    setTours({ data: [AI_TOUR], state: 'done' })
    renderAt('/gh/acme/shop/tours', <ToursPage />)
    expect(screen.getByRole('heading', { name: /Tours written by Claude/ })).toBeInTheDocument()
    const cards = screen.getAllByTestId('tour-card')
    expect(cards).toHaveLength(3)
    expect(cards[0]).toHaveAttribute('href', '/gh/acme/shop/tours?tour=ai-startup&step=1')
  })

  it('plays a tour: diagram, explanation, the exact line of code, and where it happens', async () => {
    renderAt('/gh/acme/shop/tours?tour=startup&step=1', <ToursPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'What happens when the shop opens?' })).toBeInTheDocument()
    expect(screen.getByTestId('tour-diagram')).toBeInTheDocument()
    const step = screen.getByTestId('tour-step')
    expect(within(step).getByRole('heading', { name: 'The front door' })).toBeInTheDocument()
    expect(within(step).getByText(/STEP 1 OF 3/i)).toBeInTheDocument()

    const viewer = await screen.findByTestId('code-viewer')
    expect(viewer).toHaveAttribute('data-first', '1')
    expect(viewer).toHaveAttribute('data-highlight', '4-4')
    expect(viewer).toHaveAttribute('data-max', '320')
    expect(viewer.textContent).toContain('const app = createApp()')
    expect(screen.getByRole('link', { name: /src\/main\.ts/ })).toHaveAttribute('href', '/gh/acme/shop/explore?file=src%2Fmain.ts&line=4')
    expect(screen.getByText('Line 4 of 5')).toBeInTheDocument()

    // The small map highlights the step's part.
    expect(screen.getByTestId('architecture-graph')).toHaveAttribute('data-highlight', 'src')
    // The small "Where this happens" map leaves out the zoom buttons, which would cover its cards.
    expect(screen.getByTestId('architecture-graph')).toHaveAttribute('data-controls', 'false')
    expect(useProgress.getState().isSeen('acme/shop', 'tour:startup:step:1')).toBe(true)
  })

  it('finds a snippet even when its spacing differs, cutting six lines either side', async () => {
    renderAt('/gh/acme/shop/tours?tour=startup&step=2', <ToursPage />)
    const viewer = await screen.findByTestId('code-viewer')
    expect(viewer).toHaveAttribute('data-highlight', '20-20')
    expect(viewer).toHaveAttribute('data-first', '14')
    expect(viewer.textContent?.split('\n')).toHaveLength(13)
    expect(APP_TS.split('\n')[19]).toBe('export function createApp() {')
  })

  it('moves between steps with buttons and the arrow keys, then celebrates the end', async () => {
    const user = userEvent.setup()
    renderAt('/gh/acme/shop/tours?tour=startup&step=1', <ToursPage />)
    expect(screen.getByRole('button', { name: /Previous/ })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /^Next/ }))
    expect(search().get('step')).toBe('2')
    expect(useProgress.getState().isSeen('acme/shop', 'tour:startup:step:2')).toBe(true)

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight' })
    })
    expect(search().get('step')).toBe('3')
    // A big-picture step has no code.
    expect(screen.getByText(/no code to read here/)).toBeInTheDocument()

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowLeft' })
    })
    expect(search().get('step')).toBe('2')
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight' })
    })

    await user.click(screen.getByRole('button', { name: /Finish the tour/ }))
    expect(search().get('step')).toBe('4')
    const done = screen.getByTestId('tour-complete')
    expect(within(done).getByRole('heading', { name: 'Tour finished' })).toBeInTheDocument()
    expect(within(done).getByText('Where do orders go?')).toBeInTheDocument()
    expect(within(done).getByRole('link', { name: /Start the next tour/ })).toHaveAttribute('href', '/gh/acme/shop/tours?tour=orders&step=1')
    expect(useProgress.getState().isSeen('acme/shop', 'tour:startup')).toBe(true)

    await user.click(within(done).getByRole('button', { name: /Take this tour again/ }))
    expect(search().get('step')).toBe('1')
  })

  it('ignores arrow keys while typing', () => {
    renderAt('/gh/acme/shop/tours?tour=startup&step=1', <ToursPage />)
    const input = document.createElement('input')
    document.body.appendChild(input)
    act(() => {
      fireEvent.keyDown(input, { key: 'ArrowRight' })
    })
    expect(search().get('step')).toBe('1')
    input.remove()
  })

  it('clicking a step in the diagram jumps to it', async () => {
    const user = userEvent.setup()
    renderAt('/gh/acme/shop/tours?tour=startup&step=1', <ToursPage />)
    await user.click(within(screen.getByTestId('tour-diagram')).getByRole('button', { name: /Step 3 of 3/ }))
    expect(search().get('step')).toBe('3')
  })

  it('says so when a tour link points nowhere', async () => {
    vi.useFakeTimers()
    try {
      renderAt('/gh/acme/shop/tours?tour=nope', <ToursPage />)
      expect(screen.getByRole('status', { name: /Looking for the tour/ })).toBeInTheDocument()
      act(() => {
        vi.advanceTimersByTime(2000)
      })
      expect(screen.getByText('We couldn’t find that tour')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows an Open Settings button when asking for a tour fails on the key', () => {
    useSettings.setState({ anthropicApiKey: 'sk-ant-bad' })
    setTours({ error: 'Claude didn’t accept your API key.', errorKind: 'invalid-key' })
    renderAt('/gh/acme/shop/tours', <ToursPage />)
    expect(screen.getByRole('button', { name: /Open Settings/ })).toBeInTheDocument()
  })
})
