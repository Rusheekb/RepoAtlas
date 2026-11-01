import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeFixture } from '@/ai/testFixtures'
import { renderAt, stubBrowser } from '@/components/shell/testUtils'
import type { RepoAnalysis } from '@/core/types'
import { useExplain } from '@/state/explain'
import { useProgress } from '@/state/progress'
import { useRepoStore } from '@/state/repo'
import { Term } from './Glossary'
import { ExplainPanel, progressKeyFor } from './ExplainPanel'

// Keep the AI block inert: these tests are about the panel's own facts and navigation.
vi.mock('@/components/AiAnswer', () => ({
  AiAnswer: (props: { cta?: string }) => <div data-testid="ai-answer">{props.cta}</div>,
}))

let analysis: RepoAnalysis

beforeEach(() => {
  stubBrowser()
  analysis = makeFixture().analysis
  analysis.modules = analysis.modules.map((m) =>
    m.id === 'src' ? { ...m, name: 'Main app', emoji: '🏠', role: 'The heart of the shop', description: 'Starts the app and draws the main screen.' } : m,
  )
  useRepoStore.setState({ analysis, status: 'ready', key: 'acme/shop', ref: { owner: 'acme', repo: 'shop' } })
  useExplain.setState({ target: null, history: [] })
  useProgress.setState({ seen: {}, recent: [] })
})

function renderPanel() {
  return renderAt(<ExplainPanel />, { path: '/gh/acme/shop', route: '/gh/:owner/:repo' })
}

describe('ExplainPanel', () => {
  it('renders nothing without a target', () => {
    renderPanel()
    expect(screen.queryByTestId('explain-panel')).not.toBeInTheDocument()
  })

  it('explains a module: facts, uses / used by, key files and AI', () => {
    renderPanel()
    act(() => useExplain.getState().open({ type: 'module', id: 'src' }))
    const panel = screen.getByTestId('explain-panel')
    expect(within(panel).getByRole('heading', { level: 2, name: 'Main app' })).toBeInTheDocument()
    expect(within(panel).getByText('Part of the project')).toBeInTheDocument()
    expect(within(panel).getByText('The heart of the shop')).toBeInTheDocument()
    expect(within(panel).getByText(/starts the app and draws the main screen/i)).toBeInTheDocument()
    // moduleEdges: src → src/components and src → src/state
    const uses = within(panel).getByRole('heading', { name: 'Uses' }).parentElement!
    expect(within(uses).getByRole('button', { name: /components/ })).toBeInTheDocument()
    expect(within(uses).getByRole('button', { name: /state/ })).toBeInTheDocument()
    expect(within(panel).getByText(/no other part of the project relies on it/i)).toBeInTheDocument()
    expect(within(panel).getByTestId('ai-answer')).toHaveTextContent('Explain this part in depth')
    // Heading gets focus so screen readers announce the new content.
    expect(within(panel).getByRole('heading', { level: 2 })).toHaveFocus()
  })

  it('counts the module as explored', () => {
    renderPanel()
    act(() => useExplain.getState().open({ type: 'module', id: 'src' }))
    expect(useProgress.getState().isSeen('acme/shop', 'module:src')).toBe(true)
  })

  it('navigates inside the panel and back', async () => {
    const user = userEvent.setup()
    renderPanel()
    act(() => useExplain.getState().open({ type: 'module', id: 'src' }))
    await user.click(screen.getByRole('button', { name: /components/ }))
    expect(screen.getByRole('heading', { level: 2, name: 'components' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('heading', { level: 2, name: 'Main app' })).toBeInTheDocument()
  })

  it('"Show on map" closes the panel and goes to the map with the part selected', async () => {
    const user = userEvent.setup()
    renderPanel()
    act(() => useExplain.getState().open({ type: 'module', id: 'src' }))
    await user.click(screen.getByRole('button', { name: /show on map/i }))
    expect(useExplain.getState().target).toBeNull()
    expect(await screen.findByTestId('location')).toHaveTextContent('/gh/acme/shop/map?select=src')
  })

  it('closes with Escape', async () => {
    const user = userEvent.setup()
    renderPanel()
    act(() => useExplain.getState().open({ type: 'module', id: 'src' }))
    await user.keyboard('{Escape}')
    expect(useExplain.getState().target).toBeNull()
  })

  it('gives focus back to the glossary word after “Learn more” and Escape (the popover is gone by then)', async () => {
    const user = userEvent.setup()
    renderAt(
      <>
        <p>
          Runs in a <Term id="api">API</Term> world.
        </p>
        <ExplainPanel />
      </>,
      { path: '/gh/acme/shop', route: '/gh/:owner/:repo' },
    )
    const term = screen.getByRole('button', { name: 'API' })
    await user.tab()
    expect(term).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: /learn more/i })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(useExplain.getState().target).toEqual({ type: 'term', id: 'api' })
    expect(screen.getByTestId('explain-panel')).toContainElement(document.activeElement as HTMLElement)
    await user.keyboard('{Escape}')
    expect(useExplain.getState().target).toBeNull()
    expect(term).toHaveFocus()
  })

  it('falls back to the main content when what opened the panel is gone', async () => {
    const user = userEvent.setup()
    const main = document.createElement('main')
    main.id = 'main-content'
    main.tabIndex = -1
    document.body.append(main)
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    renderPanel()
    act(() => useExplain.getState().open({ type: 'module', id: 'src' }))
    opener.remove()
    await user.keyboard('{Escape}')
    expect(main).toHaveFocus()
    main.remove()
  })

  it('explains a file with its role, summary and code links', async () => {
    const user = userEvent.setup()
    renderPanel()
    act(() => useExplain.getState().open({ type: 'file', path: 'src/main.tsx' }))
    const panel = screen.getByTestId('explain-panel')
    expect(within(panel).getByRole('heading', { level: 2, name: 'main.tsx' })).toBeInTheDocument()
    expect(within(panel).getByText('Starts the app and shows it on the page.')).toBeInTheDocument()
    expect(within(panel).getByText(/the page loads this file first/i)).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: /open on github/i })).toHaveAttribute(
      'href',
      'https://github.com/acme/shop/blob/abc123/src/main.tsx',
    )
    await user.click(within(panel).getByRole('button', { name: /read the code/i }))
    expect(await screen.findByTestId('location')).toHaveTextContent('/gh/acme/shop/explore?file=src%2Fmain.tsx')
  })

  it('explains a concept, a technology and a glossary term', () => {
    renderPanel()
    const concept = analysis.starterConcepts.concepts[0]
    act(() => useExplain.getState().open({ type: 'concept', concept }))
    expect(screen.getByRole('heading', { level: 2, name: 'Shopping cart' })).toBeInTheDocument()
    expect(screen.getByText('Like a basket.')).toBeInTheDocument()
    expect(useProgress.getState().isSeen('acme/shop', 'concept:cart')).toBe(true)

    act(() => useExplain.getState().open({ type: 'tech', id: 'zustand' }))
    expect(screen.getByRole('heading', { level: 2, name: 'Zustand' })).toBeInTheDocument()
    expect(screen.getByText('package.json → dependencies')).toBeInTheDocument()
    expect(screen.getByTestId('ai-answer')).toHaveTextContent('How does this project use it?')

    act(() => useExplain.getState().open({ type: 'term', id: 'api' }))
    expect(screen.getByRole('heading', { level: 2, name: 'API' })).toBeInTheDocument()
    expect(screen.getByText('Word to know')).toBeInTheDocument()
  })

  it('says so when a target no longer exists', () => {
    renderPanel()
    act(() => useExplain.getState().open({ type: 'module', id: 'nope' }))
    expect(screen.getByRole('heading', { name: /couldn’t find that part of the project/i })).toBeInTheDocument()
  })

  it('maps targets to progress keys', () => {
    expect(progressKeyFor({ type: 'file', path: 'a.ts' })).toBe('file:a.ts')
    expect(progressKeyFor({ type: 'module', id: 'src' })).toBe('module:src')
    expect(progressKeyFor({ type: 'term', id: 'api' })).toBeNull()
  })
})
